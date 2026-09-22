# Using Project Manager

English | [简体中文](usage.zh-CN.md) | [Project overview](../README.md)

Project Manager has three entry points: Zed Tasks, the Zed Agent through MCP, and the terminal CLI. Zed Tasks are convenient for everyday switching because they support keyboard shortcuts and open a searchable project picker in Zed's integrated terminal.

The picker is a terminal UI, not a native Zed Quick Pick. Zed's public extension API does not expose a native project-switching picker for this workflow.

## First-time setup

### 1. Install the CLI

To test this source checkout and its development extension:

```sh
npm install
npm run build
npm link
zpm --version
```

To install the latest published CLI:

```sh
npm install -g zed-project-manager
```

This project is not yet listed in the official extension marketplace. To test a local build, set an absolute `binary_path` pointing to it in Zed settings; this is required if the checkout's npm version has not been published. Once the matching npm version is available, leave `binary_path` empty to test the extension's automatic installation. Installing the CLI globally does not validate the extension's installation path.

### 2. Configure scan roots

```sh
zpm config
```

The wizard loads your current configuration, or defaults if no configuration file exists. It walks through:

1. **Scan roots:** keep the current list or replace it by entering paths one at a time, followed by an empty entry. `~`, `$HOME`, and `${HOME}` are supported. Do not quote paths containing spaces.
2. **Scan depth:** a root has depth 0, its immediate children have depth 1, and `root/group/project` has depth 2.
3. **Ignore patterns:** defaults skip `node_modules`, `.git`, `target`, `dist`, and `build`. Replace them with directory names or glob patterns. An empty replacement list clears custom ignores, but `.git` is never traversed.
4. **Nested repositories:** disabled by default; discovering a repository stops descent. Enable this for `outer-repository/workspaces/inner-repository`. Increasing depth alone will not discover the inner repository.
5. **Directory symlinks:** disabled by default. Enable this if projects are reached through directory symlinks. Depth, ignore, and nested-repository rules still apply, and targets can be outside your scan roots.

Review the JSON and confirm before saving. Ctrl-C or declining to save leaves the original file untouched. Other fields such as `cachePath` and `zedBin` are preserved. Saving does not automatically scan; run `zpm scan` afterward.

You can also enter the same wizard with `zpm init --interactive`. For scripts, use the noninteractive `zpm init` to create defaults without overwriting an existing file, then `zpm config-path` to locate it for editing. The wizard needs an interactive terminal. Example configuration:

```json
{
  "roots": [
    "~/OwnDevWorkspaces",
    "~/Work"
  ],
  "maxDepth": 4,
  "ignore": [
    "node_modules",
    ".git",
    "target",
    "dist",
    "build"
  ],
  "nestedRepositories": false,
  "followSymlinks": false
}
```

Scan and confirm the project list:

```sh
zpm scan
zpm list
```

### 3. Register Zed Tasks

The shortcuts launch global Zed Tasks. The global task file is:

```text
~/.config/zed/tasks.json
```

If it does not exist, copy the example from the repository root:

```sh
mkdir -p ~/.config/zed
cp zed/tasks.json.example ~/.config/zed/tasks.json
```

If it already exists, merge the three objects from [`zed/tasks.json.example`](../zed/tasks.json.example) into its JSON array without replacing existing tasks.

Alternatively, open the Command Palette, run `zed: open tasks`, and merge the task configuration there. Save and run `task: spawn`; you should see:

- `Project Manager: Switch (reuse)`
- `Project Manager: Open in new window`
- `Project Manager: Refresh cache`

The shortcuts will not work unless the corresponding tasks are available.

### 4. Register keyboard shortcuts

Run `zed: open keymap file` from the Command Palette and merge the bindings from [`zed/keymap.json.example`](../zed/keymap.json.example) into the existing keymap array.

Suggested macOS shortcuts:

| Shortcut | Action |
| --- | --- |
| `cmd-alt-o` | Search projects and replace the current Zed workspace |
| `cmd-alt-shift-o` | Search projects and open a new Zed window |

