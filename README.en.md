[中文](./README.md) | [English](./README.en.md)

# Jingxu 2.0 — Multi-Track NLE AI Video Prompt Editor (`ai-video-prompt-editor`)

> **A CapCut / Jianying-style non-linear visual timeline editor for AI video prompts starting strictly from `00:00` — 100% zero AI API required, full manual frame-level directorial control.**

🌐 **Live Static Demo**: https://soulmove.github.io/ai-video-prompt-editor/  
🔗 **Sister Project (Jingxu 1.0 Structured Wizard & AI Studio)**: https://github.com/Soulmove/ai-video-prompt-studio

---

## Why Jingxu 2.0?

Modern native audio-video generation models (**Seedance, Sora, Kling, Runway, Veo, Wan, Hailuo**) increasingly accept multi-shot timecodes, lip-synced dialogue windows, camera trajectory verbs, and ambient foley cues.

While **[Jingxu 1.0 (`ai-video-prompt-studio`)](https://github.com/Soulmove/ai-video-prompt-studio)** focuses on a 4-step storyboard form workflow with optional LLM assistance, **Jingxu 2.0 (`ai-video-prompt-editor`)** brings true **Desktop NLE Timeline Editing**:

- **Zero AI Required, Start at `00:00`**: Launches into a clean blank multi-track timeline (`00:00:00`) with zero API key prompts. Build every shot manually with drag-and-drop timing blocks, or optionally import a 1.0 `.jingxu.json` project / load the 5-track rain-alley demo.
- **5 Synchronized Professional Tracks**:
  - **`E1` Adjustment Layer Track**: Override aesthetic look, film color grade, light source, or motion notes across multiple V1 shots underneath.
  - **`V1` Main Video / Storyboard Track**: Drag to reorder, trim edges (`≥ 0.5s`), toggle Ripple spacing, and open **110 cinematic transitions** directly on cut seams (`⇄`).
  - **`T1` Dialogue / Subtitle Track**: Position spoken lines independently of video cuts to craft true **J-Cuts** (audio enters before cut) and **L-Cuts**.
  - **`A1` SFX & Foley Track**: Layer sound effects with automatic sub-lane staggering for overlapping cues.
  - **`A2` BGM Music Track**: Built-in **Audio Ducking** flags when dialogue overlaps.
- **Live Program Monitor**: Proportional matte viewfinder (`16:9`, `9:16`, `2.39:1`, `1:1`, `4:3`, `3:4`, custom), optional local reference image upload, real-time synced subtitle overlay, and `Space` playback scrubbing.
- **5 Prompt Compilation Modes (`ZH` / `EN`)**:
  - `storyboard`: Merged V1 shots + overlapping overlays
  - `timeline`: Exact slice boundaries across all 5 tracks (explicitly surfacing J-Cut intervals like `00:03.5 -> 00:04.0`)
  - `selected`: Focused prompt for the currently highlighted clip
  - `concise`: Single chronological director block
  - `table`: RFC 4180 escaped `.csv` shot sheet
- **Jingxu 1.0 Import Compatibility**: Drag-and-drop `.jingxu.json` files exported from 1.0 straight onto 2.0 — shots map onto `V1`, dialogues move onto `T1`, SFX onto `A1`, and BGM onto `A2`.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` | Play / Pause Program Monitor |
| `B` or `S` | Razor split clip at red Playhead |
| `ArrowLeft` / `ArrowRight` | Nudge Playhead `±0.2s` (`Shift` for `±1.0s`) |
| `Delete` / `Backspace` | Delete selected clip (ripples V1 when Ripple is active) |
| `Ctrl + Z` | Undo (up to 60 snapshots) |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo |

---

## Quick Start (Zero `npm install` Dependencies)

Requires **Node.js >= 20.0.0**.

```bash
git clone https://github.com/Soulmove/ai-video-prompt-editor.git
cd ai-video-prompt-editor
npm start
# Open http://127.0.0.1:4174/
```

Run checks and unit tests:

```bash
npm run check
npm test
npm run build
```

---

## Documentation

- [Configuration & Deployment Guide (English)](./docs/CONFIGURATION.en.md)
- [配置、部署与数据结构指南 (简体中文)](./docs/CONFIGURATION.zh-CN.md)

## License

MIT License — see [LICENSE](./LICENSE).
