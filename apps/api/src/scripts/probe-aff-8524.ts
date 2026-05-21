import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  // sst 8524 line 8500 has 2 affectation rows pointing to cc_lines 12397, 12398.
  // What are those cc lines? Are they on the same commande_client?
  console.log('=== sst 8524 — affectation context ===')
  const mirror = await query<Record<string, unknown>>(
    `SELECT IDcommande_client, numero, ref_client FROM commande_client WHERE IDcommande_ETM = 8524`,
  )
  console.log('mirror cc:', mirror)

  const lines = await query<Record<string, unknown>>(
    `SELECT IDligne_commande_client, IDcommande_client, IDligne_commande_ETM, TYPE, IDreference, IDcolori, quantite, prix
     FROM ligne_commande_client
     WHERE IDligne_commande_client IN (12397, 12398)`,
  )
  console.log('\ncc lines 12397, 12398:')
  for (const l of lines) console.log(' ', l)

  // Resolve the IDreference of each cc line — is it ref_fil or ref_ecru?
  console.log('\n=== Lookup each cc line\'s IDreference in ref_fil & ref_ecru ===')
  for (const l of lines) {
    const refId = Number((l as any).IDreference) || 0
    const inFil = await query<{ reference: string }>(`SELECT reference FROM ref_fil WHERE IDref_fil = ${refId}`)
    const inEcru = await query<{ reference: string }>(`SELECT reference FROM ref_ecru WHERE IDref_ecru = ${refId}`)
    console.log(`  cc line ${(l as any).IDligne_commande_client}: IDreference=${refId} → ref_fil="${inFil[0]?.reference ?? 'no'}", ref_ecru="${inEcru[0]?.reference ?? 'no'}"`)
  }

  // Also list ALL cc lines for this commande_client
  if (mirror.length > 0) {
    const ccId = Number((mirror[0] as any).IDcommande_client)
    console.log(`\n=== All lines on cc ${ccId} ===`)
    const all = await query<Record<string, unknown>>(
      `SELECT IDligne_commande_client, IDligne_commande_ETM, TYPE, IDreference, IDcolori, quantite, prix
       FROM ligne_commande_client
       WHERE IDcommande_client = ${ccId}
       ORDER BY IDligne_commande_client`,
    )
    for (const r of all) console.log(' ', r)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
