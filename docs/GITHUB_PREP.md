# 推送到 GitHub 前检查清单

## 仓库应包含的内容

```
cursorq/
├── apps/tauri/          # 主程序（Tauri 胶囊）
├── packages/core/       # 核心逻辑（TypeScript 源码）
├── content/             # 内置默认内容 + 远程更新源（manifest、copy、mascot）
├── scripts/             # refresh-usage、打包脚本
├── release/             # 发布说明 + remote.json.example（无 exe/zip）
├── config/              # remote.json.example
├── docs/
├── package.json
├── LICENSE
└── README.md
```

## 绝不会进 Git 的隐私/本地数据（见 `.gitignore`）

| 类型 | 路径示例 | 说明 |
|------|----------|------|
| 用量与状态缓存 | `apps/tauri/.data/app-state.json` | 今日用量、周期快照、语言 |
| 日志 | `**/logs/cursorq.log` | 可能含路径、错误栈 |
| Cursor 登录 | 本机 `%APPDATA%\Cursor\...` | **不在仓库内**，仅运行时读取 |
| 环境变量 | `.env` | 若以后添加密钥 |
| 发布包 | `release/*.zip`、`*.exe` | 本地构建产物 |

推送前可自检：

```bash
git status
git check-ignore -v apps/tauri/.data/app-state.json
```

应显示被 `.gitignore` 忽略。

## 首次推送步骤

1. 在 GitHub 新建**空仓库**（不要勾选 README，避免冲突）。
2. 把 `config/remote.json.example` 里的 `YOUR_GITHUB_USER` 改成你的用户名（**不要**提交真实 `remote.json` 到用户数据目录）。
3. 更新 `content/manifest.json` 的 `version`，并确认 `content/` 下文件完整。
4. 本地执行：

```bash
cd E:/MyCode/cursorq
git add .
git status   # 确认没有 .data、target、node_modules、*.zip
git commit -m "Initial public release: CursorQ Tauri capsule"
git remote add origin https://github.com/YOUR_GITHUB_USER/cursorq.git
git branch -M main
git push -u origin main
```

5. 推送后，把安装包内 `config/remote.json` 的地址设为：  
   `https://raw.githubusercontent.com/YOUR_GITHUB_USER/cursorq/main/content`

## 之后更新文案/动图

1. 改 `content/copy/*.json` 或 `content/mascot/gifs/*`
2. **`content/manifest.json` 的 `version` 加 1**
3. `git push` — 用户启动约 1 分钟后自动同步

## 可选：减小仓库体积

`apps/tauri/public/mascot/` 下 `sheet-source.png`、拆图帧等仅开发用，可在 `.gitignore` 中取消注释对应行，只保留 `default.png` 与 `gifs/`。
