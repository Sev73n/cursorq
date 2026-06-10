# Debug Session: exe-no-access

## Status: [OPEN]

## Symptoms
- 通过 `start-dev.bat` 启动正常
- 通过打包的 `CursorQ.exe` 启动后，前端显示"无法访问"
- Rust 日志中只有 `asset scope ok`、`CursorQ started`、`bundled content`，**没有 `refresh_usage start` 或 `get_capsule_visible called`**

## Environment
- OS: Windows
- Node: v24.13.1 (Volta)
- Tauri: 2.x
- 前端: Vite + TypeScript

## Hypotheses (待验证)
1. **H1**: 前端 JS 资源未被正确加载/嵌入到 exe 中 → 前端代码根本没执行
2. **H2**: Tauri `invoke` IPC 通信链路在 exe 中不可用（前端有加载，但 `invoke` 调用失败）
3. **H3**: 窗口未成功显示（`show_main_inactive` 失败），导致前端无法初始化
4. **H4**: 前端 `initWindow()` 在 await 链中抛错但被 catch 吞掉
5. **H5**: 资源路径解析错误（assetProtocol scope 不足），导致 HTML 加载后 JS 404

## Investigation Log
（待填充）
