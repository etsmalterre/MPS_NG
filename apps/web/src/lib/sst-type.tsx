import { cn } from '@/lib/utils'

// Hue-per-type chip for a sous-traitant type (Tricoteur / Ennoblisseur /
// Confectionneur / Autre). One distinct colour per type so the visual scan is
// fast across the Sous-traitants screens. Gold is reserved for the brand's CTA /
// active state — never reuse it for these category tags. Single source of truth
// shared by Sous-traitants › Commandes and › Gestion; see mps_designer §36.

/** Colour classes (bg + text + border) for the sous-traitant type chip. */
export function sstTypeTagClasses(type: string | null): string {
  const t = (type ?? '').trim().toLowerCase()
  // Ennoblisseur → sky (cool, dye/water association).
  if (t === 'ennoblisseur') return 'bg-sky-500/10 text-sky-700 border border-sky-500/25'
  // Tricoteur → amber (warm, yarn association).
  if (t === 'tricoteur') return 'bg-amber-500/15 text-amber-800 border border-amber-500/30'
  // Confectionneur → teal (clean cut-and-sew finishing).
  if (t === 'confectionneur') return 'bg-teal-500/10 text-teal-700 border border-teal-500/25'
  // "Autre" or unrecognised — muted stone fallback.
  return 'bg-stone-500/10 text-stone-700 border border-stone-500/25'
}

/** The type chip itself. `size="sm"` for left-list cards, `size="md"` for detail
 *  headers / KV rows. Renders nothing for an empty type. */
export function SstTypeTag({ type, size = 'sm', className }: { type: string | null; size?: 'sm' | 'md'; className?: string }) {
  if (!type || !type.trim()) return null
  return (
    <span className={cn(
      'inline-flex items-center rounded font-medium whitespace-nowrap',
      size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
      sstTypeTagClasses(type),
      className,
    )}>
      {type}
    </span>
  )
}
