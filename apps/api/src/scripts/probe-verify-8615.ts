// Verify the rows created by the test POST (cst 8615 / line 8585).
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  const cst = await query<any>(`SELECT * FROM commande_sous_traitant WHERE IDcommande_sous_traitant = 8615`)
  console.log('header:', cst[0])
  const lcs = await query<any>(`SELECT * FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = 8615`)
  console.log('line:', lcs[0])
  const mirror = await query<any>(
    `SELECT IDcommande_client, numero, IDclient, IDsociete, ref_client, date_commande FROM commande_client WHERE IDcommande_ETM = 8615`,
  )
  console.log('mirror header:', mirror[0])
  if (mirror[0]) {
    const ml = await query<any>(
      `SELECT IDligne_commande_client, IDligne_commande_ETM, TYPE, IDreference, IDcolori, quantite, unite, prix
         FROM ligne_commande_client WHERE IDcommande_client = ${Number(mirror[0].IDcommande_client)}`,
    )
    console.log('mirror line:', ml[0])
  }
  const aff = await query<any>(`SELECT * FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant = 8585`)
  console.log('affectation:', aff)
  const asso = await query<any>(`SELECT * FROM asso_fil_lignecmdsst WHERE IDligne_commande_sous_traitant = 8585`)
  console.log('asso fil:', asso)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
