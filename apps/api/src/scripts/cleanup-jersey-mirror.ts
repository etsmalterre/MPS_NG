// Cleanup the one mirror cc 6890 (sst 8593 — JERSEY DE LA BUCHE) created
// in error by the initial over-broad bridge gate. Does NOT touch any
// historical "sst MISSING" rows.
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  // Safety check before delete: make sure cc 6890 really points at sst 8593
  // AND that sst 8593's sous-traitant is NOT Tricotage Malterre.
  const cc = await query<{ IDcommande_ETM: number; IDclient: number; IDsociete: number; ref_client: string }>(
    `SELECT IDcommande_ETM, IDclient, IDsociete, ref_client FROM commande_client WHERE IDcommande_client = 6890`,
  )
  if (cc.length === 0) {
    console.log('cc 6890 already gone — nothing to do')
    return
  }
  console.log('cc 6890:', cc[0])
  if (Number(cc[0].IDcommande_ETM) !== 8593) {
    throw new Error(`cc 6890.IDcommande_ETM is ${cc[0].IDcommande_ETM}, expected 8593 — aborting`)
  }

  const sst = await query<{ IDsous_traitant: number }>(
    `SELECT IDsous_traitant FROM commande_sous_traitant WHERE IDcommande_sous_traitant = 8593`,
  )
  if (sst.length === 0) {
    console.log('sst 8593 missing — proceeding (mirror is orphaned anyway)')
  } else {
    if (Number(sst[0].IDsous_traitant) === 1) {
      throw new Error('sst 8593 IS Tricotage Malterre — would have been a legitimate mirror, aborting')
    }
    console.log(`sst 8593 sous_traitant = ${sst[0].IDsous_traitant} (NOT Tricotage Malterre) — cleanup is safe`)
  }

  // Delete the mirror lines first (FK-ish ordering, though HFSQL has no
  // declarative FKs).
  const lines = await query<{ IDligne_commande_client: number }>(
    `SELECT IDligne_commande_client FROM ligne_commande_client WHERE IDcommande_client = 6890`,
  )
  console.log(`deleting ${lines.length} cc line(s)`)
  for (const l of lines) {
    await query(`DELETE FROM ligne_commande_client WHERE IDligne_commande_client = ${l.IDligne_commande_client}`)
  }

  await query(`DELETE FROM commande_client WHERE IDcommande_client = 6890`)
  console.log('cc 6890 deleted ✓')

  // Verify
  const verify = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM commande_client WHERE IDcommande_client = 6890`)
  console.log(`post-delete check: ${Number(verify[0].n)} row(s) for cc 6890`)
}

main().catch((e) => { console.error(e); process.exit(1) })
