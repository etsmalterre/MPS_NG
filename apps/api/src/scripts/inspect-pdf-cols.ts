import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  // ref_fini conditionnement + finition value distribution
  console.log('\n=== ref_fini.conditionnement distinct values ===')
  const c = (await query(
    `SELECT TOP 20 conditionnement, COUNT(*) AS n FROM ref_fini GROUP BY conditionnement ORDER BY n DESC`,
  )) as any[]
  for (const r of c) console.log(' ', JSON.stringify(r))

  console.log('\n=== ref_fini.finition distinct values ===')
  const f = (await query(
    `SELECT TOP 20 finition, COUNT(*) AS n FROM ref_fini GROUP BY finition ORDER BY n DESC`,
  )) as any[]
  for (const r of f) console.log(' ', JSON.stringify(r))

  // ref_fini for known legacy commande 4929 to sanity check
  console.log('\n=== ligne_commande_sous_traitant rows for commande 4929 ===')
  const l = (await query(
    `SELECT lcs.IDligne_commande_sous_traitant, lcs.IDreference, lcs.IDColoris, lcs.type AS type_kind,
            lcs.quantite, lcs.prix, lcs.date_livraison
     FROM ligne_commande_sous_traitant lcs
     WHERE lcs.IDcommande_sous_traitant = 4929`,
  )) as any[]
  for (const r of l) console.log(' ', JSON.stringify(r))

  // Take the first ref_fini and look at its conditionnement/finition + treatments
  if (l[0]) {
    const refId = Number(l[0].IDreference)
    console.log(`\n=== ref_fini ${refId} extras ===`)
    const rf = (await query(
      `SELECT reference, designation, finition, conditionnement, poids_Moy, laizeHT_Moy, rendement, IDref_ecru FROM ref_fini WHERE IDref_fini = ${refId}`,
    )) as any[]
    const rfFixed = await fixEncoding(rf, 'ref_fini', 'IDref_fini', ['reference', 'designation', 'finition', 'conditionnement'])
    for (const r of rfFixed) console.log(' ', JSON.stringify(r))

    console.log(`\n=== treatments for ref_fini ${refId} ===`)
    const t = (await query(
      `SELECT t.IDtraitement, t.designation, t.ordre
       FROM traitement_ref_fini trf
       JOIN traitement t ON t.IDtraitement = trf.IDtraitement
       WHERE trf.IDref_fini = ${refId}
       ORDER BY t.ordre`,
    )) as any[]
    const tFixed = await fixEncoding(t, 'traitement', 'IDtraitement', ['designation'])
    for (const r of tFixed) console.log(' ', JSON.stringify(r))

    if (rfFixed[0]?.IDref_ecru) {
      const ecruId = Number(rfFixed[0].IDref_ecru)
      console.log(`\n=== ref_ecru ${ecruId} ===`)
      const re = (await query(
        `SELECT IDref_ecru, reference, designation, composition FROM ref_ecru WHERE IDref_ecru = ${ecruId}`,
      )) as any[]
      const reFixed = await fixEncoding(re, 'ref_ecru', 'IDref_ecru', ['reference', 'designation', 'composition'])
      for (const r of reFixed) console.log(' ', JSON.stringify(r))
    }
  }

  // Attached écru rolls for the line
  if (l[0]) {
    const lid = Number(l[0].IDligne_commande_sous_traitant)
    console.log(`\n=== stock_ecru attached to ligne ${lid} ===`)
    const s = (await query(
      `SELECT IDstock_ecru, numero, lot, poids, metrage, observations
       FROM stock_ecru WHERE IDref_commande_affectation = ${lid}
       ORDER BY numero, lot`,
    )) as any[]
    const sFixed = await fixEncoding(s, 'stock_ecru', 'IDstock_ecru', ['numero', 'lot', 'observations'])
    for (const r of sFixed) console.log(' ', JSON.stringify(r))
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
