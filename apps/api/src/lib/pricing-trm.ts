// Tricotage Malterre auto-pricing — port of the legacy WLanguage
// procedure `PrixDeRevientTRM` (cost-price per kg of écru produced by
// TRM's own factory). Activated ONLY for TRM sst commandes
// (IDsous_traitant=1); external tricoteurs price manually.
//
// Algorithm summary (full legacy spec + WLanguage source in memory
// [[project-pricing-prixderevient-trm]]):
//
//   gxNbToursKg = MIN((ref_ecru_machine.trs_10kg_chute / nb_chutes) / 10)
//                 FOR ref_ecru_machine WHERE IDref_ecru = X
//   gxMinParKg  = gxNbToursKg / 20    // 20 turns / minute target speed
//
//   FraisStructure_€/kg = (energie + maintenance + amortissement +
//                          abonnement + direction + autre_frais)
//                         / prod_annuel
//   xCoutAmortissement_€/kg = cout_metier
//                             / (5_276_160 trs_annuel × duree_amortissement_metier)
//                             × gxNbToursKg
//   xCoutChangementAiguilles_€/kg = (NbAiguilles × cout_aiguille)
//                                   / duree_vie_aiguille × gxNbToursKg
//   xCoutConsoElec_€/kg  = (gxMinParKg × 3KW / 60) × prix_kwh
//
//   For each "employé" category (bonnetier, regleur, visiteur, magasinier,
//   administration):
//     cost = Σ coutOperation(tps_X, freq_X, cout_horaire) / xPoidsCommandé
//     coutOperation = tps_min × ceil(xPoidsCommandé / freq) × (cout_horaire/60)
//     freq = "" → nbOperations = 1 (one-off, not amortized over weight)
//
// Final per-kg cost = sum of all the above.
// Final line.prix = max(PrixDeRevientTRM, ref_ecru.prix).
//
// Legacy quirks preserved verbatim (do NOT "fix"):
//   - Visiteur block re-uses `cout_horaire_bonnetier` (not `cout_horaire_visiteur`).
//     Both rates are 14 €/h in current data so the math is identical, but
//     the legacy code has a literal bug. Port matches.
//   - Visiteur block also adds `tps_garniture` (already counted under
//     Bonnetier). Counted twice in legacy. Port matches.
//   - Magasinier block also adds `tps_preparation` (already counted under
//     Bonnetier with the same freq). Counted twice in legacy. Port matches.
//   - The "20 turns/min" target speed is hardcoded in both gxMinParKg and
//     xNb_Tour_Annuel (= 20 trs/min × 229 days × 80% TRS = 5 276 160).
//     Both stay as literals.

import { query } from './hfsql-auto.js'

// ── Pure helpers (no DB access) ────────────────────────────

/** Number of needles on the machine for the given (Jauge, diamètre) lookups.
 *  Both are integer codes on ref_ecru that map to actual values:
 *    Jauge:    1→0, 2→14, 3→18, 4→20, 5→28
 *    diamètre: 1→0, 2→26, 3→30
 *  Returns round(π × diamètre × jauge, 0). Returns 0 for unknown codes
 *  (matches legacy behaviour). */
export function NbAiguilles(jaugeCode: number, diametreCode: number): number {
  let jauge = 0
  switch (jaugeCode) {
    case 1: jauge = 0; break
    case 2: jauge = 14; break
    case 3: jauge = 18; break
    case 4: jauge = 20; break
    case 5: jauge = 28; break
  }
  let diametre = 0
  switch (diametreCode) {
    case 1: diametre = 0; break
    case 2: diametre = 26; break
    case 3: diametre = 30; break
  }
  return Math.round(Math.PI * diametre * jauge)
}

/** `coutOperation` — per-task cost for the line, in €.
 *  Time-based amortization: nbOperations = ceil(xPoidsCommandé / freq).
 *  When `freqKey` is empty, the task is treated as one-off (nbOperations=1).
 *  Returns the operation's total cost over the line — caller divides by
 *  xPoidsCommandé to get a €/kg figure. */
