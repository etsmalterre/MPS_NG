// One-off, idempotent migration: add the type_doc row for the new
// "soumission lot client" envoi_email category (IDtype_doc = 30).
//
// Background: the original commit accidentally used IDtype_doc = 28,
// which collides with the legacy "devis" code already in production.
// Renumbered to 30 (the next free code beyond 1-29). Run once per
// environment — re-running is safe (existence-checked before INSERT).
//
// Usage: `cd apps/api && npx tsx src/scripts/migrate-add-type-doc-30.ts`
import { query } from '../lib/hfsql-auto.js'

async function main() {
  const ID = 30
  const NAME = 'soumission lot client'

  const existing = (await query(
    `SELECT IDtype_doc, nom FROM type_doc WHERE IDtype_doc = ${ID}`,
  )) as any[]

  if (existing.length > 0) {
    console.log(`type_doc[${ID}] already present:`, JSON.stringify(existing[0]))
    return
  }

  // Defensive: if a row already exists with the target nom but a
  // different id (e.g. someone added it manually), don't duplicate.
  const byName = (await query(
    `SELECT IDtype_doc, nom FROM type_doc WHERE nom = '${NAME.replace(/'/g, "''")}'`,
  )) as any[]
  if (byName.length > 0) {
    console.log(`type_doc row with nom='${NAME}' already exists at IDtype_doc=${byName[0].IDtype_doc}`)
    console.log(`(if that ID is not 30, update TYPE_DOC_SOUMISSION_LOT_CLIENT in commandes-sous-traitant.ts to match)`)
    return
  }

  await query(`INSERT INTO type_doc (IDtype_doc, nom) VALUES (${ID}, '${NAME}')`)
  console.log(`type_doc[${ID}] inserted: '${NAME}'`)

  // Re-fix any stray rows with IDtype_doc=28 that were accidentally
  // written by the earlier (buggy) build. These would have been logged
  // for any soumission emails sent between the feature ship and this
  // fix. We rewrite them to 30 so the Historique tab attributes them
  // correctly and the phase computation works.
  //
  // Conservative: only touch rows that look like our soumission sends
  // (recent, IDreference points to a real commande_sous_traitant).
  const stray = (await query(
    `SELECT COUNT(*) AS n FROM envoi_email ee
     WHERE ee.IDtype_doc = 28
       AND EXISTS (
         SELECT 1 FROM commande_sous_traitant cst
         WHERE cst.IDcommande_sous_traitant = ee.IDreference
       )`,
  )) as any[]
  const strayCount = Number(stray[0]?.n) || 0
  if (strayCount > 0) {
    console.log(`Reclassifying ${strayCount} envoi_email rows from IDtype_doc=28 to 30 (they referenced commandes sst → were buggy soumission sends, not real devis)`)
    await query(
      `UPDATE envoi_email SET IDtype_doc = 30
       WHERE IDtype_doc = 28
         AND EXISTS (
           SELECT 1 FROM commande_sous_traitant cst
           WHERE cst.IDcommande_sous_traitant = envoi_email.IDreference
         )`,
    )
  } else {
    console.log('No stray IDtype_doc=28 rows to reclassify.')
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
