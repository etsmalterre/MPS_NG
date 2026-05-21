import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query } from '../lib/hfsql.js'

// New semantics for fini rolls in Réception:
//   observations     -> blue banner (employee note to customer)
//   observation_sst  -> red banner (ennoblisseur's defect report)
//   second_choix=1   -> also fires the red banner with "2e choix" tag
// Side-by-side requires BOTH banners on the same roll.

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
       AND observations IS NOT NULL AND observations <> ''
       AND (
         (observation_sst IS NOT NULL AND observation_sst <> '')
         OR second_choix = 1
       )`,
  )
  console.log(`fini rolls in reception that will show side-by-side banners: ${rows.length}`)
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

  const byCmd = new Map<number, { ligne: number; fini: number; sst: boolean; sc: boolean }[]>()
  for (const r of rows) {
    const cmd = lineToCmd.get(Number(r.IDref_commande_source))
    if (!cmd) continue
    if (!byCmd.has(cmd)) byCmd.set(cmd, [])
    byCmd.get(cmd)!.push({
      ligne: Number(r.IDref_commande_source),
      fini: Number(r.IDstock_fini),
      sst: !!(r.observation_sst && r.observation_sst.trim().length > 0),
      sc: Number(r.second_choix) === 1,
    })
  }

  const sorted = Array.from(byCmd.entries()).sort((a, b) => b[1].length - a[1].length)
  for (const [cmd, rolls] of sorted.slice(0, 15)) {
    const flags = (r: { sst: boolean; sc: boolean }) =>
      [r.sst ? 'obs_sst' : '', r.sc ? '2e_choix' : ''].filter(Boolean).join('+')
    const sample = rolls.slice(0, 5).map((r) => `fini#${r.fini}(${flags(r)})`).join(', ')
    console.log(`  commande#${cmd} — ${rolls.length}: ${sample}${rolls.length > 5 ? '…' : ''}`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
