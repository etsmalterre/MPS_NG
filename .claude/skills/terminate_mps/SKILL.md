# Terminate MPS Session Skill

## When to use

Invoke with `/terminate_mps` at the end of a working session.

## What to do

Perform these steps in order:

### Step 1: Review what changed this session

Run `git diff` and `git status` to identify all files modified, added, or deleted during this session.

### Step 2: Update CLAUDE.md

Read the current `CLAUDE.md` at the project root. Then update it with any relevant information from this session:

- **New or renamed files/directories** — update the Project Structure section
- **New screens implemented** — add to Implemented Screens section with route, layout, API endpoints, HFSQL tables used
- **New API routes** — document under the relevant screen or add a new section
- **Architecture decisions** — add to the relevant Phase section or Conventions
- **New conventions or patterns** — add to Development Guidelines or Conventions
- **New HFSQL quirks discovered** — add to the HFSQL ODBC Connection section
- **Navigation changes** — update Navigation Structure section
- **New dependencies** — update Tech Stack table if significant
- **Bug fixes for systemic issues** — document the fix pattern so it's not repeated

**Rules:**
- Only add information that is **durable and useful for future sessions** — skip ephemeral details
- Keep the same formatting style as the existing CLAUDE.md
- Do NOT remove existing content unless it is now incorrect
- Be concise — one or two lines per new item is enough
- If nothing meaningful changed in CLAUDE.md-relevant areas, skip this step

### Step 2b: Check CLAUDE.md size and optimize if needed

`CLAUDE.md` is loaded into context on every session, so it must stay lean. After any edits in Step 2, measure it:

```bash
wc -l CLAUDE.md && wc -c CLAUDE.md
```

**Thresholds:**
- **Under 250 lines / 15 KB** — healthy, do nothing.
- **250–350 lines / 15–20 KB** — warn and look for optimization opportunities (see below). Only act on clear wins.
- **Over 350 lines OR over 20 KB** — must optimize before committing.

**Optimization opportunities to scan for:**
- **Detail that belongs in `claude_doc/`** — any section longer than ~15 lines that covers a specific subsystem (HFSQL quirks, auth internals, PDF/email, a screen catalog, migration history) should be extracted to `claude_doc/<topic>.md` and replaced in CLAUDE.md with a one-line entry in the "Reference Documentation" table ("load on demand when…").
- **Duplication** — the same rule/footgun stated in two sections. Keep one, delete the other.
- **Stale content** — Phase notes for completed phases, TODOs that were done, migration scripts that no longer exist, references to deleted files. Verify with `git` / file reads before deleting.
- **Verbose prose** — multi-sentence explanations that can become a single bulleted rule. CLAUDE.md is a rules sheet, not documentation.
- **Resolved footguns** — a rule that existed because of a bug that is now fixed at the code level (e.g. a lint rule, a wrapper function) can be deleted.

**How to apply:** propose the optimization to the user *before* editing when the change is non-trivial (extracting a section, deleting content). For small wins (collapsing two lines into one, removing an obviously stale TODO), just do it and mention it in Step 5. Never silently delete a rule the user added — those encode real incidents.

After optimizing, re-measure and confirm the file is back under threshold.

### Step 3: Commit all changes

Stage all modified/added/deleted files and create a single commit. Use a descriptive commit message summarizing what was accomplished this session. Follow the repository's commit message style (short summary line).

### Step 4: Push to remote

Run `git push` to push the commit(s) to the remote repository.

### Step 5: Confirm

Report what was committed and pushed, including:
- Number of files changed
- Summary of CLAUDE.md updates (if any)
- The commit hash
