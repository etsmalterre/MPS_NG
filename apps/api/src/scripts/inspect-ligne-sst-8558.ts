// Dump every column of ligne_commande_sous_traitant for line 8558
// (tricoteur line on commande 8582) — looking for a separate ref_ecru
// pointer that the legacy WinDev app might use as the "ref" display.
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant = 8558`,
  )
  if (rows.length === 0) {
    console.log('no row')
    return
  }
  const r = rows[0]
  for (const [k, v] of Object.entries(r)) {
    const display = v instanceof ArrayBuffer ? `<blob ${v.byteLength}b>` : v
    console.log(`${k.padEnd(30)} = ${display === '' ? "''" : display}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
