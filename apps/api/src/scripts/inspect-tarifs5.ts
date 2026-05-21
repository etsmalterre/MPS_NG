import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Probe per-sous-traitant tariff tables
  console.log('\n=== probe per-sous-traitant tariff tables ===')
  const cand = [
    'tarif_sst_finition',
    'tarif_sous_traitant_finition',
    'asso_sous_traitant_finition',
    'asso_sst_finition',
    'finition_sst',
    'finition_sous_traitant',
    'cout_finition_sst',
    'cout_finition_sous_traitant',
    'cout_finition',
    'asso_cout_finition',
    'asso_finition_cout',
    'asso_finition_tarif',
    'asso_finition_sst',
    'tarif_ennoblissage_sst',
    'tarif_ennob_sst',
    'tarif_ennob_finition',
    'finition_tarif_sst',
    'finition_tarif',
    'cout_sst_finition',
    'cout_ennoblissage',
    'cout_sst',
    'cout_sous_traitant',
    // Per ref_fini sous-traitant tariffs
    'tarif_ref_fini_sst',
    'asso_ref_fini_sst',
    'asso_ref_fini_sous_traitant',
    'asso_ref_fini_cout',
    // contrat
    'contrat_tarif',
    'contrat_sst',
    // bordereau
    'bordereau_cout',
    'bordereau_tarif',
  ]
  for (const t of cand) {
    try {
      const rows = await query(`SELECT TOP 3 * FROM ${t}`) as any[]
      console.log(`\n  ✓ ${t} (${rows.length} sample rows)`)
      if (rows.length > 0) console.log(`    keys: ${Object.keys(rows[0]).join(', ')}`)
      for (const r of rows) console.log(`    ${JSON.stringify(r)}`)
    } catch (e) {}
  }

  // 2) ref_fini finition column — see all distinct values
  console.log('\n=== distinct ref_fini.finition values (after fix for encoding) ===')
  try {
    const rows = await query(`SELECT DISTINCT CONVERT(finition USING 'UTF-8') AS finition FROM ref_fini WHERE finition IS NOT NULL AND finition <> ''`) as any[]
    for (const r of rows.slice(0, 50)) console.log(`  ${JSON.stringify(r.finition)}`)
    console.log(`  (showing first 50 of ${rows.length})`)
  } catch (e) { console.log('  err:', (e as Error).message) }

  // 3) Look for any "matel" in ref_fini.designation or designation_client
  console.log('\n=== ref_fini rows with "matel" anywhere ===')
  try {
    const rows = await query(`SELECT IDref_fini, reference, CONVERT(designation USING 'UTF-8') AS designation, CONVERT(finition USING 'UTF-8') AS finition FROM ref_fini WHERE designation LIKE '%matel%' OR finition LIKE '%matel%' OR reference LIKE '%matel%'`) as any[]
    console.log(`  ${rows.length} rows`)
    for (const r of rows.slice(0, 30)) console.log(`  ${JSON.stringify(r)}`)
  } catch (e) { console.log('  err:', (e as Error).message) }

  // 4) designation_client — there's an IDdesignation_client on tarif_coloris
  console.log('\n=== designation_client table ===')
  try {
    const rows = await query(`SELECT TOP 10 * FROM designation_client`) as any[]
    console.log(`row count: ${rows.length}`)
    if (rows.length > 0) console.log(`keys: ${Object.keys(rows[0]).join(', ')}`)
    for (const r of rows) console.log(`  ${JSON.stringify(r)}`)
  } catch (e) { console.log('  err:', (e as Error).message) }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
