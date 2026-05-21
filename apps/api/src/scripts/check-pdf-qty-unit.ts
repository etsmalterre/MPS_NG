// Verify PDF data builder returns the right qty_unit per commande.
import 'dotenv/config'
import { buildCommandePdfData } from '../routes/commandes-sous-traitant.js'

async function main() {
  const tricot = await buildCommandePdfData(8582)
  const ennob = await buildCommandePdfData(8587)
  console.log('sst 8582 (tricoteur): qty_unit =', tricot?.qty_unit, '- line qty =', tricot?.lignes[0]?.quantite)
  console.log('sst 8587 (ennoblisseur): qty_unit =', ennob?.qty_unit, '- line qty =', ennob?.lignes[0]?.quantite)
}
main().catch(e => { console.error(e); process.exit(1) })
