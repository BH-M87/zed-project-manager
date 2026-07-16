# Contributing

感谢参与 Project Manager 的开发。仓库包含两个相互配合的部分：Rust/Wasm Zed extension wrapper，以及在本机运行的 Node.js CLI/MCP server。

## 开发环境

- Node.js 18+
- npm
- 通过 `rustup` 安装的 Rust toolchain
- Zed 与可用的 `zed` CLI

安装依赖：

```sh
npm install
```

## Node.js 开发与测试

```sh
npm run check
npm test
npm run build
```

测试使用 `node:test` 与 `tsx`，测试文件位于 `npm/test/`。涉及扫描器的测试应只操作临时目录，不能依赖开发机上的真实项目。涉及打开项目的测试必须使用 `dryRun` 或可注入的进程启动器，不能真的启动 Zed。

新增扫描行为时，至少考虑：普通 `.git/`、worktree `.git` 文件、最大深度、ignore、嵌套仓库、重复/重叠 roots、缺失 root warning 与符号链接策略。新增缓存行为时需验证旧的 `lastOpenedAt` 不会在刷新时丢失。

## Rust wrapper

```sh
cargo check
```

wrapper 应保持轻量：注册 `project-manager` context server、解析 `binary_path` / `config_path`，并安装/启动与扩展同版本的 npm 包；`binary_path` 非空时改为启动本地 `zpm mcp`。宿主文件系统扫描、缓存和打开 Zed 的逻辑属于 Node.js 层。

## 本地联调

先构建并链接 CLI：

```sh
npm run build
npm link
zpm --help
zpm init
zpm scan
zpm open <project> --dry-run
```

然后在 Zed 中：

1. 打开 Extensions 页面并选择 **Install Dev Extension**；
2. 选择仓库根目录；
3. 在 **Settings → AI → MCP Servers** 确认 `project-manager` 为绿色；
4. 分别验证 `list_projects`、`refresh_projects`、`open_project`；首次验证 `open_project` 时传 `dryRun: true`；
5. 再在明确知晓目标项目与窗口模式后做一次真实打开验证；
6. 运行 `zed: open log` 检查错误，必要时用 `zed --foreground` 启动 Zed。

若 Zed 的环境找不到全局 `zpm`，把 context server 的 `binary_path` 改成绝对路径。需要隔离测试配置时，将 `config_path` 指向临时 JSON，避免覆盖个人缓存。

## 变更约束

- 不把终端选择器称为 Zed 原生 Quick Pick；
- 不在 Wasm wrapper 中绕过 Zed API 访问宿主环境；
- 配置或缓存 schema 发生不兼容变化时，需同时更新校验、测试、README 和版本策略；
- 用户可见错误应包含失败路径或下一步操作，但不要向 stdout 写 MCP 协议之外的调试信息；
- 提交前运行 Node.js 检查、测试、构建以及 `cargo check`，并记录无法在当前平台验证的项目。

## 发布检查

- npm 包只包含 `dist`、README、LICENSE 和 package metadata，并可在干净环境安装；`zpm --help` 与 `zpm mcp` 可启动；
- `extension.toml` 与 npm/MCP 版本保持一致；
- dev extension 已在 Zed 中完整验证；
- 仓库许可证符合 Zed extension 发布要求；
- extension submodule 使用公开 HTTPS URL；
- 同步评估官方 MCP Registry 发布，因为 Zed 已计划弃用 MCP server extension 分发方式。
