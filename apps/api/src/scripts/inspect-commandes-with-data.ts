import { query } from '../lib/hfsql.js'

async function main() {
  console.log('\n=== Find suppliers with commandes ===\n')
  
  try {
    // Find suppliers that have commandes
    const suppRows = await query(
      `SELECT DISTINCT cf.IDfournisseur FROM commande_fil cf ORDER BY cf.IDfournisseur DESC`
    )
    
    if (suppRows.length === 0) {
      console.log('No suppliers with commandes found')
      process.exit(0)
    }

    const suppId = (suppRows[0] as any).IDfournisseur
    const suppName = await query(
      `SELECT nom FROM fournisseur WHERE IDfournisseur = ${suppId}`
    )
    
    console.log(`Using supplier ID ${suppId} (${suppName.length > 0 ? (suppName[0] as any).nom : 'unknown'})`)

    // Get commandes
    const commandes = await query(
      `SELECT IDcommande_fil, date_commande, etat, commentaire FROM commande_fil WHERE IDfournisseur = ${suppId} ORDER BY date_commande DESC`
    )

    console.log(`Found ${commandes.length} commandes`)
    
    if (commandes.length > 0) {
      const commandeIds = (commandes as any[]).map(c => c.IDcommande_fil)

      // Get ALL fields from both tables
      console.log('\n=== FULL DATA STRUCTURE ===\n')
      
      const commande1 = await query(
        `SELECT * FROM commande_fil WHERE IDcommande_fil = ${commandeIds[0]}`
      )
      
      const lines1 = await query(
        `SELECT * FROM ref_fil_commande WHERE IDcommande_fil = ${commandeIds[0]}`
      )

      console.log('Commande (first order):')
      console.log(JSON.stringify(commande1[0], null, 2))
      
      console.log('\nOrder lines (first order):')
      console.log(JSON.stringify(lines1, null, 2))

      // Get joined view as API returns it
      console.log('\n=== API Response Format (with joins) ===\n')
      
      const lignesCommandes = await query(
        `SELECT rfc.IDref_fil_commande, rfc.IDcommande_fil, rfc.quantite, rfc.unite, rfc.prix_unitaire, rfc.date_livraison, rfc.etat, rf.reference as ref_fil, cf.reference as colori_reference FROM ref_fil_commande rfc LEFT JOIN ref_fil rf ON rfc.IDref_fil = rf.IDref_fil LEFT JOIN colori_fil cf ON rfc.IDcolori_fil = cf.IDcolori_fil WHERE rfc.IDcommande_fil = ${commandeIds[0]} ORDER BY rfc.IDref_fil_commande`
      )
      
      console.log('Order lines (API format):')
      console.log(JSON.stringify(lignesCommandes, null, 2))

      // Check IDecheance reference table
      console.log('\n=== Check IDecheance (in commande_fil) ===')
      const echRows = await query(`SELECT DISTINCT IDecheance FROM commande_fil`)
      console.log('Unique IDecheance values:', (echRows as any[]).map(r => r.IDecheance).join(', '))
      
      try {
        const echTable = await query(`SELECT TOP 3 * FROM echeance`)
        console.log('echeance table sample:', JSON.stringify(echTable, null, 2))
      } catch {
        console.log('No echeance table found')
      }
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
