import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })
import { query, fixEncoding, closeConnection } from '../lib/hfsql-auto.js'

const FAILED_IDS = [1057, 484, 992, 1004, 1003, 348]

async function main() {
  const rows = await query<Record<string, unknown>>(
    `SELECT IDcolori_fil, IDfournisseur, IDref_fil, reference, prix_kg, stock_mini, commentaire FROM colori_fil WHERE IDcolori_fil IN (${FAILED_IDS.join(',')})`
  )
  const fixed = await fixEncoding(rows, 'colori_fil', 'IDcolori_fil', ['reference', 'commentaire'])
  for (const r of fixed) {
    console.log(`IDcolori_fil=${r.IDcolori_fil}`)
    console.log(`  reference (raw): ${JSON.stringify(rows.find(x => x.IDcolori_fil === r.IDcolori_fil)?.reference)}`)
    console.log(`  reference (fixed): ${JSON.stringify(r.reference)}`)
    console.log(`  reference bytes: ${Buffer.from(String(r.reference ?? ''), 'utf8').toString('hex')}`)
    console.log(`  commentaire: ${JSON.stringify(r.commentaire)}`)
    console.log()
  }
  await closeConnection()
}

main().catch((err) => { console.error(err); process.exit(1) })
