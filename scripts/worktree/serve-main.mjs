// Serve the MAIN checkout (master) on its reserved slot 0: API 8080 / web 3000.
// Slot 0 sits outside the 1..6 feature range (see lib.MAIN_SLOT), so a feature
// worktree can never collide with the running master and there's no per-run
// "which port?" decision.
//
//   node scripts/worktree/serve-main.mjs          # bring master up (detached)
//   node scripts/worktree/serve-main.mjs down      # stop it
//   node scripts/worktree/serve-main.mjs status     # report
//
// State lives under reg.main in the shared registry (~/.claude/mps-worktrees.json),
// kept separate from reg.slots so worktree-status and allocateSlot ignore it.
import fs from 'node:fs'
import path from 'node:path'
import {
  MAIN_SLOT, apiPort, webPort, isPortInUse, spawnDetached, killTree,
  mainCheckout, readRegistry, updateRegistry, git, pidAlive,
} from './lib.mjs'

const API_PORT = apiPort(MAIN_SLOT) // 8080
const WEB_PORT = webPort(MAIN_SLOT) // 3000
const cmd = (process.argv[2] || 'up').trim()

const main = mainCheckout()
const logDir = path.join(main, '.dev-logs')
const apiLog = path.join(logDir, 'main-api.log')
const webLog = path.join(logDir, 'main-web.log')

function currentBranch() {
  try { return git(['-C', main, 'rev-parse', '--abbrev-ref', 'HEAD'], main) } catch { return '?' }
}

async function waitFor(port, label, ms = 90000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await isPortInUse(port)) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  console.warn(`WARN: ${label} on ${port} did NOT come up within ${ms / 1000}s.`)
  return false
}

function reportLine(label, port, pid, up) {
  console.log(`  ${label.padEnd(4)}: http://localhost:${port}   pid ${pid ?? '?'}   ${up ? 'UP' : 'NOT UP'}`)
}

async function down({ quiet } = {}) {
  const m = readRegistry().main
  if (m) {
    killTree(m.apiPid)
    killTree(m.webPid)
    updateRegistry((reg) => { delete reg.main })
    if (!quiet) console.log('Stopped master (slot 0). API 8080 / web 3000 freed.')
  } else if (!quiet) {
    console.log('No registered master server. Nothing to stop.')
  }
}

async function status() {
  const reg = readRegistry()
  const m = reg.main
  const apiUp = await isPortInUse(API_PORT)
  const webUp = await isPortInUse(WEB_PORT)
  console.log('──────────────────────────────────────────')
  console.log(`Slot 0  main (${currentBranch()})`)
  console.log(`  Checkout : ${main}`)
  reportLine('API', API_PORT, m?.apiPid, apiUp)
  reportLine('Web', WEB_PORT, m?.webPid, webUp)
  if (m && !pidAlive(m.apiPid) && !pidAlive(m.webPid) && !apiUp && !webUp) {
    console.log('  (registry has a stale entry — run `down` to clear it)')
  }
  console.log('──────────────────────────────────────────')
}

async function up() {
  // Already running? Don't double-spawn — just report.
  if ((await isPortInUse(API_PORT)) || (await isPortInUse(WEB_PORT))) {
    console.log('Master already appears to be serving on slot 0:')
    await status()
    return
  }
  // Clear any stale registry entry from a previous crash.
  await down({ quiet: true })

  fs.mkdirSync(logDir, { recursive: true })
  console.log(`Serving main checkout (${currentBranch()}) on slot 0 — API 8080 / web 3000 …`)
  const apiPid = spawnDetached(main, '@mps/api', `dev:${API_PORT}`, apiLog)
  const webPid = spawnDetached(main, '@mps/web', `dev:${WEB_PORT}`, webLog)

  updateRegistry((reg) => {
    reg.main = { branch: currentBranch(), apiPid, webPid, api: API_PORT, web: WEB_PORT, startedAt: new Date().toISOString() }
  })

  const apiUp = await waitFor(API_PORT, 'API')
  const webUp = await waitFor(WEB_PORT, 'Web')

  console.log('──────────────────────────────────────────')
  console.log(`Slot 0  main (${reg.main.branch})`)
  console.log(`  Checkout : ${main}`)
  reportLine('API', API_PORT, apiPid, apiUp)
  reportLine('Web', WEB_PORT, webPid, webUp)
  console.log(`  Logs     : ${apiLog}`)
  console.log(`             ${webLog}`)
  console.log('──────────────────────────────────────────')
  if (!apiUp || !webUp) process.exitCode = 1
}

if (cmd === 'down' || cmd === 'stop') await down()
else if (cmd === 'status') await status()
else await up()
