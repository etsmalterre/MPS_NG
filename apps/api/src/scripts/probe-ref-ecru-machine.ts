import 'dotenv/config'
import { query } from '../lib/hfsql.js'
async function main() {
  console.log('=== ref_ecru_machine schema ===')
  const s = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM ref_ecru_machine`)
  console.log('cols:', s.length === 0 ? '(empty)' : Object.keys(s[0]).join(', '))
  if (s.length > 0) console.log('sample:', s[0])

  console.log('\n=== ref_ecru_machine rows for IDref_ecru=146 ("029") ===')
  const r = await query<Record<string, unknown>>(`SELECT * FROM ref_ecru_machine WHERE IDref_ecru = 146`)
  for (const row of r) console.log(' ', row)

  console.log('\n=== MIN((trs_10kg_chute/nb_chutes)/10) for ref 146 — the gxNbToursKg input ===')
  const q = await query<{ trs_par_kg: number | null }>(
    `SELECT MIN((trs_10kg_chute/nb_chutes)/10) AS trs_par_kg FROM ref_ecru_machine WHERE IDref_ecru = 146`,
  )
  console.log(q)
}
main().catch(e => { console.error(e); process.exit(1) })
