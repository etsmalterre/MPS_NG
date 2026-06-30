// One-time data fix companion to audit-stuck-validated-rolls.ts.
//
// Promotes the rolls that were stuck in "En Contrôle" (IDetat_stock_fini = 1)
// under an already-validated lot (suivilot.IDetatLot = 3) to "Validé" (3) —
// the cascade the pre-fix Qualité › Suivi Lots verdict failed to perform.
//
// Operates on the EXACT roll ids reviewed in the audit, guarded by
// `AND IDetat_stock_fini = 1` so anything that legitimately changed since the
// audit (shipped, re-received for reprise, already validated) is skipped.
// Idempotent: re-running it touches 0 rows once everything is at 3.
import { query } from '../lib/hfsql-auto.js'

// The 79 reviewed roll ids (audit run 2026-06-30, prod mps.malterre).
const ROLL_IDS = [
  52733, 52734, 52735, 52736, 52727, 52728, 52729, 52730, 52731, 52732,
  52562, 52563, 52564, 52565, 52566, 52660, 52661, 52662, 52663, 52664,
  52665, 52666, 52667, 52668, 52669, 52670, 52671, 52672, 52673, 52658,
  52659, 52674, 52675, 52676, 52643, 52644, 52645, 52646, 52647, 52648,
  52649, 52639, 52650, 52651, 52652, 52653, 52654, 52655, 52656, 52657,
  52640, 52641, 52642, 52605, 52606, 52607, 52608, 52609, 52610, 52611,
  52612, 52613, 52598, 52599, 52600, 52601, 52602, 52603, 52604, 52629,
  52631, 52632, 52633, 52634, 52635, 52636, 52630, 52637, 52638,
]

async function main() {
  const conn = process.env.HFSQL_CONNECTION_STRING ?? '(default localhost)'
  console.log(`\nDB: ${conn.replace(/PWD=[^;]*/i, 'PWD=***')}`)
  console.log(`Target rolls: ${ROLL_IDS.length}\n`)

  const inList = ROLL_IDS.join(',')

  // Snapshot before.
  const before = await query<{ IDstock_fini: number; IDetat_stock_fini: number | null }>(
    `SELECT IDstock_fini, IDetat_stock_fini FROM stock_fini WHERE IDstock_fini IN (${inList})`,
  )
  const tally = (rows: typeof before) => {
    const m = new Map<number, number>()
    for (const r of rows) { const s = Number(r.IDetat_stock_fini) || 0; m.set(s, (m.get(s) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([s, n]) => `etat ${s}: ${n}`).join(', ')
  }
  console.log(`Before: ${before.length} rows found — ${tally(before)}`)
  const willUpdate = before.filter((r) => Number(r.IDetat_stock_fini) === 1).length
  console.log(`Rows in En Contrôle (1) that will be promoted to Validé (3): ${willUpdate}`)

  // The guarded promotion.
  await query(
    `UPDATE stock_fini SET IDetat_stock_fini = 3
     WHERE IDstock_fini IN (${inList}) AND IDetat_stock_fini = 1`,
  )

  // Snapshot after.
  const after = await query<{ IDstock_fini: number; IDetat_stock_fini: number | null }>(
    `SELECT IDstock_fini, IDetat_stock_fini FROM stock_fini WHERE IDstock_fini IN (${inList})`,
  )
  console.log(`After:  ${after.length} rows found — ${tally(after)}`)

  const stillEnControle = after.filter((r) => Number(r.IDetat_stock_fini) === 1).map((r) => Number(r.IDstock_fini))
  if (stillEnControle.length > 0) console.log(`NOTE: still En Contrôle (skipped/unchanged): ${stillEnControle.join(',')}`)
  console.log('\nDone.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
