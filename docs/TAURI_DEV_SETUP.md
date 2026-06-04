# CursorQ — Tauri 2 开发环境（Windows）

在 Windows 上请先完成下列环境。

## 你已具备

| 项目 | 状态 |
|------|------|
| Node.js 20+ | 已有（v22） |
| npm | 已有 |
| rustup / rustc | 已有（当前为 **GNU** 工具链，需改为 **MSVC**） |

## 你必须安装 / 修改

### 1. Visual Studio C++ 构建工具（必装）

Tauri 在 Windows **不能**只用 MinGW/GNU，需要 **MSVC + Windows SDK**。

1. 下载：[Build Tools for Visual Studio 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. 安装时勾选：**「使用 C++ 的桌面开发」**
3. 右侧确认包含：
   - **MSVC v143**（x64/x86 生成工具）
   - **Windows 10/11 SDK**
4. 安装完成后 **重启电脑**（推荐）

### 2. WebView2 运行时

- Windows 11 / 较新 Win10 通常已自带
- 若 `tauri dev` 报 WebView2：安装 [WebView2 Evergreen Bootstrapper](https://developer.microsoft.com/microsoft-edge/webview2/)

### 3. Rust 切换到 MSVC 工具链

在 **PowerShell** 或 **Cursor 终端** 执行：

```powershell
rustup default stable-x86_64-pc-windows-msvc
rustup target add x86_64-pc-windows-msvc
```

（你当前默认是 `x86_64-pc-windows-gnu`，不切换则 Tauri 会报 `link.exe` 找不到或链接失败。）

### 4. Tauri CLI（已用 npm，无需 cargo install）

项目内已安装 `@tauri-apps/cli`，**不要**再跑 `cargo install tauri-cli`（容易卡住 20+ 分钟）。

开发命令：

```cmd
cd E:\MyCode\cursorq
scripts\dev-tauri.cmd
```

### 永久 PATH（cargo 全局可用）

已提供脚本（写入 **用户变量** Path，Git Bash / cmd 均可用）：

```powershell
cd E:\MyCode\cursorq
npm run setup:path
```

或：`powershell -File scripts\add-cargo-to-path.ps1`

执行后 **关闭并重新打开** 终端，再执行 `cargo -V`。

在「系统属性 → 环境变量」里应看到用户 Path 中有：`C:\Users\<你>\.cargo\bin`（不要保留未展开的 `%USERPROFILE%\.cargo\bin` 字面量）。

### Git Bash（推荐）

一次性配置（写入 `~/.bashrc`，提供 `cqdev` / `cq` 命令）：

```bash
cd /e/MyCode/cursorq
bash scripts/install-bash-hook.sh
source ~/.bashrc
```

之后任意目录：

```bash
cqdev          # 启动 Tauri
cq             # cd 到项目根
```

或在项目内：

```bash
npm run dev:bash
./scripts/dev-tauri.sh
```

`npm run dev` 在 Git Bash 里也会自动走 `dev-tauri.sh`。

---

## 自检（请逐条执行并把结果发给我）

```powershell
node -v
npm -v
rustc -V
cargo -V
rustup show active-toolchain
where link
cargo tauri --version
```

### 期望结果

| 命令 | 期望 |
|------|------|
| `rustup show active-toolchain` | `stable-x86_64-pc-windows-msvc` |
| `where link` | 路径在 `...\Microsoft Visual Studio\...\link.exe`，**不是** Git 的 `usr\bin\link.exe` |
| `cargo tauri --version` | `2.x.x` |

### 冒烟编译

```powershell
cd $env:TEMP
cargo new tauri-smoke --bin
cd tauri-smoke
cargo build
```

`Finished dev` 即表示 MSVC 环境 OK。

---

## 项目结构

```
cursorq/
  packages/core/    # TypeScript：用量、文案、鉴权
  apps/tauri/       # Tauri 2：托盘 + 圆角浮窗
```

---

## 常见问题

**Q: 黑角是跟随系统深色主题吗？**  
A: 主要是 **矩形窗口 + 圆角内容** 露出的窗口底色，不是主题染色。Tauri 用透明窗 + 仅绘制药丸区域可缓解。
