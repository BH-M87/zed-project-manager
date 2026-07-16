export interface ProjectManagerConfig {
  roots: string[];
  maxDepth: number;
  ignore: string[];
  nestedRepositories: boolean;
  followSymlinks: boolean;
  cachePath: string;
  zedBin?: string;
}

export interface Project {
  name: string;
  path: string;
  lastOpenedAt?: string;
}

export interface ScanResult {
  projects: Project[];
  warnings: string[];
  scannedAt: string;
}

export interface ProjectCache {
  version: 1;
  scannedAt: string;
  projects: Project[];
}

export type OpenMode = "reuse" | "new" | "add";

export interface OpenProjectOptions {
  mode?: OpenMode;
  dryRun?: boolean;
  zedBin?: string;
}

export interface OpenProjectResult {
  project: Project;
  command: string[];
  dryRun: boolean;
}
