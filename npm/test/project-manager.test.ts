import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  expandHome,
  getConfigPath,
  loadConfig,
} from "../src/config.js";
import { ProjectCacheStore } from "../src/cache.js";
import { ProjectService } from "../src/project-service.js";
import { scanProjects } from "../src/scanner.js";
import type { ProjectManagerConfig } from "../src/types.js";

async function withTemporaryDirectory(
  name: string,
  callback: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), `${name}-`));
  try {
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function configFor(
  root: string,
  overrides: Partial<ProjectManagerConfig> = {},
): ProjectManagerConfig {
  return {
    roots: [root],
    maxDepth: 4,
    ignore: [],
    nestedRepositories: false,
    followSymlinks: false,
    cachePath: path.join(root, "projects-cache.json"),
    ...overrides,
  };
}

async function createRepository(
  directory: string,
  marker: "directory" | "worktree" = "directory",
): Promise<void> {
  await mkdir(directory, { recursive: true });
  if (marker === "directory") {
    await mkdir(path.join(directory, ".git"));
  } else {
    await writeFile(path.join(directory, ".git"), "gitdir: ../.git/worktrees/example\n", "utf8");
  }
}

test("scanProjects detects .git directories and worktree .git files, and applies ignore patterns", async () => {
  await withTemporaryDirectory("zpm-scan-markers", async (root) => {
    const repository = path.join(root, "repository");
    const worktree = path.join(root, "worktree");
    const ignored = path.join(root, "ignored", "hidden-repository");
    const falsePositive = path.join(root, "not-a-repository");
    await createRepository(repository);
    await createRepository(worktree, "worktree");
    await createRepository(ignored);
    await mkdir(falsePositive);
    await writeFile(path.join(falsePositive, ".git"), "not a gitdir marker\n", "utf8");

    const result = await scanProjects(configFor(root, { ignore: ["ignored"] }));

    assert.deepEqual(result.projects.map((project) => project.path), [repository, worktree]);
    assert.deepEqual(result.warnings, []);
  });
});

test("scanProjects respects maxDepth", async () => {
  await withTemporaryDirectory("zpm-scan-depth", async (root) => {
    const direct = path.join(root, "direct");
    const tooDeep = path.join(root, "group", "too-deep");
    await createRepository(direct);
    await createRepository(tooDeep);

    const result = await scanProjects(configFor(root, { maxDepth: 1 }));

    assert.deepEqual(result.projects.map((project) => project.path), [direct]);
  });
});

test("scanProjects can stop at an outer repository or include nested repositories", async () => {
  await withTemporaryDirectory("zpm-scan-nested", async (root) => {
    const outer = path.join(root, "outer");
    const inner = path.join(outer, "packages", "inner");
    await createRepository(outer);
    await createRepository(inner);

    const withoutNested = await scanProjects(configFor(root, { nestedRepositories: false }));
    const withNested = await scanProjects(configFor(root, { nestedRepositories: true }));

    assert.deepEqual(withoutNested.projects.map((project) => project.path), [outer]);
    assert.deepEqual(withNested.projects.map((project) => project.path), [inner, outer]);
  });
});

test("scanProjects de-duplicates overlapping roots and warns about missing roots", async () => {
  await withTemporaryDirectory("zpm-scan-roots", async (root) => {
    const repository = path.join(root, "repository");
    const missing = path.join(root, "missing");
    await createRepository(repository);

    const result = await scanProjects(configFor(root, {
      roots: [root, root, repository, missing],
    }));

    assert.deepEqual(result.projects.map((project) => project.path), [repository]);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0] ?? "", /Configured root does not exist/);
    assert.match(result.warnings[0] ?? "", new RegExp(missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("scanProjects follows directory symlinks only when enabled", async () => {
  await withTemporaryDirectory("zpm-scan-symlink", async (directory) => {
    const root = path.join(directory, "root");
    const target = path.join(directory, "external-repository");
    const linkedRepository = path.join(root, "linked-repository");
    await mkdir(root);
    await createRepository(target);
    await symlink(target, linkedRepository, "dir");

    const withoutSymlinks = await scanProjects(configFor(root, { followSymlinks: false }));
    const withSymlinks = await scanProjects(configFor(root, { followSymlinks: true }));

    assert.deepEqual(withoutSymlinks.projects, []);
    assert.deepEqual(withSymlinks.projects.map((project) => project.path), [linkedRepository]);
  });
});

test("configuration expands HOME forms and honors ZPM_CONFIG", async () => {
  await withTemporaryDirectory("zpm-config", async (directory) => {
    const home = os.homedir();
    assert.equal(expandHome("~"), home);
    assert.equal(expandHome("~/Projects"), path.join(home, "Projects"));
    assert.equal(expandHome("$HOME/Projects"), path.join(home, "Projects"));
    assert.equal(expandHome("${HOME}/Projects"), path.join(home, "Projects"));
    assert.equal(
      getConfigPath({ ZPM_CONFIG: "~/.config/zpm-test.json" }),
      path.join(home, ".config", "zpm-test.json"),
    );

    const configPath = path.join(directory, "config.json");
    await writeFile(configPath, JSON.stringify({
      roots: ["~/Projects"],
      cachePath: "~/.cache/zpm-test.json",
      zedBin: "~/bin/zed",
    }), "utf8");

    const config = await loadConfig(configPath);
    assert.deepEqual(config.roots, ["~/Projects"]);
    assert.equal(config.cachePath, path.join(home, ".cache", "zpm-test.json"));
    assert.equal(config.zedBin, path.join(home, "bin", "zed"));
  });
});

test("cache round-trips projects and refresh preserves lastOpenedAt", async () => {
  await withTemporaryDirectory("zpm-cache", async (directory) => {
    const root = path.join(directory, "projects");
    const repository = path.join(root, "alpha");
    const cachePath = path.join(directory, "cache", "projects.json");
    const configPath = path.join(directory, "config.json");
    const lastOpenedAt = "2026-07-15T08:00:00.000Z";
    await createRepository(repository);
    await writeFile(configPath, JSON.stringify({ roots: [root], cachePath }), "utf8");

    const store = new ProjectCacheStore(cachePath);
    await store.write({
      version: 1,
      scannedAt: "2026-07-15T07:00:00.000Z",
      projects: [{ name: "alpha", path: repository, lastOpenedAt }],
    });
    assert.equal((await store.read())?.projects[0]?.lastOpenedAt, lastOpenedAt);

    const previousConfig = process.env.ZPM_CONFIG;
    process.env.ZPM_CONFIG = configPath;
    try {
      const service = await ProjectService.create();
      const result = await service.refresh();
      assert.equal(result.projects[0]?.lastOpenedAt, lastOpenedAt);
      assert.equal((await store.read())?.projects[0]?.lastOpenedAt, lastOpenedAt);
    } finally {
      if (previousConfig === undefined) {
        delete process.env.ZPM_CONFIG;
      } else {
        process.env.ZPM_CONFIG = previousConfig;
      }
    }
  });
});

test("open dry-run builds every Zed command mode without spawning or updating lastOpenedAt", async () => {
  await withTemporaryDirectory("zpm-open", async (directory) => {
    const root = path.join(directory, "projects");
    const repository = path.join(root, "alpha");
    const cachePath = path.join(directory, "cache.json");
    const configPath = path.join(directory, "config.json");
    const lastOpenedAt = "2026-07-15T08:00:00.000Z";
    await createRepository(repository);
    await writeFile(configPath, JSON.stringify({ roots: [root], cachePath }), "utf8");
    await new ProjectCacheStore(cachePath).write({
      version: 1,
      scannedAt: "2026-07-15T07:00:00.000Z",
      projects: [{ name: "alpha", path: repository, lastOpenedAt }],
    });

    const previousConfig = process.env.ZPM_CONFIG;
    process.env.ZPM_CONFIG = configPath;
    try {
      const service = await ProjectService.create();
      const project = await service.resolveProject("alpha");
      const reuse = await service.open(project, { dryRun: true, zedBin: "/fake/zed" });
      const fresh = await service.open(project, { dryRun: true, mode: "new", zedBin: "/fake/zed" });
      const add = await service.open(project, { dryRun: true, mode: "add", zedBin: "/fake/zed" });

      assert.deepEqual(reuse.command, ["/fake/zed", "--reuse", repository]);
      assert.deepEqual(fresh.command, ["/fake/zed", "--new", repository]);
      assert.deepEqual(add.command, ["/fake/zed", "--add", repository]);
      assert.equal(reuse.dryRun, true);

      const cache = JSON.parse(await readFile(cachePath, "utf8")) as {
        projects: Array<{ lastOpenedAt?: string }>;
      };
      assert.equal(cache.projects[0]?.lastOpenedAt, lastOpenedAt);
    } finally {
      if (previousConfig === undefined) {
        delete process.env.ZPM_CONFIG;
      } else {
        process.env.ZPM_CONFIG = previousConfig;
      }
    }
  });
});

test("a successful open uses the injected runner and records lastOpenedAt", async () => {
  await withTemporaryDirectory("zpm-open-runner", async (directory) => {
    const root = path.join(directory, "projects");
    const repository = path.join(root, "alpha");
    const cachePath = path.join(directory, "cache.json");
    const configPath = path.join(directory, "config.json");
    await createRepository(repository);
    await writeFile(configPath, JSON.stringify({ roots: [root], cachePath }), "utf8");
    await new ProjectCacheStore(cachePath).write({
      version: 1,
      scannedAt: "2026-07-15T07:00:00.000Z",
      projects: [{ name: "alpha", path: repository }],
    });

    const calls: Array<{ command: string; args: string[] }> = [];
    const previousConfig = process.env.ZPM_CONFIG;
    process.env.ZPM_CONFIG = configPath;
    try {
      const service = await ProjectService.create(async (command, args) => {
        calls.push({ command, args });
      });
      const project = await service.resolveProject("alpha");
      const openedAfter = Date.now();
      const result = await service.open(project, { mode: "new", zedBin: "/fake/zed" });

      assert.deepEqual(calls, [{ command: "/fake/zed", args: ["--new", repository] }]);
      assert.deepEqual(result.command, ["/fake/zed", "--new", repository]);
      assert.equal(result.dryRun, false);
      const cached = await new ProjectCacheStore(cachePath).read();
      assert.ok(cached?.projects[0]?.lastOpenedAt);
      assert.ok(Date.parse(cached.projects[0].lastOpenedAt) >= openedAfter);
    } finally {
      if (previousConfig === undefined) {
        delete process.env.ZPM_CONFIG;
      } else {
        process.env.ZPM_CONFIG = previousConfig;
      }
    }
  });
});
