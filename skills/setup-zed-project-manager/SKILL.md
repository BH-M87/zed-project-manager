---
name: setup-zed-project-manager
description: Install, initialize, configure, repair, and verify this repository's Zed Project Manager extension and companion zpm CLI. Use when a user asks an agent to set up Project Manager from source, choose Git scan roots, enable cmd-alt-o shortcuts, register Zed Tasks or MCP settings, diagnose a missing project picker, or validate an existing installation.
---

# Setup Zed Project Manager

Complete the local installation rather than only describing commands. Preserve existing Zed and Project Manager configuration while making the smallest required changes.

## Read the project contract

Resolve the repository root as two directories above this `SKILL.md`. Before changing anything, read:

- `../../docs/usage.md`
- `../../zed/tasks.json.example`
- `../../zed/keymap.json.example`
- `../../extension.toml`

If those paths are unavailable, locate a checkout whose `package.json` name is `zed-project-manager`. Ask for the checkout path only when it cannot be discovered safely.

## Completion contract

Treat setup as complete only when all applicable checks pass:

- `zpm` is executable and reports the expected version.
- A persistent config contains the intended scan roots; do not use `/tmp` for long-lived config or cache.
- `zpm scan` succeeds and `zpm list` returns the expected repositories.
- Zed has the three Project Manager tasks and the shortcut targets match their labels exactly.
- `cmd-alt-o` opens the terminal project picker; cancel before switching unless the user named a target.
- The `project-manager` MCP server is enabled and uses the same persistent config.

Report any check that could not be performed instead of presenting partial setup as complete.

## 1. Inspect before mutation

1. Detect the OS, active Zed channel, repository root, Node/npm versions, and current executable paths:

   ```sh
   node --version
   npm --version
   command -v zed || true
   command -v zpm || true
   ```

2. Require Node.js 18 or newer. If it is missing or too old, use the user's existing version manager when discoverable; otherwise request direction before changing the machine-wide Node installation.
3. Inspect, without overwriting:
   - the path returned by `zpm config-path`, when `zpm` already exists;
   - global Zed `tasks.json`, `keymap.json`, and `settings.json`;
   - any existing Project Manager cache and scan roots.
4. Preserve comments, unrelated tasks, keybindings, settings, and user formatting. Never replace an existing JSON/JSONC file wholesale merely to add Project Manager entries.
5. If scan roots were not supplied, ask the user for the one to three directories that should be scanned. Do not default to the entire home directory.

Use these Zed config locations unless current installation evidence shows otherwise:

- macOS/Linux: `~/.config/zed/`
- Windows: `%APPDATA%\Zed\`

## 2. Install the CLI from this checkout

From the repository root, run:

```sh
npm install
npm run build
npm link
zpm --version
```

Prefer source installation for this repository. Use `npm install -g zed-project-manager` only when the user explicitly wants the published package and registry availability has been verified.

Record the absolute output of `command -v zpm`. A GUI-launched Zed process may not inherit the same `PATH` as a terminal, so local dev-extension settings should use this absolute path.

If `zed` is missing but Zed is installed, use Zed's `zed: install cli` action. When UI automation is needed, follow the active computer-use confirmation policy before installing or changing application-level components.

## 3. Initialize scanning

Run `zpm init`; it must not overwrite an existing config. Edit the resulting persistent JSON config so `roots` contains the user-approved directories. Keep these safe defaults unless the user requested otherwise:

```json
{
  "maxDepth": 4,
  "ignore": ["node_modules", ".git", "target", "dist", "build"],
  "nestedRepositories": false,
  "followSymlinks": false
}
```

Then run:

```sh
zpm scan
zpm list
```

Treat missing roots as configuration errors to resolve. An empty result may be valid only after confirming that the selected roots contain no Git working trees within `maxDepth`.

## 4. Merge Zed Tasks and shortcuts

Use the repository examples as the canonical source.

For global `tasks.json`:

- If it does not exist, copy `zed/tasks.json.example`.
- If it exists, merge only missing Project Manager task objects into its top-level array.
- Keep the exact labels:
  - `Project Manager: Switch (reuse)`
  - `Project Manager: Open in new window`
  - `Project Manager: Refresh cache`

For `keymap.json`:

- Merge the bindings from `zed/keymap.json.example` into an applicable `Workspace` binding object.
- Keep unrelated bindings and contexts.
- Default macOS shortcuts are `cmd-alt-o` for reuse and `cmd-alt-shift-o` for a new window. Adapt the platform modifier when setting up Windows or Linux.
- Ensure every `task_name` matches a task `label` byte-for-byte.

The picker is a searchable terminal UI, not a native Zed Quick Pick. It appears in the integrated terminal because the shortcut runs `zpm open` as a Zed Task.

## 5. Configure the extension and MCP server

For source development, install the repository as a Zed dev extension from the Extensions page by selecting the repository root containing `extension.toml`. Zed requires Rust installed through rustup to compile dev extensions. Do not substitute a Homebrew-only Rust toolchain when Zed rejects it.

Merge this shape into Zed `settings.json`, using discovered absolute paths and preserving other settings:

```json
{
  "context_servers": {
    "project-manager": {
      "enabled": true,
      "remote": false,
      "settings": {
        "binary_path": "/absolute/path/to/zpm",
        "config_path": "/absolute/path/to/config.json"
      }
    }
  }
}
```

For a published Marketplace installation, an empty `binary_path` lets the extension manage the matching npm package. For a source checkout, prefer the absolute local `zpm` path so unpublished registry state cannot break startup.

## 6. Verify through the real UI

Use Zed itself when UI control is available:

1. Open `Run -> Spawn Task` or run `task: spawn` and confirm all three task labels appear.
2. Press `cmd-alt-o` and confirm the bottom terminal shows `Open project` with scanned repositories.
3. Type a short filter, verify filtering, then cancel with Ctrl-C before a real switch unless the user requested one.
4. Open `Settings -> AI -> MCP Servers` and confirm `project-manager` is enabled without a startup error.
5. When useful, ask the Agent Panel to list projects through `project-manager`; do not approve a real `open_project` call merely as a smoke test.

If the shortcut does nothing, test `task: spawn` first:

- Missing task in the picker means `tasks.json` is absent, malformed, or has a different label.
- A working task with a failing shortcut points to `keymap.json`, context, or a key conflict. Use `dev: open key context view`.
- `zpm: command not found` points to shell/PATH setup; use the absolute binary path or repair the login-shell PATH.
- Different CLI and Agent project lists usually mean MCP `config_path` points at another file, often a stale `/tmp` test config.

## 7. Handoff and rollback

Report:

- CLI and Zed paths;
- persistent config path and approved roots;
- project count found;
- installed shortcuts and their behavior;
- MCP and UI verification status;
- every user config file changed.

Do not commit user-level files under `~/.config`. If rollback is requested, remove only the Project Manager task objects, keybindings, and context-server entry that this setup added. Unlink the global package separately. Never delete the user's config or cache without explicit confirmation.
