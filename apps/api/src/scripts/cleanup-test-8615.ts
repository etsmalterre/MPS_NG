// Remove the end-to-end test knit order created while validating the
// Tricotage-tab creation flow (cst 8615 / line 8585 / mirror cc 6901).
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  await query(`DELETE FROM asso_fil_lignecmdsst WHERE IDligne_commande_sous_traitant = 8585`)
  await query(`DELETE FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant = 8585`)
  await query(`DELETE FROM ligne_commande_client WHERE IDligne_commande_ETM = 8585`)
  await query(`DELETE FROM commande_client WHERE IDcommande_ETM = 8615`)
  await query(`DELETE FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = 8615`)
  await query(`DELETE FROM commande_sous_traitant WHERE IDcommande_sous_traitant = 8615`)
  // Verify
  for (const [t, w] of [
    ['asso_fil_lignecmdsst', 'IDligne_commande_sous_traitant = 8585'],
    ['affectation_cmd_tricotage', 'IDligne_commande_sous_traitant = 8585'],
    ['ligne_commande_client', 'IDligne_commande_ETM = 8585'],
    ['commande_client', 'IDcommande_ETM = 8615'],
    ['ligne_commande_sous_traitant', 'IDcommande_sous_traitant = 8615'],
    ['commande_sous_traitant', 'IDcommande_sous_traitant = 8615'],
  ]) {
    const r = await query<any>(`SELECT COUNT(*) AS n FROM ${t} WHERE ${w}`)
    console.log(`${t}: ${r[0]?.n} remaining`)
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
