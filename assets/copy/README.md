# 胶囊文案编辑

## 日常笑话（单击轮换）

编辑 **`jokes.json`**（本目录）：

- `line1` / `line2`：胶囊中间一行显示（合并成一行，尽量短）
- `tag`：分类标签（dry / meme / kao / poetry），仅作整理用

## 按用量状态切换的文案

编辑 **`states.json`**（本目录）：

- `state` 取值：`surplus_vibe`（蓝条多）、`warn80`（今日快满）、`done_today`（今日用完）、`over_cycle`（周期紧）、`idle`（默认走 jokes）

当胶囊处于对应状态时，优先从 `states.json` 选文案，而不是 `jokes.json`。

## 生效方式

保存后：托盘菜单 **立即刷新**，或等约 30 分钟自动刷新。

## 左侧吉祥物动图

文件夹（把 `.gif` 丢进去）：

`apps/tauri/public/mascot/gifs/`

- **双击**吉祥物：轮播下一个
- **单击**吉祥物：展开详情
- 支持 `.gif` `.webp` `.png`（png 不会动）
