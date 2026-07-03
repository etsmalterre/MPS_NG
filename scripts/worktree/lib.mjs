// Shared helpers for the worktree skills (new-feature-worktree / feature-checkpoint
// / feature-complete / worktree-status). Pure Node, no deps. Windows-first
// (taskkill for process-tree shutdown) but degrades on POSIX.
//
// Slot model (see claude_doc/worktrees.md): slot N in 1..6 →
//   API port = 8080 + N   (pnpm script `@mps/api dev:808N`)
//   Web port = 3000 + N   (pnpm script `@mps/web dev:300N`, already → API 808N)
import { execFileSync, spawn } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

export const SLOTS = [1, 2, 3, 4, 5, 6]
export const apiPort = (n) => 8080 + n
export const webPort = (n) => 3000 + n
export const IS_WIN = process.platform === 'win32'

// ── Projects ────────────────────────────────────────────────────────────────
// Worktrees can be created for either the MPS_NG repo (API + web) or the sibling
// MPS-TRM repo (web only — its web dev server talks to an MPS_NG API over HTTP).
// Each project owns a disjoint port range so an NG slot and a TRM slot with the
// same number never collide:
//   ng  slot N → API 808N + web 300N   (packages @mps/api + @mps/web)
//   trm slot N → web 517N              (package @mps-trm/web, no API of its own)
// Both repos live side-by-side under the same parent dir (dirName is the folder
// basename), so a TRM worktree can be driven from the NG checkout (the sibling is
// resolved by dirName). See claude_doc/worktrees.md.
export const PROJECTS = {
  ng: {
    key: 'ng',
    label: 'MPS_NG',
    dirName: 'MPS_NG',
    hasApi: true,
    apiPkg: '@mps/api',
    webPkg: '@mps/web',
    apiPort: (n) => 8080 + n,
    webPort: (n) => 3000 + n,
    apiScript: (n) => `dev:${8080 + n}`,
    webScript: (n) => `dev:${3000 + n}`,
  },
  trm: {
    key: 'trm',
    label: 'MPS-TRM',
    dirName: 'MPS-TRM',
    hasApi: false,
    webPkg: '@mps-trm/web',
    webPort: (n) => 5170 + n, // 5171..5176
    webScript: (n) => `dev:${5170 + n}`,
    // TRM web has no API of its own — by default it targets the slot-0 master
    // MPS_NG API (served via /serve-main). Overridable per worktree (up --api).
    defaultApiPort: 8080,
  },
}

export function getProject(key) {
  const p = PROJECTS[(key || 'ng').toLowerCase()]
  if (!p) throw new Error(`Unknown project "${key}". Use "ng" or "trm".`)
  return p
}

// Slot 0 is RESERVED for serving the main checkout (master) itself: API 8080 /
// web 3000. It sits outside the 1..6 feature range, so allocateSlot() never
// hands it out and a feature worktree can never collide with the running master.
// Managed by scripts/serve-main.mjs (skills /serve-main + /serve-main-down).
export const MAIN_SLOT = 0

// Every dev web origin that must be allowed by the API's CORS_ORIGIN so cookie
// auth works from any slot — NG web ports (slot-0 master + 1..6), the two legacy
// defaults, and the TRM web ports (5171..6) since a TRM worktree's web server
// calls an MPS_NG API cross-origin. Deduped (5175 == trm slot 5).
export const DEV_WEB_ORIGINS = [
  ...new Set([
    5174,
    5175,
    webPort(MAIN_SLOT),
    ...SLOTS.map(webPort),
    ...SLOTS.map(PROJECTS.trm.webPort),
  ]),
].map((p) => `http://localhost:${p}`)

const REGISTRY = path.join(os.homedir(), '.claude', 'mps-worktrees.json')

// Registry slot keys. NG keeps bare numeric keys ("1".."6") for backward
// compatibility with entries created before TRM support; TRM entries are
// namespaced ("trm:1".."trm:6"). A bare-numeric key with no `project` field on
// its entry is therefore an NG slot.
export function slotKey(projectKey, n) {
  return projectKey === 'ng' ? String(n) : `${projectKey}:${n}`
}
export function parseSlotKey(key) {
  if (/^\d+$/.test(key)) return { project: 'ng', slot: Number(key) }
  const [proj, n] = key.split(':')
  return { project: proj, slot: Number(n) }
}
/** Project key for a registry entry, tolerant of pre-TRM entries with no field. */
export function entryProject(entry, key) {
  return entry?.project || parseSlotKey(key).project
}

