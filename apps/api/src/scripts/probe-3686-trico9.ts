// Probe 9: simulate the FIXED buildTricotage + fetchTricoStockFil for
// commande 3686 / line 12627 and compare against the legacy screenshot.
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

const LIGNE = 12627

async function main() {
  const rf = await query<any>(`SELECT IDref_ecru, rendement FROM ref_fini WHERE IDref_fini = 639`)
  const ecruRefId = Number(rf[0]?.IDref_ecru)
  const rendement = Number(rf[0]?.rendement)

  // --- tricotage grid ---
  const lines = await query<any>(
    `SELECT lcs.IDligne_commande_sous_traitant AS lid, lcs.quantite AS q,
            cst.IDcommande_sous_traitant AS cid
       FROM ligne_commande_sous_traitant lcs
       JOIN commande_sous_traitant cst ON cst.IDcommande_sous_traitant = lcs.IDcommande_sous_traitant
      WHERE lcs.type = 1 AND lcs.IDreference = ${ecruRefId} AND lcs.IDColoris IN (1094)
        AND cst.est_soldee = 0 AND lcs.sstatut IN ('En_Cours','Attente_Delai')`,
  )
  const lineIds = lines.map((l: any) => Number(l.lid))
  const aff = await query<any>(
    `SELECT IDligne_commande_sous_traitant AS lid, IDligne_commande_client AS lcc, poids_affecte
       FROM affectation_cmd_tricotage WHERE IDligne_commande_sous_traitant IN (${lineIds.join(',')})`,
  )
  console.log('=== Tricotage grid (legacy: 8582→6388/0/0, 8488→4000/0/0) ===')
  for (const l of lines) {
    const lid = Number(l.lid)
    let all = 0, mine = 0
    for (const a of aff.filter((a: any) => Number(a.lid) === lid)) {
      all += Number(a.poids_affecte) || 0
      if (Number(a.lcc) === LIGNE) mine += Number(a.poids_affecte) || 0
    }
    const dispo = Math.max(0, (Number(l.q) || 0) - all)
    console.log(`cst ${l.cid}: dispo=${dispo.toFixed(2)} affecté=${mine.toFixed(2)} métrage=${(mine * rendement).toFixed(2)}`)
  }

  // --- stock fil ---
  console.log('\n=== Stock fil (legacy: coton 3322.29/12541.24, élasthanne 307.65/18194.33) ===')
  const pairs = await query<any>(
    `SELECT DISTINCT IDref_fil, IDcolori_fil, pourcentage FROM composition_ecru
     WHERE IDref_ecru = ${ecruRefId} AND IDcolori_ecru IN (1094) AND IDref_fil > 0`,
  )
  const pairClause = pairs.map((p: any) => `(IDref_fil = ${p.IDref_fil} AND IDcolori_fil = ${p.IDcolori_fil})`).join(' OR ')
  const lots = await query<any>(
    `SELECT IDstock_fil, IDref_fil, IDcolori_fil, IDMagasin, stock FROM stock_fil WHERE (${pairClause}) AND stock > 0`,
  )
  const lotIds = lots.map((l: any) => Number(l.IDstock_fil))
  const assoOf = await query<any>(
    `SELECT IDstock_fil, IDordre_fabrication, pourcentage FROM asso_fil_of
     WHERE IDstock_fil IN (${lotIds.join(',')}) AND IDordre_fabrication > 0`,
  )
  const ofIds = Array.from(new Set(assoOf.map((a: any) => Number(a.IDordre_fabrication))))
  const openRows = await query<any>(
    `SELECT IDordre_fabrication, quantite FROM ordre_fabrication
     WHERE IDordre_fabrication IN (${ofIds.join(',')}) AND est_termine = 0`,
  )
  const openQ = new Map(openRows.map((o: any) => [Number(o.IDordre_fabrication), Number(o.quantite) || 0]))
  const prodRows = openQ.size > 0 ? await query<any>(
    `SELECT IDordre_fabrication AS ofid, SUM(poids) AS kg FROM stock_ecru
     WHERE IDordre_fabrication IN (${Array.from(openQ.keys()).join(',')}) GROUP BY IDordre_fabrication`,
  ) : []
  const prodByOf = new Map(prodRows.map((r: any) => [Number(r.ofid), Number(r.kg) || 0]))
  const pendingByLot = new Map<number, number>()
  for (const a of assoOf) {
    const q = openQ.get(Number(a.IDordre_fabrication))
    if (q === undefined) continue
    const remaining = Math.max(0, (q as number) - ((prodByOf.get(Number(a.IDordre_fabrication)) as number) ?? 0))
    const lot = Number(a.IDstock_fil)
    pendingByLot.set(lot, (pendingByLot.get(lot) ?? 0) + remaining * ((Number(a.pourcentage) || 0) / 100))
  }
  for (const l of lots) {
    const pct = Number(pairs.find((p: any) => Number(p.IDref_fil) === Number(l.IDref_fil))?.pourcentage) || 0
    const net = (Number(l.stock) || 0) - (pendingByLot.get(Number(l.IDstock_fil)) ?? 0)
    console.log(`fil ${l.IDref_fil} mag ${l.IDMagasin}: poids=${net.toFixed(2)} kg métrage=${((net / (pct / 100)) * rendement).toFixed(2)} ml`)
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
