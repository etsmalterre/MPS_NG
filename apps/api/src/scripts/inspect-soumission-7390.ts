// Investigate commande 7390 — user reports the legacy app shows a
// soumission sent 16/04/2025 for lot 105741 + approval state.
// Goal: locate where these signals live in HFSQL.
import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function probeTable(name: string) {
  try {
    const r = (await query(`SELECT TOP 1 * FROM ${name}`)) as any[]
    return r.length > 0 ? Object.keys(r[0]) : []
  } catch { return null }
}

async function main() {
  console.log('\n=== commande_sous_traitant 7390 header ===')
  const cst = (await query(
    `SELECT IDcommande_sous_traitant, IDsous_traitant, date_commande, est_soldee
     FROM commande_sous_traitant WHERE IDcommande_sous_traitant = 7390`,
  )) as any[]
  for (const r of cst) console.log('  ', JSON.stringify(r))

  console.log('\n=== envoi_email for IDreference=7390 (all types) ===')
  const ee = (await query(
    `SELECT IDenvoi_email, DATE, adresse, société, IDtype_doc, notes
     FROM envoi_email WHERE IDreference = 7390 ORDER BY DATE DESC`,
  )) as any[]
  const eeFixed = await fixEncoding(ee as any[], 'envoi_email', 'IDenvoi_email', ['adresse', 'société', 'notes'])
  for (const r of eeFixed) console.log('  ', JSON.stringify(r))

  console.log('\n=== ligne_commande_sous_traitant of 7390 ===')
  const lines = (await query(
    `SELECT IDligne_commande_sous_traitant, IDcommande_sous_traitant, IDreference, IDColoris, sstatut, date_livraison
     FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = 7390`,
  )) as any[]
  for (const r of lines) console.log('  ', JSON.stringify(r))

  const lineIds = lines.map((l: any) => Number(l.IDligne_commande_sous_traitant))

  if (lineIds.length > 0) {
    console.log('\n=== stock_fini for those lines (lot 105741?) ===')
    const sf = (await query(
      `SELECT IDstock_fini, numero, lot, poids, metrage, IDref_fini, IDColoris, IDetat_stock_fini,
              IDligne_commande_client, IDref_commande_source
       FROM stock_fini WHERE IDref_commande_source IN (${lineIds.join(',')})`,
    )) as any[]
    const sfFixed = await fixEncoding(sf as any[], 'stock_fini', 'IDstock_fini', ['numero', 'lot'])
    for (const r of sfFixed) console.log('  ', JSON.stringify(r))
  }

  console.log('\n=== envoi_email rows mentioning lot 105741 anywhere ===')
  const byLot = (await query(
    `SELECT TOP 20 IDenvoi_email, DATE, adresse, IDreference, IDtype_doc, notes
     FROM envoi_email WHERE notes LIKE '%105741%' OR adresse LIKE '%105741%'`,
  )) as any[]
  for (const r of byLot) console.log('  ', JSON.stringify(r))

  console.log('\n=== envoi_email rows for type_doc=15 (étude soumission) referencing 7390 OR around 16/04/2025 ===')
  const t15 = (await query(
    `SELECT TOP 20 IDenvoi_email, DATE, adresse, IDreference, IDtype_doc, notes
     FROM envoi_email
     WHERE IDtype_doc = 15
       AND (IDreference = 7390 OR DATE LIKE '2025-04-16%')`,
  )) as any[]
  for (const r of t15) console.log('  ', JSON.stringify(r))

  // Look for any table with "soumis" / "approuve" / "validation" / "accept" in its name.
  console.log('\n=== Probe tables that might track soumission approval ===')
  for (const t of [
    'soumission', 'soumissions', 'soumission_etude_coloris',
    'soumission_lot', 'soumissions_lot', 'soumission_lot_client',
    'approbation', 'approbations', 'validation', 'validations',
    'acceptation', 'acceptations', 'accepted_lot',
    'reponse_soumission', 'retour_soumission', 'reception_soumission',
  ]) {
    const cols = await probeTable(t)
    console.log(`  ${cols ? '✓' : '✗'} ${t}${cols ? `: ${cols.join(', ')}` : ''}`)
  }

  // Look at the soumission table (used by etudes-coloris.ts).
  console.log('\n=== soumission table — sample rows for commande 7390 / lot 105741 ===')
  for (const candidate of ['soumission', 'soumissions']) {
    try {
      const cols = await probeTable(candidate)
      if (!cols) continue
      // Look for any column that could match commande or lot
      const lotCol = cols.find((c) => c.toLowerCase().includes('lot'))
      const refCol = cols.find((c) => c.toLowerCase().includes('reference') || c.toLowerCase().includes('idcommande'))
      console.log(`  ${candidate}: cols=${cols.join(', ')}`)
      if (lotCol) {
        const r = (await query(`SELECT TOP 5 * FROM ${candidate} WHERE ${lotCol} = '105741' OR ${lotCol} = 105741`)) as any[]
        for (const row of r) console.log('  by-lot:', JSON.stringify(row))
      }
      const r2 = (await query(`SELECT TOP 5 * FROM ${candidate} WHERE date_soum LIKE '2025-04-16%' OR DATE LIKE '2025-04-16%' OR date_envoi LIKE '2025-04-16%'`).catch(() => Promise.resolve([] as any[]))) as any[]
      for (const row of r2) console.log('  by-date:', JSON.stringify(row))
    } catch { /* */ }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
