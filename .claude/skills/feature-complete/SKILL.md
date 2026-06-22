# Feature Complete Skill

## When to use

Invoke with `/feature-complete` **from inside a feature worktree** (`../MPS_NG-<name>`, on
branch `feat/<name>`) when a screen is finished and ready to land. It commits, rebases onto
`master` (resolving conflicts with this screen's context), fast-forward-merges into `master`,
then shuts down this slot's dev servers, removes the worktree, and deletes the branch.

Deploy is a **separate** step — after this completes, run `/mps_deploy` if you want to ship.

The merge is always a clean fast-forward because we rebase first. Conflicts are resolved
HERE (you have the context), so `master` only ever sees a fast-forward.

## Preconditions

- You are in a feature worktree on a `feat/*` branch (NOT the main checkout / `master`).
- The main checkout is `C:\dev\MPS_NG`, on `master`, with a clean working tree. (The
  `apps/api/tsconfig.tsbuildinfo` gitignore keeps it clean across builds — if `git -C
  C:/dev/MPS_NG status --porcelain` is non-empty, resolve that first; do not force past it.)

## Steps

1. **Confirm the branch.** `git branch --show-current` must be `feat/<name>`. If not, STOP.

2. **Write the note + final commit.** Review the full diff. Craft a thorough summary of what
   this screen does — this is the **note**, used as the merge-commit message. Prepend a dated
   entry to `claude_doc/worktree-merge-log.md` (newest first), commit any remaining work plus
   the log entry on the branch. End the commit body with:
   ```
   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   ```

3. **Push the branch** (ensure the account first):
   ```bash
   gh auth switch --user vincentmalterre
   git push -u origin HEAD
   ```

4. **Rebase onto the latest master, resolving conflicts here:**
   ```bash
   git fetch origin
   git rebase origin/master
   ```
   On conflict: edit, `git add`, `git rebase --continue` (keep BOTH sides on additive
   registry files; for `claude_doc/worktree-merge-log.md` keep every entry). Then:
   ```bash
   git push --force-with-lease
   ```

5. **Typecheck gate — do not merge broken code.**
   ```bash
   pnpm --filter @mps/web exec tsc --noEmit        # MUST be clean
   pnpm --filter @mps/api exec tsc --noEmit        # only the 7 known baseline errors
   ```
   The API has 7 pre-existing baseline errors in `src/lib/hfsql.ts` + `src/scripts/*`. The
   gate passes if web is clean AND no API error references a file you changed. If anything
   else fails, fix it before continuing.

6. **Fast-forward merge into master, from the main checkout:**
   ```bash
   git -C C:/dev/MPS_NG fetch origin
   git -C C:/dev/MPS_NG status --porcelain          # must be empty — else stop & resolve
   git -C C:/dev/MPS_NG merge --ff-only origin/master
   git -C C:/dev/MPS_NG merge --ff-only feat/<name>
   git -C C:/dev/MPS_NG push origin master
   ```
   - If `merge --ff-only feat/<name>` **fails** (another feature landed on master between your
     rebase and now), re-run step 4 (`git fetch && git rebase origin/master && git push
     --force-with-lease`) then retry step 6. The `--ff-only` guard is intentional — it refuses
     to create a tangled merge.

7. **Tear down — run this from the main checkout** (you cannot delete the worktree you're
   standing in on Windows):
   ```bash
   cd /c/dev/MPS_NG && node scripts/worktree/down.mjs <name> --remove
   ```
   This kills the slot's API + web process trees, removes the worktree, deletes the local and
   remote `feat/<name>` branch, and frees the slot.

8. **Report.** Confirm: merged to `master` (show `git -C C:/dev/MPS_NG log --oneline -3`),
   slot freed, worktree + branch removed. Tell the user this Claude session's worktree is gone
   — they should close it — and that shipping is a separate `/mps_deploy` from the main checkout.
