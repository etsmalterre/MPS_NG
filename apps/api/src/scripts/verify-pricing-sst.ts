// Reverse-engineer test for `calcTarifSST`.
//
// Picks recent ennoblisseur (type=2) lines with prix > 0 across MATEL,
// ESAT, and Bontemps; recomputes the price from current data; reports how
// close we land to the stored value.
//
// Expect: most rows match within ±0.01 €/Kg (legacy rounding). Drift > 0.05
// indicates an algorithm bug worth investigating before declaring done.
// Some drift is expected (manual overrides, tariff catalog edits since the
// row was written), so we just sample widely and look at the distribution.

import { query } from '../lib/hfsql-auto.js'
import { calcTarifSST } from '../lib/pricing-sst.js'

interface LineSample {
  IDligne_commande_sous_traitant: number
  IDcommande_sous_traitant: number
  IDreference: number
  IDColoris: number
  prix: number
  IDsous_traitant: number
  sst_nom: string
  xPoids: number
}

async function sampleLines(sst: number, limit: number): Promise<LineSample[]> {
  // Pull recent priced ennoblisseur lines for one sst. Join the commande to
  // get IDsous_traitant; sst.nom for readability. We re-aggregate xPoids
  // from stock_ecru because that's what the algorithm wants.
  const rows = await query<any>(
    `SELECT TOP ${limit}
       lcs.IDligne_commande_sous_traitant, lcs.IDcommande_sous_traitant,
       lcs.IDreference, lcs.IDColoris, lcs.prix,
       cst.IDsous_traitant
     FROM ligne_commande_sous_traitant lcs
     INNER JOIN commande_sous_traitant cst
       ON lcs.IDcommande_sous_traitant = cst.IDcommande_sous_traitant
     WHERE lcs.type = 2
       AND lcs.prix > 0
       AND cst.IDsous_traitant = ${sst}
     ORDER BY lcs.IDligne_commande_sous_traitant DESC`,
  )
  if (rows.length === 0) return []

  // Resolve sst nom + xPoids per line in two extra queries.
  const sstRow = await query<{ nom: string | null }>(
    `SELECT nom FROM sous_traitant WHERE IDsous_traitant = ${sst}`,
  )
  const sstNom = (sstRow[0]?.nom ?? '').trim()

  const out: LineSample[] = []
  for (const r of rows) {
    const lid = Number(r.IDligne_commande_sous_traitant)
    const poidsRows = await query<{ total: number | null }>(
      `SELECT SUM(poids) AS total FROM stock_ecru WHERE IDref_commande_affectation = ${lid}`,
    )
    out.push({
      IDligne_commande_sous_traitant: lid,
      IDcommande_sous_traitant: Number(r.IDcommande_sous_traitant),
      IDreference: Number(r.IDreference),
      IDColoris: Number(r.IDColoris),
      prix: Number(r.prix),
      IDsous_traitant: Number(r.IDsous_traitant),
      sst_nom: sstNom,
      xPoids: Number(poidsRows[0]?.total) || 0,
    })
  }
  return out
}

async function main() {
  const samples: LineSample[] = []
  for (const sst of [9, 89, 38]) {
    const got = await sampleLines(sst, 5)
    samples.push(...got)
  }
  console.log(`\n=== ${samples.length} samples (MATEL=9, ESAT=89, Bontemps=38) ===`)
  console.log(
    'sst         | line     | ref   | qtyKg  | stored | calc   | Δ      | verdict',
  )
  console.log(
    '------------+----------+-------+--------+--------+--------+--------+--------',
  )
  let matches = 0
  let tinyDrift = 0
  let bigDrift = 0
  for (const s of samples) {
    let calc = 0
    try {
      calc = await calcTarifSST({
        xPoids: s.xPoids,
        IDsous_traitant: s.IDsous_traitant,
        IDref_fini: s.IDreference,
        IDref_fini_colori: s.IDColoris,
      })
    } catch (e) {
      console.log(`line ${s.IDligne_commande_sous_traitant} ERR: ${(e as Error).message}`)
      continue
    }
    const delta = calc - s.prix
    const absDelta = Math.abs(delta)
    let verdict = 'OK'
    if (absDelta < 0.01) { matches++ }
    else if (absDelta < 0.05) { verdict = 'drift'; tinyDrift++ }
    else { verdict = 'BIG'; bigDrift++ }
    console.log(
      `${(s.sst_nom + '          ').slice(0, 12)}| ${String(s.IDligne_commande_sous_traitant).padStart(8)} | ${String(s.IDreference).padStart(5)} | ${s.xPoids.toFixed(1).padStart(6)} | ${s.prix.toFixed(2).padStart(6)} | ${calc.toFixed(2).padStart(6)} | ${delta >= 0 ? '+' : ''}${delta.toFixed(2).padStart(5)} | ${verdict}`,
    )
  }
  console.log(`\nMatches (Δ<0.01): ${matches}/${samples.length}`)
  console.log(`Small drift (0.01–0.05): ${tinyDrift}`)
  console.log(`Big drift (>0.05): ${bigDrift}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
