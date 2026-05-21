import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  // 1. Full schema
  console.log('=== asso_fil_lignecmdsst — schema ===')
  const sample = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM asso_fil_lignecmdsst`)
  if (sample.length > 0) {
    console.log('columns:', Object.keys(sample[0]).join(', '))
    console.log('values: ', sample[0])
  } else {
    console.log('(empty table)')
  }

  // 2. Counts
  const cnt = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM asso_fil_lignecmdsst`)
  console.log(`\ntotal rows: ${Number(cnt[0]?.n) || 0}`)

  // 3. For a specific active TRM sst line, list rows.
  // sst 8488 line 8464 has 93 rolls produced (1816 kg) and we saw 0 in affectation_cmd_tricotage.
  // Likely has rows in asso_fil_lignecmdsst.
  console.log('\n=== asso_fil_lignecmdsst rows for sst 8488 line 8464 ===')
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM asso_fil_lignecmdsst WHERE IDligne_commande_sous_traitant = 8464`,
  )
  for (const r of rows) console.log(' ', r)

  // 4. Same for line 8500 (sst 8524) — we saw 2 affectation_cmd_tricotage rows there.
  console.log('\n=== asso_fil_lignecmdsst rows for sst 8524 line 8500 ===')
  const r2 = await query<Record<string, unknown>>(
    `SELECT * FROM asso_fil_lignecmdsst WHERE IDligne_commande_sous_traitant = 8500`,
  )
  for (const r of r2) console.log(' ', r)

  // 5. And line 8520 (sst 8544 — completed, 24 rolls).
  console.log('\n=== asso_fil_lignecmdsst rows for sst 8544 line 8520 ===')
  const r3 = await query<Record<string, unknown>>(
    `SELECT * FROM asso_fil_lignecmdsst WHERE IDligne_commande_sous_traitant = 8520`,
  )
  for (const r of r3) console.log(' ', r)

  // 6. Recent rows to see what an active affectation looks like
  console.log('\n=== asso_fil_lignecmdsst — most recent 5 rows ===')
  const recent = await query<Record<string, unknown>>(
    `SELECT TOP 5 * FROM asso_fil_lignecmdsst ORDER BY 1 DESC`,
  )
  for (const r of recent) console.log(' ', r)
}
main().catch(e => { console.error(e); process.exit(1) })
