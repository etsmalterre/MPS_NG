import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'
async function main() {
  const c = await query(`SELECT IDcommande_client, est_soldee FROM commande_client WHERE numero = 3678 AND IDsociete = 1`)
  const cid = Number(c[0]?.IDcommande_client)
  const l = await query(`SELECT IDligne_commande_client FROM ligne_commande_client WHERE IDcommande_client = ${cid}`)
  const lid = Number(l[0]?.IDligne_commande_client)
  const r = await query(`SELECT IDstock_fini FROM stock_fini WHERE IDligne_commande_client = ${lid}`)
  console.log(JSON.stringify({ cid, soldee: c[0]?.est_soldee, lid, roll: Number(r[0]?.IDstock_fini) }))
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
