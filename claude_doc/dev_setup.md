# Dev Setup (first-time, fresh machine)

The factory PC has everything pre-installed; on a fresh machine you also need:

1. **HFSQL Client/Server** running on `localhost:4900` with the `MPS` database.
2. **HFSQL ODBC driver** — install once via `C:\PC SOFT\WINDEV Suite <year>\Install\ODBC\WX310PACKODBC.exe` (admin required). Without this, the API throws ODBC `IM002` ("Source de données introuvable") on every query and the user picker shows "Impossible de charger la liste".
3. **`apps/api/.env.development`** with at minimum `PORT=3002`, `CORS_ORIGIN=http://localhost:5174`, `AUTH_COOKIE_SECRET=<32-byte hex>`, `HFSQL_CONNECTION_STRING=DRIVER={HFSQL};Server Name=localhost;Server Port=4900;Database=MPS;UID=Admin;PWD=;`. Gitignored. Gmail send/draft is disabled until `apps/api/secrets/<service-account>.json` exists and `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` points at it.

## Quick Start

```bash
pnpm install
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
