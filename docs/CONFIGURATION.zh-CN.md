# 镜序 2.0 配置、数据结构与静态部署指南

## 1. 本地运行配置

镜序 2.0 设计为 **零 AI 依赖、纯前端离线工作台**，无需配置 OpenAI / Gemini / DeepSeek 等密钥即可完整使用所有时间轴剪辑与编译功能。

如仅需修改本地 Node 预览端口，可通过环境变量控制（参考 `.env.example`）：

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `HOST` | `127.0.0.1` | 绑定监听地址 |
| `PORT` | `4174` | 本地预览 HTTP 端口（避免与 1.0 默认端口 `4173` 冲突） |

---

## 2. 多轨工程文件格式 (`.jingxu2.json` & `.jingxu.json`)

- **工程保存**：所有修改实时防抖写入浏览器 `IndexedDB`（库名 `jingxu-nle-v2`），偏好保存在 `localStorage` (`jingxu-v2-prefs`)。
- **向上导入兼容**：`parseAnyProjectImport()` 自动去除 UTF-8 BOM 并屏蔽 `__proto__` / `constructor` 原型污染字段：
  - 若识别到 `tracks.video` 数组或 `version: 2`，直接恢复五轨多剪辑台。
  - 若识别到 `shots` / `storyboard` 或 `version: 1`，自动执行 `convertV1ToV2()`：逐镜计算时间累计 `V1` 坐标，把口播台词抽离成 `T1`，把动作声响抽离成 `A1`，将全局配乐铺底成 `A2`。

---

## 3. 静态部署指南

### 方式 A：GitHub Pages / Cloudflare Pages / 任何静态托管
直接发布 `dist/` 目录中的静态文件（排除内部临时 `dist/server/` 目录即可）：
- 所有静态资源在 HTML 与 JS 中均采用 `./` 相对路径引用，天然兼容二级目录（如 `/ai-video-prompt-editor/`）。
- 建议附带空文件 `.nojekyll`，确保 ES Module（`.mjs`）不被 Jekyll 过滤。

### 方式 B：Cloudflare Workers Static Assets
根目录已自带 `wrangler.jsonc`（指向 `dist` 资源目录及 `dist/server/index.js` 健康检查入口）：

```bash
npm run build
npx wrangler deploy
```
