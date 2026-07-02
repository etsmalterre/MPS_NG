import { AlertTriangle, MessageSquare } from 'lucide-react'

/** Quality defect logged in the legacy `defaut_qualite` table. Multiple
 *  rows can point at the same roll — each carries a `description`
 *  (precise human-readable) + `type_defaut` (category) + `taille_cm`. */
export interface RollNoteDefect {
  IDdefaut_qualite: number
  description: string | null
  type_defaut: string | null
  taille_cm: number | null
}

/** Shared notes block under a roll card. Two parallel banners that may
 *  appear independently or side-by-side:
 *
 *  - Red defect banner (AlertTriangle): structured `defects` from
 *    defaut_qualite (écru only) + a small "2e choix" tag when
 *    `secondChoix` is set + free-text `defautText` (fini's
 *    observation_sst, the ennoblisseur's defect report). The red frame +
 *    icon are themselves the "defect" affordance — no title needed.
 *  - Blue observation banner (MessageSquare): non-empty free-text
 *    observations — for fini rolls this is the internal note shared with
 *    the end customer.
 *
 *  When both are present they render side-by-side with the observation
 *  on the LEFT (less alarming → more alarming, left → right).
 *
 *  Each `observation` can carry a `label` that prefixes the text; pass
 *  `null` when the source is obvious. Empty observations are filtered out.
 */
export function RollNotes({
  secondChoix,
  observations,
  defects = [],
  defautText = '',
}: {
  secondChoix: boolean
  observations: Array<{ label: string | null; text: string }>
  defects?: RollNoteDefect[]
  defautText?: string | null
}) {
  const visibleObs = observations.filter((o) => o.text.length > 0)
  const hasObs = visibleObs.length > 0
  const hasDefects = defects.length > 0
  const defautBody = (defautText ?? '').trim()
  const hasDefautText = defautBody.length > 0
  const hasDefectBanner = secondChoix || hasDefects || hasDefautText
  if (!hasDefectBanner && !hasObs) return null

  const obsBlock = hasObs ? (
    <div className="flex-1 min-w-0 flex items-start gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-2 py-1.5">
      <MessageSquare className="h-3.5 w-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        {visibleObs.map((o, i) => (
          <p key={`obs-${i}`} className="text-xs text-blue-700 leading-snug italic">
            {o.label && (
              <span className="font-semibold not-italic text-blue-800">{o.label} : </span>
            )}
            {o.text}
          </p>
        ))}
      </div>
    </div>
  ) : null

  const defectBlock = hasDefectBanner ? (
    <div className="flex-1 min-w-0 flex items-start gap-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-1.5">
      <AlertTriangle className="h-3.5 w-3.5 text-red-600 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        {secondChoix && (
          <p className="text-[10px] font-bold uppercase tracking-wide text-red-700 leading-tight">
            2e choix
          </p>
        )}
        {hasDefects && (
          <ul className="space-y-0.5">
            {defects.map((d) => {
              const desc = (d.description ?? '').trim()
              const type = (d.type_defaut ?? '').trim()
              const size = Number(d.taille_cm) || 0
              const primary = desc || [type, size > 0 ? `${size} cm` : ''].filter(Boolean).join(' ')
              if (!primary) return null
              return (
                <li key={d.IDdefaut_qualite} className="text-xs text-red-700 leading-snug flex items-start gap-1">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span>{primary}</span>
                </li>
              )
            })}
          </ul>
        )}
        {hasDefautText && (
          <p className="text-xs text-red-700 leading-snug italic whitespace-pre-line">{defautBody}</p>
        )}
      </div>
    </div>
  ) : null

  return (
    <div className="mt-2 flex items-start gap-2">
      {obsBlock}
      {defectBlock}
    </div>
  )
}
