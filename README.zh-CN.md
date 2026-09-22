# Project Manager MCP Server

[English](README.md) | 简体中文

在固定目录下递归发现 Git 仓库，并通过命令行或 Zed Agent 快速打开项目。项目借鉴 [VS Code Project Manager](https://github.com/alefragnani/vscode-project-manager) 的“自动检测仓库与快速切换”工作流，但实现方式遵循 Zed 当前公开的扩展能力。

## 快速开始

```sh
npm install
npm run build
npm link
zpm init --interactive
zpm scan
```

然后把 [`zed/tasks.json.example`](zed/tasks.json.example) 合并到全局 `~/.config/zed/tasks.json`，把 [`zed/keymap.json.example`](zed/keymap.json.example) 合并到 `~/.config/zed/keymap.json`：

- `cmd-alt-o`：在当前窗口搜索并切换项目；
- `cmd-alt-shift-o`：搜索项目并在新窗口打开。

按快捷键后出现的是 Zed 集成终端中的可搜索选择器。完整的首次配置、唤醒方式、UI 交互和排障见 [使用指南](docs/usage.zh-CN.md)。

本项目尚未上架 Zed 官方扩展市场。可以从 npm 安装最新已发布的 CLI，也可以从此 checkout 构建。如果 checkout 对应的 npm 版本尚未发布，测试 dev extension 时请按下文配置本地 `binary_path`。

### 让 Agent 完成安装

仓库提供 [`$setup-zed-project-manager`](skills/setup-zed-project-manager/SKILL.md) skill。让支持 skills 的 Agent 在本仓库中执行：

```text
使用 $setup-zed-project-manager 帮我完成 Project Manager 的初始化安装，扫描目录是 ~/OwnDevWorkspaces
```

Agent 会安装并验证 CLI、初始化扫描配置、合并 Zed Tasks/keymap/MCP 设置，并通过真实 Zed UI 检查快捷键和项目选择器。它会保留已有的 Zed 配置，不会用示例文件覆盖整个用户配置。

## 能力与限制

当前版本支持：

- 扫描一个或多个根目录，识别普通 `.git/` 目录与 Git worktree 的 `.git` 文件；
- 配置扫描深度、忽略规则、是否继续扫描嵌套仓库；
- 缓存项目列表与最近打开时间；
- 用 `zed` CLI 在当前窗口、新窗口或当前 workspace 中打开项目；
- 通过 stdio MCP 向 Zed Agent 提供列出、刷新和打开项目的工具；
- 在终端中使用可搜索的交互式项目选择器。

这不是 VS Code 扩展的逐项移植。Zed 的扩展代码运行在 WebAssembly 中，官方扩展 API 目前主要提供语言、主题、调试器、片段和 MCP server 等能力，不能创建 VS Code 式的原生 Quick Pick、Project Manager 侧边栏或任意宿主文件系统扫描器。因此本项目采用“Zed MCP 扩展 + 本机 Node.js CLI/MCP server”的架构；交互选择发生在终端，**不要把它描述成 Zed 原生 Quick Pick**。

## 架构

```text
Zed Agent
   │ MCP tools
   ▼
Rust/Wasm 扩展 ── 启动 `zpm mcp`
                         │
                         ├─ 读取配置、扫描 Git 仓库
                         ├─ 读写项目缓存
                         └─ 调用 `zed` CLI 打开项目

终端 / Zed Task ────────► `zpm` CLI
```

Rust 扩展只负责向 Zed 注册 `mcp-server-project-manager` context server，并安装/启动与扩展同版本的 npm 包。实际文件系统访问和进程启动均由 Node.js 进程完成。开发时可用 `binary_path` 指向本地构建的 `zpm`，跳过 npm 自动安装。

## 环境要求

- Node.js 18 或更高版本；
- 已安装 Zed，并能在终端执行 `zed`；
- 开发 Zed 扩展时，需要 Rust 与 `wasm32-wasip2` target。推荐使用 [rustup](https://rustup.rs/) 管理工具链与 target；只有一个 Homebrew `cargo` 或 `rustc` 可执行文件不代表已具备 Wasm 构建环境。具体步骤见 [发布指南](docs/publishing.md)。

## 安装 CLI

从源码开发时：

```sh
npm install
npm run build
npm link
zpm --help
```

不想使用 link，也可以从已构建的本地 checkout 全局安装：

```sh
npm install
npm run build
npm install -g .
zpm --help
```

安装最新已发布的 CLI：

```sh
npm install -g zed-project-manager
```

全局安装用于终端选择器和 Zed Task。扩展在未设置 `binary_path` 时会自行安装 manifest 对应的精确 npm 版本，不依赖全局安装；这一模式需要对应 npm 版本已经发布。

## 配置

推荐使用分步向导创建或调整配置：

```sh
zpm config              # 创建或编辑配置，已有值作为默认选项
zpm init --interactive  # 首次安装也可以从这里进入同一个向导
```

向导依次引导设置扫描目录、扫描深度、忽略规则、嵌套仓库和符号链接，并解释每个选项的作用。目录和忽略规则逐条输入，不需要给含空格的路径加引号；替换列表时输入空行结束。保存前会展示完整 JSON，中途按 Ctrl+C 或拒绝保存不会修改文件。未编辑的 `cachePath`、`zedBin` 等字段会保留。保存后执行 `zpm scan` 更新缓存。

需要手动编辑或用于脚本时，仍可运行 `zpm init` 创建默认文件（不覆盖已有配置），再用 `zpm config-path` 查看路径。向导需要交互式终端，不从管道读取答案。

默认配置位于 `~/.config/zed-project-manager/config.json`，默认缓存位于 `~/.cache/zed-project-manager/projects.json`。可通过 `ZPM_CONFIG` 指向另一份配置：

```sh
ZPM_CONFIG=~/dotfiles/zed-project-manager.json zpm scan
```

配置示例：

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

- `roots`：要扫描的目录，可使用 `~`、`$HOME` 或 `${HOME}`；重复或重叠根目录会去重。
- `maxDepth`：非负整数；根目录深度为 `0`。
- `ignore`：按目录名或相对根目录的路径匹配 glob。
- `nestedRepositories`：默认 `false`，发现仓库后不再向内扫描，即使尚未达到 `maxDepth`。若有 `外层仓库/workspaces/内层仓库` 这样的结构，设为 `true` 才会继续发现内层仓库。
- `followSymlinks`：默认 `false`，跳过扫描过程中遇到的目录符号链接；设为 `true` 时扫描链接目标，可能进入 roots 之外的目录。真实路径会去重以避免循环，深度和嵌套仓库规则仍然生效。
- `cachePath`：项目缓存文件位置。
- `zedBin`：`zed` 命令名或绝对路径。

缺失或不可访问的 root 会作为 warning 输出，不会让其他 root 的扫描中断。

## CLI 命令

```sh
zpm init                         # 创建默认配置，不覆盖已有文件
zpm init --interactive           # 分步配置（同 zpm config）
zpm config                       # 引导创建或编辑扫描配置
zpm config-path                  # 输出当前配置路径
zpm scan                         # 扫描并更新缓存
zpm scan --json                  # 输出扫描结果 JSON
zpm list                         # 列出缓存项目
zpm list --refresh --json        # 先刷新，再输出 JSON
zpm open                         # 在终端交互选择项目
zpm open <名称或路径>            # 精确或唯一模糊匹配
zpm open <项目> --reuse          # 当前窗口打开（默认）
zpm open <项目> --new            # 新窗口打开
zpm open <项目> --add            # 加入当前 workspace
zpm open <项目> --dry-run        # 只打印命令，不启动 Zed
zpm open <项目> --zed-bin /path/to/zed
zpm mcp                          # 以 stdio 运行 MCP server
```

首次使用建议执行 `zpm scan`。`open` 会读取缓存；查询匹配多个项目时会报出候选项，要求使用完整名称或路径。

## 在 Zed 中安装 dev extension

1. 完成上面的 CLI 构建与 `npm link`，再用 `command -v zpm` 取得绝对路径。
2. 按下方示例在 Zed settings 中配置本地 `binary_path`，以运行本地构建；checkout 对应的 npm 版本尚未发布时，必须使用此方式。
3. 在 Zed 打开 Extensions 页面，点击 **Install Dev Extension**；也可以运行 `zed: install dev extension`。
4. 选择本仓库根目录，即包含 `extension.toml` 的目录。
5. 打开 **Settings → AI → MCP Servers**，确认 `mcp-server-project-manager`（Project Manager MCP Server）的状态为绿色。

从源码安装 dev extension 时，在 Zed settings 中使用刚才取得的绝对路径，避免 GUI Zed 与 login shell 的 `PATH` 不一致：

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

`binary_path` 默认为空：由扩展下载并通过 Node.js 启动固定版本的 npm 包；开发时设置它会覆盖自动安装逻辑。如果 checkout 对应的 npm 版本尚未发布，必须使用指向本地构建的绝对 `binary_path`。`config_path` 留空时使用 CLI 默认位置，非空时会作为 `ZPM_CONFIG` 传给 MCP server。排障时可运行 `zed: open log`，或从终端执行 `zed --foreground` 查看扩展输出。

### 从 0.2.0 dev extension 迁移

`0.3.0` 将扩展 ID 和 context server 配置键由 `project-manager` 改为 `mcp-server-project-manager`，显示名称改为 Project Manager MCP Server。先备份 Zed settings，再把 `context_servers.project-manager` 下的**整个对象**移到 `context_servers.mcp-server-project-manager`，保留其中已有的 `settings`、`binary_path`、`config_path` 以及其他字段。若新键已存在，先逐字段核对合并，避免覆盖配置。

安装新 dev extension 并确认新 server 正常启动后，卸载旧 ID `project-manager` 对应的 dev extension，移除旧的空配置项，避免重复启动两个 server。npm 包名 `zed-project-manager`、命令 `zpm`、配置和缓存目录、MCP 工具名、Zed Task label 与快捷键均保持不变，无需迁移项目数据。

## MCP 工具

安装并启用后，在 Zed Agent 中可以使用：

- `list_projects`：读取缓存；可传 `refresh: true` 先扫描；
- `refresh_projects`：重新扫描并覆盖缓存；
- `open_project`：按名称或路径打开项目，支持 `reuse`、`new`、`add` 与 `dryRun`。

工具调用是否需要批准取决于 Zed 的工具权限设置。可以在 **Settings → AI → MCP Servers** 查看运行状态，并在对话中明确提到 `mcp-server-project-manager` 以帮助模型选择对应工具。

## 用 Zed Task 快速操作

快捷键依赖全局 `~/.config/zed/tasks.json` 中存在同名任务。运行 `zed: open tasks`，将 [`zed/tasks.json.example`](zed/tasks.json.example) 中的任务合并进去；如果全局文件尚不存在，也可以在仓库根目录执行：

```sh
mkdir -p ~/.config/zed
cp zed/tasks.json.example ~/.config/zed/tasks.json
```

已有 `tasks.json` 时不要覆盖，应合并三个任务对象。再将 [`zed/keymap.json.example`](zed/keymap.json.example) 中的 binding 合并到 Zed keymap。任务 label 与快捷键中的 `task_name` 必须完全一致。

也可以通过 Command Palette 的 `task: spawn` 手动选择任务。交互发生在 Zed 集成终端：输入项目名/路径过滤，方向键选择，Enter 打开，Ctrl-C 取消。详见 [使用指南](docs/usage.zh-CN.md)。

## 发布前事项

完整流程和验收步骤见 [发布指南](docs/publishing.md)。npm 发布与 Zed Marketplace 上架是独立步骤，需要分别确认每次发布的实际状态。

- 在 macOS、Linux 与 Windows 上验证扫描、路径和 `zed` CLI 参数；
- 验证仓库现有 MIT `LICENSE` 能通过 Zed 的许可证检查；自 2025-10-01 起，发布扩展必须包含受支持的许可证文件；
- 确认 `extension.toml` 的唯一 ID 与版本。ID 发布后不可修改，且 ID/名称不能包含 `zed` 或 `extension`；
- 先发布与 manifest 完全同版本的 npm 包，并验证全新环境的全局安装与扩展自动安装；
- 本地安装 dev extension，验证三个 MCP 工具和失败提示；
- 向 `zed-industries/extensions` 提交时使用公开仓库和 HTTPS submodule URL，并同步 manifest 版本；
- Zed 已宣布计划以官方 MCP Registry 取代 MCP server extensions，因此还应把 Node MCP server 发布到 [官方 MCP Registry](https://registry.modelcontextprotocol.io/)，并跟踪迁移进度。

## 参考

- [Zed：Developing Extensions](https://zed.dev/docs/extensions/developing-extensions)
- [Zed：MCP Server Extensions](https://zed.dev/docs/extensions/mcp-extensions)
- [Zed：Model Context Protocol](https://zed.dev/docs/ai/mcp)
- [Zed：Tasks](https://zed.dev/docs/tasks)
- [VS Code Project Manager](https://github.com/alefragnani/vscode-project-manager)
