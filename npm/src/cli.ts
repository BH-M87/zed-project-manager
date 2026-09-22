#!/usr/bin/env node

import { Command, Option } from "commander";
import prompts from "prompts";
import { getConfigPath, initializeConfig } from "./config.js";
import { configureInteractively } from "./config-wizard.js";
import { runMcpServer } from "./mcp.js";
import { ProjectService } from "./project-service.js";
import type { OpenMode, Project } from "./types.js";

interface OutputOptions {
  json?: boolean;
}

interface ListOptions extends OutputOptions {
  refresh?: boolean;
}

interface OpenOptions {
  reuse?: boolean;
  new?: boolean;
  add?: boolean;
  dryRun?: boolean;
  zedBin?: string;
}

function printWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning}\n`);
  }
}

function printProjects(projects: Project[]): void {
  if (projects.length === 0) {
    process.stdout.write("No projects found. Check your roots and run \"zpm scan\".\n");
    return;
  }
  for (const project of projects) {
    const recent = project.lastOpenedAt ? `\t${project.lastOpenedAt}` : "";
    process.stdout.write(`${project.name}\t${project.path}${recent}\n`);
  }
}

async function chooseProject(service: ProjectService): Promise<Project> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('A project name/path is required when input is not interactive. Try "zpm open <project>".');
  }
  const cache = await service.list();
  if (cache.projects.length === 0) {
    throw new Error('No projects are available. Check your configuration and run "zpm scan".');
  }
  const response = await prompts({
    type: "autocomplete",
    name: "projectPath",
    message: "Open project",
    choices: cache.projects.map((project) => ({
      title: project.name,
      description: project.path,
      value: project.path,
    })),
    suggest: (input, choices) => {
      const query = input.toLocaleLowerCase();
      return Promise.resolve(choices.filter((choice) =>
        choice.title.toLocaleLowerCase().includes(query)
        || (choice.description ?? "").toLocaleLowerCase().includes(query)));
    },
  }, {
    onCancel: () => {
      throw new Error("Project selection cancelled.");
    },
  });
  return service.resolveProject(response.projectPath as string);
}

function selectedMode(options: OpenOptions): OpenMode {
  const selected = [options.reuse && "reuse", options.new && "new", options.add && "add"].filter(Boolean);
  if (selected.length > 1) {
    throw new Error("Choose only one open mode: --reuse, --new, or --add.");
  }
  return (selected[0] as OpenMode | undefined) ?? "reuse";
}

export function createProgram(): Command {
  const program = new Command()
    .name("zpm")
    .description("Scan and switch between Git projects in Zed")
    .version("0.3.0");

  program.command("init")
    .description("Create the default configuration file")
    .option("-i, --interactive", "Configure scanning step by step")
    .action(async (options: { interactive?: boolean }) => {
      if (options.interactive) {
        await configureInteractively();
        return;
      }
      const result = await initializeConfig();
      process.stdout.write(result.created
        ? `Created configuration at ${result.path}\n`
        : `Configuration already exists at ${result.path}\n`);
      process.stdout.write('Run "zpm config" for guided configuration.\n');
    });

  program.command("config")
    .description("Configure project scanning with a step-by-step wizard")
    .action(async () => { await configureInteractively(); });

  program.command("config-path")
    .description("Print the active configuration path")
    .action(() => {
      process.stdout.write(`${getConfigPath()}\n`);
    });

  program.command("scan")
    .description("Scan configured roots and update the cache")
    .option("--json", "Print the scan result as JSON")
    .action(async (options: OutputOptions) => {
      const service = await ProjectService.create();
      const result = await service.refresh();
      if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        process.stdout.write(`Found ${result.projects.length} project(s). Cache: ${service.config.cachePath}\n`);
        printWarnings(result.warnings);
      }
    });

  program.command("list")
    .description("List cached projects")
    .option("--refresh", "Scan before listing")
    .option("--json", "Print the project cache as JSON")
    .action(async (options: ListOptions) => {
      const service = await ProjectService.create();
      const cache = await service.list(options.refresh === true);
      if (options.json) {
        process.stdout.write(`${JSON.stringify(cache, null, 2)}\n`);
      } else {
        printProjects(cache.projects);
      }
    });

  program.command("open")
    .description("Open a project in Zed")
    .argument("[project]", "Project name or path; prompts interactively when omitted")
    .addOption(new Option("--reuse", "Reuse the current Zed workspace (default)"))
    .addOption(new Option("--new", "Open in a new Zed window"))
    .addOption(new Option("--add", "Add the project to the current Zed workspace"))
    .option("--dry-run", "Print the command without starting Zed")
    .option("--zed-bin <path>", "Zed CLI binary or path", "")
    .action(async (query: string | undefined, options: OpenOptions) => {
      const service = await ProjectService.create();
      const project = query ? await service.resolveProject(query) : await chooseProject(service);
      const result = await service.open(project, {
        mode: selectedMode(options),
        dryRun: options.dryRun === true,
        ...(options.zedBin ? { zedBin: options.zedBin } : {}),
      });
      if (result.dryRun) {
        process.stdout.write(`${JSON.stringify(result.command)}\n`);
      }
    });

  program.command("mcp")
    .description("Run the MCP server over stdio")
    .action(runMcpServer);

  return program;
}

async function main(): Promise<void> {
  try {
    await createProgram().parseAsync(process.argv);
  } catch (error) {
    process.stderr.write(`zpm: ${(error as Error).message}\n`);
    process.exitCode = 1;
  }
}

await main();
