/**
 * Quick check: how many colori_fil rows exist, what's the max ID,
 * and show the top 50 most recent IDs to see if yesterday's bulk
 * insert left a contiguous block at the top of the sequence.
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })
import { query, closeConnection } from '../lib/hfsql-auto.js'

async function main() {
  const count = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM colori_fil`)
  console.log(`colori_fil total rows: ${count[0]?.n}`)

  const max = await query<{ m: number }>(`SELECT MAX(IDcolori_fil) AS m FROM colori_fil`)
  console.log(`Max IDcolori_fil:      ${max[0]?.m}`)

  const top = await query<{
    IDcolori_fil: number
    IDfournisseur: number
    IDref_fil: number
    reference: string | null
  }>(
    `SELECT IDcolori_fil, IDfournisseur, IDref_fil, reference
     FROM colori_fil
     ORDER BY IDcolori_fil DESC
     LIMIT 50`
  )
  console.log(`\nTop 50 rows by IDcolori_fil:`)
  for (const r of top) {
    console.log(
      `  ID=${r.IDcolori_fil}  fournisseur=${r.IDfournisseur}  ref_fil=${r.IDref_fil}  ref="${r.reference}"`
    )
  }

  await closeConnection()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
