# 使用 Project Manager

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

如果 npm 包已经发布，也可以执行：

```sh
npm install -g zed-project-manager
```

### 2. 配置扫描目录

```sh
zpm init
zpm config-path
```

编辑输出的 `config.json`，把 `roots` 改成需要扫描的目录，例如：

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
使用 project-manager 列出项目
使用 project-manager 刷新项目缓存
使用 project-manager 在当前窗口打开 zed-project-manager
```

Agent 会调用 `list_projects`、`refresh_projects` 或 `open_project`，并在真正打开项目前显示工具调用审批。MCP 入口不会显示终端选择器，它适合用自然语言指定项目。

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
npm link
```

Zed Task 使用 login shell。确保修改 PATH 的配置位于 `.zprofile`、`.zshrc` 或对应 shell 的启动文件中，保存后新建一个 Zed 终端再试。

### 选择器为空

```sh
zpm config-path
zpm scan
zpm list
```

确认配置中的 `roots` 存在，且 `maxDepth` 足以覆盖仓库所在层级。

### Agent 中看到的项目和快捷键看到的不一致

快捷键/CLI 默认读取 `~/.config/zed-project-manager/config.json`；MCP 可以通过 Zed settings 的 `config_path` 指向其他配置。建议两者使用同一个持久配置文件，不要长期指向 `/tmp` 下的测试配置。
