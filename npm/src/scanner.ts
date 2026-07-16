import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { minimatch } from "minimatch";
import { expandHome } from "./config.js";
import type { Project, ProjectManagerConfig, ScanResult } from "./types.js";

interface VisitContext {
  root: string;
  config: ProjectManagerConfig;
  projects: Map<string, Project>;
  visitedDirectories: Set<string>;
  warnings: Set<string>;
}

function portablePath(value: string): string {
  return value.split(path.sep).join("/");
}

function identity(value: string): string {
  return process.platform === "win32" ? value.toLocaleLowerCase() : value;
}

function isIgnored(directory: string, root: string, patterns: string[]): boolean {
  const basename = path.basename(directory);
  const relative = portablePath(path.relative(root, directory));
  return patterns.some((pattern) => {
    const options = { dot: true, matchBase: true } as const;
    return minimatch(basename, pattern, options)
      || minimatch(relative, pattern, options)
      || minimatch(`${relative}/`, pattern, options);
  });
}

async function containsGitMarker(directory: string): Promise<boolean> {
  const marker = path.join(directory, ".git");
  try {
    const markerStats = await lstat(marker);
    if (markerStats.isDirectory()) {
      return true;
    }
    if (!markerStats.isFile()) {
      return false;
    }
    const contents = await readFile(marker, "utf8");
    return /^gitdir:\s*.+$/im.test(contents);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function visit(directory: string, depth: number, context: VisitContext): Promise<void> {
  let canonical: string;
  try {
    canonical = await realpath(directory);
  } catch (error) {
    context.warnings.add(`Could not resolve ${directory}: ${(error as Error).message}`);
    return;
  }

  const directoryIdentity = identity(canonical);
  if (context.visitedDirectories.has(directoryIdentity)) {
    return;
  }
  context.visitedDirectories.add(directoryIdentity);

  let isRepository = false;
  try {
    isRepository = await containsGitMarker(directory);
  } catch (error) {
    context.warnings.add(`Could not inspect ${directory}: ${(error as Error).message}`);
  }

  if (isRepository) {
    const projectIdentity = identity(canonical);
    if (!context.projects.has(projectIdentity)) {
      context.projects.set(projectIdentity, { name: path.basename(directory), path: directory });
    }
    if (!context.config.nestedRepositories) {
      return;
    }
  }

  if (depth >= context.config.maxDepth) {
    return;
  }

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    context.warnings.add(`Could not read ${directory}: ${(error as Error).message}`);
    return;
  }

  for (const entry of entries) {
    if (entry.name === ".git") {
      continue;
    }
    const child = path.join(directory, entry.name);
    if (isIgnored(child, context.root, context.config.ignore)) {
      continue;
    }
    if (entry.isDirectory()) {
      await visit(child, depth + 1, context);
      continue;
    }
    if (entry.isSymbolicLink() && context.config.followSymlinks) {
      try {
        if ((await stat(child)).isDirectory()) {
          await visit(child, depth + 1, context);
        }
      } catch (error) {
        context.warnings.add(`Could not follow symlink ${child}: ${(error as Error).message}`);
      }
    }
  }
}

export async function scanProjects(config: ProjectManagerConfig): Promise<ScanResult> {
  const projects = new Map<string, Project>();
  const warnings = new Set<string>();
  const visitedDirectories = new Set<string>();

  for (const configuredRoot of config.roots) {
    const root = path.resolve(expandHome(configuredRoot));
    let rootStats;
    try {
      rootStats = await stat(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        warnings.add(`Configured root does not exist and was skipped: ${root}`);
      } else {
        warnings.add(`Configured root could not be accessed and was skipped: ${root}: ${(error as Error).message}`);
      }
      continue;
    }
    if (!rootStats.isDirectory()) {
      warnings.add(`Configured root is not a directory and was skipped: ${root}`);
      continue;
    }
    await visit(root, 0, { root, config, projects, visitedDirectories, warnings });
  }

  return {
    projects: [...projects.values()].sort((left, right) =>
      left.name.localeCompare(right.name) || left.path.localeCompare(right.path)),
    warnings: [...warnings],
    scannedAt: new Date().toISOString(),
  };
}
