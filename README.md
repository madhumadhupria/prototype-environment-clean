# prototype-environment

Public **single-model** prototype: APS Viewer (LMV) with **CAD/BIM neutral** backdrop and **footprint grid**. Full-screen canvas only — no ACC shell.

**Live demo:** https://madhumadhupria.github.io/prototype-environment/

Extension logic is copied from [viewer-environment](https://github.com/madhumadhupria/viewer-environment) (`main`).

---

## What you need to provide

| Item | Where to get it |
|------|-----------------|
| **APS Client ID + Secret** | [APS developer portal](https://aps.autodesk.com/) → Create app |
| **Model URN** (one model) | Upload + translate in APS, or use an existing viewable URN |
| **Token URL** (public deploy) | HTTPS endpoint that returns APS 2-legged tokens (see below) |

---

## Quick start (local)

```bash
git clone https://github.com/madhumadhupria/prototype-environment.git
cd prototype-environment
cp .env.example .env
# Edit .env: APS_CLIENT_ID, APS_CLIENT_SECRET, MODEL_URN
pnpm install
pnpm run config
```

Terminal 1 — token server:

```bash
node scripts/local-token-server.mjs
```

Terminal 2 — viewer:

```bash
pnpm run dev
```

Open http://localhost:5173

Local `TOKEN_URL` defaults to `/api/token` (served by the local token script).

---

## Publish to GitHub Pages

### GitHub repo variables

In **Settings → Secrets and variables → Actions → Variables**:

| Variable | Example |
|----------|---------|
| `MODEL_URN` | Base64 URN **without** `urn:` prefix |
| `TOKEN_URL` | `https://your-host.example.com/api/token` |
| `APS_ENV` | `AutodeskProduction` or `AutodeskStaging2` |

`TOKEN_URL` must be a public HTTPS API that issues APS tokens using your client id/secret (hosted separately from Pages — secrets must not ship in the static site).

### Enable Pages

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
extension/          # CAD/BIM neutral + grid + section box
src/main.ts         # Full-screen LMV, auto-applies environment
scripts/            # config writer + local dev token server
```

---

## License

MIT — see [LICENSE](LICENSE). APS Viewer usage subject to [Autodesk terms](https://aps.autodesk.com/).