A binding's `task_name` must exactly match its task's `label`, including case and parentheses.

## Open and switch projects

### Keyboard shortcuts

Press `cmd-alt-o` to open and focus an integrated terminal with the `Open project` picker:

1. Type part of a project name or path to filter.
2. Move the selection with the up and down arrow keys.
3. Press Enter to open the selected project.
4. Press Ctrl-C to cancel.

The task runs `zed --reuse <project-path>` after selection. `cmd-alt-shift-o` uses the same picker and runs `zed --new <project-path>`.

### Command Palette

Without a shortcut:

1. Press `cmd-shift-p`.
2. Run `task: spawn`.
3. Find and select `Project Manager: Switch (reuse)`.

This is also useful for troubleshooting: if the task appears and runs correctly, check the keymap. If it is missing, check the global task configuration first.

### Zed Agent / MCP

Install the development extension and configure its local executable as described in the [README](../README.md#install-the-development-extension-in-zed). In the Agent Panel, ask:

```text
Use mcp-server-project-manager to list my projects.
Use mcp-server-project-manager to refresh the project cache.
Use mcp-server-project-manager to open zed-project-manager in the current window.
```

The Agent calls `list_projects`, `refresh_projects`, or `open_project`. Tool approval depends on your Zed permissions settings. This entry point does not display the terminal picker; it lets you name a project in natural language.

### Migrate from the old development extension

Version `0.3.0` changes the extension ID and context server key from `project-manager` to `mcp-server-project-manager`, with the display name **Project Manager MCP Server**. Back up your Zed settings and move the entire object at `context_servers.project-manager` to the new key. Preserve all existing fields, including `binary_path` and `config_path` inside `settings`. If the new key already exists, reconcile its fields before replacing anything.

Install the new development extension, verify that the new server starts, then uninstall the old `project-manager` development extension and remove its obsolete settings entry. The npm package name, `zpm` command, configuration/cache files, MCP tool names, Task labels, and shortcuts do not change. See the [publishing guide](publishing.md) for the full validation workflow.

### Terminal CLI

```sh
zpm open                  # Interactive search, reusing the current window
zpm open my-project       # Match a project by name or path
zpm open my-project --new # Open in a new window
zpm scan                  # Scan again
zpm list                  # Inspect the cache
```

## Troubleshooting

### Nothing happens after pressing `cmd-alt-o`

Run `task: spawn` from the Command Palette:

- If `Project Manager: Switch (reuse)` is missing, check the global `tasks.json` location and task labels.
- If the task appears and works manually, check the binding in `~/.config/zed/keymap.json`.
- If another action still intercepts the shortcut, run `dev: open key context view` to inspect the active context and conflicts.

### The terminal reports `zpm: command not found`

```sh
command -v zpm
```

For a source installation, run `npm link` from the built checkout. For a published installation, reinstall the desired published npm version. Ensure that your shell startup files, such as `.zprofile` or `.zshrc`, make npm's global executable directory available to Zed's terminal. Open a new Zed terminal after changing `PATH`.

### The picker is empty

```sh
zpm config-path
zpm scan
zpm list
```

Check that the configured roots exist and `maxDepth` reaches the repository directories. Enable `nestedRepositories` if the projects are inside another repository.

### The Agent and shortcuts list different projects

The CLI and shortcuts default to `~/.config/zed-project-manager/config.json`; MCP can use another configuration through `settings.config_path` in Zed. Point both entry points at the same persistent configuration. Avoid keeping a temporary configuration under `/tmp` as your regular setup.

### The new development extension cannot start

If the checkout's npm version has not been published, set an absolute `settings.binary_path` under `context_servers.mcp-server-project-manager` to the locally built `zpm`. Check that `zpm --version` reports the checkout's version and that the executable exists. When using automatic installation instead, confirm that the exact version pinned by the extension is available on npm. Verify that your settings object was moved to the new key, then inspect `zed: open log`. Build prerequisites and validation steps are in the [publishing guide](publishing.md).
