import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })
import { query, closeConnection } from '../lib/hfsql-auto.js'

async function main() {
  const rows = await query<Record<string, unknown>>(`SELECT * FROM sous_traitant LIMIT 3`)
  if (rows.length > 0) {
    console.log('sous_traitant columns:', Object.keys(rows[0]))
    for (const r of rows) console.log(' ', r.IDsous_traitant ?? r, '-', r.nom ?? '?')
  }
  await closeConnection()
}
main().catch((e) => { console.error(e); process.exit(1) })
