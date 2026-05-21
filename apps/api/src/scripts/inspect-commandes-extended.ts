import { query } from '../lib/hfsql.js'

async function main() {
  console.log('\n=== Verify current API query pattern ===\n')
  
  // This is what fournisseurs.ts line 218 selects
  try {
    const rows = await query(
      `SELECT IDcommande_fil, date_commande, etat, commentaire FROM commande_fil WHERE IDfournisseur = 1 ORDER BY date_commande DESC`
    )
    console.log('Current API SELECT result (from fournisseurs.ts):')
    if (rows.length > 0) {
      console.log(JSON.stringify(rows[0], null, 2))
    }
  } catch (err) {
    console.error('Error:', err)
  }

  console.log('\n=== ref_fil_commande with ref_fil and colori_fil joins ===\n')
  
  // This is what fournisseurs.ts line 225-226 selects
  try {
    const rows = await query(
      `SELECT rfc.IDref_fil_commande, rfc.IDcommande_fil, rfc.quantite, rfc.unite, rfc.prix_unitaire, rfc.date_livraison, rfc.etat, rf.reference as ref_fil, cf.reference as colori_reference FROM ref_fil_commande rfc LEFT JOIN ref_fil rf ON rfc.IDref_fil = rf.IDref_fil LEFT JOIN colori_fil cf ON rfc.IDcolori_fil = cf.IDcolori_fil WHERE rfc.IDcommande_fil IN (673, 674, 675) ORDER BY rfc.IDref_fil_commande`
    )
    console.log('Current API select with joins (from fournisseurs.ts):')
    rows.slice(0, 3).forEach((row: any, i) => {
      console.log(`\nRow ${i + 1}:`)
      console.log(JSON.stringify(row, null, 2))
    })
  } catch (err) {
    console.error('Error:', err)
  }

  console.log('\n=== Check what IDmode_paiement, IDecheance, unite columns reference ===\n')
  
  try {
    const modeRows = await query(`SELECT TOP 3 * FROM mode_paiement`)
    console.log('mode_paiement sample:')
    console.log(JSON.stringify(modeRows, null, 2))
  } catch (err) {
    console.error('Error querying mode_paiement:', err)
  }

  console.log('\n=== All columns in commande_fil (full schema) ===\n')
  try {
    // Get ALL rows to see nulls and variations
    const allRows = await query(`SELECT * FROM commande_fil`)
    const columns = new Set<string>()
    allRows.forEach((row: any) => {
      Object.keys(row).forEach(k => columns.add(k))
    })
    console.log('Column names:')
    Array.from(columns).sort().forEach(col => console.log(`  - ${col}`))
    
    // Sample value variations
    console.log('\nColumn statistics:')
    for (const col of Array.from(columns).sort()) {
      const nonNull = allRows.filter((r: any) => r[col] !== null && r[col] !== undefined)
      const types = new Set(nonNull.map((r: any) => typeof r[col]))
      console.log(`  ${col}: ${nonNull.length}/${allRows.length} non-null, types: ${Array.from(types).join(',')}`)
    }
  } catch (err) {
    console.error('Error:', err)
  }

  console.log('\n=== All columns in ref_fil_commande (full schema) ===\n')
  try {
    const allRows = await query(`SELECT * FROM ref_fil_commande`)
    const columns = new Set<string>()
    allRows.forEach((row: any) => {
      Object.keys(row).forEach(k => columns.add(k))
    })
    console.log('Column names:')
    Array.from(columns).sort().forEach(col => console.log(`  - ${col}`))
    
    console.log('\nColumn statistics:')
    for (const col of Array.from(columns).sort()) {
      const nonNull = allRows.filter((r: any) => r[col] !== null && r[col] !== undefined)
      const types = new Set(nonNull.map((r: any) => typeof r[col]))
      console.log(`  ${col}: ${nonNull.length}/${allRows.length} non-null, types: ${Array.from(types).join(',')}`)
    }
  } catch (err) {
    console.error('Error:', err)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
