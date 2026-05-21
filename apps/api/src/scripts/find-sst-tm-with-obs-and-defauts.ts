import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query } from '../lib/hfsql.js'

// Find sous-traitant commandes whose "affectés" tab shows TM (stock_ecru) rolls
// that have BOTH observations (free text on stock_ecru) AND a defaut_qualite
// entry (polymorphic via Type_Reference=2 + reference=IDstock_ecru as string).

async function main() {
  // 1. écru rolls affected to a sous-traitant line AND with non-empty observations.
  const ecruWithObs = await query<{
    IDstock_ecru: number
    IDref_commande_affectation: number
    second_choix: number | null
    observations: string | null
  }>(
    `SELECT IDstock_ecru, IDref_commande_affectation, second_choix, observations
     FROM stock_ecru
     WHERE IDref_commande_affectation > 0
       AND observations IS NOT NULL
       AND observations <> ''`,
  )
  console.log(`écru rolls affected + with observations: ${ecruWithObs.length}`)
  if (ecruWithObs.length === 0) return

  // 2. defaut_qualite rows for those écru ids (Type_Reference=2).
  const ecruIds = ecruWithObs.map((r) => r.IDstock_ecru)
  const idList = ecruIds.map((id) => `'${id}'`).join(',')
  const defauts = await query<{ reference: string; n: number }>(
    `SELECT reference, COUNT(*) AS n
     FROM defaut_qualite
     WHERE Type_Reference = 2 AND reference IN (${idList})
     GROUP BY reference`,
  )
  const ecruWithDefaut = new Set(defauts.map((d) => Number(d.reference)))
  console.log(`écru rolls in that set that also have ≥1 defaut_qualite: ${ecruWithDefaut.size}`)

  // 3. Intersection — group back by line, then by commande.
  const winners = ecruWithObs.filter((r) => ecruWithDefaut.has(r.IDstock_ecru))
  const lineIds = Array.from(new Set(winners.map((r) => r.IDref_commande_affectation)))
  if (lineIds.length === 0) {
    console.log('No écru rolls have both observations AND a defaut_qualite.')
    return
  }

  const lignes = await query<{
    IDligne_commande_sous_traitant: number
    IDcommande_sous_traitant: number
  }>(
    `SELECT IDligne_commande_sous_traitant, IDcommande_sous_traitant
     FROM ligne_commande_sous_traitant
     WHERE IDligne_commande_sous_traitant IN (${lineIds.join(',')})`,
  )
  const lineToCmd = new Map(lignes.map((l) => [l.IDligne_commande_sous_traitant, l.IDcommande_sous_traitant]))

  // Group rolls by commande.
  const byCmd = new Map<number, { ligne: number; ecru: number }[]>()
  for (const w of winners) {
    const cmd = lineToCmd.get(w.IDref_commande_affectation)
    if (!cmd) continue
    if (!byCmd.has(cmd)) byCmd.set(cmd, [])
    byCmd.get(cmd)!.push({ ligne: w.IDref_commande_affectation, ecru: w.IDstock_ecru })
  }

  // Sort: commandes with most matching rolls first.
  const sorted = Array.from(byCmd.entries()).sort((a, b) => b[1].length - a[1].length)
  console.log(`\nCommandes sous-traitant with TM rolls having both observations AND defauts:`)
  for (const [cmd, rolls] of sorted.slice(0, 10)) {
    const sample = rolls.slice(0, 5).map((r) => `ecru#${r.ecru}@ligne#${r.ligne}`).join(', ')
    console.log(`  commande#${cmd} — ${rolls.length} matching roll(s): ${sample}${rolls.length > 5 ? '…' : ''}`)
  }

  // Pull one sample roll to show what the data actually looks like.
  const top = sorted[0]
  if (!top) return
  const sampleEcruId = top[1][0].ecru
  const sampleObs = ecruWithObs.find((r) => r.IDstock_ecru === sampleEcruId)
  const sampleDefauts = await query<{ IDdefaut_qualite: number; observation: string | null }>(
    `SELECT IDdefaut_qualite, observation FROM defaut_qualite
     WHERE Type_Reference = 2 AND reference = '${sampleEcruId}'`,
  )
  console.log(`\nSample TM roll #${sampleEcruId} (commande#${top[0]}):`)
  console.log(`  observations: ${JSON.stringify(sampleObs?.observations ?? '')}`)
  console.log(`  second_choix: ${sampleObs?.second_choix}`)
  console.log(`  defaut_qualite rows: ${sampleDefauts.length}`)
  for (const d of sampleDefauts.slice(0, 5)) {
    console.log(`    #${d.IDdefaut_qualite}: ${JSON.stringify(d.observation ?? '')}`)
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
