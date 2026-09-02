# Shotfield

Infinite canvas for short-form drama. Paste a script, break it into shots, prep assets, write prompts, then generate boards and video.

[![Node](https://img.shields.io/badge/Node-18+-3c873a?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-6aa3ff)](./LICENSE)

---

## What it does

- **Infinite canvas** — script, shot builder, boards, video, and voice are nodes; wires pass references
- **Every visit starts blank** — older projects live in **History**
- **Swap LLMs** — DeepSeek V4 Flash / Pro, or paste any model ID
- **Images** via local Comfy or cloud APIs; **video** defaults to MiniMax H3 (6s)
- **Voice** via local GPT-SoVITS / IndexTTS, or cloud clone

> Upload your own stills for characters, scenes, and props. This repo does not generate those images.

---

## Quick start (Windows)

1. Install [Node.js LTS](https://nodejs.org/)
2. Clone this repo
3. Double-click **`start.bat`**  
   First run runs `npm install`, then opens [http://127.0.0.1:5173/](http://127.0.0.1:5173/)

| File | What it does |
|---|---|
| `start.bat` | Canvas only (web `5173` + API `8787`) |
| `stop.bat` | Stop the canvas servers |
| `connect-cloud.bat` | SSH tunnel: remote Comfy → local `8188` |
| `disconnect-cloud.bat` | Close the tunnel only |

Canvas and tunnel are separate. Do not bind them together.

Or from a terminal:

```bash
npm install
npm run dev
```

---

## How to use

1. You land on an empty canvas. Click **Start from a script**, or drop a `.txt`
2. From the script node’s right **+**, pull out a **script builder**
3. Three steps: **confirm shots → prep assets → write prompts**, then batch boards / video / voice
4. Top-left **New** returns to a blank canvas; the previous one is saved in **History**
5. **Settings**: API keys, models, Comfy URL (tunnel is usually `http://127.0.0.1:8188`)

### Custom model ID

Top bar → Model → **Custom model ID…**. Pick a provider and paste the ID. Official DeepSeek IDs are `deepseek-v4-flash` and `deepseek-v4-pro`. If a proxy uses another string, paste that string.

### Cloud Comfy

1. Start Comfy on the machine (AutoDL often uses port **6006**)
2. Double-click `connect-cloud.bat`. You can paste a full `ssh -p port root@host` line, then the password
3. Leave that window open
4. In Settings, set Comfy to `http://127.0.0.1:8188`

Local Comfy is fine too — no tunnel required.

---

## Layout

```
shotfield/
├── start.bat / start.ps1
├── connect-cloud.bat / connect-cloud.ps1
├── src/                 canvas UI
├── server/              local API
├── workflows/           Comfy workflow templates
└── data/                created at runtime (canvases, keys, uploads) — not in git
```

`data/` stays on your machine. **Do not commit API keys.**

---

## License

MIT
