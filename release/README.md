# CursorQ Windows 发布包

## 目录结构（zip 解压后）

```
cursorq/
  CursorQ.exe          # 主程序
  copy/                # 文案（可本地改，也会被 GitHub 同步覆盖）
    jokes.json
    states.json
  mascot/
    default.png        # 启动占位图
    gifs/              # 动图（1 分钟后轮播）
  data/
    app-state.json     # 缓存配置（用量、语言、笑话索引等）
    content-sync.json  # 远程内容版本（自动生成）
  config/
    remote.json        # 从 remote.json.example 复制并填写 GitHub raw 地址
  logs/
    cursorq.log        # 排错日志
  scripts/
    refresh-usage.mjs
  node_modules/        # 刷新用量所需（打包时带入）
  packages/core/dist/  # 核心库
```

## 使用前

1. 编辑 `config/remote.json`，把 `contentBaseUrl` 换成你 GitHub 上 `content/` 文件夹的 raw 前缀。
2. 本机需已安装 **Node.js 20+**（用于读取 Cursor 账号与用量）；日志在 `logs/cursorq.log`。
3. 双击 `CursorQ.exe` 运行。

## 远程更新

- 启动 **60 秒**后自动检查 `manifest.json` 版本并下载新文案/动图。
- 托盘菜单 **「同步文案/动图」** 可立即同步。

仓库内维护 `content/manifest.json`，每次更新将 `version` +1 后 push 即可。
