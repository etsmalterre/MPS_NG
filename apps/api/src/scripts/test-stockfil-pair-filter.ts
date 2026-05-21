// Hypothesis: legacy filters stock_fil by the line-specific yarn variants
// — i.e. join composition_ecru on BOTH (IDref_ecru, IDcolori_ecru) to get
// the precise (IDref_fil, IDcolori_fil) pairs, then SELECT stock_fil for
// those pairs. Verify against commande 8582 line 8558 (IDref_ecru=146,
// IDColoris=1094).
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  // Pairs from composition_ecru filtered by IDcolori_ecru too.
  const pairs = await query<{ IDref_fil: number; IDcolori_fil: number }>(
    `SELECT DISTINCT IDref_fil, IDcolori_fil FROM composition_ecru
     WHERE IDref_ecru = 146 AND IDcolori_ecru = 1094`,
  )
  console.log('pairs:', pairs)

  for (const p of pairs) {
    const rows = await query<Record<string, unknown>>(
      `SELECT IDstock_fil, lot, IDref_fil, IDcolori_fil, stock, niveau, IDMagasin, date_entree
       FROM stock_fil
       WHERE IDref_fil = ${p.IDref_fil} AND IDcolori_fil = ${p.IDcolori_fil}
       ORDER BY stock DESC`,
    )
    console.log(`\n--- pair (IDref_fil=${p.IDref_fil}, IDcolori_fil=${p.IDcolori_fil}) → ${rows.length} rows ---`)
    for (const r of rows) console.log(' ', r)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
