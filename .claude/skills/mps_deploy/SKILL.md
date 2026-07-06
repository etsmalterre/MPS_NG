# MPS Deploy Skill

## When to use

Invoke with `/mps_deploy` to deploy the MPS_NG API and/or webapp to production.

## Deploy ownership — the API is shared with MPS-TRM

The API deployed here serves **two frontends**: MPS_NG (`mpsng.malterre`) and the sister
app **MPS-TRM** (`mpstrm.malterre`, dist at `/home/debian/mps_trm/dist` on the same web
server, its nginx site proxies `/api/` to this same `10.10.2.163:8081`).

- **This skill owns**: the MPS_NG web bundle + the **shared API** (including endpoints that
  only TRM screens use, e.g. `planning-atelier.ts` — they live in this repo and deploy from
  here).
- **The MPS-TRM repo's own `/mps_deploy`** owns: the TRM web bundle only. Never deploy the
  API from there; never deploy the TRM web bundle from here.
- **After every API deploy, smoke-check BOTH frontends**: `https://mpsng.malterre/api/...`
  and `http://mpstrm.malterre/api/...` (same API through two proxies — if one fails, it's
  nginx-side, not the API).
- Shared-API changes for TRM features land on this repo's `master` via a **paired NG
  worktree** (see `claude_doc/worktrees.md` §"Shared-API changes") — so deploying `master`
  here is always sufficient to ship the API side of a TRM feature.

## Infrastructure Overview

| Component | Server | IP | User | Hostname |
|-----------|--------|-----|------|----------|
| **API** | mfprod-api | `10.10.2.163` | `debian` | `mfprod-api` |
| **Web** | mfprod-erp | `10.10.2.165` | `debian` | `mfprod-erp` |
| **HFSQL** | mps.malterre | `mps.malterre:4900` | `Malterre` | — |

Both servers are Debian Linux (x86_64). The MFProd (separate project) also runs on these servers.

## SSH Access

**Connect with the Windows-native OpenSSH binary** (`C:\Windows\System32\OpenSSH\ssh.exe`) and the `claude_deploy` key — NOT WSL and NOT Git Bash's `ssh` (its libcrypto rejects these keys with `error in libcrypto: unsupported`). This is the method defined in the user-level **`ssh-context`** skill; load that skill for the full flag rationale and the access model. The recipe below is portable across machines (laptop user `malte`, factory PC user `vince`) because it derives the key path from `$HOME`.

```bash
SSH="/c/Windows/System32/OpenSSH/ssh.exe"
SCP="/c/Windows/System32/OpenSSH/scp.exe"
KEY="$HOME/.ssh/claude_deploy/claude_deploy"   # C:\Users\<current-user>\.ssh\claude_deploy\claude_deploy
OPTS="-F none -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"

# API server
"$SSH" $OPTS debian@10.10.2.163 'command'
# Web server
"$SSH" $OPTS debian@10.10.2.165 'command'
```

**Important**: The claude_deploy key is only enabled during active sessions. The user enables it before deployment and disables it after for security. `Permission denied (publickey)` = the key isn't enabled right now (normal, not a bug) — ask the user to enable it. A timeout on a `10.10.x.x` address = not on the factory LAN/VPN.

**Key location varies per machine** (verified 2026-07-06): on the **factory PC** (`vince`) the
Windows-side key path above does **not exist** — the key lives on the WSL side at
`/home/vincent/.ssh/claude_deploy/claude_deploy`. If the Windows key file is missing
(`Identity file … not accessible`), fall back to WSL:
```bash
wsl bash -c "ssh -i /home/vincent/.ssh/claude_deploy/claude_deploy -o StrictHostKeyChecking=no debian@10.10.2.163 '<command>'"
wsl bash -c "scp -i /home/vincent/.ssh/claude_deploy/claude_deploy <local> debian@10.10.2.163:<remote>"
```
(For WSL scp, local Windows paths are `/mnt/c/...`.) Try `hostname` with one method; if the
identity file is missing, switch to the other — don't conclude the key isn't enabled until
an existing key file is refused.

## API Server (10.10.2.163)

### Location
- **App directory**: `/home/debian/mps_api/`
- **Source files**: `/home/debian/mps_api/src/` (TypeScript, run directly via `tsx`)
- **Binary**: `/home/debian/mps_api/hfsql_bridge` (compiled C binary for iODBC on Linux)
- **Config**: `/home/debian/mps_api/.env` (HFSQL connection string, PORT=8081)

### Process Manager
- **Systemd service**: `mps-api.service`
- **Service file**: `/home/debian/mps-api.service` (also installed in systemd)
- **ExecStart**: `/usr/bin/node --import tsx src/index.ts`
- **Restart**: `sudo systemctl restart mps-api`
- **Status**: `sudo systemctl status mps-api`
- **Logs**: `sudo journalctl -u mps-api -f`

### Runtime
- **Node.js**: v22.22.0
- **ODBC**: Uses iODBC (not unixODBC) via the `hfsql_bridge` C binary
- **Auto-select**: `hfsql-auto.ts` detects Linux → uses `hfsql-bridge.ts` → spawns `hfsql_bridge` binary

