# CursorQ v0.2.1 Release Notes

## 文案与内容

- **states.json**：新增 2 条橙色温和提醒文案（`done_today_ok` 状态）
  - 「今天用得多 / 大盘还稳」
  - 「冲太猛了 / 好在余粮足」
- **states.json**：微调周期超前文案（「后面扣咋整」→「后面扣哋整」）
- **content/manifest.json**：版本号 1 → 2，便于已开启远程同步的用户自动合并新文案

## 发布流程

- 修正 `npm run release` 脚本顺序（先 bump 版本再打包）
- GitHub Actions Release 正文改为读取本文件
- 同步更新 `release/README.md`（便携包内 README.txt）

---

## 升级指南

**从 v0.2.0 升级**：

1. 下载 `cursorq-0.2.1-win64.zip`
2. 解压覆盖原目录即可（保留 `data/` 下的用量与语言设置）
3. 无需额外配置

**从 v0.1.x 升级**：请先升级到 v0.2.0 或直接安装 v0.2.1，进度条颜色逻辑以 v0.2.0 起以「总量节奏」为主判断。

## 注意事项

1. 首次运行需要联网获取用量数据
2. 支持离线模式，可通过 `config/remote.json` 配置禁用远程同步
3. 数据仅保存在本机，不向第三方传输
