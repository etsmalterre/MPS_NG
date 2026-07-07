// Probe: commande_client.donation flag — verify the column reads on this
// platform and that legacy rows actually use it (feat: donation switch).
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  const counts = await query<any>(
    `SELECT donation, COUNT(*) AS nb FROM commande_client WHERE IDsociete = 1 GROUP BY donation`,
  )
  console.log('donation distribution:', JSON.stringify(counts))
  const sample = await query<any>(
    `SELECT TOP 5 IDcommande_client, numero, donation, est_soldee
       FROM commande_client WHERE donation = 1 AND IDsociete = 1
       ORDER BY IDcommande_client DESC`,
  )
  console.log('latest donation commandes:', JSON.stringify(sample))
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
