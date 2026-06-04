# 远程更新内容（GitHub）

推送到仓库后，用户安装包里的 `config/remote.json` 指向此目录的 **raw** 地址，例如：

`https://raw.githubusercontent.com/<你的用户名>/cursorq/main/content`

## 更新流程

1. 修改本目录下的 `copy/jokes.json`、`copy/states.json` 或 `mascot/gifs/*`
2. 将 `manifest.json` 里的 **`version` 加 1**（客户端靠版本号判断是否需要下载）
3. 推送到 GitHub
4. 用户启动 CursorQ **约 1 分钟后**自动拉取；或托盘「同步文案/动图」

## 目录结构（与安装包一致）

```
content/
  manifest.json
  copy/
    jokes.json
    states.json
  mascot/
    default.png
    gifs/
      *.gif
```

打包后请把安装目录 `config/remote.json` 里的 `contentBaseUrl` 改成你的 raw 前缀（模板见仓库 `config/remote.json.example`）。
