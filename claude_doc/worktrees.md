# Parallel development with git worktrees

Work on multiple screens at once — one worktree per screen, one Claude per worktree, each with
its own local dev stack. Driven by the worktree skills + `scripts/worktree/*.mjs`. Supports
**two projects**: `ng` (MPS_NG — API + web, the default) and `trm` (the sibling MPS-TRM repo —
web only). The scripts live in the MPS_NG checkout and drive both; the TRM repo is resolved as
the sibling directory (`../MPS-TRM`).

## Mental model

- **`C:\dev\etsmalterre\MPS_NG` is the integration tree.** It stays permanently on `master` and is
  where features merge in and where you deploy from. **Do not do feature work here.** (A branch can
  be checked out in only one worktree, so `master` must live in one fixed place.) MPS-TRM
  (`C:\dev\etsmalterre\MPS-TRM`) is its own integration tree with the same discipline.
- **Each screen gets a worktree** `../MPS_NG-<feature>` (or `../MPS-TRM-<feature>`) on branch
  `feat/<feature>`, created off that repo's current `origin/master`.
- All worktrees share the **same local HFSQL** (`localhost:4900`) — do NOT fork the DB per tree.
- All worktrees share `node_modules`? No — each worktree runs its own `pnpm install` (the pnpm
  content-addressable store makes this fast/hardlinked).

## Slot model

Six slots **per project**; slot **N** (1–6). The two projects have **disjoint port ranges**, so
an NG slot and a TRM slot with the same number never collide:

| | MPS_NG (`ng`) | MPS-TRM (`trm`) |
|---|---|---|
| API port | `8080 + N` (pnpm `@mps/api dev:808N`) | *none* — targets an MPS_NG API over HTTP |
| Web port | `3000 + N` (pnpm `@mps/web dev:300N`, targets API `808N`) | `5170 + N` (pnpm `@mps-trm/web dev:517N`) |
| Worktree | `../MPS_NG-<feature>` | `../MPS-TRM-<feature>` |
| Branch | `feat/<feature>` | `feat/<feature>` |
| URL | `http://localhost:300N` | `http://localhost:517N` |

**TRM is web-only.** Its web dev server calls an MPS_NG API cross-origin, so the TRM web ports
(`5171–5176`) are in `DEV_WEB_ORIGINS` and in the MPS_NG API's dev CORS. By default a TRM worktree
targets the **slot-0 master** MPS_NG API on `:8080` (start it with `/serve-main`); override with
`up.mjs <feature> trm --api 808N` to point at a running NG worktree's API instead. The chosen
target is written to the TRM worktree's `apps/web/.env.development.local` as `VITE_API_URL`.

The registry `~/.claude/mps-worktrees.json` maps slot → project/feature/branch/ports/PIDs. NG
entries keep bare numeric keys (`"1"`); TRM entries are namespaced (`"trm:1"`). Slot allocation
picks the lowest slot free in the registry **for that project** and whose port(s) are actually
idle (a live probe), so a stale entry can't hand out a busy port. `PROJECTS` in
`scripts/worktree/lib.mjs` defines each project's packages/ports/scripts.

**Slot 0 is reserved for serving the main checkout (`master`) itself** — API `8080` / web `3000`,
outside the 1–6 feature range so `allocateSlot()` never hands it out and a feature worktree can
never collide with a running master. Defined as `MAIN_SLOT` in `scripts/worktree/lib.mjs`;
`localhost:3000` is in `DEV_WEB_ORIGINS` (so every generated worktree env allows it too). Managed
by `scripts/worktree/serve-main.mjs` behind the `/serve-main` + `/serve-main-down` skills; state
lives under `reg.main` (separate from `reg.slots`, so status/allocation ignore it). Use it to
click through the integrated app on `master` before deploying.

## The skills

| Skill | Run from | What it does |
|---|---|---|
| `/new-feature-worktree <name> [ng\|trm]` | MPS_NG main checkout | allocate slot for the project (default `ng`), create worktree off that repo's `origin/master`, `pnpm install`, wire dev env (ng: `.env.development` CORS + `secrets/`, start API+web; trm: `.env.development.local` `VITE_API_URL`, start web only), health-check, register. Then open a new Claude in the worktree. |
| `/feature-checkpoint [msg]` | the feature worktree | commit → push → rebase onto `origin/master` (resolve conflicts here). **No merge.** Servers stay up; keep working. |
| `/feature-complete` | the feature worktree | commit + note → push → rebase → typecheck gate → fast-forward merge into `master` (from the main checkout) → push → stop servers, remove worktree, delete branch, free slot. **Deploy is separate.** |
| `/worktree-status` | anywhere | per-slot health (servers alive? web serving? ahead/behind master), free slots, stale-entry cleanup. |
| `/serve-main` | main checkout | serve `master` on reserved slot 0 (API 8080 / web 3000) detached + health-check — verify merged work before deploying. `serve-main.mjs status` reports without starting; refuses to double-spawn. |
| `/serve-main-down` | main checkout | stop the slot-0 master server and free 8080/3000. |

## Merge discipline (why it stays clean)

1. One worktree = one branch = one screen. Keep scope tight.
2. Sync each tree onto `master` only **when it's that tree's turn** — at `/feature-checkpoint`
   or `/feature-complete`. You do NOT pull every tree after every merge.
3. Conflicts are always resolved **in the feature worktree** (rebase), where that screen's
   Claude has context. `master` therefore only ever sees a **fast-forward** — no tangled
   merges, no second Claude untangling anything.
4. Deploy only from `master` (the main checkout), via `/mps_deploy`.

### Shared "registry" files that tend to conflict (all additive — keep both sides)

`apps/api/src/lib/permission-keys.ts`, `apps/api/src/index.ts`,
`apps/web/src/config/navigation.ts`, `apps/web/src/router.tsx`, `pnpm-lock.yaml`,
`claude_doc/worktree-merge-log.md`.

## Manual fallbacks

```bash
node scripts/worktree/status.mjs                       # what's running
node scripts/worktree/up.mjs   <feature>               # create + start
node scripts/worktree/down.mjs <feature|slot>          # stop servers, free slot, keep tree
node scripts/worktree/down.mjs <feature|slot> --remove # + remove worktree & branch
git worktree list                                      # ground truth from git
```

## Notes

- Dev servers are launched **detached** so they outlive the Claude that started them; they're
  stopped by `/feature-complete` or `node down.mjs`. On Windows the whole `pnpm → vite/tsx`
  process tree is reaped via `taskkill /T /F`.
- **Deferred dir removal:** `/feature-complete` runs *inside* the worktree, so Windows won't let
  it delete that directory (the session/terminal holds the cwd). The merge + slot-free + branch
  delete still happen; the leftover dir is queued (`pendingRemovals` in the registry) and reaped
  automatically the next time any worktree skill runs from the main checkout — or manually via
  `node scripts/worktree/reap.mjs`. `/worktree-status` shows anything still pending.
- `apps/api/tsconfig.tsbuildinfo` and `.dev-logs/` are gitignored — the former so a build never
  dirties the main checkout (which would block the fast-forward merge).
