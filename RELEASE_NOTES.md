# CursorQ v0.1.1 Release Notes

## 🔄 更新内容

### 🌟 新增功能

1. **大型数据库支持**
   - 支持读取大于100MB的 Cursor 数据库文件
   - 使用 sqlite3 CLI 工具进行查询，避免内存限制
   - 修复了命令注入风险，使用安全的参数传递方式

2. **卡片式UI布局**
   - 「日均应为」和「剩余天数」改为卡片显示
   - 更清晰的用量信息展示
   - 剩余天数根据紧迫度显示不同颜色（平静/中等/紧急）

3. **国际化支持**
   - 完整的中英文翻译
   - 支持语言切换

4. **发布流程优化**
   - 新增 `release-bump.mjs` 一键版本号更新脚本
   - 自动更新 package.json、Cargo.toml、tauri.conf.json
   - 自动创建 git tag

### 🐛 Bug 修复

1. **移除调试模式**
   - 清理调试模式相关代码，避免启动失败
   - 删除 `debug-mode.ts`、`debug-ui.ts` 等调试文件
   - 保留核心工具函数到 `utils.ts`

2. **安全修复**
   - 修复数据库路径命令注入风险
   - 使用 `spawnSync` 替代 `execSync`，参数安全传递

3. **修复大文件处理逻辑**
   - 移除不完整的数据库读取逻辑（仅读取前100MB会导致SQLite解析错误）
   - 依赖 sqlite3 CLI 方案处理大文件

### 📁 文件变更

| 文件 | 变更 |
|------|------|
| `apps/tauri/src/utils.ts` | 新增 - 工具函数 |
| `apps/tauri/src/format.ts` | 重命名自 debug-ui-format.ts |
| `apps/tauri/src/debug-mode.ts` | 删除 |
| `apps/tauri/src/debug-ui.ts` | 删除 |
| `apps/tauri/src/i18n.ts` | 更新 - 删除调试模式翻译 |
| `apps/tauri/src/styles.css` | 更新 - 删除调试模式样式 |
| `packages/core/src/cursor-auth.ts` | 更新 - 安全修复 |
| `README.md` | 更新 - 数据库查询和联网说明 |

### 🚀 升级指南

**从 v0.1.0 升级**：
1. 下载最新版本 `cursorq-0.1.1-win64.zip`
2. 解压覆盖原目录即可
3. 无需额外配置

### ⚠️ 注意事项

1. 首次运行需要联网获取用量数据
2. 支持离线模式，可通过 `config/remote.json` 配置禁用远程同步
3. 数据仅保存在本机，不向第三方传输

---

## 📦 下载

- **Windows**: `cursorq-0.1.1-win64.zip`

## 📝 更新日志

```
v0.1.1 (2024-XX-XX)
├── 新增大型数据库支持
├── 新增卡片式UI布局
├── 新增中英文国际化
├── 修复命令注入安全漏洞
├── 移除调试模式代码
└── 优化发布流程
```
