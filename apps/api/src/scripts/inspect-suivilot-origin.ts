import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query } from '../lib/hfsql.js'

// Trace where suivilot.laize_demandee / poids_demande / rendement_demande
// come from. Hypothesis: they're copied from the line's ref_fini or from
// a tariff_ennoblissement-like spec at reception time.

async function main() {
  // Pull a small set of suivilot rows
  const sui = await query<{
    IDsuivilot: number
    IDligne_commande_sous_traitant: number
    IDref_fini: number
    IDColoris: number
    IDref_fini_colori: number
    laize_demandee: number
    poids_demande: number
    rendement_demande: number
    freinte_demandée: number
    stabL_demandée: number
    stabH_demandée: number
    IDetatLot: number
    DATE: string | null
  }>(
    `SELECT TOP 10 IDsuivilot, IDligne_commande_sous_traitant, IDref_fini, IDColoris, IDref_fini_colori,
            laize_demandee, poids_demande, rendement_demande, freinte_demandée,
            stabL_demandée, stabH_demandée, IDetatLot, DATE
     FROM suivilot ORDER BY IDsuivilot DESC`,
  )
  console.log('=== last 10 suivilot rows — demande fields + IDetatLot ===')
  for (const r of sui) console.log(' ', JSON.stringify(r))

  // Check the ref_fini schema — do those columns exist there?
  console.log('\n=== ref_fini columns ===')
  const refRow = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM ref_fini`)
  if (refRow.length > 0) console.log('  cols:', Object.keys(refRow[0]).join(', '))

  // Compare a suivilot's demande fields to the ref_fini's corresponding fields
  console.log('\n=== cross-check vs ref_fini (most recent suivilot) ===')
  if (sui.length > 0 && sui[0].IDref_fini > 0) {
    const fini = await query<Record<string, unknown>>(
      `SELECT IDref_fini, reference, laize, poids, rendement, freinte, stabL, stabH FROM ref_fini WHERE IDref_fini = ${sui[0].IDref_fini}`,
    )
    console.log('  ref_fini row:', JSON.stringify(fini[0] ?? null))
    console.log('  suivilot dem:', JSON.stringify({
      laize: sui[0].laize_demandee,
      poids: sui[0].poids_demande,
      rendement: sui[0].rendement_demande,
      freinte: sui[0].freinte_demandée,
      stabL: sui[0].stabL_demandée,
      stabH: sui[0].stabH_demandée,
    }))
  }

  // IDetatLot distribution
  console.log('\n=== IDetatLot distribution ===')
  const etat = await query<{ IDetatLot: number; n: number }>(
    `SELECT IDetatLot, COUNT(*) AS n FROM suivilot GROUP BY IDetatLot ORDER BY IDetatLot`,
  )
  for (const e of etat) console.log(`  IDetatLot=${e.IDetatLot}: ${e.n} rows`)

  // Is there an etat_lot table that names them?
  console.log('\n=== etat_lot (label table) ===')
  try {
    const lbl = await query<Record<string, unknown>>(`SELECT TOP 20 * FROM etat_lot`)
    if (lbl.length > 0) console.log('  cols:', Object.keys(lbl[0]).join(', '))
    for (const r of lbl) console.log(' ', JSON.stringify(r))
  } catch (e) {
    console.log('  no table or query failed:', (e as any).message?.slice(0, 80))
  }

  // Lots per ligne — distribution
  console.log('\n=== lots per ligne_commande_sous_traitant (top 5 most lots) ===')
  const top = await query<{ IDligne_commande_sous_traitant: number; n: number }>(
    `SELECT TOP 5 IDligne_commande_sous_traitant, COUNT(*) AS n FROM suivilot GROUP BY IDligne_commande_sous_traitant ORDER BY n DESC`,
  )
  for (const t of top) console.log(`  ligne#${t.IDligne_commande_sous_traitant}: ${t.n} suivilot rows`)

  // For one such ligne, show the suivilot rows' lots + check stock_fini lots
  if (top.length > 0) {
    const lid = top[0].IDligne_commande_sous_traitant
    console.log(`\n=== ligne#${lid} — suivilot lots ===`)
    const lots = await query<{ lot: string; quantite_receptionnee: number; metrage_receptionne: number; DATE: string | null }>(
      `SELECT lot, quantite_receptionnee, metrage_receptionne, DATE FROM suivilot WHERE IDligne_commande_sous_traitant = ${lid}`,
    )
    for (const l of lots) console.log(' ', JSON.stringify(l))
    console.log(`=== ligne#${lid} — stock_fini lots (aggregated) ===`)
    const sfLots = await query<{ lot: string | null; n: number; poids_total: number; metrage_total: number }>(
      `SELECT lot, COUNT(*) AS n, SUM(poids) AS poids_total, SUM(metrage) AS metrage_total
       FROM stock_fini WHERE IDref_commande_source = ${lid} GROUP BY lot`,
    )
    for (const l of sfLots) console.log(' ', JSON.stringify(l))
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
