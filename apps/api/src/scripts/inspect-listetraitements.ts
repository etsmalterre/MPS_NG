import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Sample non-empty ListeTraitements to know the format
  console.log('\n=== non-empty ListeTraitements samples ===')
  const r = await query(`SELECT TOP 30 IDtranche_tarif_ennoblissement, IDsous_traitant, IDteinture, ListeTraitements, quantite_mini, quantite_maxi, prix FROM tranche_tarif_ennoblissement WHERE ListeTraitements <> '' ORDER BY IDtranche_tarif_ennoblissement DESC`) as any[]
  for (const row of r) console.log(' ', JSON.stringify(row))

  // 2) Distinct ListeTraitements patterns
  console.log('\n=== distinct ListeTraitements formats ===')
  const r2 = await query(`SELECT DISTINCT ListeTraitements FROM tranche_tarif_ennoblissement WHERE ListeTraitements <> ''`) as any[]
  for (const row of r2.slice(0, 40)) console.log(`  "${row.ListeTraitements}"`)
  console.log(`  (${r2.length} distinct values)`)

  // 3) ref_fini_colori schema
  console.log('\n=== ref_fini_colori (TOP 1 keys + sample) ===')
  const r3 = await query(`SELECT TOP 1 * FROM ref_fini_colori`) as any[]
  if (r3.length > 0) {
    console.log('keys:', Object.keys(r3[0]))
    console.log(' ', JSON.stringify(r3[0]))
  }
  const r3b = await query(`SELECT TOP 5 IDref_fini_colori, IDref_fini, reference, IDteinture FROM ref_fini_colori WHERE IDteinture > 0`) as any[]
  for (const row of r3b) console.log(' ', JSON.stringify(row))

  // 4) ref_fini.avec_teinture distribution
  console.log('\n=== ref_fini.avec_teinture distribution ===')
  const r4 = await query(`SELECT avec_teinture, COUNT(*) AS n FROM ref_fini GROUP BY avec_teinture`) as any[]
  for (const row of r4) console.log(' ', JSON.stringify(row))

  // 5) teinture rows
  console.log('\n=== teinture (all rows) ===')
  const r5 = await query(`SELECT * FROM teinture`) as any[]
  const fixed = await fixEncoding(r5, 'teinture', 'IDteinture', ['designation_interne', 'designation_externe'])
  for (const row of fixed) console.log(' ', JSON.stringify(row))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
