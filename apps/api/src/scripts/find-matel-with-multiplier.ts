// Find MATEL commandes whose lines have a ref_fini with rendement > 3 —
// those will trigger the Matel multiplier (>1.00) and surface it in the
// breakdown tooltip.

import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Recent MATEL lines with rendement > 3 that have at least one
  //    écru attached (so the algorithm runs) AND prix > 0.
  console.log('\n=== recent MATEL lines where rendement > 3 (multiplier > 1) ===')
  const rows = await query(`
    SELECT TOP 30
      lcs.IDcommande_sous_traitant,
      lcs.IDligne_commande_sous_traitant,
      lcs.IDreference,
      lcs.prix,
      rf.reference AS ref_label,
      rf.rendement
    FROM ligne_commande_sous_traitant lcs
    INNER JOIN commande_sous_traitant cst ON lcs.IDcommande_sous_traitant = cst.IDcommande_sous_traitant
    INNER JOIN ref_fini rf ON lcs.IDreference = rf.IDref_fini
    WHERE cst.IDsous_traitant = 9
      AND lcs.type = 2
      AND lcs.prix > 0
      AND rf.rendement > 3
    ORDER BY lcs.IDligne_commande_sous_traitant DESC
  `) as any[]

  for (const r of rows.slice(0, 20)) {
    // Indicate which multiplier band the rendement falls into
    const rd = Number(r.rendement)
    let mult = 1
    for (const [t, m] of [[3, 1.0], [3.5, 1.02], [4, 1.03], [4.5, 1.04], [5, 1.05], [5.5, 1.11], [6, 1.17], [6.5, 1.24], [7, 1.32], [7.5, 1.41], [8, 1.5]]) {
      if (rd <= t) { mult = m; break }
    }
    if (rd > 8) mult = 2
    console.log(`  cmd ${r.IDcommande_sous_traitant} / line ${r.IDligne_commande_sous_traitant} | ref ${r.ref_label} | rdt=${rd.toFixed(2)} → ×${mult} | stored prix ${r.prix}`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
