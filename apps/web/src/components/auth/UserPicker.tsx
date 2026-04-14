// Fullscreen user picker — shown on first visit (no cookie) or after an
// explicit "Changer d'utilisateur" click. Mirrors the Malterre PDF gold
// header so the branding is consistent.

import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useUser } from '@/contexts/UserContext'
import { cn } from '@/lib/utils'

interface PickerUser {
  IDutilisateur: number
  prenom: string | null
  nom: string | null
  /** Lowercase legacy `pc` column — used to label role stations. */
  roleHint: string | null
}

// Maps the lowercase pc value to a human-readable role label. Only applied
// for stations that represent a role rather than an individual — everyone
// else just shows the name.
const ROLE_LABELS: Array<{ test: (pc: string) => boolean; label: string }> = [
  { test: (pc) => pc.includes('visitage'), label: 'Inspection qualité' },
  { test: (pc) => pc.includes('regleur'), label: 'Réglage machines' },
  { test: (pc) => pc === 'accueil-pc', label: 'Accueil' },
]

function roleLabel(roleHint: string | null): string | null {
  if (!roleHint) return null
  for (const r of ROLE_LABELS) if (r.test(roleHint)) return r.label
  return null
}

function initials(u: PickerUser): string {
  const p = (u.prenom?.trim() ?? '')[0] ?? ''
  const n = (u.nom?.trim() ?? '')[0] ?? ''
  const pair = `${p}${n}`.toUpperCase()
  return pair || '?'
}

function displayName(u: PickerUser): string {
  const p = u.prenom?.trim() ?? ''
  const n = u.nom?.trim() ?? ''
  return [p, n].filter(Boolean).join(' ') || '—'
}

export function UserPicker() {
  const { login } = useUser()

  const { data, isLoading, isError } = useQuery<PickerUser[]>({
    queryKey: ['auth', 'users'],
    queryFn: () => apiFetch<PickerUser[]>('/auth/users'),
    staleTime: Infinity, // the list barely changes
  })

  return (
    <div className="fixed inset-0 flex flex-col overflow-auto bg-background">
      {/* Gold header band — mirrors the PDF branding */}
      <div className="flex-shrink-0 bg-gold px-10 py-8 flex items-center justify-between">
        <img src="/logo-full.png" alt="ETS Malterre" className="h-16" />
        <div className="text-right text-white">
          <div className="text-xs uppercase tracking-widest opacity-90">Bonnetterie · Tricotage</div>
          <div className="text-2xl font-heading font-bold mt-1">ETS MALTERRE</div>
        </div>
      </div>
      {/* Thin dark blue separator like the PDF */}
      <div className="flex-shrink-0 h-[2px] bg-primary" />

      {/* Picker content */}
      <div className="flex-1 flex flex-col items-center justify-start py-16 px-8">
        <h1 className="text-4xl font-heading font-bold text-primary tracking-tight mb-3">
          Qui êtes-vous ?
        </h1>
        <p className="text-sm text-muted-foreground mb-12 max-w-md text-center">
          Sélectionnez votre utilisateur. Votre choix sera mémorisé sur cet
          ordinateur et vous n'aurez pas à le refaire à chaque visite.
        </p>

        {isLoading && (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="text-sm">Chargement de la liste des utilisateurs…</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 text-destructive">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">Impossible de charger la liste. Vérifiez que l'API est accessible.</p>
          </div>
        )}

        {data && data.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-5xl">
            {data.map((u) => {
              const role = roleLabel(u.roleHint)
              return (
                <button
                  key={u.IDutilisateur}
                  onClick={() => login(u.IDutilisateur)}
                  className={cn(
                    'group relative flex flex-col items-center gap-3 p-5 rounded-xl',
                    'bg-white border border-border/60 shadow-sm',
                    'hover:border-accent hover:ring-2 hover:ring-accent/30 hover:shadow-md',
                    'transition-all duration-150 cursor-pointer',
                  )}
                >
                  {/* Avatar initials on a gold circle — same yellow as the Modifier button */}
                  <div className="h-16 w-16 rounded-full bg-gold flex items-center justify-center text-gold-foreground text-xl font-heading font-bold shadow-sm">
                    {initials(u)}
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-primary leading-tight">
                      {displayName(u)}
                    </p>
                    {role && (
                      <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">
                        {role}
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
