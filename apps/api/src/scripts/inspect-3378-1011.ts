import { query } from '../lib/hfsql-auto.js'

async function main() {
  console.log('\n=== stock_ecru where numero contains 3378/1011 ===')
  const r = await query(`
    SELECT IDstock_ecru, numero, lot, second_choix,
           CONVERT(observations USING 'UTF-8') AS observations,
           CONVERT(visiteur USING 'UTF-8') AS visiteur,
           IDref_commande_affectation
    FROM stock_ecru
    WHERE numero LIKE '%3378/1011%'
  `) as any[]
  for (const row of r) console.log(JSON.stringify(row, null, 2))

  console.log('\n=== same row, ALL columns (find the defect text field) ===')
  for (const row of r) {
    const full = await query(`SELECT * FROM stock_ecru WHERE IDstock_ecru = ${row.IDstock_ecru}`) as any[]
    if (full.length > 0) {
      console.log('keys:', Object.keys(full[0]))
      console.log(full[0])
    }
  }

  // 2) Maybe there's a separate defect table?
  console.log('\n=== probe defect-shaped tables ===')
  const cand = [
    'defaut', 'defaut_ecru', 'defaut_stock', 'defaut_piece',
    'piece_defaut', 'stock_ecru_defaut', 'defaut_stock_ecru',
    'controle_qualite', 'qualite', 'defaut_qualite',
  ]
  for (const t of cand) {
    try {
      const x = await query(`SELECT TOP 1 * FROM ${t}`) as any[]
      console.log(`\n  ✓ ${t} — ${x.length} rows`)
      if (x.length > 0) console.log('    keys:', Object.keys(x[0]))
    } catch (e) {}
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
