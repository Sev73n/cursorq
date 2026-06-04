# CursorQ

Cursor 订阅用量 **胶囊桌面挂件**：周期蓝余量从右向左消耗 → 全绿 → 今日超标红从左向右；双行文案（每行≤10字）轮播段子与状态提示。

## 要求

- Windows 10+
- 已安装并登录 **Cursor 桌面版**（读取 `%APPDATA%\Cursor\User\globalStorage\state.vscdb`）
- Node.js 20+

## 开发

```bash
cd E:\MyCode\cursorq
npm install
npm run build
npm run dev
```

## 结构

```
cursorq/
  packages/core/       # 鉴权、Cursor API、预算与胶囊配色
  apps/tauri/          # Tauri 胶囊（主程序）
  apps/desktop/        # Electron 版（可选）
  assets/copy/         # 开发用 jokes / states
  content/             # GitHub 远程更新源（manifest + copy + mascot）
  scripts/             # 用量刷新、Windows 打包
  config/              # remote.json.example
  release/             # 发布说明（zip/exe 本地生成，不进 Git）
```

推送到 GitHub 前见 [docs/GITHUB_PREP.md](docs/GITHUB_PREP.md)。

## 说明

- 使用 Cursor **非公开** Dashboard 接口，可能随版本失效；数据仅保存在本机。
- 不拦截 Cursor 请求，仅做用量提醒与可视化。
- **点击胶囊**展开用量详情（下拉动画）；**托盘右键**可切换中/英文、刷新、显示/隐藏。
- Windows 浮窗采用 **不透明圆角窗**（避免 Electron 透明窗白角）；长期可考虑 Tauri / 原生层。

## 浮窗实现说明

| 方案 | 白角问题 | 说明 |
|------|----------|------|
| Electron `transparent: true` | 易出现 | 当前已改为不透明 `#0f172a` 圆角壳 |
| Tauri 2 | 较好 | 体积更小，需 Rust 环境 |
| Win32 `SetWindowRgn` | 最好 | 真异形窗，开发成本高 |

## 替换吉祥物

将 `128×128` 图片放到 `assets/mascot/avatar.png` 并修改 `capsule.html` 中的 `img` 路径（或后续版本支持设置页选择）。

## 许可证

MIT
