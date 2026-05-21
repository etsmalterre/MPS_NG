import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query } from '../lib/hfsql.js'

// Goal: list commandes sous-traitant whose "Réception" tab (stock_fini
// rolls linked back via IDref_commande_source) has at least one roll
// carrying BOTH a free-text observation AND a defaut_qualite entry.
//
// First we discover how defaut_qualite encodes fini rolls — only
// Type_Reference 1 (piece_production) and 2 (stock_ecru) are documented,
// so we'll print the full Type_Reference distribution and look for one
// that maps to stock_fini ids.

async function main() {
  console.log('=== defaut_qualite.Type_Reference distribution ===')
  const dist = await query<{ Type_Reference: number; n: number }>(
    `SELECT Type_Reference, COUNT(*) AS n FROM defaut_qualite GROUP BY Type_Reference`,
  )
  for (const r of dist) console.log(`  Type_Reference=${r.Type_Reference} → ${r.n} rows`)

  // For each Type_Reference, pull a few sample references and probe which
  // table the id is in. We try stock_fini, stock_ecru, piece_production,
  // ligne_commande_sous_traitant — the likely candidates.
  for (const t of dist) {
    console.log(`\n--- Probing Type_Reference=${t.Type_Reference} ---`)
    const samples = await query<{ reference: string }>(
      `SELECT TOP 20 reference FROM defaut_qualite WHERE Type_Reference = ${t.Type_Reference}`,
    )
    const ids = Array.from(new Set(samples.map((s) => Number(s.reference)).filter((x) => x > 0))).slice(0, 10)
    if (ids.length === 0) { console.log('  (no numeric references found)'); continue }
    for (const [tbl, pk] of [
      ['stock_fini', 'IDstock_fini'],
      ['stock_ecru', 'IDstock_ecru'],
      ['ligne_commande_sous_traitant', 'IDligne_commande_sous_traitant'],
    ] as const) {
      const found = await query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${tbl} WHERE ${pk} IN (${ids.join(',')})`,
      )
      console.log(`  ${tbl}.${pk}: ${found[0]?.n ?? 0}/${ids.length} sample ids hit`)
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
