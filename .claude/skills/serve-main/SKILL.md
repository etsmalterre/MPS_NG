# Serve Main Skill

## When to use

Invoke with `/serve-main` to serve the **main checkout** (`C:\dev\etsmalterre\MPS_NG`, on
`master`) locally so you can click through the integrated app — e.g. to verify that
merged feature work looks right before deploying. Master runs on its own reserved
**slot 0**: API on `8080`, web on `3000`. Slot 0 sits outside the 1–6 feature-worktree
range, so it never collides with a running feature worktree and there is no per-run
"which port?" decision.

Run this from the main checkout. Stop it later with `/serve-main-down`.

## Background

Slot 0 is defined as `MAIN_SLOT` in `scripts/worktree/lib.mjs`; `allocateSlot()` only
hands out slots 1–6, so it can never reuse 0. The web origin `http://localhost:3000`
is in the API's `CORS_ORIGIN` (and in `DEV_WEB_ORIGINS`, so every regenerated worktree
env allows it too). The committed pnpm scripts `@mps/api dev:8080` and
`@mps/web dev:3000` (→ `VITE_API_URL=http://localhost:8080/api`) wire the pair.
State is recorded under `reg.main` in `~/.claude/mps-worktrees.json`, kept separate
from `reg.slots` so `/worktree-status` and slot allocation ignore it.

## Steps

1. **Run the serve script** from the main checkout:
   ```bash
   node scripts/worktree/serve-main.mjs
   ```
   It refuses to double-spawn if slot 0 is already serving, starts the API
   (`dev:8080`) and web (`dev:3000`) detached (logs → `.dev-logs/main-api.log` /
   `main-web.log`), records the PIDs, and health-checks both ports.

2. **Read the summary** (branch, the two `http://localhost:...` URLs, PIDs, UP/NOT UP).
   If a server reports "NOT UP", tail its log to diagnose before declaring success:
   ```bash
   tail -n 40 .dev-logs/main-api.log
   tail -n 40 .dev-logs/main-web.log
   ```

3. **Report to the user**: the web URL (`http://localhost:3000`) and that it serves the
   live `master` checkout. **Flag that it talks to the live shared HFSQL DB** — clicking
   around is fine, but edits are real writes.

## Notes

- The dev servers are **detached** — they keep running after this Claude session ends.
  Stop them with `/serve-main-down` (or `node scripts/worktree/serve-main.mjs down`).
- `node scripts/worktree/serve-main.mjs status` reports current slot-0 health without
  starting anything.
- This serves whatever the main checkout currently has checked out (normally `master`);
  the summary prints the branch so you can confirm.
