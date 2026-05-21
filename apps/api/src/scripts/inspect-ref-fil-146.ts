// One-shot inspector: list every column of ref_fil row IDref_fil=146,
// looking for whatever short code the legacy app shows next to a tricoteur
// commande line (user reports "029" but our API returns
// reference="1/50 VISCOSE/LAINE 75/25").
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM ref_fil WHERE IDref_fil = 146`,
  )
  if (rows.length === 0) {
    console.log('no ref_fil 146')
    return
  }
  const r = rows[0]
  for (const [k, v] of Object.entries(r)) {
    const display = v instanceof ArrayBuffer ? `<blob ${v.byteLength}b>` : v
    console.log(`${k.padEnd(30)} = ${display === '' ? "''" : display}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
