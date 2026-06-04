# CursorQ 内置内容

## 运行策略

| 时机 | 行为 |
|------|------|
| **启动瞬间** | 使用本目录预设（`copy/`、`mascot/`），**无需联网** |
| **约 30 秒后** | 若 `config/remote.json` 已开启，从 GitHub 拉取并 **合并** 更新 |
| **合并规则** | 只 **追加** 远程新 joke / 新 gif；**不覆盖** 已有本地文件与用户手动添加的内容 |

### 合并细则

- **`copy/jokes.json` / `states.json`**：按 `line1+line2`（states 含 `state`）去重；本地条目优先保留，远程仅补充新条。
- **`mascot/gifs/*`、占位图等**：若本地已有同名文件则 **跳过下载**；用户自己丢进 `gifs/` 的动图会一直保留。
- **不在 manifest 里的本地 gif**：不会被删除。

## 目录结构

```
content/
  manifest.json
  copy/
    jokes.json
    states.json
  mascot/
    default.png
    gifs/
      animation.gif   # 启动占位动图
      …               # 其它 gif：1 分钟后轮播
```

## 修改默认内容

1. 编辑本目录文件，或将动图放入 `mascot/gifs/`
2. 推送到 GitHub 前：`manifest.json` 的 `version` **+1**，`files` 列出新增路径
3. 重启应用或等 30 秒合并 / 托盘「同步文案/动图」

## 配置在线合并（可选）

`config/remote.json`：

```json
{
  "enabled": true,
  "contentBaseUrl": "https://raw.githubusercontent.com/<用户>/cursorq/main/content",
  "syncDelayMs": 30000
}
```

`enabled: false` 或留空 `contentBaseUrl` 时仅使用内置预设，不联网。
