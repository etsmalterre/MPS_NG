// Verify findEligibleLots for 8650 (received) and 8763 (manual via écru).
import dotenv from 'dotenv'
const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: `.env.${env}` })
dotenv.config({ path: '.env' })
import { findEligibleLots } from '../routes/commandes-sous-traitant.js'

async function main() {
  for (const id of [8650, 8763]) {
    console.log(`\n=== findEligibleLots(${id}) ===`)
    const lots = await findEligibleLots(id)
    console.log(`  ${lots.length} lot(s):`)
    for (const lot of lots) console.log(' ', JSON.stringify(lot))
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
