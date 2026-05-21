import { query, queryRaw } from '../lib/hfsql.js'

async function main() {
  console.log('\n=== COMMANDE_FIL Schema ===\n')
  
  try {
    const commandeRows = await query(`SELECT TOP 1 * FROM commande_fil`)
    if (commandeRows.length > 0) {
      const row = commandeRows[0] as Record<string, unknown>
      console.log('Columns and sample values:')
      for (const [key, value] of Object.entries(row)) {
        const type = typeof value
        const displayValue = value === null ? 'NULL' : String(value).substring(0, 50)
        console.log(`  ${key}: ${type} = ${displayValue}`)
      }
    }
  } catch (err) {
    console.error('Error querying commande_fil:', err)
  }

  console.log('\n=== REF_FIL_COMMANDE Schema ===\n')
  
  try {
    const refRows = await query(`SELECT TOP 1 * FROM ref_fil_commande`)
    if (refRows.length > 0) {
      const row = refRows[0] as Record<string, unknown>
      console.log('Columns and sample values:')
      for (const [key, value] of Object.entries(row)) {
        const type = typeof value
        const displayValue = value === null ? 'NULL' : String(value).substring(0, 50)
        console.log(`  ${key}: ${type} = ${displayValue}`)
      }
    }
  } catch (err) {
    console.error('Error querying ref_fil_commande:', err)
  }

  console.log('\n=== COMMANDE_FIL Sample Rows (top 3) ===\n')
  try {
    const rows = await query(`SELECT * FROM commande_fil ORDER BY IDcommande_fil DESC`)
    rows.slice(0, 3).forEach((row: any, i: number) => {
      console.log(`Row ${i + 1}:`)
      console.log(JSON.stringify(row, null, 2))
    })
  } catch (err) {
    console.error('Error fetching commande_fil rows:', err)
  }

  console.log('\n=== REF_FIL_COMMANDE Sample Rows (top 3) ===\n')
  try {
    const rows = await query(`SELECT * FROM ref_fil_commande ORDER BY IDref_fil_commande DESC`)
    rows.slice(0, 3).forEach((row: any, i: number) => {
      console.log(`Row ${i + 1}:`)
      console.log(JSON.stringify(row, null, 2))
    })
  } catch (err) {
    console.error('Error fetching ref_fil_commande rows:', err)
  }

  console.log('\n=== Check for related tables with "commande" in name ===\n')
  // HFSQL doesn't have a standard information_schema, but we can try common patterns
  const possibleTables = [
    'commande_fil_ligne',
    'type_etat_commande',
    'statut_commande',
    'etat_commande',
    'paiement_commande',
    'livraison_commande',
    'commande_fournisseur'
  ]
  
  for (const table of possibleTables) {
    try {
      const rows = await query(`SELECT COUNT(*) as cnt FROM ${table}`)
      if (rows.length > 0) {
        console.log(`Found: ${table}`)
      }
    } catch {
      // Table doesn't exist
    }
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
