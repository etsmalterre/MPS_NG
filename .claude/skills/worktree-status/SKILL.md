# Worktree Status Skill

## When to use

Invoke with `/worktree-status` to see every active MPS_NG feature worktree at a glance:
which slot it's on, whether its API + web servers are alive, whether the web port is
actually serving, how far the branch is ahead/behind `origin/master`, and which slots are
free. Run it anywhere (it reads the shared registry at `~/.claude/mps-worktrees.json`).

## Steps

1. **Run the status script:**
   ```bash
   node scripts/worktree/status.mjs
   ```
   (Run an optional `git -C C:/dev/MPS_NG fetch origin -q` first if you want the
   ahead/behind counts to reflect the very latest `master`.)

2. **Relay the output** to the user: the per-slot health (UP / PARTIAL / DOWN), URLs,
   branch divergence, and the list of free slots.

3. **If it flags stale entries** (servers dead or the worktree missing on disk), offer to
   clean them. For each stale slot the user confirms:
   ```bash
   cd /c/dev/MPS_NG && node scripts/worktree/down.mjs <slot> --remove
   ```
   (omit `--remove` to just free the slot while keeping the worktree on disk).
