// Verify the IDcommande_ETM / IDligne_commande_ETM back-pointer.
// commande_client.IDcommande_ETM should = 8582 on the TRM-side sibling
// of ETM commande 8582. Same for IDligne_commande_ETM at line level.
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  // 1. Find the TRM commande_client that mirrors ETM commande 8582.
  console.log('--- commande_client WHERE IDcommande_ETM = 8582 ---')
  const sibling = await query<Record<string, unknown>>(
    `SELECT * FROM commande_client WHERE IDcommande_ETM = 8582`,
  )
  for (const r of sibling) {
    for (const [k, v] of Object.entries(r)) {
      const display = v instanceof ArrayBuffer ? `<blob ${v.byteLength}b>` : v
      console.log(`  ${k.padEnd(28)} = ${display === '' ? "''" : display}`)
    }
    console.log()
  }

  // 2. Same for the lines.
  console.log('--- ligne_commande_client WHERE IDligne_commande_ETM = 8558 ---')
  const lines = await query<Record<string, unknown>>(
    `SELECT * FROM ligne_commande_client WHERE IDligne_commande_ETM = 8558`,
  )
  for (const r of lines) {
    for (const [k, v] of Object.entries(r)) {
      const display = v instanceof ArrayBuffer ? `<blob ${v.byteLength}b>` : v
      console.log(`  ${k.padEnd(28)} = ${display === '' ? "''" : display}`)
    }
    console.log()
  }

  // 3. Confirm the client side knows about Tricotage Malterre's IDclient
  // (so the auto-creation logic can hard-code or look up the client = ETM).
  // From the previous probe: client 1 = "Ets Malterre". So TRM creates the
  // commande_client with IDclient = 1.
  // For ETM side: when its commande_sous_traitant has IDsous_traitant=1
  // (Tricotage Malterre), the sibling commande_client lives under IDclient=1
  // on the TRM ledger.
  //
  // Look at a few more sibling pairs to confirm the symmetric mapping.
  console.log('--- broad sample: 10 sst tricoteur commandes with their TRM sibling ---')
  const ssts = await query<{ IDcommande_sous_traitant: number; IDsous_traitant: number; date_commande: string }>(
    `SELECT TOP 15 IDcommande_sous_traitant, IDsous_traitant, date_commande
     FROM commande_sous_traitant
     WHERE IDsous_traitant = 1
     ORDER BY IDcommande_sous_traitant DESC`,
  )
  for (const sst of ssts) {
    const mirror = await query<{ IDcommande_client: number; IDclient: number; date_commande: string }>(
      `SELECT IDcommande_client, IDclient, date_commande FROM commande_client
       WHERE IDcommande_ETM = ${sst.IDcommande_sous_traitant}`,
    )
    console.log(
      `  sst ${sst.IDcommande_sous_traitant} (${sst.date_commande})`,
      mirror.length === 0
        ? '→ NO sibling commande_client'
        : `→ cc ${mirror[0].IDcommande_client} (client ${mirror[0].IDclient}, ${mirror[0].date_commande})`,
    )
  }

  // 4. Reverse direction: a TRM commande_client whose IDclient=1 (ETM) — does
  // it always have IDcommande_ETM set?
  console.log('\n--- commande_client WHERE IDclient = 1 (ETM-as-client) recent sample ---')
  const reverse = await query<{ IDcommande_client: number; IDcommande_ETM: number; date_commande: string; numero: string | null }>(
    `SELECT TOP 10 IDcommande_client, IDcommande_ETM, date_commande, numero FROM commande_client
     WHERE IDclient = 1 ORDER BY IDcommande_client DESC`,
  )
  for (const r of reverse) console.log(' ', r)
}

main().catch((e) => { console.error(e); process.exit(1) })
