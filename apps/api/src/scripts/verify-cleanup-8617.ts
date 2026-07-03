// Verify then remove the post-refactor TRM test order (cst 8617 / line 8587).
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  const lcs = await query<any>(
    `SELECT sstatut, IDColoris, quantite, unite FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = 8617`,
  )
  console.log('line (expect Attente_Delai / 1094 / 20 / 1):', lcs[0])
  const mirror = await query<any>(
    `SELECT IDcommande_client, numero, IDsociete, ref_client FROM commande_client WHERE IDcommande_ETM = 8617`,
  )
  console.log('mirror (expect IDsociete 2, ref "commande 8617, 029"):', mirror[0])
  const aff = await query<any>(`SELECT poids_affecte, IDligne_commande_client FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant = 8587`)
  console.log('affectation (expect 8 kg → 12627):', aff)
  const asso = await query<any>(`SELECT IDstock_fil, quantite FROM asso_fil_lignecmdsst WHERE IDligne_commande_sous_traitant = 8587`)
  console.log('asso (expect 18.8 kg lot 1752 + 1.2 kg lot 1646):', asso)

  await query(`DELETE FROM asso_fil_lignecmdsst WHERE IDligne_commande_sous_traitant = 8587`)
  await query(`DELETE FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant = 8587`)
  await query(`DELETE FROM ligne_commande_client WHERE IDligne_commande_ETM = 8587`)
  await query(`DELETE FROM commande_client WHERE IDcommande_ETM = 8617`)
  await query(`DELETE FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = 8617`)
  await query(`DELETE FROM commande_sous_traitant WHERE IDcommande_sous_traitant = 8617`)
  for (const [t, w] of [
    ['asso_fil_lignecmdsst', 'IDligne_commande_sous_traitant = 8587'],
    ['affectation_cmd_tricotage', 'IDligne_commande_sous_traitant = 8587'],
    ['ligne_commande_client', 'IDligne_commande_ETM = 8587'],
    ['commande_client', 'IDcommande_ETM = 8617'],
    ['ligne_commande_sous_traitant', 'IDcommande_sous_traitant = 8617'],
    ['commande_sous_traitant', 'IDcommande_sous_traitant = 8617'],
  ]) {
    const r = await query<any>(`SELECT COUNT(*) AS n FROM ${t} WHERE ${w}`)
    console.log(`cleanup ${t}: ${r[0]?.n} remaining`)
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
