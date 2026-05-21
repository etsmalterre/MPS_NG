import 'dotenv/config'
import { query, closeConnection } from '../lib/hfsql.js'

async function main() {
  try {
    console.log('\n===== AFFECTATION_CMD_TRICOTAGE TABLE =====')
    const aSchema = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM affectation_cmd_tricotage`)
    if (aSchema.length > 0) {
      console.log('Columns:', Object.keys(aSchema[0]).join(', '))
    }

    const aCount = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM affectation_cmd_tricotage`)
    const aDistinct = await query<{ n: number }>(`SELECT COUNT(DISTINCT IDligne_commande_sous_traitant) AS n FROM affectation_cmd_tricotage`)
    console.log(`Total rows: ${aCount[0]?.n}, Distinct lines: ${aDistinct[0]?.n}`)

    // Sample affectation rows
    console.log('\n=== Sample affectation_cmd_tricotage rows ===')
    const samples = await query<Record<string, unknown>>(`SELECT TOP 5 * FROM affectation_cmd_tricotage`)
    for (const s of samples) console.log(s)

    // SST 8544 / line 8520
    console.log('\n===== LINE 8520 INVESTIGATION =====')
    const affRows = await query<Record<string, unknown>>(`SELECT * FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant = 8520`)
    console.log(`Affectation rows for line 8520: ${affRows.length}`)

    const ecruRows = await query<{ IDstock_ecru: number; poids: number }>(`
      SELECT IDstock_ecru, poids FROM stock_ecru WHERE IDref_commande_source = 8520
    `)
    console.log(`stock_ecru rolls produced: ${ecruRows.length}, total kg: ${ecruRows.reduce((s, r) => s + (r.poids || 0), 0).toFixed(1)}`)

    // Get ref_fil IDs for reference 4 (the line's IDreference)
    console.log('\n===== REF_ECRU/COLORI INFO FOR REFERENCE 4, COLORIS 82 =====')
    
    // Try to find composition with reference 4
    const refRows = await query<Record<string, unknown>>(`SELECT TOP 3 * FROM reference WHERE IDreference = 4`)
    if (refRows.length > 0) {
      console.log('reference (IDreference=4):', refRows[0])
    }

    // Check for composition tables by reference instead
    const compoSchema = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM composition_ecru`)
    console.log('\ncomposition_ecru columns:', Object.keys(compoSchema[0] || {}).join(', '))

    // Find some composition rows
    const compoRows = await query<Record<string, unknown>>(`SELECT TOP 5 * FROM composition_ecru`)
    console.log('Sample composition_ecru rows:')
    for (const r of compoRows) console.log(' ', r)

    // Probe stock_fil schema and check for affectation-related columns
    console.log('\n===== STOCK_FIL SCHEMA & LINK COLUMNS =====')
    const sfSchema = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM stock_fil`)
    if (sfSchema.length > 0) {
      const cols = Object.keys(sfSchema[0])
      console.log('All stock_fil columns:', cols.join(', '))
      const special = cols.filter(c => c.toLowerCase().includes('aff') || c.toLowerCase().includes('comm') || c.toLowerCase().includes('cmd') || c.toLowerCase().includes('ligne') || c.toLowerCase().includes('ref_commande'))
      console.log('Potential link columns:', special.length > 0 ? special.join(', ') : '(none)')
    }

    // Try the specific lots
    console.log('\n===== STOCK_FIL LOTS 10485 & 10379 =====')
    const lots = await query<Record<string, unknown>>(`SELECT * FROM stock_fil WHERE lot IN ('10485', '10379')`)
    for (const lot of lots) {
      console.log(`\nLot ${lot.lot} (IDstock_fil=${lot.IDstock_fil}):`)
      for (const [k, v] of Object.entries(lot)) {
        const display = v instanceof ArrayBuffer ? `<blob>` : v
        console.log(`  ${k.padEnd(30)} = ${display}`)
      }
    }

    // Check for other potential tables
    console.log('\n===== OTHER TABLES =====')
    const candidates = [
      'mouvement_stock_fil', 'affectation_stock_fil', 'reservation_stock_fil',
      'consommation_fil', 'lot_commande'
    ]
    for (const table of candidates) {
      try {
        const count = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)
        console.log(`${table.padEnd(30)} : ${count[0]?.n} rows`)
      } catch {
        // not found
      }
    }

  } finally {
    await closeConnection()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
