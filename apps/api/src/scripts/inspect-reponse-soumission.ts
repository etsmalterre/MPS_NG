// Confirm the reponse_soumission table contents for commande 7390 +
// lot 105741, and look at the wider table to plan the historique
// extension. The user said the legacy app shows "approved 16/04/2025".
import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  console.log('\n=== reponse_soumission schema ===')
  const top = (await query(`SELECT TOP 1 * FROM reponse_soumission`)) as any[]
  if (top.length > 0) console.log('  keys:', Object.keys(top[0]).join(', '))

  console.log('\n=== reponse_soumission for commande 7390 ===')
  const r = (await query(
    `SELECT * FROM reponse_soumission WHERE IDcommande_sous_traitant = 7390`,
  )) as any[]
  const rFixed = await fixEncoding(r as any[], 'reponse_soumission', 'IDreponse_soumission', ['reponse', 'lot'])
  for (const x of rFixed) console.log('  ', JSON.stringify(x))

  console.log('\n=== reponse_soumission distinct response values ===')
  const dist = (await query(
    `SELECT reponse, COUNT(*) AS n FROM reponse_soumission GROUP BY reponse ORDER BY n DESC`,
  )) as any[]
  const distFixed = await fixEncoding(dist as any[], 'reponse_soumission', 'IDreponse_soumission', ['reponse'])
  for (const x of distFixed) console.log('  ', JSON.stringify(x))

  console.log('\n=== reponse_soumission total count ===')
  const total = (await query(`SELECT COUNT(*) AS n FROM reponse_soumission`)) as any[]
  console.log('  ', JSON.stringify(total[0]))

  // Cross-reference type_doc=15 envoi_email rows referencing real sst
  // commandes to confirm the legacy convention (IDreference = sst id,
  // notes = lot identifier).
  console.log('\n=== envoi_email type_doc=15 rows where IDreference IS a commande_sous_traitant ===')
  const sample = (await query(
    `SELECT TOP 10 ee.IDenvoi_email, ee.DATE, ee.adresse, ee.IDreference, ee.notes
     FROM envoi_email ee
     WHERE ee.IDtype_doc = 15
       AND EXISTS (
         SELECT 1 FROM commande_sous_traitant cst
         WHERE cst.IDcommande_sous_traitant = ee.IDreference
       )
     ORDER BY ee.DATE DESC`,
  )) as any[]
  const sampleFixed = await fixEncoding(sample as any[], 'envoi_email', 'IDenvoi_email', ['adresse', 'notes'])
  for (const x of sampleFixed) console.log('  ', JSON.stringify(x))

  // Count: how many type_doc=15 rows reference a real sst commande vs
  // some other table (étude-coloris soumissions).
  console.log('\n=== type_doc=15 IDreference resolution histogram ===')
  const t15Total = Number(((await query(`SELECT COUNT(*) AS n FROM envoi_email WHERE IDtype_doc = 15`)) as any[])[0]?.n) || 0
  const t15Sst = Number(((await query(
    `SELECT COUNT(*) AS n FROM envoi_email ee
     WHERE ee.IDtype_doc = 15
       AND EXISTS (SELECT 1 FROM commande_sous_traitant cst WHERE cst.IDcommande_sous_traitant = ee.IDreference)`,
  )) as any[])[0]?.n) || 0
  console.log(`  type15 total: ${t15Total}; refs commande_sous_traitant: ${t15Sst}; orphans/other: ${t15Total - t15Sst}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
