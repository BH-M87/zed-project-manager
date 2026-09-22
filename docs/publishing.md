# Publishing to npm and the Zed extension registry

The npm package is `zed-project-manager`, its CLI is `zpm`, and the Zed extension and context server ID are both `mcp-server-project-manager`. The display name is **Project Manager MCP Server**. The wrapper installs an exact npm version, so publish and verify that package before submitting the corresponding extension version.

The `0.3.0` changes prepare the project for its first official marketplace submission. A version bump in this repository is not evidence that npm publishing, Zed integration testing, or marketplace acceptance has happened. Record those outcomes separately using the checklist below.

## Prepare a release

Start from the intended release branch and inspect its working tree and recent changes. Keep unrelated changes out of the release. All runtime versions, package metadata, the Rust npm-version pin, and the extension manifest must agree; `npm run check:release` checks the repository's release contract.

```sh
git status --short
npm ci
npm run check:release
npm run check
npm test
npm run build
cargo fmt -- --check
cargo check --locked
cargo build --locked --release --target wasm32-wasip2
npm publish --dry-run --registry=https://registry.npmjs.org/
```

Install Rust through [rustup](https://rustup.rs/). The repository's `rust-toolchain.toml` selects Rust 1.90.0, rustfmt, and `wasm32-wasip2`; rustup installs them when needed. This matches Zed's current official extension build workflow; check upstream when preparing later releases. The wrapper currently uses the published `zed_extension_api` 0.7.0. Do not commit generated `extension.wasm`, `target/`, or Node.js build output.

Inspect the dry-run file list: it should contain the CLI build, package metadata, license, documentation, and Zed configuration examples, with no credentials, local caches, or development artifacts. `prepublishOnly` runs `npm test`; `prepack` runs `npm run check` (including `check:release`) and builds the TypeScript package. These lifecycle hooks do not replace the Rust and Zed integration checks.

The `0.3.0` ID change also needs a migration note. Existing development users must move settings from `context_servers.project-manager` to `context_servers.mcp-server-project-manager`, then remove or disable the old dev extension to avoid duplicate servers. The npm name, CLI command, scan configuration, and cache locations are unchanged.

## Publish and verify npm

Use a release commit that can be traced back to the exact tested source. Authenticate to the official registry, then publish:

```sh
npm whoami --registry=https://registry.npmjs.org/
npm publish --registry=https://registry.npmjs.org/
```

If authentication is missing, run `npm login --registry=https://registry.npmjs.org/` and complete npm's required account or two-factor verification. The repository also pins `publishConfig.registry` to the official registry.

For `0.3.0`, verify the published metadata and install the exact version into a fresh directory:

```sh
npm view zed-project-manager@0.3.0 version dist.integrity --registry=https://registry.npmjs.org/
npm view zed-project-manager dist-tags --registry=https://registry.npmjs.org/
RELEASE_CHECK_DIR="$(mktemp -d)"
npm install --prefix "$RELEASE_CHECK_DIR" --no-save zed-project-manager@0.3.0 --registry=https://registry.npmjs.org/
node "$RELEASE_CHECK_DIR/node_modules/zed-project-manager/dist/cli.js" --version
node "$RELEASE_CHECK_DIR/node_modules/zed-project-manager/dist/cli.js" --help
```

The version command must return `0.3.0`, and `latest` should point to `0.3.0` for a normal stable release. Update the example version for subsequent releases. An npm version cannot be overwritten; if the published artifact needs a code fix, prepare a new version.

Push the release commit to a public branch and create the matching release tag after successful npm verification. Record the full commit SHA. The upstream submodule must point to a commit reachable from a public branch, not a commit available only in a local checkout or detached history.

## Test the exact release in Zed

Install the final release commit through Zed's **Install Dev Extension** command. Build success and a standalone MCP test do not prove that the extension starts correctly in Zed.

Use a test configuration with a small disposable repository root and an isolated cache. Returned project paths and names become available to the Agent and may be sent to the configured model provider. Avoid scanning personal or sensitive directories during verification. Keep symlink traversal disabled unless deliberately testing it.

For this release check, configure the new context server key and leave `binary_path` empty:

```json
{
  "context_servers": {
    "mcp-server-project-manager": {
      "settings": {
        "binary_path": "",
        "config_path": "/absolute/path/to/release-test-config.json"
      }
    }
  }
}
```

Merge this entry with the existing settings. An empty `binary_path` exercises the wrapper's automatic installation of the pinned npm version; a global or locally linked `zpm` does not validate that path. This check cannot pass until the pinned version is available from npm.

Verify the following in the actual Zed session:

1. **Settings → AI → MCP Servers** shows **Project Manager MCP Server** running without startup errors.
2. The extension-managed package reports the release version. Inspect the installed package metadata or the MCP initialization response; a global `zpm --version` is not sufficient evidence.
3. `list_projects` returns the expected test repositories.
4. `refresh_projects` reflects an added or removed test repository and preserves existing `lastOpenedAt` values.
5. `open_project` with `{"project":"/absolute/path/to/test-repository","mode":"new","dryRun":true}` returns the expected command without opening a window.
6. The settings form exposes `binary_path` and `config_path`, and invalid configuration or an unknown project produces an actionable error. Restore the valid configuration after the test.
7. `zed: open log` contains no unexplained errors from the extension.

Record the release SHA, Zed version, operating system, and results. If source changes after testing, run the affected checks again at the final commit. Do not mark Zed integration complete based solely on Node.js tests or a Wasm build.

## Submit to the official extension registry

Check the current [publishing prerequisites](https://zed.dev/docs/extensions/publishing/prerequisites) and [publishing guide](https://zed.dev/docs/extensions/publishing/publishing-guide). The extension needs a public source repository, an accepted license, English user-visible text, and an ID that identifies it as an MCP server. This repository uses MIT and declares one MCP server.

Fork [zed-industries/extensions](https://github.com/zed-industries/extensions) and clone your fork. From that checkout, create a contribution branch and add this repository as an HTTPS submodule:

```sh
git switch -c add-mcp-server-project-manager
git submodule add https://github.com/BH-M87/zed-project-manager.git extensions/mcp-server-project-manager
git -C extensions/mcp-server-project-manager checkout <tested-release-commit-sha>
```

Replace `<tested-release-commit-sha>` with the full SHA verified above. Add this entry to the registry's `extensions.toml`:

```toml
[mcp-server-project-manager]
submodule = "extensions/mcp-server-project-manager"
version = "0.3.0"
```

The registry version must exactly match the submodule's `extension.toml`. Then run the upstream formatter and inspect the resulting diff:

```sh
pnpm install
pnpm sort-extensions
git diff --check
git diff -- .gitmodules extensions.toml
git submodule status extensions/mcp-server-project-manager
```

Commit `.gitmodules`, `extensions.toml`, and the submodule pointer, push the contribution branch, and open a PR against `zed-industries/extensions`. Include what the extension does and the exact release commit and Zed integration checks performed. Follow the upstream PR template and report any untested platforms accurately.

Keep each PR to one extension. Upstream allows at most three open PRs per contributor and expects responses to review feedback within three weeks. The submodule URL must use HTTPS, and its commit must remain publicly reachable. After acceptance and merge, Zed builds and publishes the extension; a merged PR alone is not proof that the marketplace build succeeded. Confirm the listing and installable version in Zed before announcing availability.

## Release evidence

Copy this checklist into the release notes or contribution PR and fill it with actual results. Unchecked entries mean the work is still pending.

- [ ] Release version and full source SHA recorded.
- [ ] Release contract, TypeScript checks, tests, build, and npm dry-run passed.
- [ ] Rust formatting, locked check, and `wasm32-wasip2` release build passed.
- [ ] Exact npm version published and installed successfully in a fresh directory.
- [ ] Release commit and tag publicly available.
- [ ] Final commit installed as a dev extension; Zed version and OS recorded.
- [ ] Empty `binary_path` verified with the correct extension-managed npm version.
- [ ] All three MCP tools, settings, and error cases checked in Zed.
- [ ] Upstream registry version and HTTPS submodule pointer verified.
- [ ] Official marketplace listing and installation verified after upstream publication.

## MCP Registry follow-up

Zed has announced plans to replace MCP server extensions with the official [MCP Registry](https://registry.modelcontextprotocol.io/). Treat publishing this server there as a separate distribution task: check the current namespace, ownership-verification, and metadata requirements before adding registry files. An npm release or an accepted Zed extension PR does not automatically create an MCP Registry listing.
