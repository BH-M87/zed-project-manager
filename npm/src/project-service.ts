import { spawn } from "node:child_process";
import { loadConfig } from "./config.js";
import { ProjectCacheStore } from "./cache.js";
import { scanProjects } from "./scanner.js";
import type {
  OpenProjectOptions,
  OpenProjectResult,
  Project,
  ProjectCache,
  ProjectManagerConfig,
  ScanResult,
} from "./types.js";

export type ZedCommandRunner = (command: string, args: string[]) => Promise<void>;

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let standardError = "";
    child.stderr.on("data", (chunk: Buffer | string) => {
      standardError += chunk.toString();
    });
    child.once("error", (error) => reject(new Error(`Could not start Zed using \"${command}\": ${error.message}`)));
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else if (signal) {
        reject(new Error(`Zed was terminated by signal ${signal}.`));
      } else {
        const detail = standardError.trim();
        reject(new Error(`Zed exited with status ${code ?? "unknown"}.${detail ? ` ${detail}` : ""}`));
      }
    });
  });
}

export class ProjectService {
  private constructor(
    public readonly config: ProjectManagerConfig,
    private readonly cache: ProjectCacheStore,
    private readonly commandRunner: ZedCommandRunner,
  ) {}

  public static async create(commandRunner: ZedCommandRunner = run): Promise<ProjectService> {
    const config = await loadConfig();
    return new ProjectService(config, new ProjectCacheStore(config.cachePath), commandRunner);
  }

  public async refresh(): Promise<ScanResult> {
    const result = await scanProjects(this.config);
    let previous: ProjectCache | undefined;
    try {
      previous = await this.cache.read();
    } catch (error) {
      result.warnings.push(`${(error as Error).message} It was replaced by a fresh scan.`);
    }
    const openedByPath = new Map(previous?.projects.map((project) => [project.path, project.lastOpenedAt]));
    for (const project of result.projects) {
      const lastOpenedAt = openedByPath.get(project.path);
      if (lastOpenedAt) {
        project.lastOpenedAt = lastOpenedAt;
      }
    }
    await this.cache.write({ version: 1, scannedAt: result.scannedAt, projects: result.projects });
    return result;
  }

  public async list(refresh = false): Promise<ProjectCache> {
    if (refresh) {
      const result = await this.refresh();
      return { version: 1, scannedAt: result.scannedAt, projects: result.projects };
    }
    const cached = await this.cache.read();
    if (cached) {
      return cached;
    }
    const result = await this.refresh();
    return { version: 1, scannedAt: result.scannedAt, projects: result.projects };
  }

  public async resolveProject(query: string): Promise<Project> {
    const cache = await this.list();
    const normalized = query.toLocaleLowerCase();
    const exact = cache.projects.filter((project) =>
      project.name.toLocaleLowerCase() === normalized || project.path.toLocaleLowerCase() === normalized);
    if (exact.length === 1) {
      return exact[0] as Project;
    }
    const partial = exact.length > 1 ? exact : cache.projects.filter((project) =>
      project.name.toLocaleLowerCase().includes(normalized) || project.path.toLocaleLowerCase().includes(normalized));
    if (partial.length === 0) {
      throw new Error(`No project matches \"${query}\". Run \"zpm scan\" to refresh the cache.`);
    }
    if (partial.length > 1) {
      const candidates = partial.slice(0, 8).map((project) => `  - ${project.name}: ${project.path}`).join("\n");
      throw new Error(`Project query \"${query}\" is ambiguous. Use a full name or path:\n${candidates}`);
    }
    return partial[0] as Project;
  }

  public async open(project: Project, options: OpenProjectOptions = {}): Promise<OpenProjectResult> {
    const mode = options.mode ?? "reuse";
    const zedBin = options.zedBin || this.config.zedBin || "zed";
    const args = mode === "new"
      ? ["--new", project.path]
      : mode === "add"
        ? ["--add", project.path]
        : ["--reuse", project.path];
    const command = [zedBin, ...args];
    if (!options.dryRun) {
      await this.commandRunner(zedBin, args);
      await this.recordOpened(project.path);
    }
    return { project, command, dryRun: options.dryRun ?? false };
  }

  private async recordOpened(projectPath: string): Promise<void> {
    const cache = await this.list();
    const project = cache.projects.find((item) => item.path === projectPath);
    if (!project) {
      return;
    }
    project.lastOpenedAt = new Date().toISOString();
    await this.cache.write(cache);
  }
}
