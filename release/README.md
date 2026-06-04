# CursorQ Windows 发布包

## 目录结构（zip 解压后）

```
cursorq/
  CursorQ.exe          # 主程序
  content/             # 内置默认内容（离线可用）
    manifest.json
    copy/              # 文案
    mascot/            # 占位图 + 动图
  data/
    app-state.json     # 用量、语言等（自动生成）
    content-sync.json  # 内容版本（自动生成）
  config/
    remote.json        # 可选在线更新（默认关闭）
  logs/
    cursorq.log
  scripts/
    refresh-usage.mjs
  node_modules/
```

## 使用前

1. 本机需 **Node.js 20+**（读取 Cursor 用量）与已登录 **Cursor 桌面版**。
2. 双击 `CursorQ.exe` 即可运行；启动即用 `content/` 预设，**无需联网**。
3. 可选：`config/remote.json` 开启后，约 **30 秒** 联网 **合并** 远程新 joke/gif（不覆盖本地与手动添加）。

## 远程合并（可选）

- 只 **追加** 远程新内容；已有本地文件、用户自增 gif **不会被覆盖**。
- 托盘 **「同步文案/动图」** 可随时手动触发合并。
- 未开启或离线时始终使用安装包内的 `content/`。

仓库维护 `content/manifest.json`，每次更新将 `version` +1 后 push。
