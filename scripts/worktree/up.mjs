// Create a feature worktree on a free slot and spin up its API + web dev servers.
//   node scripts/worktree/up.mjs <feature-name>
//
// <feature-name> is kebab-case; it yields branch `feat/<name>` and worktree
// `../MPS_NG-<name>`. Idempotency is intentionally NOT assumed — if the branch or
// dir already exists the script aborts so you don't clobber in-progress work.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import {
  allocateSlot, apiPort, webPort, mainCheckout, readRegistry, writeRegistry,
  spawnDetached, isPortInUse, DEV_WEB_ORIGINS, git,
} from './lib.mjs'

const feature = (process.argv[2] || '').trim()
if (!/^[a-z0-9][a-z0-9-]*$/.test(feature)) {
  console.error('Usage: node scripts/worktree/up.mjs <feature-name>  (kebab-case)')
  process.exit(1)
}

const main = mainCheckout()
const branch = `feat/${feature}`
const wt = path.join(path.dirname(main), `MPS_NG-${feature}`)

// Guards: don't clobber an existing branch or directory.
if (fs.existsSync(wt)) { console.error(`Worktree dir already exists: ${wt}`); process.exit(1) }
const branches = git(['branch', '--list', branch], main)
if (branches) { console.error(`Branch already exists: ${branch}`); process.exit(1) }

console.log(`Fetching origin in ${main} …`)
execFileSync('git', ['-C', main, 'fetch', 'origin'], { stdio: 'inherit' })

const slot = await allocateSlot()
const api = apiPort(slot)
const web = webPort(slot)
console.log(`Slot ${slot} → API ${api}, Web ${web}`)

console.log(`Creating worktree ${wt} on ${branch} …`)
execFileSync('git', ['-C', main, 'worktree', 'add', wt, '-b', branch, 'origin/master'], {
  stdio: 'inherit',
})

console.log('Installing dependencies (pnpm install) …')
execFileSync('pnpm', ['install'], { cwd: wt, stdio: 'inherit', shell: true })

// Copy gitignored dev config the new worktree needs, and force a CORS_ORIGIN
// that allows every dev slot so cookie auth works regardless of which slot we got.
const srcEnv = path.join(main, 'apps/api/.env.development')
const dstEnv = path.join(wt, 'apps/api/.env.development')
if (fs.existsSync(srcEnv)) {
  let env = fs.readFileSync(srcEnv, 'utf8')
  const corsLine = `CORS_ORIGIN=${DEV_WEB_ORIGINS.join(',')}`
  env = /^CORS_ORIGIN=.*$/m.test(env)
    ? env.replace(/^CORS_ORIGIN=.*$/m, corsLine)
    : env.trimEnd() + `\n${corsLine}\n`
  fs.writeFileSync(dstEnv, env)
  console.log('Wrote apps/api/.env.development (CORS spans all dev ports).')
} else {
  console.warn('WARN: main checkout has no apps/api/.env.development to copy.')
}
// Label the web dev server's browser tab with the branch so parallel worktree
// tabs are distinguishable. Vite reads .env.development.local (gitignored); the
// app prefixes document.title from VITE_WORKTREE_LABEL in dev (see main.tsx).
fs.writeFileSync(
  path.join(wt, 'apps/web/.env.development.local'),
  `VITE_WORKTREE_LABEL=${branch}\n`,
)
console.log(`Wrote apps/web/.env.development.local (tab label "${branch}").`)

// Secrets (Google service-account key) for email/PDF — copy if present.
const srcSecrets = path.join(main, 'apps/api/secrets')
if (fs.existsSync(srcSecrets)) {
  fs.cpSync(srcSecrets, path.join(wt, 'apps/api/secrets'), { recursive: true })
  console.log('Copied apps/api/secrets/.')
}

const logDir = path.join(wt, '.dev-logs')
fs.mkdirSync(logDir, { recursive: true })
const apiLog = path.join(logDir, 'api.log')
const webLog = path.join(logDir, 'web.log')

console.log('Starting API + web (detached) …')
const apiPid = spawnDetached(wt, '@mps/api', `dev:808${slot}`, apiLog)
const webPid = spawnDetached(wt, '@mps/web', `dev:300${slot}`, webLog)

const reg = readRegistry()
reg.slots[String(slot)] = {
  feature, branch, worktree: wt.replace(/\\/g, '/'),
  apiPort: api, webPort: web, apiPid, webPid,
  logDir: logDir.replace(/\\/g, '/'), createdAt: new Date().toISOString(),
}
writeRegistry(reg)

// Health check: wait for the web port to accept connections (vite is quick; the
// API tsx-watch a few seconds). 90s ceiling so a broken start fails loudly.
async function waitFor(port, label, ms = 90000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await isPortInUse(port)) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}
const apiUp = await waitFor(api, 'API')
const webUp = await waitFor(web, 'Web')

console.log('\n──────────────────────────────────────────')
console.log(`Slot ${slot}  ${feature}`)
console.log(`  Worktree : ${wt}`)
console.log(`  Branch   : ${branch}`)
console.log(`  API      : http://localhost:${api}   pid ${apiPid}  ${apiUp ? 'UP' : 'NOT UP (check log)'}`)
console.log(`  Web      : http://localhost:${web}   pid ${webPid}  ${webUp ? 'UP' : 'NOT UP (check log)'}`)
console.log(`  Logs     : ${apiLog}`)
console.log(`             ${webLog}`)
console.log('──────────────────────────────────────────')
if (!apiUp || !webUp) {
  console.log('One or both servers did not come up in time — tail the log(s) above.')
  process.exitCode = 2
}
