import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ProjectService } from "./project-service.js";
import type { OpenMode } from "./types.js";

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export async function runMcpServer(): Promise<void> {
  const service = await ProjectService.create();
  const server = new Server(
    { name: "zed-project-manager", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "list_projects",
        description: "List cached Git projects. Refreshes automatically when no cache exists.",
        inputSchema: {
          type: "object",
          properties: { refresh: { type: "boolean", description: "Scan configured roots before listing." } },
          additionalProperties: false,
        },
      },
      {
        name: "refresh_projects",
        description: "Rescan configured roots and replace the project cache.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "open_project",
        description: "Open a cached project in Zed by name or path.",
        inputSchema: {
          type: "object",
          required: ["project"],
          properties: {
            project: { type: "string", description: "Exact or unique partial project name/path." },
            mode: { type: "string", enum: ["reuse", "new", "add"], default: "reuse" },
            dryRun: { type: "boolean", default: false },
            zedBin: { type: "string", description: "Override the Zed CLI binary." },
          },
          additionalProperties: false,
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;
      switch (request.params.name) {
        case "list_projects":
          if (args.refresh !== undefined && typeof args.refresh !== "boolean") {
            throw new Error('Tool "list_projects" refresh must be a boolean.');
          }
          return textResult(await service.list(args.refresh === true));
        case "refresh_projects":
          return textResult(await service.refresh());
        case "open_project": {
          if (typeof args.project !== "string" || !args.project.trim()) {
            throw new Error('Tool "open_project" requires a non-empty "project" string.');
          }
          const mode = args.mode === undefined ? "reuse" : args.mode;
          if (mode !== "reuse" && mode !== "new" && mode !== "add") {
            throw new Error('Tool "open_project" mode must be "reuse", "new", or "add".');
          }
          if (args.zedBin !== undefined && typeof args.zedBin !== "string") {
            throw new Error('Tool "open_project" zedBin must be a string.');
          }
          if (args.dryRun !== undefined && typeof args.dryRun !== "boolean") {
            throw new Error('Tool "open_project" dryRun must be a boolean.');
          }
          const project = await service.resolveProject(args.project);
          return textResult(await service.open(project, {
            mode: mode as OpenMode,
            dryRun: args.dryRun === true,
            ...(typeof args.zedBin === "string" ? { zedBin: args.zedBin } : {}),
          }));
        }
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: (error as Error).message }] };
    }
  });

  await server.connect(new StdioServerTransport());
}
