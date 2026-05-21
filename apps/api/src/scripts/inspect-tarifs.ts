import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) List all tables whose name contains "tarif"
  console.log('\n=== probe tarif-related tables (TOP 1 row each, columns only) ===')
  const candidates = [
    'tarif',
    'tarif_TRM',
    'tarif_ETM',
    'tarif_sst',
    'tarif_sous_traitant',
    'tarif_ennoblisseur',
    'tarif_confection',
    'tarif_client',
    'fiche_tarif',
    'tarif_combinaison',
    'combinaison_tarif',
    'tarif_matiere',
    'tarif_finition',
    'cout_sst',
    'cout_sous_traitant',
    'cout_ennoblisseur',
    'cout_ennob',
    'ennoblisseur_tarif',
  ]
  for (const t of candidates) {
    try {
      const r = await query(`SELECT TOP 1 * FROM ${t}`) as any[]
      console.log(`\n  ✓ ${t} — ${r.length} sample row`)
      if (r.length > 0) {
        console.log(`    keys: ${Object.keys(r[0]).join(', ')}`)
      }
    } catch (e) {
      // table doesn't exist — silent
    }
  }

  // 2) Sous_traitant table — does it carry a "matel" / matelassage flag or
  //    a coefficient column we should know about?
  console.log('\n=== sous_traitant table — columns + a few sample rows ===')
  try {
    const r = await query(`SELECT TOP 3 * FROM sous_traitant`) as any[]
    if (r.length > 0) {
      console.log(`  keys: ${Object.keys(r[0]).join(', ')}`)
      for (const row of r) {
        const interesting: any = {}
        for (const k of Object.keys(row)) {
          if (/coeff|matel|tarif|cout|prix|matie/i.test(k)) interesting[k] = row[k]
        }
        console.log(`  row ${row.IDsous_traitant} (${row.nom}): ${JSON.stringify(interesting)}`)
      }
    }
  } catch (e) { console.log('err:', (e as Error).message) }

  // 3) type_sst — different categories of sous-traitant; the algorithm
  //    likely branches on this
  console.log('\n=== type_sst table — all rows ===')
  try {
    const r = await query(`SELECT * FROM type_sst ORDER BY IDtype_sst`) as any[]
    console.log(r)
  } catch (e) { console.log('err:', (e as Error).message) }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
