// Probe 2: affectation_cmd_tricotage + asso_fil_lignecmdsst semantics for 3686.
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  // Tricotage affectations for the two open tricoteur lines (8558 / 8464)
  for (const lid of [8558, 8464]) {
    const rows = await query<any>(
      `SELECT * FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant = ${lid}`,
    )
    console.log(`affectation_cmd_tricotage for lcs ${lid}:`, rows)
  }
  // Any affectation rows pointing at client line 12627?
  const mine = await query<any>(
    `SELECT * FROM affectation_cmd_tricotage WHERE IDligne_commande_client = 12627`,
  )
  console.log('affectation_cmd_tricotage for client line 12627:', mine)

  // Sample rows to understand values (poids_affecte scale)
  const sample = await query<any>(
    `SELECT * FROM affectation_cmd_tricotage WHERE IDaffectation_cmd_tricotage > 0 ORDER BY IDaffectation_cmd_tricotage DESC LIMIT 5`,
  )
  console.log('\nlatest affectation_cmd_tricotage rows:', sample)

  // Yarn lots for fil 5/317 and 8/338 at magasin 1, and their affectations.
  for (const [rf, cf] of [[5, 317], [8, 338]]) {
    const lots = await query<any>(
      `SELECT IDstock_fil, lot, stock, stock_initial, IDMagasin FROM stock_fil
       WHERE IDref_fil = ${rf} AND IDcolori_fil = ${cf} AND stock > 0`,
    )
    console.log(`\nfil ${rf}/${cf} lots:`, lots)
    for (const l of lots) {
      const asso = await query<any>(
        `SELECT * FROM asso_fil_lignecmdsst WHERE IDstock_fil = ${Number(l.IDstock_fil)}`,
      )
      let tot = 0
      for (const a of asso) tot += Number(a.quantite ?? a.poids ?? 0) || 0
      console.log(`  lot ${l.IDstock_fil} (${l.lot}): ${asso.length} asso rows, total=${tot.toFixed(2)}`)
      if (asso.length > 0) console.log('   rows:', asso)
    }
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