### Dependencies
- `node_modules/` installed with npm (not pnpm — monorepo workspace refs stripped)
- `package.json` is a standalone copy (no workspace protocol)

### Deploy Steps (API)

1. **Build a deploy tarball** locally with the API source files:
   - `src/` directory (all .ts files)
   - `package.json` (convert `workspace:*` refs to actual versions or remove them)
   - `.env.production` → `.env`
   - Do NOT include `node_modules/`, `hfsql_bridge` binary (already on server), or `.env.development`

2. **Upload** the tarball to the server (uses `$SCP`/`$KEY` from the SSH Access block):
   ```bash
   "$SCP" -i "$KEY" -o IdentitiesOnly=yes tarball.tar.gz debian@10.10.2.163:/home/debian/
   ```

3. **On the server**: extract, install deps, restart service:
   ```bash
   cd /home/debian/mps_api
   # backup current
   tar czf ../mps_api_backup.tar.gz src/ package.json
   # extract new files
   tar xzf ../tarball.tar.gz
   # install new dependencies if package.json changed
   npm install --production
   # restart
   sudo systemctl restart mps-api
   sudo systemctl status mps-api
   ```

### Key Differences from Local Dev
- Linux uses `hfsql-bridge.ts` (C bridge binary via iODBC) instead of `odbc` npm package (unixODBC)
- `hfsql-auto.ts` must export `queryRaw` on both paths
- `hfsql-bridge.ts` must also export `queryRaw`
- **Binary blobs**: The C bridge base64-encodes binary columns (`"b64:..."` prefix), Node decodes in `cleanRow()`. If `hfsql_bridge.c` changes, recompile on server: `gcc -o hfsql_bridge src/hfsql_bridge.c -I/usr/include/iodbc -liodbc -liodbcinst`
- **Accented column names**: iODBC bridge mangles accents (e.g. `recyclé` → `recyclb`). Frontend must handle all variants.
- **Accented VALUES in write literals (Windows-passes / Linux-500 footgun)**: a SQL write that interpolates accented text as a plain quoted literal (`'${esc(v)}'`) works on the Windows `odbc` driver but **corrupts the Linux bridge** → `[HY090]` / `string without end: ' not found` → HTTP 500. Because it never fails in local dev, it ships silently and only breaks after deploy. Any INSERT/UPDATE (and any `WHERE textcol = '...'` SELECT-back) touching free text — incl. **hardcoded French defaults** like `'Nouvelle référence'` — must emit accented values via the Latin-1 hex-literal helper `sqlText()` (canonical impl in `commandes-sous-traitant.ts`), not `'${esc(v)}'`. See CLAUDE.md §"Encoding (writes)". Found 2026-06-14: Fils › Références "Nouveau" button (silent 500, no UI feedback). When deploying API write routes, grep the changed routes for `'${esc(` on text columns before shipping, and after restart check `journalctl -u mps-api | grep HY090`.
- `multer` must be in `package.json` dependencies for certificate file uploads
- **Use `npm install` (not `--production`)** — `tsx` is in devDependencies but needed at runtime since the service runs TypeScript directly

## Web Server (10.10.2.165)

### Location
- **Dist directory**: `/home/debian/mps_erp/dist/`
- **Nginx config**: `/etc/nginx/sites-available/mpsng.malterre` (symlinked to sites-enabled)
- **Server name**: `mpsng.malterre`

### Nginx Setup
- Serves static files from `/home/debian/mps_erp/dist/`
- Proxies `/api/` to `http://10.10.2.163:8081` (API server)
- SPA routing: all non-file routes → `/index.html`
- Hashed assets cached 1 year; `index.html` + `sw.js` never cached
- **Default `client_max_body_size` is 1MB** — may need increasing for certificate file uploads

### Deploy Steps (Web)

1. **Build locally — use PowerShell, NOT the Bash tool.** `VITE_API_URL=/api`
   MUST be set in the build env:
   ```powershell
   cd C:\dev\etsmalterre\MPS_NG; $env:VITE_API_URL='/api'; pnpm --filter web build   # USE THIS
   ```
   ```bash
   MSYS_NO_PATHCONV=1 VITE_API_URL=/api pnpm --filter web build          # bash ONLY with the guard
   ```
   This produces `apps/web/dist/` with hashed assets.

   **Footgun A — git-bash path mangling (caused a prod outage 2026-06-15):**
   the Claude Code Bash tool on this machine is **git-bash**, whose MSYS
   path-conversion rewrites any value that looks like an absolute Unix path. So
   `VITE_API_URL=/api ... build` run through Bash bakes the API base as
   **`C:/Program Files/Git/api`**, and the prod bundle does
   `fetch(\`C:/Program Files/Git/api/auth/users\`)` → resolves to
   `https://mpsng.malterre/C:/Program Files/Git/api/...` → never matches `/api/*`.
   Result is identical to Footgun B ("Impossible de charger la liste" everywhere)
   but the `localhost:3002` grep below PASSES because the var *was* set, just to a
   garbage value. Build with PowerShell to avoid it entirely.

   **Footgun B — unset var (caused a prod outage 2026-06-14):** if the var is
   unset at build time, `apiFetch` silently bakes in its dev fallback
   `http://localhost:3002/api` (`apps/web/src/lib/api.ts:5`). The build succeeds,
   but every prod API call goes to `localhost:3002` and is blocked.

   **Verify the built bundle BEFORE upload — both a negative AND a positive
   check (the negative alone is necessary-but-not-sufficient, it misses Footgun A):**
   ```bash
   B=$(ls apps/web/dist/assets/index-*.js)
   grep -oc 'localhost:3002'        "$B"   # must be 0  (Footgun B)
   grep -oc 'Program Files/Git/api' "$B"   # must be 0  (Footgun A)
   grep -oE  'ht="/api"|="/api"'    "$B"   # MUST match — confirms API base is literally /api
   ```
   If the positive `="/api"` assertion doesn't match, do NOT deploy — the base is
   wrong regardless of what the negative checks say.