export function readRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY, 'utf8'))
  } catch {
    return { slots: {} }
  }
}

export function writeRegistry(reg) {
  fs.mkdirSync(path.dirname(REGISTRY), { recursive: true })
  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2))
}

// ── Deferred directory removal ─────────────────────────────────────────────
// /feature-complete runs INSIDE the feature worktree, so that session (and the
// user's terminal) holds the dir as its cwd — Windows refuses to delete it. We
// can't remove it from there no matter how many retries. Instead we queue it and
// reap it later from the main checkout (where it's no longer locked), at the
// start of any worktree skill.

export function readPending() {
  const reg = readRegistry()
  return Array.isArray(reg.pendingRemovals) ? reg.pendingRemovals : []
}

export function addPending(entry) {
  const reg = readRegistry()
  const list = Array.isArray(reg.pendingRemovals) ? reg.pendingRemovals : []
  if (!list.some((e) => e.worktree === entry.worktree)) list.push(entry)
  reg.pendingRemovals = list
  writeRegistry(reg)
}

/** Finish removing any worktrees whose directory was locked at completion time.
 *  Local-only (no network) so it's cheap to call at the start of every skill.
 *  Returns { reaped: [...], stillBlocked: [...] }. */
export function reapPending() {
  const list = readPending()
  if (list.length === 0) return { reaped: [], stillBlocked: [] }
  // git prune/branch-delete must run in the repo the worktree belongs to. Older
  // pending entries predate the `main` field — fall back to the current repo's
  // main checkout (those are always NG, created before TRM support existed).
  const fallbackMain = mainCheckout()
  const reaped = []
  const stillBlocked = []
  for (const e of list) {
    const repo = e.main || fallbackMain
    const tryGit = (args) => { try { git(['-C', repo, ...args], repo) } catch {} }
    if (fs.existsSync(e.worktree)) {
      try {
        fs.rmSync(e.worktree, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
      } catch {
        // still locked (a terminal is cwd'd inside) — try again next time
      }
    }
    if (!fs.existsSync(e.worktree)) {
      tryGit(['worktree', 'prune'])
      tryGit(['branch', '-D', e.branch]) // already merged by /feature-complete
      reaped.push(e)
    } else {
      stillBlocked.push(e)
    }
  }
  const reg = readRegistry()
  reg.pendingRemovals = stillBlocked
  writeRegistry(reg)
  return { reaped, stillBlocked }
}

/** Absolute path of the main checkout (the worktree holding the shared .git).
 *  Works from any worktree: --git-common-dir points at <main>/.git. */
export function mainCheckout(cwd = process.cwd()) {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd,
    encoding: 'utf8',
  }).trim()
  return path.dirname(path.resolve(cwd, common))
}

/** Main checkout for a given project. When cwd is already that project's repo,
 *  it's mainCheckout(); otherwise the project repo is a sibling dir (same parent,
 *  named project.dirName) — which is how a TRM worktree is driven from the NG
 *  checkout. Throws if the sibling isn't a git repo. */
export function projectMainCheckout(projectKey, cwd = process.cwd()) {
  const proj = getProject(projectKey)
  const here = mainCheckout(cwd)
  if (path.basename(here).toLowerCase() === proj.dirName.toLowerCase()) return here
  const sibling = path.join(path.dirname(here), proj.dirName)
  if (!fs.existsSync(path.join(sibling, '.git'))) {
    throw new Error(
      `Cannot find the ${proj.label} checkout at ${sibling} (expected a sibling of ${here}).`,
    )
  }
  return sibling
}

function probeHost(port, host, timeoutMs) {
  return new Promise((resolve) => {
    const sock = new net.Socket()
    const done = (inUse) => { sock.destroy(); resolve(inUse) }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => done(true))
    sock.once('timeout', () => done(false))
    sock.once('error', () => done(false))
    sock.connect(port, host)
  })
}

