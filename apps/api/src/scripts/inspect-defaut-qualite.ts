import { query } from '../lib/hfsql-auto.js'

async function main() {
  console.log('\n=== defaut_qualite — full schema + sample ===')
  const r = await query(`SELECT TOP 3 * FROM defaut_qualite`) as any[]
  if (r.length > 0) console.log('keys:', Object.keys(r[0]))
  for (const row of r) console.log(JSON.stringify(row, null, 2))

  console.log('\n=== defaut_qualite rows for stock_ecru 52557 (numero 3378/1011) ===')
  // Try various FK patterns
  const candidates = [
    `IDstock_ecru = 52557`,
    `IDpiece_production = 36699`,
    `Type_Reference = 'stock_ecru' AND IDSpotteur = 52557`,
    `Type_Spotteur = 'stock_ecru' AND IDSpotteur = 52557`,
  ]
  for (const where of candidates) {
    try {
      const rows = await query(`SELECT * FROM defaut_qualite WHERE ${where}`) as any[]
      console.log(`\n WHERE ${where} → ${rows.length} rows`)
      for (const row of rows) console.log(JSON.stringify(row, null, 2))
    } catch (e) {
      console.log(`\n WHERE ${where} → err: ${(e as Error).message.slice(0, 100)}`)
    }
  }

  console.log('\n=== count of defaut_qualite rows total ===')
  const c = await query(`SELECT COUNT(*) AS n FROM defaut_qualite`) as any[]
  console.log(c)

  console.log('\n=== distinct Type_Spotteur values ===')
  try {
    const t = await query(`SELECT DISTINCT Type_Spotteur FROM defaut_qualite`) as any[]
    for (const r of t) console.log(' ', JSON.stringify(r))
  } catch (e) { console.log('err:', (e as Error).message) }

  console.log('\n=== distinct Type_Reference values ===')
  try {
    const t = await query(`SELECT DISTINCT Type_Reference FROM defaut_qualite`) as any[]
    for (const r of t) console.log(' ', JSON.stringify(r))
  } catch (e) { console.log('err:', (e as Error).message) }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
