// One-off introspection round 3:
//   1. fil_non_facturé format across ALL designation_client rows
//   2. ref_fil keys (label column for Fil facturé list)
//   3. ref_fini_colori / colori_ecru keys + parent FK columns
//   4. TM refs: designation_client rows with IDref_ecru>0 — tombe_metier flag on those ecrus?
import { query } from '../lib/hfsql-auto.js'

async function main() {
  const rows = (await query(`SELECT * FROM designation_client`)) as any[]
  console.log(`designation_client total: ${rows.length}`)
  const filKey = Object.keys(rows[0]).find((k) => /^fil/i.test(k)) as string
  console.log('fil key resolved as:', JSON.stringify(filKey))
  const withFil = rows.filter((r) => String(r[filKey] ?? '').trim() !== '')
  console.log(`rows with ${filKey}: ${withFil.length}`)
  for (const r of withFil.slice(0, 12)) console.log(' ', JSON.stringify({ id: r.IDdesignation_client, fil: r[filKey] }))

  console.log('\n=== ref_fil keys ===')
  const rf = (await query(`SELECT TOP 1 * FROM ref_fil`)) as any[]
  if (rf.length) console.log(Object.keys(rf[0]).join(', '))

  console.log('\n=== ref_fini_colori keys ===')
  const rfc = (await query(`SELECT TOP 1 * FROM ref_fini_colori`)) as any[]
  if (rfc.length) console.log(Object.keys(rfc[0]).join(', '))

  console.log('\n=== colori_ecru keys ===')
  const ce = (await query(`SELECT TOP 1 * FROM colori_ecru`)) as any[]
  if (ce.length) console.log(Object.keys(ce[0]).join(', '))

  console.log('\n=== designation_client with IDref_ecru>0 → tombe_metier? ===')
  const tmDesigs = rows.filter((r) => Number(r.IDref_ecru) > 0).slice(0, 10)
  console.log(`count with IDref_ecru>0: ${rows.filter((r) => Number(r.IDref_ecru) > 0).length}`)
  if (tmDesigs.length) {
    const ids = [...new Set(tmDesigs.map((r) => Number(r.IDref_ecru)))]
    const ecrus = (await query(`SELECT IDref_ecru, reference, designation, tombe_metier FROM ref_ecru WHERE IDref_ecru IN (${ids.join(',')})`)) as any[]
    for (const e of ecrus) console.log(' ', JSON.stringify(e))
  }
  const tmCount = (await query(`SELECT COUNT(*) AS n FROM ref_ecru WHERE tombe_metier = 1`)) as any[]
  console.log('ref_ecru tombe_metier=1 count:', JSON.stringify(tmCount))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
