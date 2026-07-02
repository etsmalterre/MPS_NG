// One-off probe: sst commande 8500 soumission shows ref client 65511019000,
// but Gestion Client shows 65511000800 for ref 1732 / Blanc 54508/1.
// Hypothesis: multiple designation_client rows for the same (client, ref_fini),
// distinguished per-coloris via ref_client_colori — dcMap overwrites.
import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  // 1) lines of sst commande 8500 (type=2 fini)
  const lines = (await query(
    `SELECT IDligne_commande_sous_traitant, IDreference, IDColoris, type, quantite
     FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = 8500`,
  )) as any[]
  console.log('=== lcsst of 8500 ===')
  for (const r of lines) console.log(' ', JSON.stringify(r))

  // 2) ref_fini for those refs
  const refIds = [...new Set(lines.map((l) => Number(l.IDreference)).filter((x) => x > 0))]
  if (refIds.length) {
    const rf = (await query(
      `SELECT IDref_fini, reference, avec_teinture FROM ref_fini WHERE IDref_fini IN (${refIds.join(',')})`,
    )) as any[]
    console.log('\n=== ref_fini ===')
    for (const r of rf) console.log(' ', JSON.stringify(r))
  }

  // 3) find the ref_fini whose reference is '1732'
  const rf1732 = (await query(
    `SELECT IDref_fini, reference, avec_teinture FROM ref_fini WHERE reference = '1732'`,
  )) as any[]
  console.log('\n=== ref_fini 1732 ===')
  for (const r of rf1732) console.log(' ', JSON.stringify(r))
  const idRef = Number(rf1732[0]?.IDref_fini) || 0

  // 4) all designation_client rows for that ref (all clients)
  if (idRef > 0) {
    const dc = (await query(
      `SELECT * FROM designation_client WHERE IDref_fini = ${idRef}`,
    )) as any[]
    const dcFixed = await fixEncoding(dc as any[], 'designation_client', 'IDdesignation_client', ['designation'])
    console.log('\n=== designation_client for ref_fini', idRef, '===')
    for (const r of dcFixed) console.log(' ', JSON.stringify(r))

    // 5) ref_client_colori per designation
    const dIds = dcFixed.map((r: any) => Number(r.IDdesignation_client)).filter((x) => x > 0)
    if (dIds.length) {
      const rcc = (await query(
        `SELECT * FROM ref_client_colori WHERE IDdesignation_client IN (${dIds.join(',')})`,
      )) as any[]
      console.log('\n=== ref_client_colori for those designations ===')
      for (const r of rcc) console.log(' ', JSON.stringify(r))
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
