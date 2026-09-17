import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import prompts from "prompts";
import { configureInteractively } from "../src/config-wizard.js";
import { loadConfig } from "../src/config.js";

async function withWizard(callback: (configPath: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zpm-wizard-"));
  const streams = [process.stdin, process.stdout];
  const descriptors = streams.map((stream) => Object.getOwnPropertyDescriptor(stream, "isTTY"));
  for (const stream of streams) Object.defineProperty(stream, "isTTY", { configurable: true, value: true });
  try {
    await callback(path.join(directory, "config.json"));
  } finally {
    streams.forEach((stream, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(stream, "isTTY", descriptor);
      else Reflect.deleteProperty(stream, "isTTY");
    });
    await rm(directory, { recursive: true, force: true });
  }
}

test("wizard creates a configuration with multiple roots and explicit scan options", async () => {
  await withWizard(async (configPath) => {
    prompts.inject([false, "~/My Projects, work", "$HOME/Work", "", "5", false,
      "node_modules", "{dist,build}", "", true, true, true]);
    await configureInteractively(configPath);
    const config = await loadConfig(configPath);
    assert.deepEqual(config.roots, ["~/My Projects, work", "$HOME/Work"]);
    assert.equal(config.maxDepth, 5);
    assert.deepEqual(config.ignore, ["node_modules", "{dist,build}"]);
    assert.equal(config.nestedRepositories, true);
    assert.equal(config.followSymlinks, true);
    assert.deepEqual(await readdir(path.dirname(configPath)), ["config.json"]);
  });
});

test("wizard retains existing values, advanced fields and unknown fields", async () => {
  await withWizard(async (configPath) => {
    const existing = { roots: ["~/Work"], maxDepth: 5, ignore: ["vendor"],
      nestedRepositories: true, followSymlinks: true,
      cachePath: "$HOME/cache/custom.json", zedBin: "~/bin/zed", extra: { keep: true } };
    await writeFile(configPath, JSON.stringify(existing));
    prompts.inject([true, undefined, true, undefined, undefined, true]);
    await configureInteractively(configPath);
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), existing);
  });
});

test("wizard can clear ignore rules and turn both options off", async () => {
  await withWizard(async (configPath) => {
    await writeFile(configPath, JSON.stringify({ roots: ["~/Work"], nestedRepositories: true, followSymlinks: true }));
    prompts.inject([true, "0", false, "", false, false, true]);
    await configureInteractively(configPath);
    const config = await loadConfig(configPath);
    assert.deepEqual(config.ignore, []);
    assert.equal(config.maxDepth, 0);
    assert.equal(config.nestedRepositories, false);
    assert.equal(config.followSymlinks, false);
  });
});

test("cancellation at each step leaves existing files untouched", async () => {
  await withWizard(async (configPath) => {
    const original = '{ "roots": ["~/Work"] }\n';
    await writeFile(configPath, original);
    const answers = [true, "5", true, true, true];
    for (let step = 0; step <= answers.length; step++) {
      prompts.inject([...answers.slice(0, step), new Error("cancel")]);
      await configureInteractively(configPath);
      assert.equal(await readFile(configPath, "utf8"), original);
    }
    prompts.inject([...answers, false]);
    await configureInteractively(configPath);
    assert.equal(await readFile(configPath, "utf8"), original);
  });
});

test("cancelling first-time setup creates no file", async () => {
  await withWizard(async (configPath) => {
    prompts.inject([true, "4", true, false, false, false]);
    await configureInteractively(configPath);
    assert.deepEqual(await readdir(path.dirname(configPath)), []);
  });
});

test("invalid existing configurations are reported without overwriting", async () => {
  await withWizard(async (configPath) => {
    for (const original of ["{", '{"maxDepth":-1}']) {
      await writeFile(configPath, original);
      await assert.rejects(configureInteractively(configPath), /not valid JSON|non-negative integer/);
      assert.equal(await readFile(configPath, "utf8"), original);
    }
  });
});

test("wizard preserves a config symlink and saves to its target", async () => {
  await withWizard(async (configPath) => {
    const target = path.join(path.dirname(configPath), "target.json");
    await writeFile(target, '{"roots":["~/Work"]}');
    await symlink(target, configPath);
    prompts.inject([true, "5", true, true, false, true]);
    await configureInteractively(configPath);
    assert.equal((await lstat(configPath)).isSymbolicLink(), true);
    assert.equal((await loadConfig(target)).nestedRepositories, true);
  });
});

test("CLI rejects non-interactive wizards and preserves config-path and plain init", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zpm-cli-config-"));
  const configPath = path.join(directory, "custom.json");
  const run = (...args: string[]) => spawnSync(process.execPath,
    ["--import", "tsx", "npm/src/cli.ts", ...args],
    { encoding: "utf8", env: { ...process.env, ZPM_CONFIG: configPath } });
  try {
    for (const args of [["config"], ["init", "--interactive"]]) {
      const result = run(...args);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /requires an interactive terminal/);
      assert.deepEqual(await readdir(directory), []);
    }
    const location = run("config-path");
    assert.equal(location.status, 0, location.stderr);
    assert.equal(location.stdout.trim(), configPath);
    const initialized = run("init");
    assert.equal(initialized.status, 0, initialized.stderr);
    const config = await loadConfig(configPath);
    assert.equal(config.nestedRepositories, false);
    assert.equal(config.followSymlinks, false);
    await writeFile(configPath, '{"roots":["~/Custom"]}');
    assert.equal(run("init").status, 0);
    assert.equal(await readFile(configPath, "utf8"), '{"roots":["~/Custom"]}');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