/** True if something is listening on the port on EITHER stack. Vite binds the
 *  IPv6 localhost (::1); Express binds IPv4 (0.0.0.0) — so we must probe both,
 *  or a running vite/api looks "free" and the slot collides. */
export async function isPortInUse(port, timeoutMs = 500) {
  const [v4, v6] = await Promise.all([
    probeHost(port, '127.0.0.1', timeoutMs),
    probeHost(port, '::1', timeoutMs),
  ])
  return v4 || v6
}

/** Lowest free slot for a project: no registry entry for that project+slot AND
 *  the project's port(s) actually free. Projects have disjoint port ranges, so
 *  an NG slot and a TRM slot with the same number don't collide. Throws if all
 *  six of the project's slots are taken. */
export async function allocateSlot(projectKey = 'ng') {
  const proj = getProject(projectKey)
  const reg = readRegistry()
  for (const n of SLOTS) {
    if (reg.slots[slotKey(projectKey, n)]) continue
    if (proj.hasApi && (await isPortInUse(proj.apiPort(n)))) continue
    if (await isPortInUse(proj.webPort(n))) continue
    return n
  }
  throw new Error(`All 6 ${proj.label} worktree slots are in use.`)
}

/** PID still exists? (signal 0 probe — may false-positive on a recycled PID, so
 *  status.mjs cross-checks the port.) */
export function pidAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM' // exists but not ours
  }
}

/** Kill a detached dev server and its child tree (pnpm → node → vite/tsx). */
export function killTree(pid) {
  if (!pid) return
  try {
    if (IS_WIN) {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      process.kill(-pid, 'SIGTERM')
    }
  } catch {
    // already dead — fine
  }
}

/** Launch `pnpm --filter <pkg> <script>` as a fully detached dev server, output
 *  → logFile (+ .err.log), and return its PID. On Windows we use Start-Process
 *  (reliable detach + redirection + a stable PID whose whole tree killTree()
 *  reaps via taskkill /T); a Node detached spawn here orphaned the real server
 *  behind a transient wrapper PID. */
export function spawnDetached(cwd, pkg, script, logFile) {
  if (IS_WIN) {
    const errFile = logFile.replace(/\.log$/, '.err.log')
    const pidFile = logFile.replace(/\.log$/, '.pid')
    try { fs.rmSync(pidFile) } catch {}
    const q = (s) => String(s).replace(/'/g, "''")
    // Start-Process can't redirect a .cmd shim's streams (pnpm is pnpm.cmd) →
    // launch cmd.exe (a real exe) with `/c pnpm …`; its pid roots the tree.
    // Write the pid to a FILE and run powershell with stdio:'ignore' — if Node
    // captured powershell's stdout pipe, the detached grandchild would leak that
    // handle and execFileSync would hang waiting for pipe-EOF.
    const inner = `pnpm --filter ${q(pkg)} ${q(script)}`
    const ps =
      `$p = Start-Process -FilePath 'cmd.exe' ` +
      `-ArgumentList '/c','${inner}' ` +
      `-WorkingDirectory '${q(cwd)}' ` +
      `-RedirectStandardOutput '${q(logFile)}' -RedirectStandardError '${q(errFile)}' ` +
      `-WindowStyle Hidden -PassThru; Set-Content -Path '${q(pidFile)}' -Value $p.Id`
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore' })
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim())
    try { fs.rmSync(pidFile) } catch {}
    return pid
  }
  const out = fs.openSync(logFile, 'a')
  const child = spawn('pnpm', ['--filter', pkg, script], {
    cwd, detached: true, stdio: ['ignore', out, out],
  })
  child.unref()
  return child.pid
}

export function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/** ahead/behind origin/master for a worktree, using last-fetched refs. */
export function aheadBehind(cwd) {
  try {
    const out = git(['rev-list', '--left-right', '--count', 'origin/master...HEAD'], cwd)
    const [behind, ahead] = out.split(/\s+/).map((n) => Number(n) || 0)
    return { ahead, behind }
  } catch {
    return { ahead: 0, behind: 0 }
  }
}
