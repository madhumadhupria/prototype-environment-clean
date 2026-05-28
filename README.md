# prototype-environment

Public **single-model** prototype: APS Viewer (LMV) with **CAD/BIM neutral** backdrop and **footprint grid**. Full-screen canvas only — no ACC shell.

**Live demo (after setup):** https://madhumadhupria.github.io/prototype-environment/

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
git clone https://github.com/madhumadhupria/prototype-environment.git
cd prototype-environment
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

1. Import this repo in [Vercel](https://vercel.com).
2. Set environment variables: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`.
3. Deploy. Note the URL, e.g. `https://prototype-environment.vercel.app`.
4. Token endpoint: `https://prototype-environment.vercel.app/api/token`

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

## Model URN format

Set `MODEL_URN` in `.env` (local) or GitHub Actions variable (deploy). Base64 id only, **no** `urn:` prefix:

```env
MODEL_URN=dXJuOmFkc2sud2lwc3RnOmZzLmZpbGU6dmYue...
```

The app loads `urn:${modelUrn}` from `public/config.json`.

---

## Layout

```
extension/          # CAD/BIM neutral + grid (from viewer-environment)
src/main.ts         # Full-screen LMV, auto-applies environment
api/token.js        # Vercel serverless APS token
scripts/            # Local dev token server
```

---

## License

MIT — see [LICENSE](LICENSE). APS Viewer usage subject to [Autodesk terms](https://aps.autodesk.com/).
