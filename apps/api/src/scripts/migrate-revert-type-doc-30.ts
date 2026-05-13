// Reverse the (mistaken) type_doc=30 introduction. The legacy WinDev
// app actually uses type_doc=15 for sst soumissions with the lot id in
// `notes` — confirmed via production data (3279 rows of type=15 all
// referencing real commande_sous_traitant, many with "MA{lot}" notes).
//
// This script:
//   1. Reclassifies any envoi_email row with IDtype_doc=30 to 15. Sets
//      notes = '[legacy]' as a marker for rows that don't carry a real
//      lot id (probably none, but defensive).
//   2. Deletes (30, 'soumission lot client') from type_doc.
//
// Idempotent — re-running is safe.
import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) How many stray type=30 rows in envoi_email?
  const stray = (await query(
    `SELECT COUNT(*) AS n FROM envoi_email WHERE IDtype_doc = 30`,
  )) as any[]
  const strayCount = Number(stray[0]?.n) || 0
  console.log(`envoi_email rows with IDtype_doc = 30: ${strayCount}`)
  if (strayCount > 0) {
    await query(
      `UPDATE envoi_email
       SET IDtype_doc = 15,
           notes = '[legacy]'
       WHERE IDtype_doc = 30
         AND (notes IS NULL OR notes = '')`,
    )
    await query(
      `UPDATE envoi_email
       SET IDtype_doc = 15
       WHERE IDtype_doc = 30
         AND notes IS NOT NULL
         AND notes <> ''`,
    )
    console.log(`  ${strayCount} envoi_email rows reclassified from 30 → 15`)
  }

  // 2) Drop the dead type_doc row.
  const existing = (await query(
    `SELECT IDtype_doc FROM type_doc WHERE IDtype_doc = 30`,
  )) as any[]
  if (existing.length > 0) {
    await query(`DELETE FROM type_doc WHERE IDtype_doc = 30`)
    console.log('type_doc[30] deleted')
  } else {
    console.log('type_doc[30] already absent')
  }

  // 3) Verify.
  const after = (await query(
    `SELECT IDtype_doc, nom FROM type_doc WHERE IDtype_doc IN (15, 28, 30)`,
  )) as any[]
  console.log('\nFinal type_doc state for (15, 28, 30):')
  for (const r of after) console.log('  ', JSON.stringify(r))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