2. **Upload** the dist folder (uses `$SSH`/`$SCP`/`$KEY`/`$OPTS` from the SSH Access block):
   ```bash
   "$SCP" -i "$KEY" -o IdentitiesOnly=yes -r apps/web/dist/* debian@10.10.2.165:/home/debian/mps_erp/dist/
   ```
   Or tar it first for speed:
   ```bash
   tar czf /tmp/mps_web_dist.tar.gz -C apps/web/dist .
   "$SCP" -i "$KEY" -o IdentitiesOnly=yes /tmp/mps_web_dist.tar.gz debian@10.10.2.165:/home/debian/
   "$SSH" $OPTS debian@10.10.2.165 'rm -rf /home/debian/mps_erp/dist/* && tar xzf /home/debian/mps_web_dist.tar.gz -C /home/debian/mps_erp/dist/'
   ```

3. **No restart needed** — nginx serves static files directly. Just verify:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://mpsng.malterre/
   ```

### Production Environment
- `VITE_API_URL=/api` — relative URL, proxied by nginx to the API server
- No `.env` file needed on the web server (baked into the build)

## Verification Checklist

After deployment, verify:
- [ ] `curl http://10.10.2.163:8081/api/fournisseurs` returns JSON
- [ ] `curl http://mpsng.malterre/` returns HTML
- [ ] `curl http://mpsng.malterre/api/fournisseurs` returns JSON (through nginx proxy)
- [ ] Navigate to `http://mpsng.malterre/fournisseurs/gestion` in browser
- [ ] Certificate PDF viewer works (may need `client_max_body_size` increase in nginx)

## Known Issues

- **nginx upload limit**: Default 1MB `client_max_body_size` may block large certificate uploads. Fix: add `client_max_body_size 10m;` to the `/api/` location block in nginx config.
- **hfsql_bridge binary**: Compiled on the server from `src/hfsql_bridge.c`. Must be recompiled when the C source changes. Build: `gcc -o hfsql_bridge src/hfsql_bridge.c -I/usr/include/iodbc -liodbc -liodbcinst`
- **Logo files**: `logo-full.png`, `logo-small.png`, `logo-dev.webp` are in `public/` and included in the build. The `logo-dev.webp` only shows in dev mode (`import.meta.env.DEV`), so it won't appear in production.
- **Service Worker caching**: After deploying, users may need to hard-refresh (Ctrl+Shift+R) or unregister the SW in DevTools to pick up the new bundle. The SW precaches assets by hash, so new filenames are picked up on next SW update cycle.
- **Diagnosing "Impossible de charger la liste" / "API inaccessible" in the browser while curl works**: do NOT assume stale service worker and send the user through cache-clearing rituals first. **Diagnose server-side before touching the client**, in this order:
  1. `curl -sk https://mpsng.malterre/api/auth/users` — if it returns JSON, the API is fine.
  2. Check the nginx access log for the user's request: `sudo grep 'auth/users' /var/log/nginx/access.log | tail`. **If the browser shows the error but NO matching request appears in the log, the bundle is sending the request to the wrong URL** (Footgun A `C:/Program Files/Git/api/...` or Footgun B `localhost:3002`) — it's a bad build, not a cache problem.
  3. Confirm by grepping the *served* bundle: `curl -sk https://mpsng.malterre/$(curl -sk https://mpsng.malterre/ | grep -oE 'assets/index-[^"]+\.js')` then check for `ht="/api"` vs `Program Files`/`localhost`.
  Only after the served bundle is confirmed correct is a client-side SW clear the right next step. Rebuilding wrong → re-pushing → telling the user to clear cache again wastes everyone's time.
- **Missing PWA manifest icons**: `manifest.webmanifest` references `/icons/icon-192.png` and `/icons/icon-512.png`, but `apps/web/public/icons/` only contains `fini.png` and `tm.png` — so these 404 in the nginx error log after every deploy. Cosmetic (only affects the PWA install icon), NOT a sign of a broken deploy. Don't chase it while diagnosing API failures.
- **SW NavigationRoute**: The `navigateFallbackDenylist: [/^\/api\//]` in `vite.config.ts` is critical — without it, the SW intercepts iframe loads to `/api/` and serves `index.html`, causing React Router 404 errors.
