// Phase-distribution sanity check for the new computed-phase model.
// Counts how many open commandes fall into each derived phase.
import { query } from '../lib/hfsql-auto.js'

const TYPE_DOC_SOUMISSION_LOT_CLIENT = 28

async function main() {
  console.log('\n=== Phase distribution probe ===')

  const totalRows = await query<{ n: number; est_soldee: number }>(
    `SELECT est_soldee, COUNT(*) AS n FROM commande_sous_traitant GROUP BY est_soldee`,
  )
  for (const r of totalRows) console.log(`  est_soldee=${r.est_soldee}: ${r.n}`)

  const repriseRows = await query<{ IDcommande_sous_traitant: number }>(
    `SELECT DISTINCT lcs.IDcommande_sous_traitant
     FROM stock_fini sf
     JOIN ligne_commande_sous_traitant lcs
       ON lcs.IDligne_commande_sous_traitant = sf.IDref_commande_source
     JOIN commande_sous_traitant cst
       ON cst.IDcommande_sous_traitant = lcs.IDcommande_sous_traitant
     WHERE sf.IDetat_stock_fini = 2 AND cst.est_soldee = 0`,
  )
  const soumisRows = await query<{ IDreference: number }>(
    `SELECT DISTINCT ee.IDreference
     FROM envoi_email ee
     JOIN commande_sous_traitant cst
       ON cst.IDcommande_sous_traitant = ee.IDreference
     WHERE ee.IDtype_doc = ${TYPE_DOC_SOUMISSION_LOT_CLIENT}
       AND (ee.invalidé = 0 OR ee.invalidé IS NULL)
       AND cst.est_soldee = 0`,
  )
  const receptionRows = await query<{ IDcommande_sous_traitant: number }>(
    `SELECT DISTINCT lcs.IDcommande_sous_traitant
     FROM stock_fini sf
     JOIN ligne_commande_sous_traitant lcs
       ON lcs.IDligne_commande_sous_traitant = sf.IDref_commande_source
     JOIN commande_sous_traitant cst
       ON cst.IDcommande_sous_traitant = lcs.IDcommande_sous_traitant
     WHERE cst.est_soldee = 0`,
  )
  const allOpenRows = await query<{ IDcommande_sous_traitant: number }>(
    `SELECT IDcommande_sous_traitant FROM commande_sous_traitant WHERE est_soldee = 0`,
  )

  const repriseSet = new Set(repriseRows.map((r) => Number(r.IDcommande_sous_traitant)))
  const soumisSetRaw = new Set(soumisRows.map((r) => Number(r.IDreference)))
  const receptionSetRaw = new Set(receptionRows.map((r) => Number(r.IDcommande_sous_traitant)))
  const soumisSet = new Set(Array.from(soumisSetRaw).filter((id) => !repriseSet.has(id)))
  const controleSet = new Set(
    Array.from(receptionSetRaw).filter((id) => !repriseSet.has(id) && !soumisSet.has(id)),
  )
  const allOpenIds = allOpenRows.map((r) => Number(r.IDcommande_sous_traitant))
  const enCoursIds = allOpenIds.filter((id) =>
    !repriseSet.has(id) && !soumisSet.has(id) && !controleSet.has(id),
  )

  console.log('\n=== Open commandes by phase ===')
  console.log(`  en_reprise:  ${repriseSet.size}`)
  console.log(`  soumis:      ${soumisSet.size}`)
  console.log(`  en_controle: ${controleSet.size}`)
  console.log(`  en_cours:    ${enCoursIds.length}`)
  console.log(`  total open:  ${allOpenIds.length}`)
  console.log(`  (sanity: ${repriseSet.size + soumisSet.size + controleSet.size + enCoursIds.length} should equal total open)`)

  if (repriseSet.size > 0) {
    console.log('\n  sample en_reprise IDs:', Array.from(repriseSet).slice(0, 5).join(', '))
  }
  if (soumisSet.size > 0) {
    console.log('  sample soumis IDs:    ', Array.from(soumisSet).slice(0, 5).join(', '))
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
