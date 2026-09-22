import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const manifest = read("extension.toml");
const capture = (file, pattern) => {
  const match = read(file).match(pattern);
  assert.ok(match, `Missing release field in ${file}`);
  return match[1];
};

assert.match(pkg.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const versions = {
  "package-lock.json": lock.version,
  "package-lock.json root": lock.packages[""].version,
  "extension.toml": capture("extension.toml", /^version = "([^"]+)"$/m),
  "Cargo.toml": capture("Cargo.toml", /^version = "([^"]+)"$/m),
  "Cargo.lock": capture("Cargo.lock", /\[\[package\]\]\s+name = "project_manager"\s+version = "([^"]+)"/),
  "src/lib.rs": capture("src/lib.rs", /const NPM_PACKAGE_VERSION: &str = "([^"]+)";/),
  "npm/src/cli.ts": capture("npm/src/cli.ts", /\.version\("([^"]+)"\)/),
  "npm/src/mcp.ts": capture("npm/src/mcp.ts", /name: "zed-project-manager", version: "([^"]+)"/),
};
for (const [file, version] of Object.entries(versions)) {
  assert.equal(version, pkg.version, `${file} must match package.json (${pkg.version})`);
}

const extensionId = "mcp-server-project-manager";
assert.equal(capture("extension.toml", /^id = "([^"]+)"$/m), extensionId);
const servers = [...manifest.matchAll(/^\[context_servers\.([^\]]+)\]$/gm)].map((match) => match[1]);
assert.deepEqual(servers, [extensionId], "The extension must register exactly its one MCP server");
assert.equal(pkg.name, "zed-project-manager");
assert.equal(capture("src/lib.rs", /const NPM_PACKAGE_NAME: &str = "([^"]+)";/), pkg.name);
assert.equal(lock.name, pkg.name);
assert.equal(lock.packages[""].name, pkg.name);
assert.equal(pkg.bin.zpm, "dist/cli.js");
assert.equal(pkg.publishConfig.registry, "https://registry.npmjs.org/");
console.log(`Release metadata consistent: ${pkg.name}@${pkg.version}, ${extensionId}`);
