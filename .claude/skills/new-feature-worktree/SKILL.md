# New Feature Worktree Skill

## When to use

Invoke with `/new-feature-worktree <feature-name>` to start work on a new MPS_NG
screen/feature in an isolated git worktree with its own local dev stack (API + web)
on a dedicated port slot. Run this from the **main checkout** (`C:\dev\MPS_NG`, which
stays on `master`). Up to 6 worktrees can run at once.

`<feature-name>` is kebab-case (e.g. `clients-commandes`). It produces:
- branch `feat/<feature-name>`
- worktree dir `../MPS_NG-<feature-name>`
- the lowest free slot N (1–6) → API on `808N`, web on `300N`

## Background

Slot model and merge flow are documented in `claude_doc/worktrees.md`. The heavy
lifting (slot allocation, worktree creation, `pnpm install`, env/secrets copy,
starting the detached dev servers, health checks, registry bookkeeping) is done by
`scripts/worktree/up.mjs`. The registry lives at `~/.claude/mps-worktrees.json`.

## Steps

1. **Validate the argument.** If no feature name was given, ask for one. It must match
   `^[a-z0-9][a-z0-9-]*$` (kebab-case). Reject names with spaces/uppercase/slashes.

2. **Run the spin-up script** from the main checkout:
   ```bash
   node scripts/worktree/up.mjs <feature-name>
   ```
   This fetches origin, allocates a free slot, creates the worktree off
   `origin/master`, installs deps, writes a CORS-correct `.env.development`, copies
   `secrets/` if present, starts the API (`dev:808N`) and web (`dev:300N`) detached
   (logs → `<worktree>/.dev-logs/`), and records the slot + PIDs in the registry.

3. **Read the script's summary** (slot, branch, worktree path, the two
   `http://localhost:...` URLs, log paths). If it reports a server "NOT UP", tail the
   named log to diagnose before declaring success:
   ```bash
   tail -n 40 ../MPS_NG-<feature-name>/.dev-logs/web.log
   tail -n 40 ../MPS_NG-<feature-name>/.dev-logs/api.log
   ```

4. **Report to the user** the worktree path, the web URL (`http://localhost:300N`),
   and the slot number. Tell them to **open a new Claude Code session in the worktree
   directory** to do the screen work there — that session will use `/feature-checkpoint`
   to sync and `/feature-complete` to land it.

## Notes / failure modes

- "All 6 worktree slots are in use" → run `/worktree-status`; finish or `/feature-down`
  one before creating another.
- "Branch already exists" / "Worktree dir already exists" → the script aborts to avoid
  clobbering in-progress work. Pick a different name, or clean up the old one with
  `/feature-complete` (if mergeable) or `node scripts/worktree/down.mjs <name> --remove`.
- The dev servers are **detached** — they keep running after this Claude session ends,
  which is the point. They are stopped by `/feature-complete` or `/feature-down`.
- Do NOT do feature work in the main checkout; it is the integration tree on `master`.
