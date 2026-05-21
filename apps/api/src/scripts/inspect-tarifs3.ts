import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Remaining tarif_TRM rows
  console.log('\n=== tarif_TRM rows 31..50 ===')
  const r = await query(`SELECT * FROM tarif_TRM WHERE IDtarif_TRM > 30 ORDER BY IDtarif_TRM`) as any[]
  for (const row of r) console.log(`  ${JSON.stringify(row)}`)

  // 2) Probe ennoblissage-pricing-shaped tables — that's the user's actual ask
  console.log('\n=== probe ennoblissage / ETM / sous-traitant pricing tables ===')
  const cand = [
    'tarif_ETM', 'tarif_ennoblissage', 'tarif_ennoblisseur',
    'cout_ennoblissage', 'cout_ennoblisseur', 'cout_ETM',
    'tarif_finition', 'finition_tarif',
    'tarif_sst', 'tarif_sous_traitant',
    'asso_tarif', 'asso_tarif_ETM',
    'tarif_matiere', 'tarif_coloris',
    'ligne_tarif', 'tarif_ligne',
    'tarif_TRM_combinaison', 'tarif_combinaison',
    'fiche_tarif', 'fiche_tarif_ETM',
    'matel', 'matelassage', 'matelas',
  ]
  for (const t of cand) {
    try {
      const rows = await query(`SELECT TOP 5 * FROM ${t}`) as any[]
      console.log(`\n  ✓ ${t} (${rows.length} sample rows)`)
      if (rows.length > 0) console.log(`    keys: ${Object.keys(rows[0]).join(', ')}`)
      for (const row of rows) console.log(`    ${JSON.stringify(row)}`)
    } catch (e) {}
  }

  // 3) Search across all known catalogs for the literal string "matel"
  console.log('\n=== text-grep "matel" across likely text columns ===')
  const textProbes = [
    `SELECT TOP 5 IDref_fini, reference, designation FROM ref_fini WHERE designation LIKE '%matel%' OR reference LIKE '%matel%' OR finition LIKE '%matel%'`,
    `SELECT TOP 5 IDtype_doc, nom FROM type_doc WHERE nom LIKE '%matel%'`,
    `SELECT TOP 5 IDtype_sst, TYPE FROM type_sst WHERE TYPE LIKE '%matel%'`,
  ]
  for (const q of textProbes) {
    try {
      const rows = await query(q) as any[]
      if (rows.length > 0) {
        console.log(`  query: ${q.split(' FROM ')[1].split(' WHERE ')[0]}`)
        for (const r of rows) console.log(`    ${JSON.stringify(r)}`)
      }
    } catch (e) {}
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
