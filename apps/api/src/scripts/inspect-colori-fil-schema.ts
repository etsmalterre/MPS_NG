/**
 * Schema inspection — dumps a sample colori_fil row and column list
 * so we know exactly which fields to copy when duplicating rows.
 */
import { query, closeConnection } from '../lib/hfsql-auto.js'

async function main() {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM colori_fil WHERE IDcolori_fil = 824`
  )
  if (rows.length === 0) {
    console.log('IDcolori_fil=824 not found')
  } else {
    console.log('Columns:', Object.keys(rows[0]))
    console.log('Sample row (824):')
    for (const [k, v] of Object.entries(rows[0])) {
      console.log(`  ${k}: ${JSON.stringify(v)}`)
    }
  }

  // Also show a "healthy" row still attached to a fournisseur
  const sample2 = await query<Record<string, unknown>>(
    `SELECT * FROM colori_fil WHERE IDfournisseur > 0 AND reference IS NOT NULL ORDER BY IDcolori_fil LIMIT 1`
  )
  if (sample2.length > 0) {
    console.log('\nSample healthy row:')
    for (const [k, v] of Object.entries(sample2[0])) {
      console.log(`  ${k}: ${JSON.stringify(v)}`)
    }
  }

  await closeConnection()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
