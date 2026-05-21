import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Find the roll by its numero
  console.log('\n=== stock_ecru numero=3377/1 (all columns) ===')
  const r = await query(`SELECT TOP 1 * FROM stock_ecru WHERE numero = '3377/1'`) as any[]
  if (r.length === 0) { console.log('no row matches numero=3377/1'); }
  else {
    console.log('keys:', Object.keys(r[0]))
    console.log(r[0])
  }

  // 2) All stock_ecru rolls affected to ligne_commande_sous_traitant 8562
  //    (which belongs to commande_sous_traitant 8586)
  console.log('\n=== rolls affected to ligne 8562 ===')
  const rolls = await query(`
    SELECT IDstock_ecru, numero, lot, poids, IDref_commande_affectation
    FROM stock_ecru
    WHERE IDref_commande_affectation = 8562
  `) as any[]
  console.log(rolls)

  // 3) Look at every "client-ish" column on the first row of stock_ecru
  console.log('\n=== stock_ecru columns containing "client" or "commande_client" ===')
  if (r.length > 0) {
    for (const k of Object.keys(r[0])) {
      if (/client/i.test(k) || /commande_c/i.test(k)) {
        console.log(`  ${k} = ${r[0][k]}`)
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
