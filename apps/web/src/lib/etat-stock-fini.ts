// État (stock_fini status) libellé → pill colour classes. Shared between the
// Finis/Stock table and the Sous-traitants/Gestion "rolls on site" table so the
// status tag reads identically across screens. Falls back to neutral zinc for
// unknown values.
export function etatPillClass(libelle: string | null): string {
  if (!libelle) return 'bg-zinc-100 text-zinc-700 border-zinc-200'
  const l = libelle.toLowerCase()
  if (l.includes('contrôle') || l.includes('controle')) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (l.includes('reprise')) return 'bg-orange-100 text-orange-800 border-orange-200'
  // "Validé" / "Disponible" / "Prêt" are all positive, approved states → green.
  if (l.includes('valid') || l.includes('disponible') || l.includes('prêt') || l.includes('pret')) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (l.includes('refus') || l.includes('rebut')) return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-zinc-100 text-zinc-700 border-zinc-200'
}
