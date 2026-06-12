# Prototype Environment Clean

Full-screen APS Viewer (LMV) with **CAD/BIM neutral** backdrop and **footprint grid** — no bottom prototype control bar.

**Live demo:** https://madhumadhupria.github.io/prototype-environment-clean/

This is a stripped-down fork of [prototype-environment](https://github.com/madhumadhupria/prototype-environment) with the Environment / Section / Rotate bottom strip removed. The CAD/BIM neutral environment is applied automatically.

Extension logic is copied from [viewer-environment](https://github.com/madhumadhupria/viewer-environment) (`main`).

---

## How it works


1. **The browser loads the page** from GitHub Pages (`index.html` + bundled JavaScript).
2. **The APS Viewer library** is pulled from Autodesk’s CDN (`viewer3D.min.js`).
3. **The app reads `public/config.json`** to get the model URN and token URL.
4. **Before the model loads**, the viewer asks for an access token by calling the token URL (currently Vercel).
5. **With that token**, the viewer opens the model from APS and the custom extension applies the environmental backdrop and grid.

The model URN is public; the APS client secret stays on the token server.

---

## How it is built and deployed

The source is TypeScript. **Vite** bundles it into plain static files for the browser.

| Step | What happens |
|------|----------------|
| `npm run config` | Writes `public/config.json` from `.env` (local) or GitHub Actions variables (deploy) |
| `npm run build` | Vite compiles `src/` + `extension/` → `dist/` (HTML, JS, config) |
| GitHub Actions | On push to `main`, runs `pnpm install` + `pnpm run build`, then uploads `dist/` to GitHub Pages |

Locally you run `npm run dev` instead — Vite serves the files with hot reload on port 5173.

**Folder roles:**

```
src/main.ts              # Boots the viewer, loads the model
extension/               # CAD/BIM backdrop, grid, camera, etc.
public/config.json       # Model URN + token URL (generated, not hand-edited for deploy)
api/token.js             # Serverless token endpoint (for Vercel, not used by GitHub Pages directly)
scripts/                 # Local dev helpers (config writer, local token server)
```

---


## What you need to provide - if requirement arises for cloning and redeploying purposes

| Item | Where to get it |
|------|-----------------|
| **APS Client ID + Secret** | [APS developer portal](https://aps.autodesk.com/) → Create app |
| **Model URN** (one model) | Upload + translate in APS, or use an existing viewable URN |
| **Token server** (for live deploy) | Vercel project, or reuse `https://prototype-environment.vercel.app/api/token` |

---

## Quick start (local)

```bash
git clone https://github.com/madhumadhupria/prototype-environment-clean.git
cd prototype-environment-clean
cp .env.example .env
# Edit .env: APS_CLIENT_ID, APS_CLIENT_SECRET, MODEL_URN
npm install
npm run config
```

Terminal 1 — token server:

```bash
node scripts/local-token-server.mjs
```

Terminal 2 — viewer:

```bash
npm run dev
```

Open http://localhost:5173

---

## Publish to GitHub Pages

### 1. Token API

Reuse the token endpoint from the main prototype, or deploy your own:

`https://prototype-environment.vercel.app/api/token`

### 2. GitHub repo variables

In **Settings → Secrets and variables → Actions → Variables**:

| Variable | Example |
|----------|---------|
| `MODEL_URN` | Base64 URN **without** `urn:` prefix |
| `TOKEN_URL` | `https://prototype-environment.vercel.app/api/token` |
| `APS_ENV` | `AutodeskProduction` or `AutodeskStaging2` |

### 3. Enable Pages

**Settings → Pages → Build and deployment → Source:** GitHub Actions.

Push to `main` — workflow deploys `dist/` to Pages.

---

## License

MIT — see [LICENSE](LICENSE). APS Viewer usage subject to [Autodesk terms](https://aps.autodesk.com/).
