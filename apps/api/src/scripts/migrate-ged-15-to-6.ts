// One-off migration: ged.IDtype_doc 15 → 6.
//
// Both refer to "bl fournisseur"; type 15 is a legacy variant. After this
// runs no rows will use 15. We pre-count, write the affected IDged + their
// previous IDtype_doc to a JSON backup, run the UPDATE, then re-count.
//
// Usage:
//   apps/api $ pnpm tsx src/scripts/migrate-ged-15-to-6.ts [--apply]
//
// Without --apply this is a dry-run: shows counts and writes the backup
// file but does NOT modify the database.

import dotenv from 'dotenv'
const _env = process.env.NODE_ENV || 'development'
dotenv.config({ path: `.env.${_env}` })
dotenv.config({ path: '.env' })

import { query } from '../lib/hfsql-auto.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

async function main() {
  const apply = process.argv.includes('--apply')

  const before15 = (await query<{ n: number | bigint }>(
    `SELECT COUNT(*) AS n FROM ged WHERE IDtype_doc = 15`
  ))[0]?.n
  const before6 = (await query<{ n: number | bigint }>(
    `SELECT COUNT(*) AS n FROM ged WHERE IDtype_doc = 6`
  ))[0]?.n
  console.log(`[before] ged rows with IDtype_doc=15: ${Number(before15)}`)
  console.log(`[before] ged rows with IDtype_doc=6 : ${Number(before6)}`)

  if (Number(before15) === 0) {
    console.log('Nothing to do — no rows with IDtype_doc=15.')
    return
  }

  // Capture the IDs we're about to touch so we can roll back manually if the
  // semantics turn out to be wrong.
  const affected = await query<{ IDged: number | bigint }>(
    `SELECT IDged FROM ged WHERE IDtype_doc = 15`
  )
  const ids = affected.map((r) => Number(r.IDged))
  const backupPath = path.resolve(
    process.cwd(),
    `ged-15-to-6-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  )
  await fs.writeFile(
    backupPath,
    JSON.stringify({ from: 15, to: 6, ids, count: ids.length, ts: new Date().toISOString() }, null, 2)
  )
  console.log(`[backup] wrote ${ids.length} IDged → ${backupPath}`)

  if (!apply) {
    console.log('\nDry run — pass --apply to execute the UPDATE.')
    return
  }

  console.log('[apply] running UPDATE ged SET IDtype_doc = 6 WHERE IDtype_doc = 15 …')
  await query(`UPDATE ged SET IDtype_doc = 6 WHERE IDtype_doc = 15`)

  const after15 = (await query<{ n: number | bigint }>(
    `SELECT COUNT(*) AS n FROM ged WHERE IDtype_doc = 15`
  ))[0]?.n
  const after6 = (await query<{ n: number | bigint }>(
    `SELECT COUNT(*) AS n FROM ged WHERE IDtype_doc = 6`
  ))[0]?.n
  console.log(`[after]  ged rows with IDtype_doc=15: ${Number(after15)}`)
  console.log(`[after]  ged rows with IDtype_doc=6 : ${Number(after6)}`)
  console.log(`Δ type=6: +${Number(after6) - Number(before6)} (expected ${ids.length})`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    if (e.odbcErrors) for (const x of e.odbcErrors) console.error(x.state, x.message)
    process.exit(1)
  })
