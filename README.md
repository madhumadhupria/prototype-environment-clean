# Prototype Environment Clean

Full-screen APS Viewer (LMV) with **CAD/BIM neutral** backdrop and **footprint grid** — no bottom prototype control bar.

**Live demo:** https://madhumadhupria.github.io/prototype-environment-clean/

This is a stripped-down fork of [prototype-environment](https://github.com/madhumadhupria/prototype-environment) with the Environment / Section / Rotate bottom strip removed. The CAD/BIM neutral environment is applied automatically.

Extension logic is copied from [viewer-environment](https://github.com/madhumadhupria/viewer-environment) (`main`).

---

## What you need to provide

| Item | Where to get it |
|------|-----------------|
| **APS Client ID + Secret** | [APS developer portal](https://aps.autodesk.com/) → Create app |
| **Model URN** (one model) | Upload + translate in APS, or use an existing viewable URN |
| **Vercel project** (free) | Hosts `/api/token` only — secrets stay off GitHub Pages |

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

### 1. Vercel (token API)

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
