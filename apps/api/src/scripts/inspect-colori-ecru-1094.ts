// Check colori_ecru 1094 — the line's IDColoris resolves to "ecru" here,
// which means tricoteur lines actually point into colori_ecru, not
// colori_fil. Pull all columns to see what other label might map to "029".
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  console.log('--- colori_ecru ---')
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM colori_ecru WHERE IDcolori_ecru = 1094`,
  )
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      const display = v instanceof ArrayBuffer ? `<blob ${v.byteLength}b>` : v
      console.log(`${k.padEnd(30)} = ${display === '' ? "''" : display}`)
    }
  }

  console.log('\n--- ref_ecru columns (limit 1) ---')
  const e = await query<Record<string, unknown>>(`SELECT * FROM ref_ecru LIMIT 1`)
  if (e.length > 0) {
    console.log(Object.keys(e[0]).join(', '))
  }

  console.log('\n--- ref_fil with reference LIKE 02% or = 029 ---')
  const f = await query<Record<string, unknown>>(
    `SELECT IDref_fil, reference FROM ref_fil WHERE reference LIKE '02%' OR reference = '029'`,
  )
  for (const r of f) console.log(r)
}

main().catch((e) => { console.error(e); process.exit(1) })
