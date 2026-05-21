import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query } from '../lib/hfsql.js'

// Find commandes sous-traitant whose Réception tab (stock_fini rolls
// linked back via IDref_commande_source) shows rolls carrying BOTH a
// free-text observation (visiteur or sst) AND a "défaut" marker.
// defaut_qualite doesn't store stock_fini defects (only Type_Reference
// 1=piece_production and 2=stock_ecru are populated), so the only
// defect signal on a fini roll is the second_choix=1 flag — which is
// also what triggers the red banner in the UI.

async function main() {
  const rows = await query<{
    IDstock_fini: number
    IDref_commande_source: number
    second_choix: number | null
    observations: string | null
    observation_sst: string | null
  }>(
    `SELECT IDstock_fini, IDref_commande_source, second_choix, observations, observation_sst
     FROM stock_fini
     WHERE IDref_commande_source > 0
       AND second_choix = 1
       AND (
         (observations IS NOT NULL AND observations <> '')
         OR (observation_sst IS NOT NULL AND observation_sst <> '')
       )`,
  )
  console.log(`fini rolls in reception with second_choix=1 + non-empty observation(s): ${rows.length}`)
  if (rows.length === 0) return

  const lineIds = Array.from(new Set(rows.map((r) => Number(r.IDref_commande_source)).filter((x) => x > 0)))
  const lignes = await query<{
    IDligne_commande_sous_traitant: number
    IDcommande_sous_traitant: number
  }>(
    `SELECT IDligne_commande_sous_traitant, IDcommande_sous_traitant
     FROM ligne_commande_sous_traitant
     WHERE IDligne_commande_sous_traitant IN (${lineIds.join(',')})`,
  )
  const lineToCmd = new Map(lignes.map((l) => [l.IDligne_commande_sous_traitant, l.IDcommande_sous_traitant]))

  const byCmd = new Map<number, { ligne: number; fini: number }[]>()
  for (const r of rows) {
    const cmd = lineToCmd.get(Number(r.IDref_commande_source))
    if (!cmd) continue
    if (!byCmd.has(cmd)) byCmd.set(cmd, [])
    byCmd.get(cmd)!.push({ ligne: Number(r.IDref_commande_source), fini: Number(r.IDstock_fini) })
  }

  const sorted = Array.from(byCmd.entries()).sort((a, b) => b[1].length - a[1].length)
  console.log(`\nCommandes sous-traitant with fini rolls (Réception) carrying obs + second_choix:`)
  for (const [cmd, rolls] of sorted.slice(0, 10)) {
    const sample = rolls.slice(0, 5).map((r) => `fini#${r.fini}@ligne#${r.ligne}`).join(', ')
    console.log(`  commande#${cmd} — ${rolls.length} roll(s): ${sample}${rolls.length > 5 ? '…' : ''}`)
  }

  // Pull one sample to show what the data looks like.
  const topCmd = sorted[0]
  if (topCmd) {
    const sample = topCmd[1][0]
    const detail = rows.find((r) => Number(r.IDstock_fini) === sample.fini)
    console.log(`\nSample fini roll #${sample.fini} (commande#${topCmd[0]}):`)
    console.log(`  observations    : ${JSON.stringify(detail?.observations ?? '')}`)
    console.log(`  observation_sst : ${JSON.stringify(detail?.observation_sst ?? '')}`)
    console.log(`  second_choix    : ${detail?.second_choix}`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
