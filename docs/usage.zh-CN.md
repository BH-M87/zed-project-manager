# 使用 Project Manager

[English](usage.md) | 简体中文 | [项目说明](../README.zh-CN.md)

Project Manager 有三种入口：Zed Task、Zed Agent/MCP 和终端 CLI。日常切换项目推荐使用 Zed Task，因为它可以绑定快捷键，并在 Zed 集成终端中显示可搜索的项目选择器。

> 这里的选择器是终端 UI，不是 Zed 原生 Quick Pick。Zed 当前的扩展 API 不能注册原生命令面板项目、Quick Pick 或项目切换窗口。

## 首次配置

### 1. 安装 CLI

从仓库源码安装：

```sh
npm install
npm run build
npm link
zpm --version
```

安装最新已发布的 CLI 时，也可以执行：

```sh
npm install -g zed-project-manager
```

本项目尚未上架官方扩展市场。测试本地构建时，在 Zed 中设置指向该构建的绝对 `binary_path`；checkout 对应的 npm 版本尚未发布时，必须使用此方式。对应版本已发布后，可将 `binary_path` 留空来验证扩展自动安装。全局安装 CLI 不能代替对扩展安装流程的验证。

### 2. 配置扫描目录

```sh
zpm config
```

向导会读取已有配置；没有配置文件时使用默认值。依次完成：

1. **扫描目录**：确认当前目录列表，或选择替换，逐条输入路径，最后以空行结束。支持 `~`、`$HOME`、`${HOME}`，含空格的路径不加引号。
2. **扫描深度**：根目录为 0，直接子目录为 1，`根目录/分组/项目` 为 2。
3. **忽略规则**：默认跳过 `node_modules`、`.git`、`target`、`dist`、`build`，可逐条替换为目录名或 glob。替换时直接输入空行可清空自定义忽略规则，但 `.git` 始终不进入扫描。
4. **嵌套仓库**：默认关闭，发现外层仓库就停止向内扫描。若项目放在 `外层仓库/workspaces/内层仓库` 中，需要打开；单纯增大扫描深度无效。
5. **符号链接**：默认关闭。若项目通过目录软链接放在扫描目录下，需要打开；开启后仍受扫描深度、忽略规则和嵌套仓库选项限制。

最后检查 JSON 并确认保存。Ctrl+C 或拒绝保存都不会改动原文件，`cachePath`、`zedBin` 等其他字段会原样保留。向导不会自动扫描，保存后运行下面的 `zpm scan` 更新缓存。

首次安装也可以用 `zpm init --interactive` 进入同一个向导。脚本中仍使用非交互的 `zpm init` 创建默认文件，用 `zpm config-path` 查看文件位置，再手动编辑。配置示例：

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

首次扫描并确认项目列表：

```sh
zpm scan
zpm list
```

### 3. 注册 Zed Tasks

快捷键绑定的不是扩展命令，而是全局 Zed Task。全局任务文件位于：

```text
~/.config/zed/tasks.json
```

如果这个文件还不存在，可以直接复制仓库示例：

```sh
mkdir -p ~/.config/zed
cp zed/tasks.json.example ~/.config/zed/tasks.json
```

如果文件已经存在，不要覆盖；把 [`zed/tasks.json.example`](../zed/tasks.json.example) 中的三个对象合并到现有 JSON 数组。

也可以在 Zed 中打开 Command Palette，运行 `zed: open tasks`，再粘贴任务配置。保存后运行 `task: spawn`，应该能看到：

- `Project Manager: Switch (reuse)`
- `Project Manager: Open in new window`
- `Project Manager: Refresh cache`

如果这里看不到这些任务，快捷键也不会生效。

### 4. 注册快捷键

打开 Command Palette，运行 `zed: open keymap file`，把 [`zed/keymap.json.example`](../zed/keymap.json.example) 中的 binding 合并到现有 `keymap.json` 数组。

macOS 默认建议：

| 快捷键 | 行为 |
| --- | --- |
| `cmd-alt-o` | 搜索项目，并在当前 Zed 窗口中替换 workspace |
| `cmd-alt-shift-o` | 搜索项目，并在新 Zed 窗口中打开 |

快捷键的 `task_name` 必须与 `tasks.json` 的 `label` 完全一致，包括大小写和括号。

## 怎么唤醒和交互

### 快捷键

按 `cmd-alt-o` 后，Zed 会打开并聚焦一个集成终端，终端中出现 `Open project` 选择器：

