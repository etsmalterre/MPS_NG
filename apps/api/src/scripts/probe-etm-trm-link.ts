// Initial probe: does the legacy DB encode an ETM-TRM link on tricoteur
// sst commandes? Hypothesis: when ETM creates a commande_sous_traitant
// with sous-traitant = "Tricotage Malterre", a sibling commande_client
// is created on TRM's side. The link probably surfaces as either:
//   • commande_sous_traitant.IDcommande_client → pointer to the TRM-side
//     commande_client row;
//   • or a matching commande_client created at the same date with the
//     same line items + IDclient = ETM-as-client in client table.
// Probe both for commande 8582.

import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function dumpAll(table: string, pk: string, id: number) {
  console.log(`\n--- ${table} ${pk}=${id} ---`)
  try {
    const rows = await query<Record<string, unknown>>(`SELECT * FROM ${table} WHERE ${pk} = ${id}`)
    if (rows.length === 0) { console.log('  (no row)'); return }
    for (const [k, v] of Object.entries(rows[0])) {
      const display = v instanceof ArrayBuffer ? `<blob ${v.byteLength}b>` : v
      console.log(`  ${k.padEnd(28)} = ${display === '' ? "''" : display}`)
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`)
  }
}

async function main() {
  // 1) Check the sst commande's pointer columns for the TRM link.
  await dumpAll('commande_sous_traitant', 'IDcommande_sous_traitant', 8582)

  // 2) ligne_commande_sous_traitant for the line, looking at IDligne_commande_client.
  await dumpAll('ligne_commande_sous_traitant', 'IDligne_commande_sous_traitant', 8558)

  // 3) Try to find a sibling commande_client for the same date / quantite / partner.
  // First inspect a sample commande_client row to learn its shape.
  console.log('\n--- commande_client sample shape ---')
  const cc = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM commande_client`)
  if (cc.length > 0) console.log(Object.keys(cc[0]).join(', '))

  // 4) Search for ETM as a client in TRM's client table. ETM might appear
  // as a client row whose nom matches "Malterre" / "ETS Malterre".
  console.log('\n--- client rows matching Malterre ---')
  const clients = await query<{ IDclient: number; nom: string | null }>(
    `SELECT IDclient, nom FROM client WHERE nom LIKE '%Malterre%' OR nom LIKE '%MALTERRE%' OR nom LIKE '%ETM%' OR nom LIKE '%ETS%'`,
  )
  for (const c of clients) console.log(' ', c.IDclient, c.nom)

  // 5) Search for commande_client rows tied to those clients near commande 8582's
  // date (20260324). If the link is implicit (by metadata, not FK), the matching
  // commande_client should exist with date_commande = 20260324.
  console.log('\n--- commande_client rows around date 20260324 ---')
  const sameDate = await query<Record<string, unknown>>(
    `SELECT TOP 30 IDcommande_client, IDclient, date_commande, commentaire FROM commande_client
     WHERE date_commande = '20260324'`,
  )
  for (const r of sameDate) console.log(' ', r)

  // 6) Search the column lists of every commande-ish or ligne-ish table for any
  // column that might hold the back-pointer to commande_sous_traitant.
  console.log('\n--- ligne_commande_client sample (to spot any IDcommande_sous_traitant FK) ---')
  const lcc = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM ligne_commande_client`)
  if (lcc.length > 0) console.log(Object.keys(lcc[0]).join(', '))
}

main().catch((e) => { console.error(e); process.exit(1) })
