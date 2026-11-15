# Jingxu 2.0 Configuration & Deployment Guide

## 1. Local Runtime Variables

Jingxu 2.0 operates completely without external AI providers or API keys. Optional local preview server variables (see `.env.example`):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `HOST` | `127.0.0.1` | HTTP bind host |
| `PORT` | `4174` | HTTP preview port (kept separate from Jingxu 1.0 port `4173`) |

---

## 2. Project Schema & Storage

- Browser persistence uses local `IndexedDB` database `jingxu-nle-v2` alongside `localStorage` keys prefixed `jingxu-v2-*`.
- **Import Security & 1.0 Migration**: `parseAnyProjectImport()` strips UTF-8 BOM headers and removes `__proto__`, `constructor`, and `prototype` keys recursively. Version 1.0 `.jingxu.json` files automatically convert into 5 synchronized tracks (`video`, `dialogue`, `audio`, `bgm`, `adjust`).

---

## 3. Static Hosting & Deployment

- **GitHub Pages / Static Web Hosts**: Serve the contents of `dist/` (excluding `dist/server/`) with an empty `.nojekyll` file. All HTML, CSS, and ESM module imports use relative `./` URLs so subpath deployments (`/ai-video-prompt-editor/`) work cleanly.
- **Cloudflare Workers Static Assets**: Uses `wrangler.jsonc`:

```bash
npm run build
npx wrangler deploy
```
