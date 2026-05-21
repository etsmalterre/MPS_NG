// Deep probe of how the legacy app tracks per-lot yarn affectations.
// Question: affectation_cmd_tricotage seems aggregate-only — but the UI
// allows per-lot selection. Where's the per-lot tracking?
//
// Hypotheses to test:
// H1 — affectation_cmd_tricotage has more columns than expected (maybe IDstock_fil).
// H2 — A separate junction table exists (mouvement_stock_fil, affectation_lot, etc).
// H3 — stock_fil rows themselves carry a back-pointer to the SST line consuming them.
// H4 — Each (sst_line × ref_fil) gets ONE row aggregating across lots (legacy doesn't track per-lot at all).

import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  // 1. Full columns of affectation_cmd_tricotage via a SELECT * with limit
  console.log('=== affectation_cmd_tricotage — full column list (SELECT * LIMIT 1) ===')
  const sample = await query<Record<string, unknown>>(`SELECT * FROM affectation_cmd_tricotage LIMIT 1`)
  if (sample.length > 0) {
    console.log('columns:', Object.keys(sample[0]).join(', '))
    console.log('values: ', sample[0])
  }

  // 2. For an ACTIVE tricoteur sst commande (est_soldee=0), look at affectation rows.
  // Pick a TRM commande with confirmed yarn consumption.
  console.log('\n=== Recent TRM sst commandes (est_soldee=0) with linked rolls + affectation rows ===')
  const recent = await query<{ IDcommande_sous_traitant: number; IDligne_commande_sous_traitant: number; IDref_ecru: number; IDColoris: number; quantite: number }>(
    `SELECT TOP 30 cst.IDcommande_sous_traitant, lcs.IDligne_commande_sous_traitant,
            lcs.IDreference AS IDref_ecru, lcs.IDColoris, lcs.quantite
     FROM commande_sous_traitant cst
     JOIN ligne_commande_sous_traitant lcs ON lcs.IDcommande_sous_traitant = cst.IDcommande_sous_traitant
     WHERE cst.IDsous_traitant = 1 AND cst.est_soldee = 0 AND lcs.type = 1
     ORDER BY cst.IDcommande_sous_traitant DESC`,
  )
  for (const r of recent.slice(0, 15)) {
    const aff = await query<{ IDaffectation_cmd_tricotage: number; poids_affecte: number; IDligne_commande_client: number }>(
      `SELECT IDaffectation_cmd_tricotage, poids_affecte, IDligne_commande_client
       FROM affectation_cmd_tricotage
       WHERE IDligne_commande_sous_traitant = ${r.IDligne_commande_sous_traitant}`,
    )
    const ecruN = await query<{ n: number; kg: number | null }>(
      `SELECT COUNT(*) AS n, SUM(poids) AS kg FROM stock_ecru WHERE IDref_commande_source = ${r.IDligne_commande_sous_traitant}`,
    )
    console.log(`  sst ${r.IDcommande_sous_traitant} line ${r.IDligne_commande_sous_traitant} (ref_ecru=${r.IDref_ecru}, col=${r.IDColoris}, qty=${r.quantite}): ${aff.length} aff rows, ${Number(ecruN[0]?.n) || 0} rolls produced (${Number(ecruN[0]?.kg) || 0} kg)`)
    if (aff.length > 0) {
      for (const a of aff) console.log(`     aff #${a.IDaffectation_cmd_tricotage} poids=${a.poids_affecte} cc_line=${a.IDligne_commande_client}`)
    }
  }

  // 3. Search for ANY junction table whose name hints at yarn affectation.
  // Try every plausible candidate.
  console.log('\n=== Candidate per-lot tracking tables ===')
  const candidates = [
    'mouvement_stock_fil', 'mouvement_stock', 'mvt_stock_fil', 'mvt_stock',
    'historique_stock_fil', 'historique_stock',
    'reservation_stock_fil', 'reservation_fil',
    'stock_fil_commande', 'stock_fil_ligne', 'stock_fil_sst',
    'consommation_fil', 'consommation_stock',
    'affectation_lot', 'affectation_fil', 'affectation_stock_fil',
    'lot_consommation', 'lot_affectation',
    'sortie_stock_fil', 'entree_stock_fil',
    'journal_stock_fil',
  ]
  for (const t of candidates) {
    try {
      const r = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM ${t}`)
      console.log(`  ✓ ${t} EXISTS — cols: ${r.length === 0 ? '(empty table)' : Object.keys(r[0]).join(', ')}`)
      if (r.length > 0) console.log('    sample:', r[0])
    } catch {
      // Doesn't exist — silent
    }
  }

  // 4. Per-lot pointer check: does stock_fil track which sst line consumed it?
  // Check ALL columns of a known stock_fil row to see if there's an IDref_commande_*
  // or similar back-pointer hidden in there.
  console.log('\n=== Full column list of stock_fil (via SELECT *) ===')
  const sf = await query<Record<string, unknown>>(`SELECT IDstock_fil, IDref_fil, lot, stock, stock_initial, IDref_fil_commande, IDfournisseur, IDcolori_fil, IDMagasin, emplacement, date_entree FROM stock_fil WHERE lot = '10485'`)
  if (sf.length > 0) console.log('lot 10485:', sf[0])

  // 5. Stock_fil quantity history: for lot 10485 (stock_initial=10390, current=5736),
  //    look at OF tables to see if there are consumption records.
  console.log('\n=== Lot 10485 historical context — anything linking to ordre_fabrication or sst lines? ===')
  // Look for OF rows that consumed yarn from this lot (if there's a yarn-input column on OF).
  const of = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM ordre_fabrication`)
  if (of.length > 0) {
    console.log('ordre_fabrication columns:', Object.keys(of[0]).join(', '))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
