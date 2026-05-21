import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) reference column — try literal "3378/1011"
  console.log('\n=== defaut_qualite WHERE reference = "3378/1011" ===')
  const r1 = await query(`
    SELECT IDdefaut_qualite, reference, CONVERT(description USING 'UTF-8') AS description,
           CONVERT(type_defaut USING 'UTF-8') AS type_defaut,
           Type_Spotteur, IDSpotteur, Type_Reference, taille_cm, nombre
    FROM defaut_qualite
    WHERE reference = '3378/1011'
  `) as any[]
  console.log(`${r1.length} rows`)
  for (const r of r1) console.log(' ', JSON.stringify(r))

  // 2) Maybe reference is just the piece number (1011)?
  console.log('\n=== defaut_qualite WHERE reference LIKE "%1011%" ===')
  const r2 = await query(`
    SELECT TOP 20 IDdefaut_qualite, reference, CONVERT(description USING 'UTF-8') AS description,
           CONVERT(type_defaut USING 'UTF-8') AS type_defaut,
           taille_cm
    FROM defaut_qualite
    WHERE reference LIKE '%1011%'
    ORDER BY IDdefaut_qualite DESC
  `) as any[]
  console.log(`${r2.length} rows`)
  for (const r of r2) console.log(' ', JSON.stringify(r))

  // 3) Check most recent defaut_qualite rows — see how they're keyed
  console.log('\n=== last 10 defaut_qualite rows ===')
  const r3 = await query(`
    SELECT TOP 10 IDdefaut_qualite, reference, CONVERT(description USING 'UTF-8') AS description,
           CONVERT(type_defaut USING 'UTF-8') AS type_defaut,
           Type_Spotteur, IDSpotteur, Type_Reference, taille_cm, nombre
    FROM defaut_qualite
    ORDER BY IDdefaut_qualite DESC
  `) as any[]
  for (const r of r3) console.log(' ', JSON.stringify(r))

  // 4) Same date as the stock_ecru entry (2026-02-26) — see if there are
  //    defaut rows then for the same OF
  console.log('\n=== defaut_qualite rows from late February 2026 with OF-like reference ===')
  const r4 = await query(`
    SELECT TOP 20 IDdefaut_qualite, reference, CONVERT(description USING 'UTF-8') AS description,
           CONVERT(type_defaut USING 'UTF-8') AS type_defaut,
           Type_Spotteur, IDSpotteur, Type_Reference, taille_cm, DATE
    FROM defaut_qualite
    WHERE DATE >= '2026-02-25' AND DATE <= '2026-02-27'
    ORDER BY DATE DESC
  `) as any[]
  console.log(`${r4.length} rows`)
  for (const r of r4) console.log(' ', JSON.stringify(r))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
