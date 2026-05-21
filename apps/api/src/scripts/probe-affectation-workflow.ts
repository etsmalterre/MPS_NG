// Comprehensive probe: yarn affectation workflow for tricoteur sst commandes
import 'dotenv/config'
import { query, closeConnection } from '../lib/hfsql.js'

async function main() {
  try {
    // ===== 1. affectation_cmd_tricotage schema and row count =====
    console.log('\n===== AFFECTATION_CMD_TRICOTAGE TABLE =====')
    const aSchema = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM affectation_cmd_tricotage`)
    if (aSchema.length > 0) {
      console.log('Columns:', Object.keys(aSchema[0]).join(', '))
      console.log('Sample row:')
      for (const [k, v] of Object.entries(aSchema[0])) {
        const display = v instanceof ArrayBuffer ? `<blob ${v.byteLength}b>` : v
        console.log(`  ${k.padEnd(35)} = ${display === '' ? "''" : display}`)
      }
    } else {
      console.log('(empty table)')
    }

    const aCount = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM affectation_cmd_tricotage`)
    console.log(`Total rows: ${aCount[0]?.n}`)

    const aDistinct = await query<{ n: number }>(`
      SELECT COUNT(DISTINCT IDligne_commande_sous_traitant) AS n FROM affectation_cmd_tricotage
    `)
    console.log(`Distinct IDligne_commande_sous_traitant: ${aDistinct[0]?.n}`)

    // ===== 2. Specific probe: sst 8544 / line 8520 =====
    console.log('\n===== SST 8544 / LINE 8520 (TRM CC 6863) =====')
    const affRows = await query<Record<string, unknown>>(`
      SELECT * FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant = 8520
    `)
    console.log(`Affectation rows for line 8520: ${affRows.length}`)
    if (affRows.length > 0) {
      for (const r of affRows) {
        console.log(' ', r)
      }
    }

    // Check stock_ecru produced for this line
    const ecruRows = await query<{ IDstock_ecru: number; poids: number }>(`
      SELECT IDstock_ecru, poids FROM stock_ecru WHERE IDref_commande_source = 8520
    `)
    console.log(`stock_ecru rolls produced (IDref_commande_source=8520): ${ecruRows.length}`)
    if (ecruRows.length > 0) {
      const totalPoids = ecruRows.reduce((sum, r) => sum + Number(r.poids || 0), 0)
      console.log(`  Total poids: ${totalPoids} kg`)
    }

    // ===== 3. Probe composition_ecru for ref_ecru/colori of the line =====
    console.log('\n===== COMPOSITION & STOCK_FIL FOR REF_ECRU 146 / COLORI 1094 =====')
    
    const lineInfo = await query<{ IDref_ecru: number; IDcolori_ecru: number }>(`
      SELECT DISTINCT IDref_ecru, IDcolori_ecru FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant = 8520
    `)
    console.log('Line ref_ecru/colori:', lineInfo)

    const compo = await query<{ IDref_fil: number; IDcolori_fil: number; pourcentage: number }>(`
      SELECT IDref_fil, IDcolori_fil, pourcentage FROM composition_ecru WHERE IDref_ecru = 146 AND IDcolori_ecru = 1094
    `)
    console.log(`Composition pairs (ref_ecru=146, colori=1094): ${compo.length}`)
    for (const c of compo) {
      console.log(`  IDref_fil=${c.IDref_fil} / IDcolori_fil=${c.IDcolori_fil} → ${c.pourcentage}%`)
    }

    // ===== 4. Probe specific lots 10485 and 10379 =====
    console.log('\n===== STOCK_FIL LOTS 10485 & 10379 =====')
    const lots = await query<Record<string, unknown>>(`
      SELECT IDstock_fil, lot, IDref_fil, IDcolori_fil, stock, stock_initial, IDref_fil_commande, IDMagasin
      FROM stock_fil WHERE lot IN ('10485', '10379')
    `)
    for (const lot of lots) {
      console.log(`\nLot ${lot.lot}:`)
      for (const [k, v] of Object.entries(lot)) {
        console.log(`  ${k.padEnd(25)} = ${v}`)
      }
    }

    // ===== 5. Search for any column linking stock_fil to commandes =====
    console.log('\n===== STOCK_FIL SCHEMA CHECK =====')
    const sfSchema = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM stock_fil`)
    if (sfSchema.length > 0) {
      const cols = Object.keys(sfSchema[0])
      const affectRelated = cols.filter(c => c.includes('affectation') || c.includes('commande') || c.includes('ligne'))
      console.log('All columns:', cols.join(', '))
      console.log('Commande/affectation-related columns:', affectRelated.length > 0 ? affectRelated.join(', ') : '(none)')
    }

    // ===== 6. Check for other affectation-related tables =====
    console.log('\n===== OTHER POTENTIAL AFFECTATION TABLES =====')
    const candidates = [
      'mouvement_stock_fil', 'mouvement_stock', 'mvt_stock', 'historique_stock_fil',
      'reservation_stock_fil', 'stock_fil_commande', 'consommation_fil', 'stock_fil_mouvement',
      'stock_fil_lot', 'lot_consommation', 'journal_stock_fil'
    ]
    for (const table of candidates) {
      try {
        const exists = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)
        console.log(`${table.padEnd(30)} : ${exists[0]?.n} rows`)
      } catch {
        // table doesn't exist
      }
    }

    // ===== 7. Find active TRM commandes =====
    console.log('\n===== ACTIVE TRM COMMANDES (est_soldee=0) =====')
    const activeTRM = await query<{ IDcommande_sous_traitant: number; IDligne_commande_sous_traitant: number; IDref_ecru: number; IDcolori_ecru: number }>(`
      SELECT TOP 5 cst.IDcommande_sous_traitant, lcst.IDligne_commande_sous_traitant, lcst.IDref_ecru, lcst.IDcolori_ecru
      FROM commande_sous_traitant cst
      JOIN ligne_commande_sous_traitant lcst ON cst.IDcommande_sous_traitant = lcst.IDcommande_sous_traitant
      WHERE cst.IDsous_traitant = 1 AND cst.est_soldee = 0
      ORDER BY cst.IDcommande_sous_traitant DESC
    `)
    console.log(`Active TRM commandes (not yet closed): ${activeTRM.length}`)
    for (const line of activeTRM) {
      const rolls = await query<{ n: number }>(`
        SELECT COUNT(*) AS n FROM stock_ecru WHERE IDref_commande_source = ${line.IDligne_commande_sous_traitant}
      `)
      console.log(`  sst ${line.IDcommande_sous_traitant} / line ${line.IDligne_commande_sous_traitant} (ref_ecru=${line.IDref_ecru}, colori=${line.IDcolori_ecru}) → ${rolls[0]?.n} rolls produced`)
    }

    // ===== 8. Detailed affectation rows for a sample active line =====
    if (activeTRM.length > 0) {
      const sampleLine = activeTRM[0]
      console.log(`\n===== AFFECTATION ROWS FOR ACTIVE LINE ${sampleLine.IDligne_commande_sous_traitant} =====`)
      const affSample = await query<Record<string, unknown>>(`
        SELECT * FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant = ${sampleLine.IDligne_commande_sous_traitant}
      `)
      console.log(`Rows: ${affSample.length}`)
      for (const r of affSample.slice(0, 10)) {
        console.log(' ', r)
      }
    }

  } finally {
    await closeConnection()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
