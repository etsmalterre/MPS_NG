// Investigate what envoi_email.IDreference points to per IDtype_doc.
// Hypothesis: IDreference is polymorphic — type 13 = commande_sous_traitant,
// type 14 = expedition (or commande_client). Need to verify and stop
// surfacing the wrong rows under a sous-traitant commande's Historique.
import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function probeTable(name: string) {
  try {
    const r = (await query(`SELECT TOP 1 * FROM ${name}`)) as any[]
    return r.length > 0 ? Object.keys(r[0]) : []
  } catch { return null }
}

async function main() {
  console.log('\n=== Probe for tables that could host type_doc=14 events ===')
  for (const t of ['expedition', 'expeditions', 'bl_expedition', 'avis_expedition', 'ligne_expedition']) {
    const cols = await probeTable(t)
    console.log(`  ${cols ? '✓' : '✗'} ${t}${cols ? `: ${cols.slice(0,10).join(', ')}…` : ''}`)
  }

  console.log('\n=== commande 8586 — sous-traitant header ===')
  const cst = (await query(
    `SELECT IDcommande_sous_traitant, IDsous_traitant, date_commande, est_soldee
     FROM commande_sous_traitant WHERE IDcommande_sous_traitant = 8586`,
  )) as any[]
  for (const r of cst) console.log('  ', JSON.stringify(r))

  console.log('\n=== envoi_email rows for IDreference=8586 (all types) ===')
  const ee = (await query(
    `SELECT IDenvoi_email, DATE, adresse, société, IDreference, IDtype_doc, notes
     FROM envoi_email WHERE IDreference = 8586 ORDER BY DATE DESC`,
  )) as any[]
  const eeFixed = await fixEncoding(ee as any[], 'envoi_email', 'IDenvoi_email', ['adresse', 'société', 'notes'])
  for (const r of eeFixed) console.log('  ', JSON.stringify(r))

  // If `expedition` exists, see if 8586 is one of its PKs.
  const expCols = await probeTable('expedition')
  if (expCols) {
    console.log('\n=== expedition row for IDexpedition=8586 (if exists) ===')
    try {
      const e = (await query(`SELECT TOP 1 * FROM expedition WHERE IDexpedition = 8586`)) as any[]
      for (const r of e) console.log('  ', JSON.stringify(r))
      if (e.length === 0) console.log('  (no row)')
    } catch (err) { console.log('  err:', (err as Error).message) }
  }

  console.log('\n=== envoi_email type 14 — what tables do their IDreferences point to? ===')
  // Sample some type=14 rows and check existence in candidate tables.
  const sample14 = (await query(
    `SELECT TOP 5 IDenvoi_email, DATE, IDreference FROM envoi_email WHERE IDtype_doc = 14 ORDER BY DATE DESC`,
  )) as any[]
  for (const r of sample14) {
    const ref = Number(r.IDreference)
    const checks: string[] = []
    for (const [table, pk] of [
      ['commande_sous_traitant', 'IDcommande_sous_traitant'],
      ['commande_client', 'IDcommande_client'],
      ['expedition', 'IDexpedition'],
      ['commande_fil', 'IDcommande_fil'],
    ] as const) {
      try {
        const x = (await query(`SELECT TOP 1 ${pk} FROM ${table} WHERE ${pk} = ${ref}`)) as any[]
        if (x.length > 0) checks.push(`${table}✓`)
      } catch { /* table missing */ }
    }
    console.log(`  type14 row id=${r.IDenvoi_email} date=${r.DATE} IDreference=${ref} → ${checks.join(', ') || 'none'}`)
  }

  console.log('\n=== envoi_email type 13 — sanity (should all match commande_sous_traitant) ===')
  const sample13 = (await query(
    `SELECT TOP 5 IDenvoi_email, DATE, IDreference FROM envoi_email WHERE IDtype_doc = 13 ORDER BY DATE DESC`,
  )) as any[]
  for (const r of sample13) {
    const ref = Number(r.IDreference)
    const checks: string[] = []
    for (const [table, pk] of [
      ['commande_sous_traitant', 'IDcommande_sous_traitant'],
      ['commande_client', 'IDcommande_client'],
      ['expedition', 'IDexpedition'],
    ] as const) {
      try {
        const x = (await query(`SELECT TOP 1 ${pk} FROM ${table} WHERE ${pk} = ${ref}`)) as any[]
        if (x.length > 0) checks.push(`${table}✓`)
      } catch { /* */ }
    }
    console.log(`  type13 row id=${r.IDenvoi_email} date=${r.DATE} IDreference=${ref} → ${checks.join(', ') || 'none'}`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
