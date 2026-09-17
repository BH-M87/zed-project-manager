import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProjectManagerConfig } from "./types.js";

export const DEFAULT_MAX_DEPTH = 4;
export const DEFAULT_IGNORE = ["node_modules", ".git", "target", "dist", "build"];

export function expandHome(value: string): string {
  const home = os.homedir();
  if (value === "~") {
    return home;
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(home, value.slice(2));
  }
  return value
    .replace(/^\$HOME(?=$|[\\/])/, home)
    .replace(/^\$\{HOME\}(?=$|[\\/])/, home);
}

export function getConfigPath(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.ZPM_CONFIG?.trim();
  return path.resolve(expandHome(configured || "~/.config/zed-project-manager/config.json"));
}

export function getDefaultCachePath(): string {
  return path.resolve(expandHome("~/.cache/zed-project-manager/projects.json"));
}

export function defaultConfig(): Omit<ProjectManagerConfig, "cachePath"> {
  return {
    roots: ["~/Projects"],
    maxDepth: DEFAULT_MAX_DEPTH,
    ignore: DEFAULT_IGNORE,
    nestedRepositories: false,
    followSymlinks: false,
  };
}

function assertStringArray(value: unknown, key: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Configuration field \"${key}\" must be an array of strings.`);
  }
}

export async function loadConfig(configPath = getConfigPath()): Promise<ProjectManagerConfig> {
  let text: string;
  try {
    text = await readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Configuration not found at ${configPath}. Run \"zpm init\" first.`);
    }
    throw new Error(`Unable to read configuration at ${configPath}: ${(error as Error).message}`);
  }

  return parseConfig(text, configPath);
}

export function parseConfig(text: string, configPath: string): ProjectManagerConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`Configuration at ${configPath} is not valid JSON: ${(error as Error).message}`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Configuration at ${configPath} must contain a JSON object.`);
  }

  const input = raw as Record<string, unknown>;
  const defaults = defaultConfig();
  const roots = input.roots ?? defaults.roots;
  const ignore = input.ignore ?? defaults.ignore;
  assertStringArray(roots, "roots");
  assertStringArray(ignore, "ignore");

  const maxDepth = input.maxDepth ?? defaults.maxDepth;
  if (!Number.isInteger(maxDepth) || (maxDepth as number) < 0) {
    throw new Error('Configuration field "maxDepth" must be a non-negative integer.');
  }
  const nestedRepositories = input.nestedRepositories ?? defaults.nestedRepositories;
  const followSymlinks = input.followSymlinks ?? defaults.followSymlinks;
  if (typeof nestedRepositories !== "boolean") {
    throw new Error('Configuration field "nestedRepositories" must be a boolean.');
  }
  if (typeof followSymlinks !== "boolean") {
    throw new Error('Configuration field "followSymlinks" must be a boolean.');
  }
  if (input.cachePath !== undefined && typeof input.cachePath !== "string") {
    throw new Error('Configuration field "cachePath" must be a string.');
  }
  if (input.zedBin !== undefined && typeof input.zedBin !== "string") {
    throw new Error('Configuration field "zedBin" must be a string.');
  }

  return {
    roots,
    ignore,
    maxDepth: maxDepth as number,
    nestedRepositories,
    followSymlinks,
    cachePath: path.resolve(expandHome((input.cachePath as string | undefined) || getDefaultCachePath())),
    ...(input.zedBin ? { zedBin: expandHome(input.zedBin as string) } : {}),
  };
}

export async function initializeConfig(configPath = getConfigPath()): Promise<{ path: string; created: boolean }> {
  await mkdir(path.dirname(configPath), { recursive: true });
  try {
    await access(configPath, constants.F_OK);
    return { path: configPath, created: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`Unable to access configuration path ${configPath}: ${(error as Error).message}`);
    }
  }

  try {
    await writeFile(configPath, `${JSON.stringify(defaultConfig(), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return { path: configPath, created: false };
    }
    throw new Error(`Unable to create configuration at ${configPath}: ${(error as Error).message}`);
  }
  return { path: configPath, created: true };
}
