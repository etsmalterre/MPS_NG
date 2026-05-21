// Two-fold verification:
// 1. Re-check sst 8544's reception state — did the second agent see a real
//    legacy anomaly or pick a bad case? Look at IDref_commande_affectation,
//    IDref_commande_source, IDLigne_Commande_TRM on every produced roll.
// 2. Find well-formed reception examples — sst commandes where rolls DO
//    show up in the ETM drawer (IDref_commande_affectation = sst line).
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  // 1) sst 8544 state
  console.log('=== sst 8544 (TRM cc 6863) reception state ===')
  const lines = await query<{ IDligne_commande_sous_traitant: number; IDcommande_sous_traitant: number }>(
    `SELECT IDligne_commande_sous_traitant, IDcommande_sous_traitant
     FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = 8544`,
  )
  console.log('ETM sst lines:', lines.map((l) => l.IDligne_commande_sous_traitant))

  const trmLines = await query<{ IDligne_commande_client: number; IDligne_commande_ETM: number }>(
    `SELECT IDligne_commande_client, IDligne_commande_ETM
     FROM ligne_commande_client WHERE IDcommande_client = 6863`,
  )
  console.log('TRM cc lines (with IDligne_commande_ETM):', trmLines)

  // Rolls produced via OFs of the TRM lines.
  if (trmLines.length > 0) {
    const ofs = await query<{ IDordre_fabrication: number; IDligne_commande_client: number; est_termine: number }>(
      `SELECT IDordre_fabrication, IDligne_commande_client, est_termine FROM ordre_fabrication
       WHERE IDligne_commande_client IN (${trmLines.map((l) => l.IDligne_commande_client).join(',')})`,
    )
    console.log('OFs:', ofs)
    if (ofs.length > 0) {
      const rolls = await query<Record<string, unknown>>(
        `SELECT IDstock_ecru, IDordre_fabrication, IDref_commande_source, IDref_commande_affectation,
                IDLigne_Commande_TRM, IDligne_commande_client, IDsociete, date_saisie, poids
         FROM stock_ecru
         WHERE IDordre_fabrication IN (${ofs.map((o) => o.IDordre_fabrication).join(',')})`,
      )
      console.log(`stock_ecru rolls (n=${rolls.length}):`)
      const ic = rolls.filter((r) => Number((r as any).IDref_commande_affectation) === 0).length
      const ok = rolls.length - ic
      console.log(`  IDref_commande_affectation = 0:  ${ic}`)
      console.log(`  IDref_commande_affectation > 0:  ${ok}`)
      for (const r of rolls.slice(0, 5)) console.log(' ', r)
    }
  }

  // 2) Find a sst where reception DID succeed. Pull recent sst with lines that have
  // matching stock_ecru.IDref_commande_affectation.
  console.log('\n=== sst commandes with rolls properly received (IDref_commande_affectation set) ===')
  const okLines = await query<{ IDref_commande_affectation: number; n: number }>(
    `SELECT IDref_commande_affectation, COUNT(*) AS n FROM stock_ecru
     WHERE IDref_commande_affectation > 0
     GROUP BY IDref_commande_affectation
     ORDER BY IDref_commande_affectation DESC`,
  )
  // Filter only those that are tricoteur sst lines.
  const lineIds = okLines.slice(0, 80).map((r) => Number(r.IDref_commande_affectation))
  const trim = await query<{ IDligne_commande_sous_traitant: number; IDcommande_sous_traitant: number; type_kind: number }>(
    `SELECT IDligne_commande_sous_traitant, IDcommande_sous_traitant, type AS type_kind
     FROM ligne_commande_sous_traitant
     WHERE IDligne_commande_sous_traitant IN (${lineIds.join(',')}) AND type = 1`,
  )
  console.log(`tricoteur lines with successful reception (top 10): ${trim.length}`)
  for (const t of trim.slice(0, 10)) {
    const n = okLines.find((x) => Number(x.IDref_commande_affectation) === t.IDligne_commande_sous_traitant)?.n ?? 0
    console.log(`  sst ${t.IDcommande_sous_traitant} / line ${t.IDligne_commande_sous_traitant} → ${n} rolls`)
  }

  // 3) Verify by picking the most recent OK tricoteur sst and dumping its stock_ecru shape.
  if (trim.length > 0) {
    const sample = trim[0]
    console.log(`\n--- sample stock_ecru row for line ${sample.IDligne_commande_sous_traitant} ---`)
    const sr = await query<Record<string, unknown>>(
      `SELECT * FROM stock_ecru WHERE IDref_commande_affectation = ${sample.IDligne_commande_sous_traitant}`,
    )
    if (sr.length > 0) {
      const r = sr[0]
      for (const [k, v] of Object.entries(r)) {
        if (k.length > 28) continue
        const display = v instanceof ArrayBuffer ? `<blob ${v.byteLength}b>` : v
        console.log(`  ${k.padEnd(28)} = ${display === '' ? "''" : display}`)
      }
    }
  }

  // 4) affectation_cmd_tricotage — is it actively used?
  console.log('\n=== affectation_cmd_tricotage usage ===')
  const acmd = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM affectation_cmd_tricotage`)
  if (acmd.length > 0) console.log('shape:', Object.keys(acmd[0]).join(', '))
  const count = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM affectation_cmd_tricotage`)
  console.log('row count:', count[0]?.n)
}

main().catch((e) => { console.error(e); process.exit(1) })
