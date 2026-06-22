// Stop a feature worktree's dev servers (and optionally remove the worktree +
// branch). Frees the slot in the registry.
//   node scripts/worktree/down.mjs <feature|slot> [--remove]
//
// Without --remove: kill servers, free the slot, LEAVE the worktree + branch on
//   disk (pause work).  With --remove: also remove the worktree and delete the
//   local + remote branch (used by /feature-complete after a merge).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import {
  killTree, mainCheckout, readRegistry, writeRegistry,
} from './lib.mjs'

/** Synchronous sleep (no async in this short script). */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

const target = (process.argv[2] || '').trim()
const remove = process.argv.includes('--remove')
if (!target) {
  console.error('Usage: node scripts/worktree/down.mjs <feature|slot> [--remove]')
  process.exit(1)
}

const reg = readRegistry()
// Find the slot by number or by feature name.
let slotKey = null
if (/^[1-6]$/.test(target) && reg.slots[target]) {
  slotKey = target
} else {
  slotKey = Object.keys(reg.slots).find((k) => reg.slots[k].feature === target) ?? null
}
if (!slotKey) {
  console.error(`No registry entry for "${target}". Active: ${Object.values(reg.slots).map((s) => s.feature).join(', ') || '(none)'}`)
  process.exit(1)
}
const entry = reg.slots[slotKey]

console.log(`Stopping servers for slot ${slotKey} (${entry.feature}) …`)
killTree(entry.apiPid)
killTree(entry.webPid)

if (remove) {
  const main = mainCheckout()
  const tryGit = (args, label) => {
    try {
      execFileSync('git', ['-C', main, ...args], { stdio: 'inherit' })
    } catch {
      console.warn(`WARN: ${label} failed (continuing).`)
    }
  }
  console.log(`Removing worktree ${entry.worktree} …`)
  // Let the OS release the just-killed processes' file handles, then delete the
  // directory ourselves — Node's rmSync retries EBUSY/ENOTEMPTY on Windows,
  // which `git worktree remove` does not (it bails on "Directory not empty").
  sleepSync(1500)
  try {
    fs.rmSync(entry.worktree, { recursive: true, force: true, maxRetries: 10, retryDelay: 400 })
  } catch (e) {
    console.warn(`WARN: could not fully remove ${entry.worktree}: ${e.message}`)
  }
  tryGit(['worktree', 'prune'], 'worktree prune')
  tryGit(['branch', '-D', entry.branch], 'local branch delete')
  tryGit(['push', 'origin', '--delete', entry.branch], 'remote branch delete')
}

delete reg.slots[slotKey]
writeRegistry(reg)
console.log(`Slot ${slotKey} freed.${remove ? ' Worktree + branch removed.' : ' Worktree kept on disk.'}`)
