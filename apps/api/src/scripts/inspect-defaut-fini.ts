import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) IN-clause test for stock_ecru defects
  console.log('\n=== defaut_qualite WHERE Type_Reference=2 AND reference IN ("52557","52550") ===')
  const r1 = await query(`
    SELECT IDdefaut_qualite, reference,
           CONVERT(description USING 'UTF-8') AS description,
           CONVERT(type_defaut USING 'UTF-8') AS type_defaut,
           taille_cm, DATE
    FROM defaut_qualite
    WHERE Type_Reference = 2
      AND reference IN ('52557','52550')
  `) as any[]
  for (const r of r1) console.log(' ', JSON.stringify(r))

  // 2) Does any defaut_qualite reference a recent stock_fini IDstock_fini?
  console.log('\n=== last 5 stock_fini IDs (to test fini defect link) ===')
  const finiSample = await query(`SELECT TOP 5 IDstock_fini FROM stock_fini ORDER BY IDstock_fini DESC`) as any[]
  const finiIds = finiSample.map((r: any) => Number(r.IDstock_fini))
  console.log('  ', finiIds)

  // Same Type_Reference=2 (or maybe a different value for fini)
  console.log('\n=== defaut_qualite where reference matches recent stock_fini IDs ===')
  const inList = finiIds.map((id) => `'${id}'`).join(',')
  for (const tr of [1, 2, 3]) {
    const r = await query(`
      SELECT IDdefaut_qualite, reference, Type_Reference,
             CONVERT(description USING 'UTF-8') AS description
      FROM defaut_qualite
      WHERE Type_Reference = ${tr} AND reference IN (${inList})
    `) as any[]
    console.log(`  Type_Reference=${tr}: ${r.length} rows`)
    for (const row of r) console.log('     ', JSON.stringify(row))
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
