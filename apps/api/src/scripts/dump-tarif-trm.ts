import 'dotenv/config'
import { query } from '../lib/hfsql.js'
async function main() {
  console.log('=== tarif_TRM (all rows) ===')
  const rows = await query<Record<string, unknown>>(`SELECT * FROM tarif_TRM ORDER BY IDtarif_trm`)
  console.log(`${rows.length} rows`)
  for (const r of rows) console.log(' ', r)

  // Also probe for nearby tables (machine, prod stats)
  console.log('\n=== related candidates ===')
  for (const t of [
    'machine','machine_tricot','machine_TRM',
    'tableau_bord','tableau_bord_TRM','statistique_TRM',
    'duree_tricotage','tps_tricotage','temps_tricotage',
    'tps_machine','frais_machine',
  ]) {
    try {
      const r = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM ${t}`)
      console.log(`  ✓ ${t}: cols=${r.length === 0 ? '(empty)' : Object.keys(r[0]).join(', ')}`)
    } catch {}
  }
}
main().catch(e => { console.error(e); process.exit(1) })
