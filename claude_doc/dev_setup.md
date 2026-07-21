# Dev Setup (first-time, fresh machine)

The factory PC has everything pre-installed; on a fresh machine you also need:

1. **HFSQL Client/Server** running on `localhost:4900` with the `MPS` database.
2. **HFSQL ODBC driver** — install once via `C:\PC SOFT\WINDEV Suite <year>\Install\ODBC\WX310PACKODBC.exe` (admin required). Without this, the API throws ODBC `IM002` ("Source de données introuvable") on every query and the user picker shows "Impossible de charger la liste".
3. **`apps/api/.env.development`** with at minimum `PORT=3002`, `AUTH_COOKIE_SECRET=<32-byte hex>`, `HFSQL_CONNECTION_STRING=DRIVER={HFSQL};Server Name=localhost;Server Port=4900;Database=MPS;UID=Admin;PWD=;`, and a `CORS_ORIGIN` **spanning every dev web port** (see below). Gitignored. Gmail send/draft is disabled until `apps/api/secrets/<service-account>.json` exists and `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` points at it.

### `CORS_ORIGIN` must list every dev port, not just one

The API rejects any origin not in the list, and the symptom is misleading: the app loads
but every list shows *"Impossible de charger la liste"*, while `curl` against the same
endpoint returns 200 — because `curl` sends no `Origin` header. A single-origin value
(the old `CORS_ORIGIN=http://localhost:5174`) breaks slot 0 (`:3000`) and every worktree
slot. Since the file is gitignored, this drifts per machine; generate the correct line
from the canonical list instead of typing one:

```bash
node -e "import('./scripts/worktree/lib.mjs').then(m => console.log('CORS_ORIGIN=' + m.DEV_WEB_ORIGINS.join(',')))"
```

`up.mjs` (worktrees) and `serve-main.mjs` (main checkout) both rewrite this line on every
start, so in practice you only hit it if you start a server another way.

## Quick Start

```bash
# --config.confirmModulesPurge=false: pnpm may otherwise block on an interactive
# "remove and reinstall modules dirs?" prompt, which looks like a hang.
pnpm install --config.confirmModulesPurge=false
pnpm dev          # start dev servers
pnpm build        # build all packages
pnpm test         # run tests
```

## Dev Ports

| Service | Port | Notes |
|---------|------|-------|
| MPS_NG API | 3002 | Set in `apps/api/.env.development` |
| MPS_NG Web | 5175 | Vite (5173/5174 taken by MFProd) |
| MFProd API | 8080 | Separate project |
| MFProd Web | 5173 | Separate project |

> Local dev webapp actually runs on **5174** in practice (memory `feedback_local_dev_port` overrides the 5175 note above).
