# 托盘 / 应用图标源图

- 源文件：`tray-mascot.png`（像素小人）
- 重新生成 Tauri 图标：

```bash
cd apps/tauri
npx tauri icon ../../assets/icon/tray-mascot.png
```

生成结果在 `apps/tauri/src-tauri/icons/`（含 `icon.ico`、各尺寸 PNG）。
