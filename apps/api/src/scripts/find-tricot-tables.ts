// Look for any table whose name suggests it stores tricoteur/tricotage
// commandes separately from commande_sous_traitant. Also probe legacy
// `commande_fil`, `commande_tricotage`, `OF`-style tables.
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  // HFSQL doesn't expose information_schema, so we try known suspects.
  const candidates = [
    'commande_tricotage', 'commande_tricot', 'commande_tm',
    'ordre_fabrication', 'ordre_tricotage', 'ordre_tricot',
    'OF', 'OF_tricotage', 'OF_tricot',
    'tricotage', 'tricot', 'fabrication',
    'commande_fil',
  ]
  for (const t of candidates) {
    try {
      const rows = await query<Record<string, unknown>>(`SELECT * FROM ${t} LIMIT 1`)
      console.log(`${t}: ${rows.length === 0 ? '(empty)' : Object.keys(rows[0]).join(', ')}`)
    } catch (e: any) {
      // Table doesn't exist — silent
    }
  }

  console.log('\n--- ordre_fabrication for any line touching ref_fil 146 ---')
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM ordre_fabrication LIMIT 3`,
    )
    if (rows.length > 0) {
      console.log('columns:', Object.keys(rows[0]).join(', '))
      for (const r of rows) console.log(r)
    }
  } catch (e: any) {
    console.log('  (no ordre_fabrication)')
  }

  console.log('\n--- ref_ecru reference column values (sample) ---')
  const ecruSample = await query<Record<string, unknown>>(
    `SELECT TOP 5 IDref_ecru, reference FROM ref_ecru WHERE reference IS NOT NULL`,
  )
  for (const r of ecruSample) console.log(r)
}

main().catch((e) => { console.error(e); process.exit(1) })
