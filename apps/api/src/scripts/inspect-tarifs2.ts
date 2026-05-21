import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Dump tarif_TRM rows
  console.log('\n=== tarif_TRM (all rows) ===')
  try {
    const r = await query(`SELECT * FROM tarif_TRM ORDER BY IDtarif_TRM`) as any[]
    console.log(`row count: ${r.length}`)
    for (const row of r.slice(0, 30)) console.log(`  ${JSON.stringify(row)}`)
  } catch (e) { console.log('err:', (e as Error).message) }

  // 2) Probe likely related tables — "_ligne" or "combinaison" or "detail"
  console.log('\n=== probe related-pricing tables ===')
  const candidates = [
    'ligne_tarif_TRM',
    'tarif_TRM_ligne',
    'detail_tarif_TRM',
    'tarif_TRM_detail',
    'tarif_TRM_combinaison',
    'combinaison_tarif_TRM',
    'tarif_TRM_couleur',
    'tarif_TRM_matiere',
    'tarif_TRM_finition',
    'tarif_TRM_quantite',
    'tarif_TRM_metrage',
    'tarif_TRM_poids',
  ]
  for (const t of candidates) {
    try {
      const r = await query(`SELECT TOP 2 * FROM ${t}`) as any[]
      if (r.length > 0) {
        console.log(`\n  ✓ ${t}`)
        console.log(`    keys: ${Object.keys(r[0]).join(', ')}`)
        for (const row of r) console.log(`    ${JSON.stringify(row)}`)
      } else {
        console.log(`\n  ✓ ${t} (empty)`)
        // try to get columns from an INSERT-error trick
      }
    } catch (e) {}
  }

  // 3) Look at how column names of all tables match "tarif"
  console.log('\n=== HSQL tables containing "tarif" (via system catalog if available) ===')
  // HFSQL has a HListeFichier; via ODBC we can sometimes query system.
  // Try SQLTables-like introspection by querying a list of known tables
  // and seeing which exist.
  const moreTables = [
    'tarif',
    'tarif_client',
    'tarif_ETM',
    'tarif_sst',
    'tarif_sous_traitant',
    'tarif_finition',
    'tarif_couleur',
    'tarif_ennoblissage',
    'tarif_dyeing',
    'asso_tarif_TRM',
    'asso_tarif',
  ]
  for (const t of moreTables) {
    try {
      const r = await query(`SELECT TOP 1 * FROM ${t}`) as any[]
      console.log(`  ✓ ${t} — keys: ${r.length > 0 ? Object.keys(r[0]).join(', ') : '(empty)'}`)
    } catch (e) {}
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
