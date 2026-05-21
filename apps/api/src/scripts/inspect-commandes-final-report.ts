import { query } from '../lib/hfsql.js'

async function main() {
  try {
    const commande = await query('SELECT * FROM commande_fil ORDER BY IDcommande_fil DESC')
    const ligne = await query('SELECT * FROM ref_fil_commande ORDER BY IDref_fil_commande DESC')
    const echance = await query('SELECT * FROM echeance')
    const modePaiement = await query('SELECT * FROM mode_paiement')

    console.log('\n=== COMMANDE_FIL (Order Headers) ===')
    console.log('\nColumns and types:')
    const commandeCols = [
      ['IDcommande_fil', 'integer', 'Primary key'],
      ['IDfournisseur', 'integer (FK)', 'Supplier ID'],
      ['date_commande', 'string YYYYMMDD', 'Order date'],
      ['etat', 'integer 0/1', '0=open, 1=closed'],
      ['commentaire', 'string', 'Order notes'],
      ['IDadresse_fournisseur', 'integer (FK)', 'Invoice address'],
      ['IDadresse_livraison', 'integer (FK)', 'Delivery address'],
      ['IDmode_paiement', 'integer (FK)', 'Payment method'],
      ['IDecheance', 'integer (FK)', 'Payment term'],
      ['journal', 'string RARE', '1.8% populated, legacy'],
    ]
    commandeCols.forEach(([col, type, desc]) => {
      console.log(`  ${col.padEnd(28)} ${type.padEnd(20)} ${desc}`)
    })
    console.log('\nSample row:')
    console.log(JSON.stringify(commande[0], null, 2))

    console.log('\n=== REF_FIL_COMMANDE (Order Lines) ===')
    console.log('\nColumns and types:')
    const ligneCols = [
      ['IDref_fil_commande', 'integer', 'Primary key'],
      ['IDcommande_fil', 'integer (FK)', 'Parent order'],
      ['IDref_fil', 'integer (FK)', 'Yarn reference'],
      ['IDcolori_fil', 'integer (FK)', 'Color'],
      ['quantite', 'integer', 'Quantity'],
      ['unite', 'integer', '1 = standard unit'],
      ['prix_unitaire', 'float', 'Unit price'],
      ['date_livraison', 'string YYYYMMDD', '94.6% populated'],
      ['etat', 'integer 0/1', '0=pending, 1=delivered'],
      ['date_notif', 'string YYYYMMDD', '20.8% populated'],
    ]
    ligneCols.forEach(([col, type, desc]) => {
      console.log(`  ${col.padEnd(28)} ${type.padEnd(20)} ${desc}`)
    })
    console.log('\nSample row:')
    console.log(JSON.stringify(ligne[0], null, 2))

    console.log('\n=== Related Tables ===')
    console.log('\necheance (Payment Terms):')
    ;(echance as any[]).slice(0, 3).forEach(row => {
      console.log(`  ID=${row.IDecheance}: "${row.libelle}" (${row.nb_jours} days)`)
    })

    console.log('\nmode_paiement (Payment Methods):')
    ;(modePaiement as any[]).forEach(row => {
      console.log(`  ID=${row.IDmode_paiement}: "${row.libelle}"`)
    })

    console.log('\n=== Observations ===')
    console.log('- No accented column names')
    console.log('- No date-only columns (always YYYYMMDD string)')
    console.log('- etat is binary flag, not tracked by quantity')
    console.log('- No document attachment column (unlike certificat)')
    console.log('- journal field is legacy (1.8% populated)')

  } catch (err) {
    console.error('Error:', err)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
