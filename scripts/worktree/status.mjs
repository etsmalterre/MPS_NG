// Show every active worktree slot, whether its servers are alive, and how far
// each branch is ahead/behind origin/master.
//   node scripts/worktree/status.mjs
import fs from 'node:fs'
import {
  SLOTS, apiPort, webPort, readRegistry, isPortInUse, pidAlive, aheadBehind,
} from './lib.mjs'

const reg = readRegistry()
const keys = Object.keys(reg.slots).sort()

if (keys.length === 0) {
  console.log('No active worktrees. All 6 slots free.')
  process.exit(0)
}

console.log('Active worktrees:')
const stale = []
for (const k of keys) {
  const s = reg.slots[k]
  const exists = fs.existsSync(s.worktree)
  const apiAlive = pidAlive(s.apiPid)
  const webAlive = pidAlive(s.webPid)
  const webServing = await isPortInUse(s.webPort)
  const ab = exists ? aheadBehind(s.worktree) : { ahead: 0, behind: 0 }
  const health = webServing ? 'UP' : (apiAlive || webAlive) ? 'PARTIAL' : 'DOWN'
  console.log(`\n  [slot ${k}] ${s.feature}   ${health}`)
  console.log(`    branch   ${s.branch}   (+${ab.ahead} ahead / -${ab.behind} behind origin/master)`)
  console.log(`    worktree ${s.worktree}${exists ? '' : '   ⚠ MISSING ON DISK'}`)
  console.log(`    API      http://localhost:${s.apiPort}  pid ${s.apiPid} ${apiAlive ? 'alive' : 'dead'}`)
  console.log(`    Web      http://localhost:${s.webPort}  pid ${s.webPid} ${webAlive ? 'alive' : 'dead'}${webServing ? ' (serving)' : ''}`)
  if (!exists || (!apiAlive && !webAlive && !webServing)) stale.push(k)
}

const free = SLOTS.filter((n) => !reg.slots[String(n)])
console.log(`\nFree slots: ${free.length ? free.map((n) => `${n} (API ${apiPort(n)}/Web ${webPort(n)})`).join(', ') : 'none'}`)
if (stale.length) {
  console.log(`\n⚠ Stale entries (servers dead or worktree gone): slot ${stale.join(', ')}.`)
  console.log(`  Clean each with:  node scripts/worktree/down.mjs <slot>`)
}
