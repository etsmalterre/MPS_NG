/**
 * Inspect asso_colorisfil_frs: show columns, count, and sample rows.
 * Also: for a known fournisseur, show what refs/coloris would come out
 * of joining asso_colorisfil_frs → ref_fil → colori_fil.
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })
import { query, closeConnection } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Columns + sample
  const sample = await query<Record<string, unknown>>(
    `SELECT * FROM asso_colorisfil_frs LIMIT 5`
  )
  if (sample.length === 0) {
    console.log('asso_colorisfil_frs is empty.')
  } else {
    console.log('asso_colorisfil_frs columns:')
    for (const k of Object.keys(sample[0])) console.log(`  - ${k}`)
    console.log('\nFirst 5 rows:')
    for (const r of sample) console.log(' ', r)
  }

  // 2) Count
  const n = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM asso_colorisfil_frs`)
  console.log(`\nTotal rows: ${n[0]?.n}`)

  // 3) Distinct fournisseurs present
  try {
    const frs = await query<{ n: number }>(
      `SELECT COUNT(DISTINCT IDfournisseur) AS n FROM asso_colorisfil_frs`
    )
    console.log(`Distinct IDfournisseur: ${frs[0]?.n}`)
  } catch (e) {
    console.log('No IDfournisseur column? Error:', (e as Error).message)
  }

  // 4) For fournisseur #27 (seen in top-50 earlier), show its rows
  try {
    const f27 = await query<Record<string, unknown>>(
      `SELECT * FROM asso_colorisfil_frs WHERE IDfournisseur = 27 LIMIT 10`
    )
    console.log(`\nFournisseur #27 rows in asso_colorisfil_frs: ${f27.length}`)
    for (const r of f27) console.log(' ', r)
  } catch (e) {
    console.log('Fournisseur #27 lookup failed:', (e as Error).message)
  }

  await closeConnection()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
