# Contributing

Project Manager contains a Rust/Wasm extension for Zed and a local Node.js CLI/MCP server. The wrapper starts the server; the Node.js process discovers repositories, maintains the cache, and opens projects through the `zed` CLI.

## Development environment

- Node.js 18 or newer and npm.
- Rust installed through [rustup](https://rustup.rs/). The repository's `rust-toolchain.toml` selects Rust 1.90.0, rustfmt, and the `wasm32-wasip2` target to match Zed's current extension build workflow.
- Zed and its `zed` CLI for integration testing.

Install the locked Node.js dependencies and the configured Rust target:

```sh
npm ci
rustup target add wasm32-wasip2
```

## Checks and tests

Run these checks before proposing a change:

```sh
npm run check:release
npm run check
npm test
npm run build
cargo fmt -- --check
cargo check --locked
cargo build --locked --release --target wasm32-wasip2
```

Tests use `node:test` and `tsx` and live in `npm/test/`. Scanner tests must use temporary directories, not real projects on the developer's machine. Project-opening tests must use `dryRun` or an injected process launcher so that they do not actually open Zed.

For scanner changes, cover ordinary `.git/` directories, worktree `.git` files, depth limits, ignore rules, nested repositories, overlapping roots, missing-root warnings, and symlink behavior as applicable. Cache changes must preserve a project's existing `lastOpenedAt` when refreshing.

Keep the Rust wrapper small. It registers `mcp-server-project-manager`, reads `binary_path` and `config_path`, and installs or starts the exact npm version pinned by the extension. A nonempty `binary_path` starts that executable with `mcp` instead. Host filesystem scanning, cache access, and launching Zed belong in the Node.js layer.

## Local integration

Build and link the CLI:

```sh
npm run build
npm link
zpm --help
command -v zpm
```

Create a separate test configuration pointing to a small set of disposable Git repositories and a separate cache. Do not use a broad personal projects root for release smoke tests. `list_projects` and `refresh_projects` return local project names and paths to the Agent; only expose directories intended for the active model provider. Keep `followSymlinks` disabled unless the test explicitly covers links outside the configured roots.

In Zed:

1. Open Extensions, choose **Install Dev Extension**, and select the repository root.
2. Configure `context_servers.mcp-server-project-manager.settings` with the absolute `zpm` path as `binary_path` and the test configuration as `config_path`.
3. Confirm the server starts in **Settings → AI → MCP Servers**.
4. Test `list_projects`, `refresh_projects`, and `open_project` with `dryRun: true` against a test repository. Check that the returned command uses the intended project path and window mode.
5. Test a real project open only when intentionally exercising that behavior; it changes the editor window or workspace.
6. Check `zed: open log` for errors. `zed --foreground` can also help diagnose startup failures.

The local executable override is useful during development, but it bypasses npm installation. Before a marketplace submission, follow [the publishing guide](docs/publishing.md) to test the published, pinned npm package with an empty `binary_path` at the exact release commit.

## Change guidelines

- Describe the interactive selector as a terminal interface, not a native Zed Quick Pick.
- Use Zed's supported APIs in the Wasm wrapper rather than bypassing them to reach the host environment.
- For incompatible configuration or cache changes, update validation, tests, documentation, and the version strategy together.
- Keep user-visible text in English; translated guides may accompany it.
- Include a relevant path or next action in user-facing errors. Never write debug output to MCP stdout, which carries protocol messages.
- Record checks that could not be run on the current platform without claiming they passed.

See [Publishing](docs/publishing.md) for version synchronization, npm validation, Zed integration evidence, and the official extension registry contribution workflow.
