import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Try a wide net of likely table names
  console.log('\n=== probe a wide net of candidate tables ===')
  const cand = [
    // ennoblissage core
    'tarif_ennob', 'ennob_tarif', 'tarif_ENN', 'tarif_finition',
    'fiche_tarif_ennob', 'fiche_ennob', 'fiche_tarif',
    // sous-traitant-specific
    'tarif_sst', 'sst_tarif', 'tarif_sous_traitant',
    'cout_sst', 'cout_sous_traitant',
    'asso_sst_tarif', 'asso_sous_traitant_tarif',
    // by-couleur tiers
    'tranche_tarifaire', 'tranche_tarif',
    // matelassage hint
    'matelassage', 'matel', 'matiere_matelassage',
    // catalog
    'ref_catalogue', 'catalogue',
    // tarif_TRM relatives
    'tarif_TRM_ligne', 'tarif_TRM_combinaison',
    // combinaisons
    'combinaison_tarif', 'tarif_combinaison',
    'combinaison_ETM', 'combinaison_TRM',
    // ennoblisseur by ref
    'tarif_ref_fini', 'tarif_ref_fini_colori',
  ]
  for (const t of cand) {
    try {
      const rows = await query(`SELECT TOP 3 * FROM ${t}`) as any[]
      console.log(`\n  ✓ ${t} (${rows.length} sample rows)`)
      if (rows.length > 0) console.log(`    keys: ${Object.keys(rows[0]).join(', ')}`)
      for (const r of rows) console.log(`    ${JSON.stringify(r)}`)
    } catch (e) {}
  }

  // 2) Check ref_catalogue since tarif_coloris references it
  console.log('\n=== ref_catalogue (the IDRef_Catalogue from tarif_coloris) ===')
  try {
    const rows = await query(`SELECT TOP 10 * FROM ref_catalogue`) as any[]
    console.log(`row count: ${rows.length}`)
    if (rows.length > 0) console.log(`keys: ${Object.keys(rows[0]).join(', ')}`)
    for (const r of rows) console.log(`  ${JSON.stringify(r)}`)
  } catch (e) { console.log('  err:', (e as Error).message) }

  // 3) Look at all distinct values for sstatut on ligne_commande_sous_traitant
  //    to map the workflow states (matel might be encoded as a status)
  console.log('\n=== distinct ligne_commande_sous_traitant.sstatut values ===')
  try {
    const rows = await query(`SELECT DISTINCT sstatut FROM ligne_commande_sous_traitant`) as any[]
    for (const r of rows) console.log(`  ${JSON.stringify(r)}`)
  } catch (e) { console.log('  err:', (e as Error).message) }

  // 4) Look at type_doc — there may be a "matel" doc type that flips a coefficient
  console.log('\n=== type_doc rows mentioning matel or coeff ===')
  try {
    const rows = await query(`SELECT * FROM type_doc`) as any[]
    for (const r of rows) {
      if (/matel|coeff|tarif/i.test(r.nom ?? '')) console.log(`  ${JSON.stringify(r)}`)
    }
  } catch (e) { console.log('  err:', (e as Error).message) }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
