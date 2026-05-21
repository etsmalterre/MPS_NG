// List every TRM-side commande_client mirror whose ETM source sst is NOT
// pointing at Tricotage Malterre (IDsous_traitant=1). These are orphans
// from the over-broad initial bridge gate (gated on IDtype_sst=1 instead
// of IDsous_traitant=1). Lists them but does NOT delete — operator runs
// the cleanup explicitly.
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  // commande_client rows with IDcommande_ETM set, joined to the source sst.
  const mirrors = await query<{ IDcommande_client: number; IDcommande_ETM: number; numero: number; ref_client: string; date_commande: string }>(
    `SELECT IDcommande_client, IDcommande_ETM, numero, ref_client, date_commande
     FROM commande_client
     WHERE IDcommande_ETM > 0
     ORDER BY IDcommande_client DESC`,
  )
  console.log(`total TRM mirrors (IDcommande_ETM > 0): ${mirrors.length}`)

  if (mirrors.length === 0) return

  // Resolve each source sst's IDsous_traitant.
  const ssts = await query<{ IDcommande_sous_traitant: number; IDsous_traitant: number; nom: string | null }>(
    `SELECT cst.IDcommande_sous_traitant, cst.IDsous_traitant, st.nom
     FROM commande_sous_traitant cst
     LEFT JOIN sous_traitant st ON st.IDsous_traitant = cst.IDsous_traitant
     WHERE cst.IDcommande_sous_traitant IN (${mirrors.map((m) => Number(m.IDcommande_ETM) || 0).filter((x) => x > 0).join(',')})`,
  )
  const stById = new Map<number, { IDsous_traitant: number; nom: string | null }>()
  for (const s of ssts) stById.set(Number(s.IDcommande_sous_traitant), { IDsous_traitant: Number(s.IDsous_traitant), nom: s.nom })

  const orphans: typeof mirrors = []
  let trmCount = 0
  for (const m of mirrors) {
    const st = stById.get(Number(m.IDcommande_ETM))
    if (!st) {
      console.log(`  mirror cc ${m.IDcommande_client} → sst ${m.IDcommande_ETM} (sst MISSING)`)
      orphans.push(m)
      continue
    }
    if (st.IDsous_traitant !== 1) {
      orphans.push(m)
      console.log(`  ORPHAN mirror cc ${m.IDcommande_client} (numero ${m.numero}, ${m.date_commande}) → sst ${m.IDcommande_ETM} → sous_traitant ${st.IDsous_traitant} (${st.nom}) — should NOT have a mirror`)
    } else {
      trmCount++
    }
  }
  console.log(`\n${trmCount} legitimate TRM mirrors (sous_traitant=Tricotage Malterre)`)
  console.log(`${orphans.length} orphan mirror(s) to clean up`)

  if (orphans.length > 0) {
    console.log('\nTo clean up, run (per orphan):')
    for (const o of orphans) {
      // Find lines first
      const lcc = await query<{ IDligne_commande_client: number; IDligne_commande_ETM: number }>(
        `SELECT IDligne_commande_client, IDligne_commande_ETM FROM ligne_commande_client WHERE IDcommande_client = ${o.IDcommande_client}`,
      )
      console.log(`  -- cc ${o.IDcommande_client} (sst ${o.IDcommande_ETM}, ${lcc.length} lines)`)
      for (const l of lcc) {
        console.log(`     DELETE FROM ligne_commande_client WHERE IDligne_commande_client = ${l.IDligne_commande_client};`)
      }
      console.log(`     DELETE FROM commande_client WHERE IDcommande_client = ${o.IDcommande_client};`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
