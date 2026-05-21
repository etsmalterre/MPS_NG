import { query } from '../lib/hfsql.js'

async function main() {
  console.log('\n=== Test API fournisseur detail with commandes ===\n')
  
  try {
    // Get a fournisseur that has commandes
    const suppRows = await query(`SELECT IDfournisseur FROM fournisseur ORDER BY IDfournisseur DESC`)
    if (suppRows.length === 0) {
      console.log('No suppliers found')
      process.exit(0)
    }

    const suppId = (suppRows[0] as any).IDfournisseur
    console.log(`Fetching supplier ID ${suppId}...`)

    // Now replicate the exact API call from fournisseurs.ts GET /:id
    const [
      commandes,
      adresses,
      contacts
    ] = await Promise.all([
      query(`SELECT IDcommande_fil, date_commande, etat, commentaire FROM commande_fil WHERE IDfournisseur = ${suppId} ORDER BY date_commande DESC`),
      query(`SELECT * FROM adresse WHERE IDfournisseur = ${suppId} ORDER BY est_defaut DESC, IDadresse`),
      query(`SELECT * FROM contact WHERE IDfournisseur = ${suppId} ORDER BY est_defaut DESC, IDcontact`),
    ])

    console.log(`\nFound ${commandes.length} commandes for supplier ${suppId}`)
    
    if (commandes.length > 0) {
      // Get lines for these commandes
      const commandeIds = (commandes as any[]).map(c => c.IDcommande_fil).filter(Boolean)
      console.log(`Order IDs: ${commandeIds.slice(0, 3).join(', ')}...`)

      if (commandeIds.length > 0) {
        const lignesCommandes = await query(
          `SELECT rfc.IDref_fil_commande, rfc.IDcommande_fil, rfc.quantite, rfc.unite, rfc.prix_unitaire, rfc.date_livraison, rfc.etat, rf.reference as ref_fil, cf.reference as colori_reference FROM ref_fil_commande rfc LEFT JOIN ref_fil rf ON rfc.IDref_fil = rf.IDref_fil LEFT JOIN colori_fil cf ON rfc.IDcolori_fil = cf.IDcolori_fil WHERE rfc.IDcommande_fil IN (${commandeIds.join(',')}) ORDER BY rfc.IDref_fil_commande`
        )

        console.log(`\nFound ${lignesCommandes.length} order lines`)
        
        // Group by commande
        const lignesMap = new Map<number, any[]>()
        for (const l of lignesCommandes as any[]) {
          const arr = lignesMap.get(l.IDcommande_fil) || []
          arr.push(l)
          lignesMap.set(l.IDcommande_fil, arr)
        }

        console.log('\n=== Full Structure ===')
        console.log(JSON.stringify({
          commandes: (commandes as any[]).slice(0, 2).map(c => ({
            ...c,
            lignes: lignesMap.get(c.IDcommande_fil) || []
          }))
        }, null, 2))
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
