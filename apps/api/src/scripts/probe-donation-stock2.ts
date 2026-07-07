// Probe: why are commande 6854's attached fini pieces excluded from the
// donation candidates eligibility filter?
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  const rows = await query<any>(
    `SELECT IDstock_fini, IDligne_expedition, IDetat_stock_fini, IDligne_commande_client, IDcommande_donation
     FROM stock_fini WHERE IDcommande_donation = 6854`,
  )
  console.log(JSON.stringify(rows, null, 1))
  const e = await query<any>(
    `SELECT IDstock_ecru, IDligne_expedition_ETM, IDligne_commande_client, IDref_commande_affectation
     FROM stock_ecru WHERE IDcommande_donation = 6854`,
  )
  console.log(JSON.stringify(e, null, 1))
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
