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

### Step 3: Commit all changes

Stage all modified/added/deleted files and create a single commit. Use a descriptive commit message summarizing what was accomplished this session. Follow the repository's commit message style (short summary line).

### Step 4: Push to remote

Run `git push` to push the commit(s) to the remote repository.

### Step 5: Confirm

Report what was committed and pushed, including:
- Number of files changed
- Summary of CLAUDE.md updates (if any)
- The commit hash
