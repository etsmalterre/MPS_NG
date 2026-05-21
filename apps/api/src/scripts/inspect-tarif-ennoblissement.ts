import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  // 1) tranche_tarif_ennoblissement structure + sample
  console.log('\n=== tranche_tarif_ennoblissement (TOP 5 + columns) ===')
  const r1 = await query(`SELECT TOP 5 * FROM tranche_tarif_ennoblissement`) as any[]
  if (r1.length > 0) console.log('keys:', Object.keys(r1[0]))
  for (const r of r1) console.log(' ', JSON.stringify(r))

  // 2) traitement table
  console.log('\n=== traitement (TOP 10) ===')
  const r2 = await query(`SELECT TOP 30 * FROM traitement`) as any[]
  if (r2.length > 0) console.log('keys:', Object.keys(r2[0]))
  const fixed2 = await fixEncoding(r2, 'traitement', 'IDtraitement', ['nom', 'description'].filter((k) => k in r2[0]))
  for (const r of fixed2 as any[]) console.log(' ', JSON.stringify(r))

  // 3) Lookup the two hardcoded treatment ids 285 and 302
  console.log('\n=== traitement 285 / 302 (the "Lavage" treatments) ===')
  const r3 = await query(`SELECT * FROM traitement WHERE IDtraitement IN (285, 302)`) as any[]
  const fixed3 = await fixEncoding(r3, 'traitement', 'IDtraitement', ['nom'])
  for (const r of fixed3) console.log(' ', JSON.stringify(r))

  // 4) traitement_ref_fini structure
  console.log('\n=== traitement_ref_fini (TOP 5 + columns) ===')
  const r4 = await query(`SELECT TOP 5 * FROM traitement_ref_fini`) as any[]
  if (r4.length > 0) console.log('keys:', Object.keys(r4[0]))
  for (const r of r4) console.log(' ', JSON.stringify(r))

  // 5) teinture table
  console.log('\n=== teinture (TOP 5 + columns) ===')
  const r5 = await query(`SELECT TOP 5 * FROM teinture`) as any[]
  if (r5.length > 0) console.log('keys:', Object.keys(r5[0]))

  // 6) ref_fini_colori.IDteinture confirmation
  console.log('\n=== ref_fini_colori keys ===')
  const r6 = await query(`SELECT TOP 1 * FROM ref_fini_colori`) as any[]
  if (r6.length > 0) console.log('keys:', Object.keys(r6[0]))

  // 7) Stats per sous-traitant on tranche_tarif_ennoblissement
  console.log('\n=== tranche_tarif_ennoblissement row counts by sous-traitant ===')
  const r7 = await query(`SELECT IDsous_traitant, COUNT(*) AS n FROM tranche_tarif_ennoblissement GROUP BY IDsous_traitant ORDER BY n DESC`) as any[]
  for (const r of r7) console.log(' ', JSON.stringify(r))

  // 8) Sample for MATEL with a known coloris dye id
  console.log('\n=== sample MATEL tranches with their ListeTraitements / quantite range / prix ===')
  const r8 = await query(`SELECT TOP 8 IDtranche_tarif_ennoblissement, IDsous_traitant, IDteinture, IDtraitement, ListeTraitements, quantite_mini, quantite_maxi, prix FROM tranche_tarif_ennoblissement WHERE IDsous_traitant = 9 ORDER BY IDtranche_tarif_ennoblissement DESC`) as any[]
  for (const r of r8) console.log(' ', JSON.stringify(r))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
