// End-to-end verification of the ETM↔TRM bridge.
// Runs every step from the plan's Verification section, then cleans up.
// Use `tsx src/scripts/verify-trm-bridge.ts` from apps/api.
//
// NOTE: this inserts real rows into the shared HFSQL DB. Cleanup at the
// end removes them. Read-side regression (sst 8544 line 8520) is read-only.

import 'dotenv/config'
import { query } from '../lib/hfsql.js'

const API = 'http://localhost:3002/api'

async function http(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed: any
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
  return { status: res.status, body: parsed }
}

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

async function main() {
  // 0. Snapshot MAX(numero) before.
  const maxBefore = await query<{ m: number }>(`SELECT MAX(numero) AS m FROM commande_client WHERE IDsociete = 2`)
  const numeroBefore = Number(maxBefore[0]?.m) || 0
  console.log(`MAX(numero) for TRM before: ${numeroBefore}`)

  console.log('\n=== Step 2: Create tricoteur sst ===')
  const create = await http('POST', '/commandes-sous-traitant', {
    IDsous_traitant: 1, // Tricotage Malterre
    date_commande: '20260520',
    IDadresse_sous_traitant: 777,
    IDadresse_livraison: 777,
  })
  assert(create.status === 201, `POST returned ${create.status}`)
  const newSstId = create.body.IDcommande_sous_traitant
  console.log(`  new sst id: ${newSstId}, mirror_status: ${create.body.mirror_status}`)
  assert(create.body.mirror_status === 'created', 'mirror_status=created')

  const cc = await query<{ IDcommande_client: number; IDclient: number; IDsociete: number; numero: number; ref_client: string; date_commande: string }>(
    `SELECT IDcommande_client, IDclient, IDsociete, numero, ref_client, date_commande
     FROM commande_client WHERE IDcommande_ETM = ${newSstId}`,
  )
  assert(cc.length === 1, `cc row exists (n=${cc.length})`)
  const mirrorId = Number(cc[0].IDcommande_client)
  assert(Number(cc[0].IDclient) === 1, 'cc.IDclient = 1')
  assert(Number(cc[0].IDsociete) === 2, 'cc.IDsociete = 2')
  assert(Number(cc[0].numero) === numeroBefore + 1, `cc.numero = ${numeroBefore + 1}`)
  assert(cc[0].ref_client === `commande ${newSstId}`, `cc.ref_client = "commande ${newSstId}"`)
  assert(String(cc[0].date_commande) === '20260520', 'cc.date_commande = 20260520')

  console.log('\n=== Step 3: Create tricoteur line (ref 146 / colori 1094 / 100 kg) ===')
  const lineCreate = await http('POST', `/commandes-sous-traitant/${newSstId}/lignes`, {
    type: 1,
    IDreference: 146, // ref_ecru "029" with prix=2.07
    IDColoris: 1094,
    quantite: 100,
  })
  assert(lineCreate.status === 201, `POST line returned ${lineCreate.status}`)
  assert(lineCreate.body.mirror_status === 'created', 'line mirror_status=created')

  const sstLine = await query<{ IDligne_commande_sous_traitant: number; TYPE: number; prix: number; quantite: number; IDreference: number; IDColoris: number }>(
    `SELECT IDligne_commande_sous_traitant, type AS TYPE, prix, quantite, IDreference, IDColoris
     FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = ${newSstId}`,
  )
  assert(sstLine.length === 1, `1 sst line exists`)
  const newSstLineId = Number(sstLine[0].IDligne_commande_sous_traitant)
  assert(Number(sstLine[0].TYPE) === 1, 'sst line TYPE = 1')
  assert(Math.abs(Number(sstLine[0].prix) - 2.07) < 0.01, `sst line prix ≈ 2.07 (got ${sstLine[0].prix})`)
  assert(Number(sstLine[0].quantite) === 100, 'sst line quantite = 100')

  const ccLine = await query<{ IDligne_commande_client: number; TYPE: number; IDcolori: number; prix: number; quantite: number; IDligne_commande_ETM: number }>(
    `SELECT IDligne_commande_client, TYPE, IDcolori, prix, quantite, IDligne_commande_ETM
     FROM ligne_commande_client WHERE IDcommande_client = ${mirrorId}`,
  )
  assert(ccLine.length === 1, `1 cc line mirrored`)
  const ccLineId = Number(ccLine[0].IDligne_commande_client)
  assert(Number(ccLine[0].IDligne_commande_ETM) === newSstLineId, 'cc.IDligne_commande_ETM = sst line id')
  assert(Number(ccLine[0].IDcolori) === 1094, 'cc.IDcolori (lowercase!) = 1094')
  assert(Number(ccLine[0].quantite) === 100, 'cc line quantite = 100')
  assert(Math.abs(Number(ccLine[0].prix) - 2.07) < 0.01, `cc line prix ≈ 2.07 (got ${ccLine[0].prix})`)

  const cc2 = await query<{ ref_client: string }>(`SELECT ref_client FROM commande_client WHERE IDcommande_client = ${mirrorId}`)
  assert(cc2[0].ref_client === `commande ${newSstId}, 029`, `cc.ref_client = "commande ${newSstId}, 029"`)

  console.log('\n=== Step 4a: Update line quantite to 200 ===')
  const upd1 = await http('PUT', `/commandes-sous-traitant/lignes/${newSstLineId}`, { quantite: 200 })
  assert(upd1.status === 200, `PUT returned ${upd1.status}`)
  const ccQty = await query<{ quantite: number }>(`SELECT quantite FROM ligne_commande_client WHERE IDligne_commande_client = ${ccLineId}`)
  assert(Number(ccQty[0].quantite) === 200, 'cc line quantite synced to 200')

  console.log('\n=== Step 4b: Update line IDreference to 4 (MADF bio) ===')
  const refEcru4 = await query<{ prix: number; reference: string }>(`SELECT prix, reference FROM ref_ecru WHERE IDref_ecru = 4`)
  const expectedPrix = Number(refEcru4[0]?.prix) || 0
  const expectedRef = String(refEcru4[0]?.reference ?? '').trim()
  console.log(`  ref_ecru[4] = "${expectedRef}", prix=${expectedPrix}`)
  const upd2 = await http('PUT', `/commandes-sous-traitant/lignes/${newSstLineId}`, { IDreference: 4 })
  assert(upd2.status === 200, `PUT returned ${upd2.status}`)
  const sstLine2 = await query<{ IDreference: number; prix: number }>(`SELECT IDreference, prix FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant = ${newSstLineId}`)
  assert(Number(sstLine2[0].IDreference) === 4, 'sst line IDreference = 4')
  assert(Math.abs(Number(sstLine2[0].prix) - expectedPrix) < 0.01, `sst line prix recomputed to ${expectedPrix}`)
  const ccLine2 = await query<{ IDreference: number; prix: number }>(`SELECT IDreference, prix FROM ligne_commande_client WHERE IDligne_commande_client = ${ccLineId}`)
  assert(Number(ccLine2[0].IDreference) === 4, 'cc line IDreference = 4')
  assert(Math.abs(Number(ccLine2[0].prix) - expectedPrix) < 0.01, `cc line prix synced to ${expectedPrix}`)
  const cc3 = await query<{ ref_client: string }>(`SELECT ref_client FROM commande_client WHERE IDcommande_client = ${mirrorId}`)
  assert(cc3[0].ref_client === `commande ${newSstId}, ${expectedRef}`, `cc.ref_client = "commande ${newSstId}, ${expectedRef}"`)

  console.log('\n=== Step 7: Try to delete the sst — should refuse (mirror exists) ===')
  const delTry1 = await http('DELETE', `/commandes-sous-traitant/${newSstId}`)
  assert(delTry1.status === 409, `delete refused with 409 (got ${delTry1.status})`)
  assert(String(delTry1.body?.error) === 'trm_mirror_exists', 'error=trm_mirror_exists')

  console.log('\n=== Step 5: Delete the line — should succeed (no OF) ===')
  const delLine = await http('DELETE', `/commandes-sous-traitant/lignes/${newSstLineId}`)
  assert(delLine.status === 200, `line delete returned ${delLine.status}`)
  const ccLine3 = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM ligne_commande_client WHERE IDligne_commande_client = ${ccLineId}`)
  assert(Number(ccLine3[0].n) === 0, 'cc line removed')
  const cc4 = await query<{ ref_client: string }>(`SELECT ref_client FROM commande_client WHERE IDcommande_client = ${mirrorId}`)
  assert(cc4[0].ref_client === `commande ${newSstId}`, 'cc.ref_client trimmed (no refs)')

  console.log('\n=== Cleanup: manually remove mirror cc + sst (avoid 409 on commande delete) ===')
  await query(`DELETE FROM commande_client WHERE IDcommande_client = ${mirrorId}`)
  const delSst = await http('DELETE', `/commandes-sous-traitant/${newSstId}`)
  assert(delSst.status === 200, `sst delete after manual mirror removal returned ${delSst.status}`)

  console.log('\n=== Step 8: Ennoblisseur regression — POST + verify NO mirror ===')
  const eCreate = await http('POST', '/commandes-sous-traitant', {
    IDsous_traitant: 9, // MATEL (ennoblisseur)
    date_commande: '20260520',
    IDadresse_sous_traitant: 0,
    IDadresse_livraison: 0,
  })
  assert(eCreate.status === 201, `ennoblisseur POST returned ${eCreate.status}`)
  const newEnnId = eCreate.body.IDcommande_sous_traitant
  assert(eCreate.body.mirror_status === undefined, 'no mirror_status (bridge skipped)')
  const eMirror = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM commande_client WHERE IDcommande_ETM = ${newEnnId}`)
  assert(Number(eMirror[0].n) === 0, 'NO cc mirror for ennoblisseur sst')
  // cleanup ennoblisseur test row
  await http('DELETE', `/commandes-sous-traitant/${newEnnId}`)

  console.log('\n=== Step 10: Read-side regression — sst 8544 / line 8520 ===')
  const reception = await http('GET', '/commandes-sous-traitant/8544/lignes/8520/pieces-fil')
  assert(reception.status === 200, `GET pieces-fil returned ${reception.status}`)
  assert(Array.isArray(reception.body.ecruProduced) && reception.body.ecruProduced.length === 24, `24 rolls received (got ${reception.body.ecruProduced?.length})`)

  console.log('\n✅ ALL CHECKS PASSED')
}

main().catch((e) => { console.error(e); process.exit(1) })
