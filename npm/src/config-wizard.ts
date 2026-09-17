import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import prompts from "prompts";
import { defaultConfig, getConfigPath, parseConfig } from "./config.js";

class ConfigurationCancelled extends Error {}

async function ask(question: prompts.PromptObject<"value">): Promise<any> {
  const response = await prompts(question, {
    onCancel: () => { throw new ConfigurationCancelled(); },
  });
  return response.value;
}

async function editList(label: string, current: string[], required: boolean): Promise<string[]> {
  process.stdout.write(`${label}:\n${current.map((item) => `  ${item}`).join("\n") || "  (none)"}\n`);
  if ((!required || current.length > 0) && await ask({
    type: "confirm", name: "value", message: `Keep these ${label.toLowerCase()}?`, initial: true,
  })) {
    return current;
  }
  process.stdout.write("Enter one item at a time, without quotes. Leave blank to finish.\n");
  const items: string[] = [];
  while (true) {
    const item = (await ask({
      type: "text", name: "value", message: `${label} #${items.length + 1}`,
      validate: (value: string) => !required || items.length > 0 || value.trim().length > 0
        ? true : "Enter at least one scan directory.",
    }) as string).trim();
    if (!item) return items;
    if (!items.includes(item)) items.push(item);
  }
}

async function readExisting(configPath: string): Promise<string | undefined> {
  try {
    return await readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function configureInteractively(configPath = getConfigPath()): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Configuration wizard requires an interactive terminal. Run "zpm init" to create defaults and "zpm config-path" to locate the file.');
  }

  const original = await readExisting(configPath);
  // Validate before prompting; retain unedited fields and their original path notation.
  const current = original === undefined ? defaultConfig() : parseConfig(original, configPath);
  const raw = original === undefined ? {} : JSON.parse(original) as Record<string, unknown>;
  process.stdout.write(`Configure Project Manager\nFile: ${configPath}\nPress Ctrl+C at any step to cancel without saving.\n`);

  try {
    process.stdout.write("\n1/5 — Scan directories (roots)\nChoose folders containing your Git projects. ~, $HOME and ${HOME} are supported.\n");
    const roots = await editList("Scan directories", current.roots, true);

    process.stdout.write("\n2/5 — Scan depth (maxDepth)\nThe scan directory is depth 0; its children are depth 1. For root/group/project, use at least 2.\n");
    const maxDepth = Number(await ask({
      type: "text", name: "value", message: "Maximum depth", initial: String(current.maxDepth),
      validate: (value: string) => value.trim() !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0
        ? true : "Enter a non-negative whole number (0 scans only the roots).",
    }));

    process.stdout.write("\n3/5 — Ignored directories (ignore)\nPatterns match directory names or paths relative to each scan root. Examples: node_modules, build, archive/**.\nAn empty list removes all configurable exclusions; .git is always skipped.\n");
    const ignore = await editList("Ignore patterns", current.ignore, false);

    process.stdout.write("\n4/5 — Nested repositories (nestedRepositories)\nOff (default): stop descending when a Git repository is found, even if maxDepth allows more.\nOn: also find repositories inside it, e.g. outer-repo/workspaces/inner-repo.\n");
    const nestedRepositories = await ask({
      type: "confirm", name: "value", message: "Scan inside discovered Git repositories?", initial: current.nestedRepositories,
    }) as boolean;

    process.stdout.write("\n5/5 — Directory symlinks (followSymlinks)\nOff (default): skip directory symlinks encountered inside scan roots.\nOn: scan their targets, including folders outside the roots. Real paths are deduplicated to avoid cycles.\nDepth, ignore rules and the nested-repository setting still apply.\n");
    const followSymlinks = await ask({
      type: "confirm", name: "value", message: "Follow directory symlinks?", initial: current.followSymlinks,
    }) as boolean;

    const text = `${JSON.stringify({ ...raw, roots, maxDepth, ignore, nestedRepositories, followSymlinks }, null, 2)}\n`;
    parseConfig(text, configPath);
    process.stdout.write(`\nConfiguration to save at ${configPath}:\n${text}`);
    if (!await ask({ type: "confirm", name: "value", message: "Save this configuration?", initial: true })) {
      process.stdout.write("Configuration cancelled. No changes saved.\n");
      return;
    }

    if (await readExisting(configPath) !== original) {
      throw new Error("Configuration changed while the wizard was open. Run it again to keep those changes.");
    }
    // Follow an existing config symlink instead of replacing the link itself.
    const target = original === undefined ? configPath : await realpath(configPath);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, text, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    process.stdout.write(`Saved configuration at ${configPath}\nRun "zpm scan" to refresh the project cache.\n`);
  } catch (error) {
    if (!(error instanceof ConfigurationCancelled)) throw error;
    process.stdout.write("Configuration cancelled. No changes saved.\n");
  }
}
