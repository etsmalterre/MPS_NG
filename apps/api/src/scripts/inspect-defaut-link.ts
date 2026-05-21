import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Defects on OF reference '3378'
  console.log('\n=== defaut_qualite WHERE reference = "3378" ===')
  const r1 = await query(`
    SELECT IDdefaut_qualite, reference, CONVERT(description USING 'UTF-8') AS description,
           CONVERT(type_defaut USING 'UTF-8') AS type_defaut,
           Type_Spotteur, IDSpotteur, Type_Reference,
           traité, taille_cm, "récuperé" AS recupere, nombre
    FROM defaut_qualite
    WHERE reference = '3378'
  `) as any[]
  console.log(`${r1.length} rows`)
  for (const r of r1.slice(0, 30)) console.log(' ', JSON.stringify(r))

  // 2) IDSpotteur in stock_ecru.IDpiece_production?
  console.log('\n=== defaut_qualite WHERE IDSpotteur = 36699 (the IDpiece_production of 3378/1011) ===')
  const r2 = await query(`
    SELECT IDdefaut_qualite, reference, CONVERT(description USING 'UTF-8') AS description,
           CONVERT(type_defaut USING 'UTF-8') AS type_defaut,
           Type_Spotteur, Type_Reference, taille_cm
    FROM defaut_qualite
    WHERE IDSpotteur = 36699
  `) as any[]
  console.log(`${r2.length} rows`)
  for (const r of r2) console.log(' ', JSON.stringify(r))

  // 3) Maybe the link is via piece_production.num_piece? Inspect that table
  console.log('\n=== piece_production schema ===')
  try {
    const p = await query(`SELECT TOP 1 * FROM piece_production`) as any[]
    if (p.length > 0) {
      console.log('keys:', Object.keys(p[0]))
      console.log(JSON.stringify(p[0]))
    }
  } catch (e) { console.log('err:', (e as Error).message) }

  console.log('\n=== piece_production row 36699 ===')
  try {
    const p = await query(`SELECT * FROM piece_production WHERE IDpiece_production = 36699`) as any[]
    for (const r of p) console.log(JSON.stringify(r, null, 2))
  } catch (e) { console.log('err:', (e as Error).message) }

  // 4) Defects pointing to stock_ecru by IDstock_ecru as IDSpotteur with Type_Reference = 2?
  console.log('\n=== defaut_qualite WHERE IDSpotteur = 52557 (the IDstock_ecru) ===')
  const r4 = await query(`
    SELECT IDdefaut_qualite, reference, CONVERT(description USING 'UTF-8') AS description,
           CONVERT(type_defaut USING 'UTF-8') AS type_defaut,
           Type_Spotteur, Type_Reference, taille_cm
    FROM defaut_qualite
    WHERE IDSpotteur = 52557
  `) as any[]
  console.log(`${r4.length} rows`)
  for (const r of r4) console.log(' ', JSON.stringify(r))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
