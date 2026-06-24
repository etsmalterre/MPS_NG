// Per-line auto-pricing for client orders (Clients › Commandes "Nouvelle ligne").
//
// Given the reference + coloris + quantity + unit the user is entering, this
// derives:
//   - the suggested unit price (€/Ml or €/Kg), and
//   - the roll-count note shown next to the quantity field (e.g. "10 Rouleaux
//     (480 Ml)" green when the quantity is a whole-roll multiple, "> 10 Rouleaux
//     (480 Ml)" amber when it overshoots a clean roll count).
//
// It is a thin layer over the legacy `PrixDeVenteV4` port:
//   - Fini (type 2) reuses `calcTarifRefFini` (validated exact against the legacy
//     "Gestion ligne de commande" window: ref 040A beige2585, 10 rolls → 10,43 €).
//   - Écru / tombé-de-métier (type 1) is the nType_Ref=1 reduction of the same
//     procedure: prix de revient = fil + tricotage only (no ennoblissement), then
//     ÷ margin ÷ port. Kg-based (écru has no rendement).
//   - Divers (type 3) and non Kg/Ml units are not auto-priced (manual entry).
//
// Roll geometry: one roll = `ref_ecru.poids` kg = `poids × rendement` Ml. The
// tariff tranche is the largest band (1,2,3,4,5,10,15,30 rolls) not exceeding the
// floored roll count; below one roll it's the "métrage" band (tranche 0).

import { query } from './hfsql-auto.js'
import {
  calcTarifRefFini,
  computePrixFil,
  COEFFICIENT_V2,
  ROLL_MULT,
} from './pricing-fini-tarif.js'

const TAUX_FRAIS_DE_PORT = 0.05
const TAUX_FRAIS_DE_PORT_30RLX = 0.03 // tranche i=8 (30 rolls)

/** Flag the next-tranche commercial nudge when the extra quantity needed to reach
 *  the next (cheaper) band is ≤ this fraction of the entered quantity. */
const NEAR_NEXT_TRANCHE_PCT = 0.15

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

export interface LignePriceResult {
  /** Suggested unit price in the line's unit (€/Ml for unite 3, €/Kg for unite 1),
   *  or null when the line can't be auto-priced. */
  prix: number | null
  unite: number
  /** Quantity that makes up one roll, in the line's unit (Ml or Kg). */
  rollSize: number
  /** Whole rolls the entered quantity covers (floored). */
  nRolls: number
  /** Quantity of `nRolls` whole rolls, in the line's unit. */
  cleanQty: number
  /** True when the entered quantity is an exact whole-roll multiple. */
  exact: boolean
  /** Roll count of the tariff band actually used for the price. */
  trancheRolls: number
  /** Roll count of the NEXT (cheaper) tariff band, 0 if already at the top band. */
  nextTrancheRolls: number
  /** Quantity (line's unit) needed to reach the next band, 0 if none. */
  nextTrancheQty: number
  /** Extra quantity (line's unit) to add to reach the next band, 0 if none. */
  nextTrancheGapQty: number
  /** Unit price at the next band, null if none — lets the UI nudge "order a bit
   *  more to drop to this price". */
  nextTranchePrix: number | null
  /** True when within NEAR_NEXT_TRANCHE_PCT of the next band — show the nudge. */
  nearNextTranche: boolean
  /** False for divers / unsupported units / missing data — UI shows no note. */
  priceable: boolean
}

const BASE: LignePriceResult = {
  prix: null, unite: 0, rollSize: 0, nRolls: 0, cleanQty: 0,
  exact: false, trancheRolls: 0,
  nextTrancheRolls: 0, nextTrancheQty: 0, nextTrancheGapQty: 0, nextTranchePrix: null,
  nearNextTranche: false,
  priceable: false,
}

/** Largest tranche index (1..8) whose roll band ≤ nRolls; tranche 0 ("métrage")
 *  when below a single roll. */
function pickTrancheIndex(nRolls: number): number {
  if (nRolls < 1) return 0
  let idx = 1
  for (let i = 1; i < ROLL_MULT.length; i++) {
    if (ROLL_MULT[i] <= nRolls) idx = i
  }
  return idx
}

/** Describe the next (cheaper) tariff band above tranche `idx`, given a per-tranche
 *  price function. Returns zeros when already at the top band or when the next
 *  band isn't strictly cheaper (defensive — bands are monotonically cheaper). */
