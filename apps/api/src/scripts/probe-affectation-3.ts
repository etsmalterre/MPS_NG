import 'dotenv/config'
import { query, closeConnection } from '../lib/hfsql.js'

async function main() {
  try {
    // ==== CORE AFFECTATION TABLE ====
    console.log('\n===== 1. AFFECTATION_CMD_TRICOTAGE =====')
    const aCount = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM affectation_cmd_tricotage`)
    console.log(`Total rows: ${aCount[0]?.n}`)

    const aDistinct = await query<{ n: number }>(`
      SELECT COUNT(DISTINCT IDligne_commande_sous_traitant) AS n FROM affectation_cmd_tricotage
    `)
    console.log(`Distinct IDligne_commande_sous_traitant: ${aDistinct[0]?.n}`)

    const aSamples = await query<Record<string, unknown>>(`SELECT TOP 10 * FROM affectation_cmd_tricotage`)
    console.log('Sample rows:')
    for (const s of aSamples) {
      console.log(`  affectID=${s.IDaffectation_cmd_tricotage}, poids=${s.poids_affecte}, ligne_sst=${s.IDligne_commande_sous_traitant}, ligne_client=${s.IDligne_commande_client}`)
    }

    // ==== LINE 8520 ====
    console.log('\n===== 2. LINE 8520 AFFECTATION =====')
    const aff8520 = await query<Record<string, unknown>>(`
      SELECT * FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant = 8520
    `)
    console.log(`Rows for line 8520: ${aff8520.length}`)

    const ecru8520 = await query<{ poids: number }>(`
      SELECT poids FROM stock_ecru WHERE IDref_commande_source = 8520 LIMIT 1
    `)
    console.log(`stock_ecru for line 8520: ${ecru8520.length} rows, sample poids: ${ecru8520[0]?.poids}`)

    // ==== STOCK_FIL SCHEMA CHECK ====
    console.log('\n===== 3. STOCK_FIL COLUMNS =====')
    const sfSchema = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM stock_fil`)
    const cols = Object.keys(sfSchema[0] || {})
    console.log('All columns:', cols.join(', '))
    
    const potentialLinks = cols.filter(c => {
      const lower = c.toLowerCase()
      return lower.includes('aff') || lower.includes('cmd') || lower.includes('commande') || 
             lower.includes('ligne') || lower.includes('ref_commande')
    })
    console.log('Potential link columns:', potentialLinks.length > 0 ? potentialLinks.join(', ') : '(none found)')

    // ==== STOCK_FIL DATA FOR LOTS 10485 & 10379 ====
    console.log('\n===== 4. STOCK_FIL LOTS 10485 & 10379 =====')
    const lots = await query<Record<string, unknown>>(`
      SELECT IDstock_fil, lot, IDref_fil, IDcolori_fil, stock, stock_initial FROM stock_fil WHERE lot IN ('10485', '10379')
    `)
    for (const lot of lots) {
      console.log(`Lot ${lot.lot}: IDstock_fil=${lot.IDstock_fil}, IDref_fil=${lot.IDref_fil}, IDcolori_fil=${lot.IDcolori_fil}`)
      console.log(`  stock=${lot.stock}, stock_initial=${lot.stock_initial}`)
    }

    // ==== SEARCH FOR OTHER TABLES ====
    console.log('\n===== 5. OTHER TABLES =====')
    const candidates = [
      'mouvement_stock_fil', 'affectation_stock_fil', 'reservation_stock_fil',
      'consommation_fil', 'lot_affectation', 'affectation_fil_cmd'
    ]
    for (const table of candidates) {
      try {
        const count = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)
        console.log(`${table.padEnd(30)} : ${count[0]?.n} rows`)
      } catch {
        // not found, silent
      }
    }

    // ==== ACTIVE TRM COMMANDS ====
    console.log('\n===== 6. ACTIVE TRM COMMANDS (est_soldee=0) =====')
    const activeTRM = await query<{ IDcommande_sous_traitant: number; IDligne_commande_sous_traitant: number }>(`
      SELECT TOP 3 cst.IDcommande_sous_traitant, lcst.IDligne_commande_sous_traitant
      FROM commande_sous_traitant cst
      JOIN ligne_commande_sous_traitant lcst ON cst.IDcommande_sous_traitant = lcst.IDcommande_sous_traitant
      WHERE cst.IDsous_traitant = 1 AND cst.est_soldee = 0
      ORDER BY cst.IDcommande_sous_traitant DESC
    `)
    console.log(`Found ${activeTRM.length} active TRM lines`)
    
    if (activeTRM.length > 0) {
      const sampleLine = activeTRM[0]
      console.log(`\nSample active line: sst ${sampleLine.IDcommande_sous_traitant}, line ${sampleLine.IDligne_commande_sous_traitant}`)
      
      const affRows = await query<Record<string, unknown>>(`
        SELECT * FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant = ${sampleLine.IDligne_commande_sous_traitant}
      `)
      console.log(`  Affectation rows: ${affRows.length}`)
      if (affRows.length > 0) {
        for (const r of affRows.slice(0, 3)) {
          console.log(`    poids=${r.poids_affecte}, ligne_client=${r.IDligne_commande_client}`)
        }
      }
    }

  } finally {
    await closeConnection()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
