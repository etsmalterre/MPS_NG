// Verify then remove the external-tricoteur test order (cst 8616 / line 8586).
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  const cst = await query<any>(`SELECT * FROM commande_sous_traitant WHERE IDcommande_sous_traitant = 8616`)
  console.log('header:', cst[0])
  const lcs = await query<any>(
    `SELECT IDligne_commande_sous_traitant AS lid, lcs.type AS type_kind, IDreference, IDColoris, quantite, unite, prix, sstatut, date_livraison
       FROM ligne_commande_sous_traitant lcs WHERE IDcommande_sous_traitant = 8616`,
  )
  console.log('line:', lcs[0])
  const mirror = await query<any>(`SELECT COUNT(*) AS n FROM commande_client WHERE IDcommande_ETM = 8616`)
  console.log('mirror rows (expect 0):', mirror[0]?.n)
  const aff = await query<any>(`SELECT * FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant = 8586`)
  console.log('affectation:', aff)
  const asso = await query<any>(`SELECT COUNT(*) AS n FROM asso_fil_lignecmdsst WHERE IDligne_commande_sous_traitant = 8586`)
  console.log('asso rows (expect 0 — no lots at sst 37):', asso[0]?.n)

  // Cleanup
  await query(`DELETE FROM asso_fil_lignecmdsst WHERE IDligne_commande_sous_traitant = 8586`)
  await query(`DELETE FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant = 8586`)
  await query(`DELETE FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = 8616`)
  await query(`DELETE FROM commande_sous_traitant WHERE IDcommande_sous_traitant = 8616`)
  for (const [t, w] of [
    ['affectation_cmd_tricotage', 'IDligne_commande_sous_traitant = 8586'],
    ['ligne_commande_sous_traitant', 'IDcommande_sous_traitant = 8616'],
    ['commande_sous_traitant', 'IDcommande_sous_traitant = 8616'],
  ]) {
    const r = await query<any>(`SELECT COUNT(*) AS n FROM ${t} WHERE ${w}`)
    console.log(`cleanup ${t}: ${r[0]?.n} remaining`)
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
