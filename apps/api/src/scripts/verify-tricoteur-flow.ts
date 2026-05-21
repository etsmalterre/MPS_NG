// End-to-end verification of the tricoteur affectation + reception flow.
// Tests against the live HFSQL DB, cleans up after itself.
//
// Flow:
//   1. Create a fresh TRM sst commande
//   2. Add a tricoteur line (ref 146 / colori 1094, qty 200)
//   3. Affecter à la commande — verify asso_fil_lignecmdsst rows
//   4. Verify "affectations exist" guard
//   5. Désaffecter — verify rows gone
//   6. Re-affect with Finir le lot mode — verify line.quantite updated
//   7. Désaffecter again
//   8. Affecter standard, then create a roll — verify Désaffecter refuses
//   9. Cleanup: delete roll, désaffecter, delete cc mirror, delete sst

import 'dotenv/config'
import { query } from '../lib/hfsql.js'

const API = 'http://localhost:3002/api'

async function http(method: string, path: string, body?: unknown) {
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
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

async function main() {
  console.log('=== Step 1: Create TRM sst ===')
  const create = await http('POST', '/commandes-sous-traitant', {
    IDsous_traitant: 1, date_commande: '20260520',
    IDadresse_sous_traitant: 777, IDadresse_livraison: 777,
  })
  assert(create.status === 201, `POST returned ${create.status}`)
  const sstId = create.body.IDcommande_sous_traitant

  console.log('\n=== Step 2: Add line (ref 146, col 1094, qty 200) ===')
  const lineCreate = await http('POST', `/commandes-sous-traitant/${sstId}/lignes`, {
    type: 1, IDreference: 146, IDColoris: 1094, quantite: 200,
  })
  assert(lineCreate.status === 201, `line POST returned ${lineCreate.status}`)
  const lineRow = await query<{ id: number }>(
    `SELECT IDligne_commande_sous_traitant AS id FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = ${sstId}`,
  )
  const lineId = Number(lineRow[0].id)

  // Find the lots for ref 146 col 1094 composition: (ref_fil=5, colori_fil=317) + (ref_fil=8, colori_fil=338).
  // Pick lots 1752 (lot 10485, ref 5, colori 317) and 1646 (lot 10379, ref 8, colori 338).

  console.log('\n=== Step 3: Affecter standard (200 kg, 94/6 split) ===')
  const aff = await http('POST', `/commandes-sous-traitant/${sstId}/lignes/${lineId}/affecter`, {
    stockFilIds: [1752, 1646], mode: 'standard',
  })
  assert(aff.status === 200, `affecter returned ${aff.status}`)
  assert(aff.body.ok === true, 'ok=true')
  const assoRows = await query<{ IDstock_fil: number; quantite: number }>(
    `SELECT IDstock_fil, quantite FROM asso_fil_lignecmdsst WHERE IDligne_commande_sous_traitant = ${lineId}`,
  )
  assert(assoRows.length === 2, `2 asso rows (got ${assoRows.length})`)
  const lot1752 = assoRows.find((r) => Number(r.IDstock_fil) === 1752)
  const lot1646 = assoRows.find((r) => Number(r.IDstock_fil) === 1646)
  assert(lot1752 && Math.abs(Number(lot1752.quantite) - 188) < 0.5, `lot 1752 ≈ 188 kg (94%) (got ${lot1752?.quantite})`)
  assert(lot1646 && Math.abs(Number(lot1646.quantite) - 12) < 0.5, `lot 1646 ≈ 12 kg (6%) (got ${lot1646?.quantite})`)

  console.log('\n=== Step 4: Re-affect — should refuse (already affected) ===')
  const aff2 = await http('POST', `/commandes-sous-traitant/${sstId}/lignes/${lineId}/affecter`, {
    stockFilIds: [1752, 1646], mode: 'standard',
  })
  assert(aff2.status === 409, `re-affecter returned ${aff2.status}`)
  assert(aff2.body.error === 'affectations_exist', 'error=affectations_exist')

  console.log('\n=== Step 5: Désaffecter ===')
  const des = await http('DELETE', `/commandes-sous-traitant/${sstId}/lignes/${lineId}/affectations`)
  assert(des.status === 200, `desaffecter returned ${des.status}`)
  const after = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM asso_fil_lignecmdsst WHERE IDligne_commande_sous_traitant = ${lineId}`)
  assert(Number(after[0].n) === 0, 'asso rows gone')

  console.log('\n=== Step 6: Finir le lot mode — qty should grow to lot1646 capacity ===')
  // lot 1646 has stock 568.7 kg of ref_fil=8 (6%) → producible = 568.7 / 0.06 = 9478 kg
  // lot 1752 has stock 5736 kg of ref_fil=5 (94%) → producible = 5736 / 0.94 = 6102 kg
  // Limiting bucket: ref_fil=5 (lot 1752), producible 6102 kg → new line qty.
  const fin = await http('POST', `/commandes-sous-traitant/${sstId}/lignes/${lineId}/affecter`, {
    stockFilIds: [1752, 1646], mode: 'finir',
  })
  assert(fin.status === 200, `finir returned ${fin.status}`)
  assert(fin.body.ok === true, 'ok=true')
  assert(fin.body.targetQtyKg > 6000 && fin.body.targetQtyKg < 6200, `targetQtyKg ~6102 (got ${fin.body.targetQtyKg})`)
  const lineQ = await query<{ quantite: number }>(`SELECT quantite FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant = ${lineId}`)
  assert(Math.abs(Number(lineQ[0].quantite) - fin.body.targetQtyKg) < 1, 'sst line qty matches targetQtyKg')
  assert(fin.body.limitingLot?.IDstock_fil === 1752, `limitingLot=1752 (lot 10485) (got ${fin.body.limitingLot?.IDstock_fil})`)

  console.log('\n=== Step 7: Désaffecter again ===')
  await http('DELETE', `/commandes-sous-traitant/${sstId}/lignes/${lineId}/affectations`)
  const after2 = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM asso_fil_lignecmdsst WHERE IDligne_commande_sous_traitant = ${lineId}`)
  assert(Number(after2[0].n) === 0, 'rows gone again')

  console.log('\n=== Step 8: Affecter then create a roll, désaffecter should refuse ===')
  await http('POST', `/commandes-sous-traitant/${sstId}/lignes/${lineId}/affecter`, {
    stockFilIds: [1752, 1646], mode: 'standard',
  })
  const roll = await http('POST', `/commandes-sous-traitant/${sstId}/lignes/${lineId}/pieces-fil/rolls`, {
    numero: 'TEST-001', lot: 'TST', poids: 20.5, observations: 'verify test',
  })
  assert(roll.status === 201, `roll POST returned ${roll.status}`)
  const ecruRows = await query<{ IDstock_ecru: number; numero: string; IDref_commande_source: number }>(
    `SELECT IDstock_ecru, numero, IDref_commande_source FROM stock_ecru WHERE IDref_commande_source = ${lineId}`,
  )
  assert(ecruRows.length === 1, '1 stock_ecru row created')
  assert(ecruRows[0].numero === 'TEST-001', `numero = TEST-001 (got "${ecruRows[0].numero}")`)
  const newEcruId = Number(ecruRows[0].IDstock_ecru)

  const desFail = await http('DELETE', `/commandes-sous-traitant/${sstId}/lignes/${lineId}/affectations`)
  assert(desFail.status === 409, `desaffecter blocked with ${desFail.status}`)
  assert(desFail.body.error === 'production_started', 'error=production_started')

  console.log('\n=== Cleanup ===')
  await query(`DELETE FROM stock_ecru WHERE IDstock_ecru = ${newEcruId}`)
  await query(`DELETE FROM asso_fil_lignecmdsst WHERE IDligne_commande_sous_traitant = ${lineId}`)
  // Mirror cc + line — bridge refuses sst delete with mirror, so manual.
  const mirror = await query<{ IDcommande_client: number }>(`SELECT IDcommande_client FROM commande_client WHERE IDcommande_ETM = ${sstId}`)
  if (mirror.length > 0) {
    const ccId = Number(mirror[0].IDcommande_client)
    await query(`DELETE FROM ligne_commande_client WHERE IDcommande_client = ${ccId}`)
    await query(`DELETE FROM commande_client WHERE IDcommande_client = ${ccId}`)
  }
  await http('DELETE', `/commandes-sous-traitant/${sstId}`)
  console.log('  ✓ test rows cleaned up')

  console.log('\n✅ ALL CHECKS PASSED')
}

main().catch((e) => { console.error(e); process.exit(1) })
