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

// Every dev web origin that must be allowed by the API's CORS_ORIGIN so cookie
// auth works from any slot (plus the two legacy defaults).
export const DEV_WEB_ORIGINS = [5174, 5175, ...SLOTS.map(webPort)].map(
  (p) => `http://localhost:${p}`,
)

const REGISTRY = path.join(os.homedir(), '.claude', 'mps-worktrees.json')

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

/** Absolute path of the main checkout (the worktree holding the shared .git).
 *  Works from any worktree: --git-common-dir points at <main>/.git. */
export function mainCheckout(cwd = process.cwd()) {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd,
    encoding: 'utf8',
  }).trim()
  return path.dirname(path.resolve(cwd, common))
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

/** Lowest free slot: not in the registry AND both its ports actually free.
 *  Throws if all six are taken. */
export async function allocateSlot() {
  const reg = readRegistry()
  for (const n of SLOTS) {
    if (reg.slots[String(n)]) continue
    if (await isPortInUse(apiPort(n))) continue
    if (await isPortInUse(webPort(n))) continue
    return n
  }
  throw new Error('All 6 worktree slots are in use (ports 8081-8086 / 3001-3006).')
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
