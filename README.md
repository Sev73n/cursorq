# CursorQ

Cursor 订阅用量 **桌面胶囊挂件**（Tauri 2）：在屏幕顶部显示周期余量、今日预算与段子文案；不拦截 Cursor，仅读取本机登录态与 Dashboard 数据做提醒与可视化。

## 功能概览

- **胶囊进度条**：绿/蓝表示周期余量（含节余银行）；今日用量 ≥ **2× 日预算** 时从左向右出现红色警示
- **单行文案**：根据用量状态轮播段子与提示（`content/copy/`）；单击文案可手动切换
- **用量详情面板**：计费周期、今日/周期用量、日预算、剩余天数；按 API / Auto 分组，可展开查看分模型明细
- **系统托盘**：显示/隐藏胶囊、中/英文、总是置顶、开机启动、立即刷新、同步远程文案/动图
- **吉祥物动图**：启动显示占位图，约 1 分钟后轮播 `gifs/` 内动图（每 20 分钟切换）；双击吉祥物手动换下一张
- **远程内容合并**：启动即用内置 `content/`；约 30 秒后可从 GitHub 追加 jokes / 动图（不覆盖本地已有文件）

## 环境要求

- Windows 10+
- 已安装并登录 **Cursor 桌面版**（读取 `%APPDATA%\Cursor\User\globalStorage\state.vscdb` 中的 token）
- 开发/build：**Node.js 20+**、**Rust（MSVC 工具链）**、WebView2  
  详见 [docs/TAURI_DEV_SETUP.md](docs/TAURI_DEV_SETUP.md)

## 开发运行

```bash
cd E:\MyCode\cursorq
npm install
npm run build
npm run dev
```

Git Bash 可用 `npm run dev:bash` 或配置后的 `cqdev` 命令（见开发文档）。

## 使用方法

### 胶囊窗口

| 操作 | 效果 |
|------|------|
| **拖动** | 按住胶囊约 0.5 秒或移动鼠标后开始拖动， reposition 窗口 |
| **单击吉祥物** | 展开 / 收起用量详情面板 |
| **双击胶囊** | 展开 / 收起详情面板 |
| **单击文案行** | 切换下一条段子/状态文案 |
| **双击吉祥物** | 切换下一张动图 |
| **详情内点击分类行** | 展开 / 收起该分类下的模型列表 |

### 系统托盘

- **左键单击**：打开菜单  
- **双击**：显示胶囊（若已隐藏）  
- 菜单项：**显示/隐藏胶囊** · **中文 / English** · **总是置顶** · **开机启动** · **立即刷新** · **同步文案/动图** · **退出**

用量默认每 **30 分钟**自动刷新一次；也可在托盘选择「立即刷新」。

### 进度条含义

| 胶囊颜色 | 含义 |
|----------|------|
| 绿 → 蓝 | 周期剩余 + 节余银行占订阅额度的比例（蓝从右侧随消耗向左收缩） |
| 红（自左向右） | 今日用量达到日预算的 **200%** 及以上 |

详情面板中的「总量 / 今日已用 / 剩余天数」等进度条仅作参考；胶囊红条仅由「今日 vs 日预算」触发。

### 调试模式（开发者）

在详情面板底部提示行 **连点三下**，可进入调试模式：用滑条模拟不同用量状态。调试中再次点击提示行可退出。

## 自定义内容

### 段子与状态文案

编辑仓库内 `content/copy/jokes.json`、`content/copy/states.json`。  
开发时也可改 `apps/tauri/public/` 下对应资源；发布包以 `content/` 为准。

### 吉祥物与动图

| 文件 | 说明 |
|------|------|
| `content/mascot/default.png` | 启动占位图 |
| `content/mascot/gifs/*.gif` | 动图轮播（按文件名排序；支持 `.gif` `.webp` `.png`） |

- 启动后先显示 `default.png`，**满 1 分钟**开始轮播 `gifs/`  
- **每 20 分钟**自动切换一张；**双击吉祥物**可手动切换  
- 更多说明见 `content/mascot/gifs/README.txt` 与 [content/README.md](content/README.md)

### 远程同步（可选）

复制 `config/remote.json.example` 为 `config/remote.json`（开发时在 `apps/tauri/.data/config/`，便携包在 exe 同级 `config/`）：

```json
{
  "enabled": true,
  "contentBaseUrl": "https://raw.githubusercontent.com/<用户>/cursorq/main/content",
  "syncDelayMs": 30000
}
```

`enabled: false` 或留空 `contentBaseUrl` 时仅使用本地内置内容。合并规则：**只追加**远程新条目，**不覆盖**本地已有 jokes / 动图。

## 项目结构

```
cursorq/
  packages/core/       # 鉴权、Cursor API、日预算/节余银行、胶囊配色
  apps/tauri/          # Tauri 2 主程序（托盘 + 透明圆角浮窗）
  content/             # 内置文案、吉祥物、manifest（启动即用）
  config/              # remote.json.example
  scripts/             # 开发启动、Windows 打包、文案校验
  docs/                # 开发与发布说明
  release/             # 本地生成的 zip/exe（不进 Git）
```

## 打包发布（Windows）

```bash
npm run package:win
```

产出：`release/cursorq-<version>-win64.zip`（便携目录含 exe、`content/`、`config/` 等）。

推送到 GitHub 前见 [docs/GITHUB_PREP.md](docs/GITHUB_PREP.md)。

## 说明与限制

- 使用 Cursor **非公开** Dashboard 接口，可能随 Cursor 版本变化而失效；用量与状态仅保存在本机（`apps/tauri/.data/`，日志见 `.data/logs/cursorq.log`）。
- 不修改、不拦截 Cursor 网络请求；未登录 Cursor 时胶囊会提示「请先登录 Cursor」。
- 主程序为 **Tauri 2** 无边框透明圆角窗；Windows 下通过 DWM 处理窗口形状，避免白边。

## 许可证

MIT
