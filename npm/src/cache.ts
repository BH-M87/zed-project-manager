import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectCache } from "./types.js";

function validateCache(value: unknown, cachePath: string): ProjectCache {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Cache at ${cachePath} does not contain a JSON object.`);
  }
  const cache = value as Partial<ProjectCache>;
  if (cache.version !== 1 || typeof cache.scannedAt !== "string" || !Array.isArray(cache.projects)) {
    throw new Error(`Cache at ${cachePath} has an unsupported or invalid format.`);
  }
  for (const project of cache.projects) {
    if (!project || typeof project.name !== "string" || typeof project.path !== "string"
      || (project.lastOpenedAt !== undefined && typeof project.lastOpenedAt !== "string")) {
      throw new Error(`Cache at ${cachePath} contains an invalid project entry.`);
    }
  }
  return cache as ProjectCache;
}

export class ProjectCacheStore {
  public constructor(public readonly path: string) {}

  public async read(): Promise<ProjectCache | undefined> {
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw new Error(`Unable to read cache at ${this.path}: ${(error as Error).message}`);
    }
    try {
      return validateCache(JSON.parse(text), this.path);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Cache at ${this.path} is not valid JSON: ${error.message}`);
      }
      throw error;
    }
  }

  public async write(cache: ProjectCache): Promise<void> {
    await mkdir(path.dirname(this.path), { recursive: true });
    const nonce = randomBytes(6).toString("hex");
    const temporaryPath = `${this.path}.${process.pid}.${Date.now()}.${nonce}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.path);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw new Error(`Unable to write cache at ${this.path}: ${(error as Error).message}`);
    }
  }
}
