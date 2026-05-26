// List every commande_sous_traitant with IDsous_traitant = 1 (Tricotage
// Malterre) that has NO corresponding commande_client mirror row pointing
// back via IDcommande_ETM. These are ETM-side ssts whose TRM mirror failed
// to create — typically because the Linux iODBC bridge rejected the
// accented identifiers (`archivé`, `expedié`, `envoyé_client`) in the
// original INSERT.
//
// Run on prod via: pnpm exec tsx src/scripts/find-missing-trm-mirrors.ts
// Read-only — does not modify the DB.

import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  // Every TRM-targeted sst.
  const ssts = await query<{ IDcommande_sous_traitant: number; date_commande: string | null }>(
    `SELECT IDcommande_sous_traitant, date_commande
     FROM commande_sous_traitant
     WHERE IDsous_traitant = 1
     ORDER BY IDcommande_sous_traitant DESC`,
  )
  console.log(`total TRM-targeted ssts: ${ssts.length}`)

  if (ssts.length === 0) return

  // Resolve which already have a mirror.
  const sstIds = ssts.map((s) => Number(s.IDcommande_sous_traitant))
  const mirrors = await query<{ IDcommande_ETM: number }>(
    `SELECT IDcommande_ETM FROM commande_client
     WHERE IDcommande_ETM IN (${sstIds.join(',')})`,
  )
  const mirrored = new Set(mirrors.map((m) => Number(m.IDcommande_ETM)))

  const orphans: { sstId: number; date: string | null; lineCount: number }[] = []
  for (const s of ssts) {
    if (mirrored.has(Number(s.IDcommande_sous_traitant))) continue
    const lc = await query<{ n: number | null }>(
      `SELECT COUNT(*) AS n FROM ligne_commande_sous_traitant
       WHERE IDcommande_sous_traitant = ${s.IDcommande_sous_traitant}`,
    )
    orphans.push({
      sstId: Number(s.IDcommande_sous_traitant),
      date: s.date_commande,
      lineCount: Number(lc[0]?.n) || 0,
    })
  }

  console.log(`${orphans.length} TRM ssts MISSING a mirror cc:\n`)
  for (const o of orphans) {
    console.log(`  sst ${o.sstId}  date=${o.date}  ${o.lineCount} line(s)`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
