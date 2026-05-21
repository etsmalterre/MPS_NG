// Audit what defect / observation columns actually exist on stock_ecru
// and stock_fini, plus a few example rows where those columns are
// populated. Helps decide which fields the drawer should surface.

import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Column list for each table
  for (const t of ['stock_ecru', 'stock_fini']) {
    console.log(`\n=== ${t} — TOP 1 (column list) ===`)
    const r = await query(`SELECT TOP 1 * FROM ${t}`) as any[]
    if (r.length > 0) console.log(' keys:', Object.keys(r[0]))
  }

  // 2) On stock_ecru: look for second_choix / observations / defaut-like
  //    columns being non-default. Then surface a few rows.
  console.log('\n=== stock_ecru — sample rows with non-empty observations or second_choix > 0 ===')
  const ecruRows = await query(`
    SELECT TOP 10 IDstock_ecru, numero, lot, poids, second_choix,
                  CONVERT(observations USING 'UTF-8') AS observations,
                  IDref_commande_affectation
    FROM stock_ecru
    WHERE (observations IS NOT NULL AND observations <> '') OR second_choix > 0
    ORDER BY IDstock_ecru DESC
  `) as any[]
  for (const r of ecruRows) console.log(' ', JSON.stringify(r))

  // 3) On stock_fini: same. Plus surface the commande_sst id so the
  //    user can click into the drawer.
  console.log('\n=== stock_fini — sample rows with non-empty observations or second_choix > 0 ===')
  const finiRows = await query(`
    SELECT TOP 10 sf.IDstock_fini, sf.numero, sf.lot, sf.poids, sf.metrage, sf.second_choix,
                  CONVERT(sf.observations USING 'UTF-8') AS observations,
                  sf.IDref_commande_source AS IDligne_sst,
                  lcs.IDcommande_sous_traitant AS IDcommande_sst
    FROM stock_fini sf
    LEFT JOIN ligne_commande_sous_traitant lcs ON sf.IDref_commande_source = lcs.IDligne_commande_sous_traitant
    WHERE (sf.observations IS NOT NULL AND sf.observations <> '') OR sf.second_choix > 0
    ORDER BY sf.IDstock_fini DESC
  `) as any[]
  for (const r of finiRows) console.log(' ', JSON.stringify(r))

  // 4) Resolve the commande IDs for ecru samples that ARE attached to a
  //    sous-traitant line, so we can give the user clickable commande nos.
  console.log('\n=== commande IDs for the écru sample rows (when affected to a line) ===')
  const ecruAttached = ecruRows.filter((r: any) => Number(r.IDref_commande_affectation) > 0)
  for (const r of ecruAttached) {
    const lcs = await query(`SELECT IDcommande_sous_traitant FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant = ${Number(r.IDref_commande_affectation)}`) as any[]
    console.log(`  écru #${r.IDstock_ecru} numero=${r.numero} (line ${r.IDref_commande_affectation}) → cmd ${lcs[0]?.IDcommande_sous_traitant ?? '?'}`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
