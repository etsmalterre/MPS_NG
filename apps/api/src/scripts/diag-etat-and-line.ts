import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query, fixEncoding } from '../lib/hfsql.js'

async function main() {
  console.log('=== etat_stock_fini codes ===')
  try {
    const rows = await query<any>(`SELECT IDetat_stock_fini, nom FROM etat_stock_fini ORDER BY IDetat_stock_fini`)
    const fixed = await fixEncoding(rows, 'etat_stock_fini', 'IDetat_stock_fini', ['nom'])
    for (const r of fixed) console.log(' ', r.IDetat_stock_fini, '→', r.nom)
  } catch (e) {
    console.log('  fail:', (e as any).message?.slice(0, 100))
  }

  console.log('\n=== ligne #8494 — what IDColoris does it carry? ===')
  const line = await query<any>(
    `SELECT IDligne_commande_sous_traitant, IDreference, IDColoris, type AS type_kind
     FROM ligne_commande_sous_traitant
     WHERE IDligne_commande_sous_traitant = 8494`,
  )
  console.log(' ', JSON.stringify(line[0]))

  console.log('\n=== suivilot 5548 (the legacy MA108050-Actual) ===')
  const legacy = await query<any>(
    `SELECT IDsuivilot, lot, IDColoris, IDref_fini_colori, IDref_fini, IDetatLot,
            quantite_receptionnee, metrage_receptionne, laize_demandee, poids_demande,
            rendement_demande
     FROM suivilot WHERE IDsuivilot = 5548`,
  )
  console.log(' ', JSON.stringify(legacy[0]))

  console.log('\n=== suivilot 5551 (ours) ===')
  const ours = await query<any>(
    `SELECT IDsuivilot, lot, IDColoris, IDref_fini_colori, IDref_fini, IDetatLot,
            quantite_receptionnee, metrage_receptionne, laize_demandee, poids_demande,
            rendement_demande
     FROM suivilot WHERE IDsuivilot = 5551`,
  )
  console.log(' ', JSON.stringify(ours[0]))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