export function coutOperation(
  tpsKey: string,
  freqKey: string,
  hourlyRate: number,
  xPoidsCommandé: number,
  tarifMap: Map<string, number>,
): number {
  const xTemps = tarifMap.get(tpsKey) ?? 0
  const xCoutEmployeParMinute = hourlyRate / 60
  let nbOperations: number
  if (freqKey && freqKey.length > 0) {
    const xFrequence = tarifMap.get(freqKey) ?? 0
    if (xFrequence <= 0) {
      // Defensive: legacy passes through unchanged. Treat as 1 op.
      nbOperations = 1
    } else {
      nbOperations = Math.ceil(xPoidsCommandé / xFrequence)
    }
  } else {
    nbOperations = 1
  }
  return xTemps * nbOperations * xCoutEmployeParMinute
}

// ── DB-backed pieces ───────────────────────────────────────

/** Load every tarif_TRM row into a Map<identifiant, nombre> for O(1)
 *  lookups during the algo. ~50 rows, ~3ms. */
export async function loadTarifTrmConfig(): Promise<Map<string, number>> {
  const rows = await query<{ identifiant: string; nombre: number | null }>(
    `SELECT identifiant, nombre FROM tarif_TRM`,
  )
  const m = new Map<string, number>()
  for (const r of rows) {
    const key = (r.identifiant ?? '').toString().trim()
    if (key.length > 0) m.set(key, Number(r.nombre) || 0)
  }
  return m
}

/** Per-ref production data — `gxNbToursKg` is the min turns-per-kg across
 *  all machines defined for this ref_ecru. Returns 0 if no machine rows
 *  exist (then the algo returns 0 too → floor wins via max). */
export async function loadTrsParKg(IDref_ecru: number): Promise<number> {
  if (!(IDref_ecru > 0)) return 0
  const rows = await query<{ trs_par_kg: number | null }>(
    `SELECT MIN((trs_10kg_chute/nb_chutes)/10) AS trs_par_kg
     FROM ref_ecru_machine WHERE IDref_ecru = ${IDref_ecru}`,
  )
  return Number(rows[0]?.trs_par_kg) || 0
}

/** Per-ref Jauge + diamètre codes from ref_ecru.
 *  Accented column "diamètre" — Linux ODBC bridge rejects accented
 *  identifiers in SELECT lists, Windows accepts them. Use `SELECT *` so
 *  the row carries both forms (the bridge mangles to "diamtre" or
 *  similar on Linux; Windows keeps the accent). Pluck whichever key the
 *  driver surfaced. */
