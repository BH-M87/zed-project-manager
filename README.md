# Project Manager MCP Server

English | [简体中文](README.zh-CN.md)

Discover Git repositories under configured directories and open them from a terminal, a Zed Task, or the Zed Agent. Inspired by [VS Code Project Manager](https://github.com/alefragnani/vscode-project-manager), this project provides automatic repository discovery and fast project switching using Zed's public extension APIs.

This project is not yet listed in the Zed extension marketplace. Install the latest published CLI from npm, or build this checkout from source. If the checkout's npm version has not been published, test its development extension with a local build and the `binary_path` setting described below.

## Quick start from source

```sh
npm install
npm run build
npm link
zpm init --interactive
zpm scan
```

Merge [`zed/tasks.json.example`](zed/tasks.json.example) into your global `~/.config/zed/tasks.json` and [`zed/keymap.json.example`](zed/keymap.json.example) into `~/.config/zed/keymap.json`:

- `cmd-alt-o`: search for a project and open it in the current window.
- `cmd-alt-shift-o`: search for a project and open it in a new window.

The searchable picker runs in Zed's integrated terminal. See the [usage guide](docs/usage.md) for setup, interaction, and troubleshooting.

### Agent-assisted setup

The repository includes a [`setup-zed-project-manager`](skills/setup-zed-project-manager/SKILL.md) skill. In an agent that supports skills, run it from this repository:

```text
Use $setup-zed-project-manager to set up Project Manager and scan ~/OwnDevWorkspaces.
```

The skill guides CLI installation and verification, initializes the scanning configuration, merges Zed Tasks, key bindings, and MCP settings, and checks the shortcuts and picker in Zed. Existing Zed settings are preserved instead of replacing entire configuration files with examples.

## Features and limits

- Scan one or more roots, recognizing both `.git/` directories and Git worktree `.git` files.
- Configure scan depth, ignore patterns, nested repositories, and directory symlinks.
- Cache discovered projects and their last-opened timestamps.
- Use the `zed` CLI to reuse a window, open a new window, or add a project to the current workspace.
- Expose project listing, refresh, and opening tools to the Zed Agent over stdio MCP.
- Choose projects with a searchable terminal picker.

This is not a feature-for-feature port of the VS Code extension. Zed extension code runs in WebAssembly, and its public APIs do not provide a native Quick Pick or Project Manager sidebar for this workflow. The project uses a Rust/Wasm extension to launch a local Node.js CLI/MCP server. The interactive picker is a **terminal UI, not a native Zed Quick Pick**.

## Architecture

```text
Zed Agent
   │ MCP tools
   ▼
Rust/Wasm extension ── launches `zpm mcp`
                              │
                              ├─ reads configuration and scans Git repositories
                              ├─ reads and writes the project cache
                              └─ invokes the `zed` CLI to open projects

Terminal / Zed Task ─────────► `zpm` CLI
```

The Rust extension registers the `mcp-server-project-manager` context server and installs/launches the npm package at the extension's exact version. Filesystem access and process execution happen in Node.js. Set `binary_path` to a locally built `zpm` during development to bypass automatic npm installation.

## Requirements

- Node.js 18 or later.
- Zed installed, with the `zed` command available in your terminal.
- For extension development: Rust with the `wasm32-wasip2` target. [rustup](https://rustup.rs/) is recommended for managing toolchains and targets. Having a Homebrew `cargo` or `rustc` alone does not establish that the required Wasm target is installed. See the [publishing guide](docs/publishing.md) for build instructions.

## Install the CLI

For the currently published CLI:

```sh
npm install -g zed-project-manager
zpm --help
```

For this source checkout and its development extension:

```sh
npm install
npm run build
npm link
zpm --help
```

If you prefer not to use a link, install the built checkout globally:

```sh
npm install
npm run build
npm install -g .
zpm --help
```

Global installation provides the terminal picker and Zed Tasks. When `binary_path` is unset, the extension installs its exact npm version independently of the global installation. That version must already exist on npm; use the source build override while testing an unpublished version.

## Configuration

Use the step-by-step wizard to create or edit your configuration:

```sh
zpm config              # Create or edit configuration using current values as defaults
zpm init --interactive  # Enter the same wizard during first-time setup
```

The wizard explains scan roots, depth, ignore rules, nested repositories, and symlinks. Enter roots and ignore patterns one per prompt; do not add quotes around paths containing spaces. Finish a replacement list with an empty entry. Review the complete JSON before saving. Ctrl-C or declining to save leaves the original file unchanged, and unrelated fields such as `cachePath` and `zedBin` are preserved. Run `zpm scan` afterward to refresh the cache.

For scripts or manual setup, `zpm init` creates a default configuration without overwriting an existing file, and `zpm config-path` prints its location. The wizard requires an interactive terminal and does not read answers from a pipe.

The default configuration is `~/.config/zed-project-manager/config.json`; the default cache is `~/.cache/zed-project-manager/projects.json`. Override the configuration path with `ZPM_CONFIG`:

```sh
ZPM_CONFIG=~/dotfiles/zed-project-manager.json zpm scan
```

Example configuration:

```json
{
  "roots": [
    "~/Projects",
    "$HOME/Work"
  ],
  "maxDepth": 4,
  "ignore": [
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    "archive/**"
  ],
  "nestedRepositories": false,
  "followSymlinks": false,
  "cachePath": "~/.cache/zed-project-manager/projects.json",
  "zedBin": "zed"
}
```

- `roots`: directories to scan; supports `~`, `$HOME`, and `${HOME}`. Duplicate or overlapping roots are deduplicated.
- `maxDepth`: a nonnegative integer; a root is at depth `0`.
- `ignore`: glob patterns matching directory names or paths relative to a root.
- `nestedRepositories`: defaults to `false`, so finding a repository stops descent into that directory even when the depth limit has not been reached. Enable it to discover layouts such as `outer-repository/workspaces/inner-repository`.
- `followSymlinks`: defaults to `false`. Enable it to scan directory symlink targets, which may be outside the configured roots. Real paths are deduplicated to prevent loops; depth and nested-repository rules still apply.
- `cachePath`: location of the project cache.
- `zedBin`: the `zed` command name or an absolute path to it.

Missing or inaccessible roots produce warnings without interrupting scans of other roots.

## CLI commands

```sh
zpm init                         # Create default configuration without overwriting
zpm init --interactive           # Guided configuration, equivalent to zpm config
zpm config                       # Create or edit scanning configuration interactively
zpm config-path                  # Print the active configuration path
zpm scan                         # Scan and update the cache
zpm scan --json                  # Print scan results as JSON
zpm list                         # List cached projects
zpm list --refresh --json        # Refresh first, then print JSON
zpm open                         # Choose a project in the terminal
zpm open <name-or-path>           # Exact or unambiguous fuzzy match
zpm open <project> --reuse        # Reuse the current window (default)
zpm open <project> --new          # Open a new window
zpm open <project> --add          # Add to the current workspace
zpm open <project> --dry-run      # Print the command without starting Zed
zpm open <project> --zed-bin /path/to/zed
zpm mcp                          # Run the MCP server over stdio
```

Run `zpm scan` before first use. `open` reads the cache; if a query matches multiple projects, it reports the candidates and asks for a full name or path.

## Install the development extension in Zed

1. Build and link the CLI as above. Run `command -v zpm` to obtain its absolute path.
2. Add the settings below using that path to run the local build. This is required if the checkout's npm version has not been published and also avoids differences between your shell's `PATH` and the GUI application's environment.
3. Open Extensions in Zed and select **Install Dev Extension**, or run `zed: install dev extension` from the Command Palette.
4. Select this repository's root directory, containing `extension.toml`.
5. Open **Settings → AI → MCP Servers** and confirm that `mcp-server-project-manager` (Project Manager MCP Server) starts successfully.

Merge this object into your Zed settings, preserving other servers and settings:

```json
{
  "context_servers": {
    "mcp-server-project-manager": {
      "settings": {
        "binary_path": "/absolute/path/to/zpm",
        "config_path": "/absolute/path/to/config.json"
      }
    }
  }
}
```

With an empty `binary_path`, the extension downloads the matching npm version and launches it with Node.js. A nonempty path overrides that behavior. An empty `config_path` uses the CLI default; a nonempty path is passed to the MCP server as `ZPM_CONFIG`. For diagnostics, run `zed: open log` or start Zed with `zed --foreground`.

### Migrate from the 0.2.0 development extension

Version `0.3.0` changes both the extension ID and the context server key from `project-manager` to `mcp-server-project-manager`. Its display name becomes **Project Manager MCP Server**.

Back up your Zed settings, then move the **entire existing object** at `context_servers.project-manager` to `context_servers.mcp-server-project-manager`. Preserve every field, including `settings`, `binary_path`, `config_path`, and any other existing values. If the destination key already exists, reconcile its fields before replacing anything.

Install the new development extension and verify that the new server starts. Then uninstall the old `project-manager` development extension and remove its obsolete settings entry to avoid running duplicate servers. The npm package name `zed-project-manager`, the `zpm` command, configuration and cache locations, MCP tool names, Zed Task labels, and key bindings remain unchanged. Project data does not need migration.

## MCP tools

Once the extension is enabled, the Zed Agent can use:

- `list_projects`: read the cache, optionally scanning first with `refresh: true`.
- `refresh_projects`: scan again and replace the cache.
- `open_project`: open by name or path, with `reuse`, `new`, or `add` mode and a `dryRun` option.

Tool approval depends on your Zed permissions settings. Check server status in **Settings → AI → MCP Servers** and mention `mcp-server-project-manager` in your request to help the Agent select its tools.

## Zed Tasks and shortcuts

Shortcuts require matching tasks in the global `~/.config/zed/tasks.json`. Run `zed: open tasks` and merge the three objects from [`zed/tasks.json.example`](zed/tasks.json.example). If the global file does not exist, you can copy the example from the repository root:

```sh
mkdir -p ~/.config/zed
cp zed/tasks.json.example ~/.config/zed/tasks.json
```

Do not overwrite an existing task file. Merge the bindings from [`zed/keymap.json.example`](zed/keymap.json.example) into your keymap. Each binding's `task_name` must exactly match the task's `label`.

You can also choose a task manually through `task: spawn`. In the integrated terminal picker, type a project name or path to filter, use the arrow keys to select, press Enter to open, or Ctrl-C to cancel. See the [usage guide](docs/usage.md).

## Publishing

The [publishing guide](docs/publishing.md) covers version synchronization, build validation, npm publication, development-extension testing, and submission to [`zed-industries/extensions`](https://github.com/zed-industries/extensions). npm publication and acceptance into the Zed marketplace are separate steps; verify each release's status independently.

Before submission, validate scanning, paths, and `zed` CLI arguments on macOS, Linux, and Windows; verify the MIT license, unique extension ID, and matching versions; publish the exact npm version before testing automatic installation; and test all three MCP tools and failure messages in Zed. Marketplace submissions use a public repository and an HTTPS submodule URL. Extension IDs cannot be changed after publication, and must meet the official naming requirements.

Zed has announced plans to replace MCP server extensions with the official [MCP Registry](https://registry.modelcontextprotocol.io/). Track that transition and plan a separate registry submission for the Node MCP server.

## References

- [Zed: Developing Extensions](https://zed.dev/docs/extensions/developing-extensions)
- [Zed: MCP Server Extensions](https://zed.dev/docs/extensions/mcp-extensions)
- [Zed: Model Context Protocol](https://zed.dev/docs/ai/mcp)
- [Zed: Tasks](https://zed.dev/docs/tasks)
- [VS Code Project Manager](https://github.com/alefragnani/vscode-project-manager)