1. 直接输入项目名或路径片段进行过滤；
2. 用上下方向键移动选择；
3. 按 Enter 打开项目；
4. 按 Ctrl-C 取消。

选择完成后，任务会执行 `zed --reuse <项目路径>`。`cmd-alt-shift-o` 的交互相同，但执行的是 `zed --new <项目路径>`。

### Command Palette

不使用快捷键时：

1. 按 `cmd-shift-p`；
2. 运行 `task: spawn`；
3. 搜索并选择 `Project Manager: Switch (reuse)`。

这也是排查快捷键问题时最有用的入口：如果 Task Picker 里能看到任务，说明 `tasks.json` 正常，问题位于 keymap；如果看不到，先修复 `tasks.json`。

### Zed Agent / MCP

在 Agent Panel 中可以直接说：

```text
使用 mcp-server-project-manager 列出项目
使用 mcp-server-project-manager 刷新项目缓存
使用 mcp-server-project-manager 在当前窗口打开 zed-project-manager
```

Agent 会调用 `list_projects`、`refresh_projects` 或 `open_project`；是否显示工具调用审批取决于 Zed 的工具权限设置。MCP 入口不会显示终端选择器，它适合用自然语言指定项目。dev extension 的安装和 settings 示例见 [项目说明](../README.zh-CN.md#在-zed-中安装-dev-extension)。

### 从旧 dev extension 迁移

`0.3.0` 将扩展 ID 和 context server 配置键从 `project-manager` 改为 `mcp-server-project-manager`，显示名称为 Project Manager MCP Server。备份 Zed settings 后，把旧的 `context_servers.project-manager` 整个对象移到新键，保留所有已有字段，包括 `settings` 中的 `binary_path` 和 `config_path`。若新键已存在，应逐字段核对合并，避免覆盖。

安装新 dev extension，验证新 server 能正常启动，再卸载旧的 `project-manager` dev extension 并清理旧配置项。npm 包名、`zpm` 命令、项目配置与缓存文件、MCP 工具名、Task label 和快捷键均不变。完整验证流程见 [发布指南](publishing.md)。

### 终端 CLI

```sh
zpm open                  # 交互搜索，当前窗口打开
zpm open my-project       # 按名称或路径匹配
zpm open my-project --new # 新窗口打开
zpm scan                  # 重新扫描
zpm list                  # 查看缓存
```

## 常见问题

### 按 `cmd-alt-o` 没有反应

先运行 Command Palette 中的 `task: spawn`：

- 看不到 `Project Manager: Switch (reuse)`：全局 `tasks.json` 缺失、位置不对，或任务 label 不匹配；
- 能看到且手动运行正常：检查 `~/.config/zed/keymap.json` 中的 binding；
- 快捷键仍被其他动作占用：运行 `dev: open key context view` 检查当前 context 和快捷键冲突。

### 终端提示 `zpm: command not found`

```sh
command -v zpm
```

源码安装可在已构建的 checkout 中重新运行 `npm link`；使用已发布包时，重新安装所需的 npm 版本。确保 `.zprofile`、`.zshrc` 或对应 shell 的启动文件能让 Zed 终端访问 npm 的全局可执行文件目录，修改 PATH 后新建一个 Zed 终端再试。

### 选择器为空

```sh
zpm config-path
zpm scan
zpm list
```

确认配置中的 `roots` 存在，且 `maxDepth` 足以覆盖仓库所在层级。如果项目放在另一 Git 仓库中，还需要开启 `nestedRepositories`。

### Agent 中看到的项目和快捷键看到的不一致

快捷键/CLI 默认读取 `~/.config/zed-project-manager/config.json`；MCP 可以通过 Zed settings 的 `config_path` 指向其他配置。建议两者使用同一个持久配置文件，不要长期指向 `/tmp` 下的测试配置。

### 新 dev extension 无法启动

如果 checkout 对应的 npm 版本尚未发布，需要在 `context_servers.mcp-server-project-manager` 下设置绝对 `settings.binary_path`，指向本地构建的 `zpm`。确认可执行文件存在，且 `zpm --version` 返回 checkout 中的版本。使用自动安装时，则应确认扩展固定的精确版本已在 npm 发布。检查原有 settings 对象是否已经移到新键，再通过 `zed: open log` 查看日志。构建前置条件和验证步骤见 [发布指南](publishing.md)。