export async function loadRefEcruMachineCodes(IDref_ecru: number): Promise<{ Jauge: number; diametre: number }> {
  if (!(IDref_ecru > 0)) return { Jauge: 0, diametre: 0 }
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM ref_ecru WHERE IDref_ecru = ${IDref_ecru}`,
  )
  if (rows.length === 0) return { Jauge: 0, diametre: 0 }
  const r = rows[0] as any
  return {
    Jauge: Number(r.Jauge) || 0,
    diametre: Number(r['diamètre'] ?? r.diametre ?? r['diamtre']) || 0,
  }
}

/** `ref_ecru.prix` — the contractual floor. The final line.prix is
 *  max(PrixDeRevientTRM, this). */
export async function loadRefEcruPrixFloor(IDref_ecru: number): Promise<number> {
  if (!(IDref_ecru > 0)) return 0
  const r = await query<{ prix: number | null }>(
    `SELECT prix FROM ref_ecru WHERE IDref_ecru = ${IDref_ecru}`,
  )
  return Number(r[0]?.prix) || 0
}

// ── Main algorithm ─────────────────────────────────────────

/** Constants from the legacy code. */
const NB_TOUR_ANNUEL = 5_276_160 // 20 trs/min × 229 days × 80% TRS
const TARGET_SPEED_TRS_MIN = 20  // gxMinParKg = gxNbToursKg / 20
const MACHINE_POWER_KW = 3       // ConsoElecParKg = gxMinParKg × 3 / 60

/** Compute the production cost per kg of écru. Returns 0 if any required
 *  input is missing (no ref_ecru_machine rows, no quantity, etc.) so the
 *  caller can default to the ref_ecru.prix floor via `max()`. */
export async function prixDeRevientTRM(
  IDref_ecru: number,
  xPoidsCommandé: number,
): Promise<number> {
  if (xPoidsCommandé <= 0 || IDref_ecru <= 0) return 0

  const [tarif, gxNbToursKg, codes] = await Promise.all([
    loadTarifTrmConfig(),
    loadTrsParKg(IDref_ecru),
    loadRefEcruMachineCodes(IDref_ecru),
  ])

  // Without machine data we can't compute amortization or needle wear —
  // bail to 0 so the floor wins.
  if (gxNbToursKg <= 0) return 0

  const gxMinParKg = gxNbToursKg / TARGET_SPEED_TRS_MIN

  // ── Frais de structure (annual fixed costs / annual production) ──
  const xProdAnnuel = tarif.get('prod_annuel') ?? 0
  let xCoutAnnuelTotal = 0
  for (const key of ['energie', 'maintenance', 'amortissement', 'abonnement', 'direction', 'autre_frais']) {
    xCoutAnnuelTotal += tarif.get(key) ?? 0
  }
  const FraisStructure = xProdAnnuel > 0 ? xCoutAnnuelTotal / xProdAnnuel : 0

  // ── Frais de production ──
  // Amortissement machine
  const xCout_metier = tarif.get('cout_metier') ?? 0
  const xDuréé_amortissement = tarif.get('duree_amortissement_metier') ?? 0
  const denominator = NB_TOUR_ANNUEL * xDuréé_amortissement
  const xCoutAmortissement = denominator > 0
    ? (xCout_metier / denominator) * gxNbToursKg
    : 0

  // Changement des aiguilles
  const xCout_aiguille = tarif.get('cout_aiguille') ?? 0
  const nbAiguilles = NbAiguilles(codes.Jauge, codes.diametre)
  const xPrixJeuAiguille = nbAiguilles * xCout_aiguille
  const xDuréeDeVie = tarif.get('duree_vie_aiguille') ?? 0
  const xPrixParTour = xDuréeDeVie > 0 ? xPrixJeuAiguille / xDuréeDeVie : 0
  const xCoutChangementAiguilles = xPrixParTour * gxNbToursKg

  // Conso électrique — legacy hardcoded 3 KW machine power.
  const xPrixDuKWH = tarif.get('prix_kwh') ?? 0
  const ConsoElecParKg = (gxMinParKg * MACHINE_POWER_KW) / 60
  const xCoutConsoElec = ConsoElecParKg * xPrixDuKWH

  // ── Main d'œuvre ──
  // Bonnetier
  let xCoutHoraire = tarif.get('cout_horaire_bonnetier') ?? 0
  let xCoutDeLaCommande = 0
  xCoutDeLaCommande += coutOperation('tps_garniture', '', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_preparation', 'freq_preparation', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_doublage', 'freq_doublage', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_redemarrage_machine', 'freq_redemarrage_machine', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_nettoyage', 'freq_nettoyage', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_fin_piece', 'freq_fin_piece', xCoutHoraire, xPoidsCommandé, tarif)
  const CoutBonnetierParKg = xCoutDeLaCommande / xPoidsCommandé

  // Régleur
  xCoutHoraire = tarif.get('cout_horaire_regleur') ?? 0
  xCoutDeLaCommande = 0
  xCoutDeLaCommande += coutOperation('tps_reglage_machine', '', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_controle_param', 'freq_controle_param', xCoutHoraire, xPoidsCommandé, tarif)
  const xCoutRegleurParKg = xCoutDeLaCommande / xPoidsCommandé

  // Visiteur — LEGACY QUIRK: reads cout_horaire_bonnetier (not _visiteur)
  // AND re-counts tps_garniture (already in Bonnetier). Ported as-is so
  // MPS_NG matches legacy outputs exactly. Both rates are 14 €/h today so
  // the bug is invisible in current data.
  xCoutHoraire = tarif.get('cout_horaire_bonnetier') ?? 0
  xCoutDeLaCommande = 0
  xCoutDeLaCommande += coutOperation('tps_garniture', '', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_visitage', 'freq_visitage', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_saisie_piece', 'freq_saisie_piece', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_manutention', 'freq_manutention', xCoutHoraire, xPoidsCommandé, tarif)
  const xCoutVisiteurParKg = xCoutDeLaCommande / xPoidsCommandé

  // Magasinier — LEGACY QUIRK: re-counts tps_preparation (already in
  // Bonnetier). Port matches.
  xCoutHoraire = tarif.get('cout_horaire_magasinier') ?? 0
  xCoutDeLaCommande = 0
  xCoutDeLaCommande += coutOperation('tps_reception_fil', 'freq_reception_fil', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_preparation', 'freq_preparation', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_conditionnement', 'freq_conditionnement', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_organisation_stock', '', xCoutHoraire, xPoidsCommandé, tarif)
  const xCoutMagasinierParKg = xCoutDeLaCommande / xPoidsCommandé

  // Administration
  xCoutHoraire = tarif.get('cout_horaire_administration') ?? 0
  xCoutDeLaCommande = 0
  xCoutDeLaCommande += coutOperation('tps_traitement_of', '', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_gestion_commande', '', xCoutHoraire, xPoidsCommandé, tarif)
  xCoutDeLaCommande += coutOperation('tps_gestion_expedition', '', xCoutHoraire, xPoidsCommandé, tarif)
  const xCoutAdministrationParKg = xCoutDeLaCommande / xPoidsCommandé

  return (
    FraisStructure
    + xCoutAmortissement
    + xCoutChangementAiguilles
    + xCoutConsoElec
    + CoutBonnetierParKg
    + xCoutRegleurParKg
    + xCoutVisiteurParKg
    + xCoutMagasinierParKg
    + xCoutAdministrationParKg
  )
}

/** Margin applied to the cost price to get the sale price. Legacy
 *  WLanguage: `moPrixMargé = PrixDeRevientTRM(...) / 0.7` — 30 % markup.
 *  Centralised here so a future tarif adjustment is one-line. */
export const TRM_MARGIN = 0.30

/** Final tricoteur line prix per the legacy WLanguage at line-save time:
 *
 *    moPrixMargé = PrixDeRevientTRM(IDref_ecru, qty) / (1 - 0.30)
 *    line.prix   = (moPrixMargé > ref_ecru.prix) ? moPrixMargé : ref_ecru.prix
 *
 *  Applied to every line with `type=1` (tricoteur), regardless of which
 *  knitter — the legacy gate is on the line's type, not the sous-traitant
 *  identity. External tricoteurs get TRM's cost model as a starting
 *  reference; the user can override manually after creation.
 *  Rounded to 2 decimals (Arrondi(moPrix, 2)). */
export async function trmLinePrix(
  IDref_ecru: number,
  xPoidsCommandé: number,
): Promise<number> {
  const [algoCost, floor] = await Promise.all([
    prixDeRevientTRM(IDref_ecru, xPoidsCommandé),
    loadRefEcruPrixFloor(IDref_ecru),
  ])
  const algoSale = algoCost > 0 ? algoCost / (1 - TRM_MARGIN) : 0
  const best = Math.max(algoSale, floor)
  return Math.round(best * 100) / 100
}
