# MPS Deploy Skill

## When to use

Invoke with `/mps_deploy` to deploy the MPS_NG API and/or webapp to production.

## Infrastructure Overview

| Component | Server | IP | User | Hostname |
|-----------|--------|-----|------|----------|
| **API** | mfprod-api | `10.10.2.163` | `debian` | `mfprod-api` |
| **Web** | mfprod-erp | `10.10.2.165` | `debian` | `mfprod-erp` |
| **HFSQL** | mps.malterre | `mps.malterre:4900` | `Malterre` | — |

Both servers are Debian Linux (x86_64). The MFProd (separate project) also runs on these servers.

## SSH Access

Connect via WSL using the `claude_deploy` key:

```bash
SSH_KEY="/home/vincent/.ssh/claude_deploy/claude_deploy"
# API server
wsl bash -c "ssh -i $SSH_KEY debian@10.10.2.163 'command'"
# Web server
wsl bash -c "ssh -i $SSH_KEY debian@10.10.2.165 'command'"
```

**Important**: The claude_deploy key is only enabled during active sessions. The user enables it before deployment and disables it after for security.

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

2. **Upload** the tarball to the server:
   ```bash
   wsl bash -c "scp -i $SSH_KEY tarball.tar.gz debian@10.10.2.163:/home/debian/"
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

1. **Build locally**:
   ```bash
   pnpm --filter web build
   ```
   This produces `apps/web/dist/` with hashed assets.

2. **Upload** the dist folder:
   ```bash
   wsl bash -c "scp -i $SSH_KEY -r apps/web/dist/* debian@10.10.2.165:/home/debian/mps_erp/dist/"
   ```
   Or tar it first for speed:
   ```bash
   tar czf /tmp/mps_web_dist.tar.gz -C apps/web/dist .
   wsl bash -c "scp -i $SSH_KEY /tmp/mps_web_dist.tar.gz debian@10.10.2.165:/home/debian/"
   wsl bash -c "ssh -i $SSH_KEY debian@10.10.2.165 'rm -rf /home/debian/mps_erp/dist/* && tar xzf /home/debian/mps_web_dist.tar.gz -C /home/debian/mps_erp/dist/'"
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
- **SW NavigationRoute**: The `navigateFallbackDenylist: [/^\/api\//]` in `vite.config.ts` is critical — without it, the SW intercepts iframe loads to `/api/` and serves `index.html`, causing React Router 404 errors.
