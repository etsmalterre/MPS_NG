import { cn } from '@/lib/utils'

// État (stock_fini status) libellé → pill colour classes. Shared between the
// Finis/Stock table, the Sous-traitants/Gestion "rolls on site" table and the
// Clients/Commandes affectation drawer so the status tag reads identically
// across screens. Falls back to neutral zinc for unknown values.
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

// Canonical stock_fini état pill. Every screen displaying a roll's état must
// render this component — never an ad-hoc <Badge> — so the colour language
// (green = validé/disponible, amber = contrôle, orange = reprise, red =
// refusé/rebut) stays identical everywhere. Renders nothing when the libellé
// is empty; call sites decide whether to show a "—" fallback.
export function EtatPill({ libelle, className }: { libelle: string | null; className?: string }) {
  if (!libelle) return null
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border',
        etatPillClass(libelle),
        className,
      )}
    >
      {libelle}
    </span>
  )
}
