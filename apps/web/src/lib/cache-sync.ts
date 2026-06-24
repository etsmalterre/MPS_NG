import type { QueryClient } from '@tanstack/react-query'

// Lot quality state (suivilot.IDetatLot) and roll state (stock_fini.IDetat_stock_fini)
// are shared by two screens that write to it independently:
//   • Sous-traitants › Commandes — réception, reprise, soumission (sets the lot
//     to "Attente Client"), and the computed phase pill.
//   • Qualité › Suivi des lots — the responsable's Valider / Reprendre verdict
//     (Reprendre also flags the lot's rolls).
// A change on either screen alters data the other renders, so both query
// families must be invalidated together. Without this, the global 5-minute
// staleTime (main.tsx) keeps the other screen on stale cache until a hard
// reload. invalidateQueries marks matching queries stale regardless of
// staleTime, so active queries refetch immediately and inactive ones refetch on
// their next mount.
export function invalidateLotQualityCaches(qc: QueryClient): void {
  // Qualité › Suivi des lots
  qc.invalidateQueries({ queryKey: ['suivi-lots'] }) // list (état pills)
  qc.invalidateQueries({ queryKey: ['suivi-lot'] }) // any open detail (footer pill, pièces)

  // Sous-traitants › Commandes — note these are distinct key roots (React Query
  // matches by array prefix, element-by-element, so each family is listed).
  qc.invalidateQueries({ queryKey: ['commandes-sst'] }) // list (computed phase pill)
  qc.invalidateQueries({ queryKey: ['commande-sst'] }) // detail
  qc.invalidateQueries({ queryKey: ['commande-sst-pieces'] }) // réception / affectés drawer (roll état badges)
  qc.invalidateQueries({ queryKey: ['commande-sst-lots-eligibles'] }) // soumission eligibility
  qc.invalidateQueries({ queryKey: ['commande-sst-urgency-counts'] }) // header urgency counts
}
