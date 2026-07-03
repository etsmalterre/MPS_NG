// Probe 7: fil_incorpore / asso_fil_of — real yarn consumption ledger?
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  for (const t of ['fil_incorpore', 'asso_fil_of', 'asso_fil_stock_tm']) {
    try {
      const one = await query<any>(`SELECT * FROM ${t} LIMIT 2`)
      console.log(`\n${t} sample:`, one)
      const cnt = await query<any>(`SELECT COUNT(*) AS n FROM ${t}`)
      console.log(`${t} rows: ${cnt[0]?.n}`)
    } catch (e: any) {
      console.log(`\n${t}: ERROR ${e.message ?? e}`)
    }
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
