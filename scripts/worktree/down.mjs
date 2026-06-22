// Stop a feature worktree's dev servers (and optionally remove the worktree +
// branch). Frees the slot in the registry.
//   node scripts/worktree/down.mjs <feature|slot> [--remove]
//
// Without --remove: kill servers, free the slot, LEAVE the worktree + branch on
//   disk (pause work).  With --remove: also remove the worktree and delete the
//   branch (used by /feature-complete after a merge). If the directory is locked
//   (a terminal is cwd'd inside it — the usual case when run from the feature
//   session), the dir/branch removal is DEFERRED to a pending queue and reaped
//   later from the main checkout by any worktree skill (see lib.reapPending).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import {
  killTree, mainCheckout, readRegistry, writeRegistry, addPending, reapPending,
} from './lib.mjs'

/** Synchronous sleep (no async in this short script). */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// Opportunistically finish any previously-deferred removals first.
const swept = reapPending()
if (swept.reaped.length) {
  console.log(`Reaped leftover worktree dir(s): ${swept.reaped.map((e) => e.feature).join(', ')}`)
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

// Free the slot immediately (ports/registry) regardless of the dir outcome.
delete reg.slots[slotKey]
writeRegistry(reg)

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
  // Let the OS release the just-killed processes' handles, then try to delete
  // the directory (Node's rmSync retries EBUSY/ENOTEMPTY on Windows).
  sleepSync(1500)
  let removed = false
  if (fs.existsSync(entry.worktree)) {
    try {
      fs.rmSync(entry.worktree, { recursive: true, force: true, maxRetries: 10, retryDelay: 400 })
    } catch { /* still locked */ }
    removed = !fs.existsSync(entry.worktree)
  } else {
    removed = true
  }

  if (removed) {
    tryGit(['worktree', 'prune'], 'worktree prune')
    tryGit(['branch', '-D', entry.branch], 'local branch delete')
    tryGit(['push', 'origin', '--delete', entry.branch], 'remote branch delete')
    console.log(`Slot ${slotKey} freed. Worktree + branch removed.`)
  } else {
    // Locked by a terminal cwd'd inside (the usual feature-session case). Defer.
    addPending({ worktree: entry.worktree, branch: entry.branch, feature: entry.feature })
    console.log(`Slot ${slotKey} freed. Servers stopped and merge is done.`)
    console.log(`NOTE: ${entry.worktree} is still open in a terminal, so it can't be deleted yet.`)
    console.log(`      It will be removed automatically the next time you run any worktree`)
    console.log(`      skill from ${main} (or run: node scripts/worktree/reap.mjs there).`)
  }
} else {
  console.log(`Slot ${slotKey} freed. Worktree kept on disk.`)
}