function nextTranche(
  idx: number,
  rollSize: number,
  quantite: number,
  priceAt: (j: number) => number,
  currentPrix: number,
): {
  nextTrancheRolls: number
  nextTrancheQty: number
  nextTrancheGapQty: number
  nextTranchePrix: number | null
  nearNextTranche: boolean
} {
  const none = { nextTrancheRolls: 0, nextTrancheQty: 0, nextTrancheGapQty: 0, nextTranchePrix: null, nearNextTranche: false }
  const nIdx = idx + 1
  if (nIdx >= ROLL_MULT.length) return none
  const nextPrix = priceAt(nIdx)
  if (!(nextPrix < currentPrix)) return none
  const nextQty = round2(ROLL_MULT[nIdx] * rollSize)
  const gap = round2(nextQty - quantite)
  return {
    nextTrancheRolls: ROLL_MULT[nIdx],
    nextTrancheQty: nextQty,
    nextTrancheGapQty: gap,
    nextTranchePrix: nextPrix,
    nearNextTranche: gap > 0 && gap <= quantite * NEAR_NEXT_TRANCHE_PCT,
  }
}

/** Roll geometry from a quantity and the per-roll size (same unit). */
function geom(quantite: number, rollSize: number): { nRolls: number; cleanQty: number; exact: boolean } {
  const rollsFloat = quantite / rollSize
  const nRolls = Math.floor(rollsFloat + 1e-6)
  const cleanQty = round2(nRolls * rollSize)
  const exact = nRolls >= 1 && Math.abs(quantite - nRolls * rollSize) < rollSize * 1e-4
  return { nRolls, cleanQty, exact }
}

export async function calcLignePriceClient(p: {
  type: number
  IDreference: number
  IDcolori: number
  quantite: number
  unite: number
}): Promise<LignePriceResult> {
  const base = { ...BASE, unite: p.unite }
  // Only Kg (1) and Ml (3) lines have a roll-based tariff; divers / U / m² are manual.
  if (p.type === 3) return base
  if (!(p.IDreference > 0) || !(p.quantite > 0)) return base
  if (p.unite !== 1 && p.unite !== 3) return base

  // ── Fini (type 2) ──────────────────────────────────────────
  if (p.type === 2) {
    const tarif = await calcTarifRefFini(p.IDreference, p.IDcolori)
    if (!tarif.ref_ecru || tarif.tranches.length === 0) return base
    const poids = tarif.ref_ecru.poids
    // Round rendement to 2 dp before sizing a roll — HFSQL stores it as a noisy
    // float32 (e.g. 2.4000000953...), which would make a clean 1440 Ml read as
    // 29.99 rolls. This mirrors the engine's own `rdt2` rounding.
    const rendement = Math.round(tarif.rendement * 100) / 100
    const rollSize = p.unite === 3 ? (rendement > 0 ? poids * rendement : 0) : poids
    if (!(rollSize > 0)) return base
    const { nRolls, cleanQty, exact } = geom(p.quantite, rollSize)
    const idx = pickTrancheIndex(nRolls)
    const priceAt = (j: number) => (p.unite === 3 ? tarif.tranches[j].moPrixDeVenteAuMl : tarif.tranches[j].moPrixDeVenteAuKg)
    const prix = priceAt(idx)
    const next = nextTranche(idx, rollSize, p.quantite, priceAt, prix)
    return {
      prix, unite: p.unite, rollSize, nRolls, cleanQty, exact, trancheRolls: tarif.tranches[idx].rolls,
      ...next, priceable: true,
    }
  }

  // ── Écru / tombé de métier (type 1) — prix de revient = fil + tricotage ──
  if (p.type === 1) {
    const ecruRows = await query<{ poids: number | null; prix: number | null; rendement: number | null }>(
      `SELECT poids, prix, rendement FROM ref_ecru WHERE IDref_ecru = ${p.IDreference}`,
    )
    if (ecruRows.length === 0) return base
    const poids = Number(ecruRows[0].poids) || 0
    const prixTricotage = Number(ecruRows[0].prix) || 0
    const rendement = Math.round((Number(ecruRows[0].rendement) || 0) * 100) / 100
    if (!(poids > 0)) return base
    // One roll = poids kg = poids × rendement Ml. Ml lines need a rendement.
    const rollSize = p.unite === 3 ? (rendement > 0 ? poids * rendement : 0) : poids
    if (!(rollSize > 0)) return base
    const { nRolls, cleanQty, exact } = geom(p.quantite, rollSize)
    const idx = pickTrancheIndex(nRolls)

    const fil = await computePrixFil(p.IDreference, p.IDcolori)
    const moFil = round2(fil.reduce((s, d) => s + d.valueKg, 0))

    const priceAt = (j: number) => {
      let tric = prixTricotage
      if (j === 7) tric *= 0.95
      else if (j === 8) tric *= 0.9
      const venteKg = (moFil + tric) / (1 - COEFFICIENT_V2[j])
      const port = j === 8 ? TAUX_FRAIS_DE_PORT_30RLX : TAUX_FRAIS_DE_PORT
      return p.unite === 3 ? round2(venteKg / rendement / (1 - port)) : round2(venteKg / (1 - port))
    }
    const prix = priceAt(idx)
    const next = nextTranche(idx, rollSize, p.quantite, priceAt, prix)

    return {
      prix, unite: p.unite, rollSize, nRolls, cleanQty, exact, trancheRolls: ROLL_MULT[idx],
      ...next, priceable: true,
    }
  }

  return base
}
