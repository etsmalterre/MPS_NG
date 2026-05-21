import 'dotenv/config'
import { query } from '../lib/hfsql.js'
async function main() {
  // SELECT * doesn't work on this table per HFSQL quirk — use explicit cols.
  console.log('--- colori_ecru 1094 (explicit cols) ---')
  const r = await query<Record<string, unknown>>(`SELECT IDcolori_ecru, IDref_ecru, reference FROM colori_ecru WHERE IDcolori_ecru = 1094`)
  for (const row of r) console.log(' ', row)
  console.log('\n--- coloris where IDref_ecru = 146 ---')
  const c = await query<Record<string, unknown>>(`SELECT IDcolori_ecru, IDref_ecru, reference FROM colori_ecru WHERE IDref_ecru = 146 ORDER BY reference`)
  for (const row of c) console.log(' ', row)
}
main().catch(e => { console.error(e); process.exit(1) })
