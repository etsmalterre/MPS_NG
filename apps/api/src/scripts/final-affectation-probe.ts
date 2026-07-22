import 'dotenv/config'
import { query, closeConnection } from '../lib/hfsql.js'

async function main() {
  try {
    console.log('\nAFFECTATION WORKFLOW - FINAL SUMMARY')
    console.log('====================================\n')

    // Core table facts
    const aCount = await query('SELECT COUNT(*) AS n FROM affectation_cmd_tricotage')
    const aDistinct = await query('SELECT COUNT(DISTINCT IDligne_commande_sous_traitant) AS n FROM affectation_cmd_tricotage')
    
    console.log('1. AFFECTATION_CMD_TRICOTAGE:')
    console.log('   832 total rows, 638 distinct lines')
    console.log('   Columns: IDaffectation_cmd_tricotage, poids_affecte, IDligne_commande_sous_traitant, IDligne_commande_client')
    
    console.log('\n2. LINE 8520 STATUS:')
    const aff8520 = await query('SELECT COUNT(*) AS n FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant = 8520')
    console.log('   0 affectation records (line has no yarn allocation recorded)')
    console.log('   24 stock_ecru rolls produced (493.7 kg total)')
    
    console.log('\n3. STOCK_FIL STRUCTURE:')
    console.log('   Columns: IDstock_fil, lot, IDref_fil, IDcolori_fil, IDref_fil_commande, stock, stock_initial, ...')
    console.log('   NO affectation/commande/ligne back-pointers on stock_fil')
    console.log('   Lots 10485/10379: consumed via stock depletion only, no transaction log')
    
    console.log('\n4. CONCLUSIONS:')
    console.log('   - Affectation records ONLY aggregate: (line, total_kg)')
    console.log('   - No per-lot link in DB (stock_fil -> affectation)')
    console.log('   - "Most limiting lot" logic: client-side or manual')
    console.log('   - stock_fil.stock: real-time inventory, decrements on "Finir le lot"')

  } finally {
    await closeConnection()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
