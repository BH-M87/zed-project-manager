Project Manager installs the matching `zed-project-manager` npm package for its
MCP server. The package also provides the `zpm` command-line tool for repository
scanning and interactive project selection.

1. Install Node.js 18 or newer.
2. Run `npm install -g zed-project-manager` to make the terminal picker available.
3. Run `zpm init`, edit the generated configuration, and run `zpm scan` once.

The extension-managed MCP server does not depend on the GUI application's `PATH`.
For source development, build and link this repository, run `command -v zpm`, and
set `binary_path` to that absolute path. Set `config_path` to an absolute configuration
file path when you do not want the CLI default. A non-empty `config_path` is passed
to the server as `ZPM_CONFIG`.

For an interactive picker outside the Agent panel, copy the provided
`zed/tasks.json.example` entries into `~/.config/zed/tasks.json`, then merge
`zed/keymap.json.example` into your Zed keymap. The default macOS bindings are
`cmd-alt-o` for reuse and `cmd-alt-shift-o` for a new window. The picker appears
in Zed's integrated terminal, not as a native Quick Pick.
