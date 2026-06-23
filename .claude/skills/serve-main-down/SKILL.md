# Serve Main Down Skill

## When to use

Invoke with `/serve-main-down` to stop the local **master** server started by
`/serve-main` (the reserved slot 0 — API `8080`, web `3000`). Run it when you're done
verifying the integrated app.

## Steps

1. **Run the down command** from the main checkout:
   ```bash
   node scripts/worktree/serve-main.mjs down
   ```
   It kills the recorded API + web process trees and clears `reg.main` from the
   registry, freeing ports 8080 / 3000.

2. **Report to the user** that master (slot 0) is stopped and the ports are free.

## Notes

- Safe to run when nothing is up — it just reports "nothing to stop".
- If you only want to check whether master is currently serving (without stopping it),
  use `node scripts/worktree/serve-main.mjs status` instead.
- This only affects slot 0 (master). Feature worktrees on slots 1–6 are untouched.
