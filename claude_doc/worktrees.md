# Parallel development with git worktrees

Work on multiple MPS_NG screens at once — one worktree per screen, one Claude per worktree,
each with its own local dev stack. Driven by four skills + `scripts/worktree/*.mjs`.

## Mental model

- **`C:\dev\MPS_NG` is the integration tree.** It stays permanently on `master` and is where
  features merge in and where you deploy from. **Do not do feature work here.** (A branch can
  be checked out in only one worktree, so `master` must live in one fixed place.)
- **Each screen gets a worktree** `../MPS_NG-<feature>` on branch `feat/<feature>`, created off
  the current `origin/master`.
- All worktrees share the **same local HFSQL** (`localhost:4900`) — do NOT fork the DB per tree.
- All worktrees share `node_modules`? No — each worktree runs its own `pnpm install` (the pnpm
  content-addressable store makes this fast/hardlinked).

## Slot model

Six slots; slot **N** (1–6):

| | value |
|---|---|
| API port | `8080 + N` (pnpm `@mps/api dev:808N`) |
| Web port | `3000 + N` (pnpm `@mps/web dev:300N`, already targets API `808N`) |
| Worktree | `../MPS_NG-<feature>` |
| Branch | `feat/<feature>` |
| URL | `http://localhost:300N` |

The registry `~/.claude/mps-worktrees.json` maps slot → feature/branch/ports/PIDs. Slot
allocation picks the lowest slot that is free in the registry **and** whose ports are actually
idle (a live probe), so a stale entry can't hand out a busy port.

## The skills

| Skill | Run from | What it does |
|---|---|---|
| `/new-feature-worktree <name>` | main checkout | allocate slot, create worktree off `origin/master`, `pnpm install`, copy `.env.development` (CORS spanning all dev ports) + `secrets/`, start API+web detached, health-check, register. Then open a new Claude in the worktree. |
| `/feature-checkpoint [msg]` | the feature worktree | commit → push → rebase onto `origin/master` (resolve conflicts here). **No merge.** Servers stay up; keep working. |
| `/feature-complete` | the feature worktree | commit + note → push → rebase → typecheck gate → fast-forward merge into `master` (from the main checkout) → push → stop servers, remove worktree, delete branch, free slot. **Deploy is separate.** |
| `/worktree-status` | anywhere | per-slot health (servers alive? web serving? ahead/behind master), free slots, stale-entry cleanup. |

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
