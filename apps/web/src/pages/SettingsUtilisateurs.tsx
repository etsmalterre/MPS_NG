// Settings > Utilisateurs — admin-only page for managing per-user permissions.
// Built on the canonical 3-panel MasterDetailLayout: searchable user list on
// the left, a header + permission toggle cards in the centre, info on the right.
//
// Permissions are toggled inline (no edit mode). Each toggle immediately PUTs
// the new grant set to /api/permissions/users/:id and refreshes the list.

import { useState, useMemo, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Loader2, AlertCircle, Shield, Check } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useUser } from '@/contexts/UserContext'
import { usePermissions } from '@/contexts/PermissionsContext'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────

interface PermissionUser {
  IDutilisateur: number
  prenom: string | null
  nom: string | null
  roleHint: string | null
  granted: string[]
}

interface PermissionKeyDef {
  key: string
  label: string
  description: string
  category: string
}

// Maps the lowercase pc value to a human-readable role label (same as picker).
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

function initials(u: PermissionUser): string {
  const p = (u.prenom?.trim() ?? '')[0] ?? ''
  const n = (u.nom?.trim() ?? '')[0] ?? ''
  return (`${p}${n}`.toUpperCase()) || '?'
}

function displayName(u: PermissionUser): string {
  const p = u.prenom?.trim() ?? ''
  const n = u.nom?.trim() ?? ''
  return [p, n].filter(Boolean).join(' ') || '—'
}

function isVincent(u: PermissionUser): boolean {
  return (
    (u.prenom?.trim().toLowerCase() === 'vincent') &&
    (u.nom?.trim().toLowerCase() === 'malterre')
  )
}

// ── Page ───────────────────────────────────────────────

export function SettingsUtilisateurs() {
  const { user } = useUser()
  // Only EFFECTIVE admins (admin acting as themselves) can access this page.
  // When an admin impersonates another user, this drops to false and the
  // route guard below redirects to /. The admin must switch back to
  // themselves first via the header avatar to regain access.
  const { isEffectiveAdmin: viewerIsAdmin } = usePermissions()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // ── Data ───────────────────────────────────────
  const { data: users, isLoading, isError, error } = useQuery<PermissionUser[]>({
    queryKey: ['perm-users'],
    queryFn: () => apiFetch<PermissionUser[]>('/permissions/users'),
    enabled: viewerIsAdmin,
  })

  const { data: keys } = useQuery<PermissionKeyDef[]>({
    queryKey: ['perm-keys'],
    queryFn: () => apiFetch<PermissionKeyDef[]>('/permissions/keys'),
    staleTime: Infinity,
  })

  // Auto-select first user once loaded
  useEffect(() => {
    if (users && users.length > 0 && selectedId === null) {
      setSelectedId(users[0].IDutilisateur)
    }
  }, [users, selectedId])

  // ── Mutation: toggle a permission key ─────────
  const updateMut = useMutation({
    mutationFn: ({ id, granted }: { id: number; granted: string[] }) =>
      apiFetch<{ IDutilisateur: number; granted: string[] }>(
        `/permissions/users/${id}`,
        { method: 'PUT', body: JSON.stringify({ granted }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perm-users'] })
    },
  })

  const filtered = useMemo(() => {
    if (!users) return []
    if (!searchQuery.trim()) return users
    const q = searchQuery.toLowerCase()
    return users.filter((u) => displayName(u).toLowerCase().includes(q))
  }, [users, searchQuery])

  const selected = useMemo(() => {
    if (!users || selectedId === null) return null
    return users.find((u) => u.IDutilisateur === selectedId) ?? null
  }, [users, selectedId])

  // ── Admin guard (belt-and-suspenders) ──────────
  // Sidebar already hides the link, but a direct URL hit needs page-level
  // protection too. Wait until the user context has loaded before deciding,
  // otherwise a brief flicker would redirect admins to /.
  if (!user) return null
  if (!viewerIsAdmin) return <Navigate to="/" replace />

  // ── Render ─────────────────────────────────────
  return (
    <MasterDetailLayout
      hasSelection={selectedId !== null}
      onBack={() => setSelectedId(null)}
      sidebarTitle="Informations"
      sidebar={null}
      list={
        <UserList
          rows={filtered}
          isLoading={isLoading}
          isError={isError}
          error={error as Error | null}
          selectedId={selectedId}
          onSelect={setSelectedId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      }
      detailHeader={<DetailHeader user={selected} />}
      detail={
        <DetailBody
          user={selected}
          keys={keys ?? []}
          isUpdating={updateMut.isPending}
          onToggle={(key, nextValue) => {
            if (!selected) return
            const current = new Set(selected.granted)
            if (nextValue) current.add(key)
            else current.delete(key)
            updateMut.mutate({ id: selected.IDutilisateur, granted: Array.from(current) })
          }}
        />
      }
    />
  )
}

// ── Left Panel: List ───────────────────────────────────

function UserList({
  rows, isLoading, isError, error,
  selectedId, onSelect,
  searchQuery, onSearchChange,
}: {
  rows: PermissionUser[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  selectedId: number | null
  onSelect: (id: number) => void
  searchQuery: string
  onSearchChange: (q: string) => void
}) {
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      {/* Search header */}
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher un utilisateur..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off"
            className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* List body */}
      <div className="flex-1 overflow-auto p-3 space-y-2 scrollbar-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-8 text-destructive">
            <AlertCircle className="h-6 w-6 mb-2" />
            <p className="text-sm">{error?.message || 'Erreur'}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">Aucun utilisateur</p>
          </div>
        ) : rows.map((u) => {
          const isSelected = selectedId === u.IDutilisateur
          const role = roleLabel(u.roleHint)
          const isVin = isVincent(u)
          return (
            <div
              key={u.IDutilisateur}
              onClick={() => onSelect(u.IDutilisateur)}
              className={cn(
                'p-3 border rounded-lg cursor-pointer transition-all bg-white flex items-center gap-3',
                isSelected
                  ? 'border-accent ring-1 ring-accent'
                  : 'border-border hover:border-accent/50'
              )}
            >
              <div className="h-8 w-8 rounded-full bg-gold flex items-center justify-center text-gold-foreground text-xs font-bold flex-shrink-0">
                {initials(u)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate">{displayName(u)}</p>
                  {isVin && (
                    <Shield className="h-3 w-3 text-accent flex-shrink-0" />
                  )}
                </div>
                {role && (
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{role}</p>
                )}
              </div>
              {u.granted.length > 0 && (
                <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
                  {u.granted.length}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer count */}
      {rows.length > 0 && (
        <div className="p-3 border-t text-xs text-muted-foreground rounded-b-lg bg-zinc-200/50">
          {rows.length} utilisateur{rows.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

// ── Center: Detail Header ──────────────────────────────

function DetailHeader({ user }: { user: PermissionUser | null }) {
  if (!user) return null
  const isVin = isVincent(user)
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-gold flex items-center justify-center text-gold-foreground font-heading font-bold shadow-sm">
          {initials(user)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-heading font-bold tracking-tight truncate">
              {displayName(user)}
            </h1>
            {isVin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/15 text-accent text-[10px] font-bold uppercase tracking-wide">
                <Shield className="h-3 w-3" />
                Administrateur
              </span>
            )}
          </div>
          {user.roleHint && (
            <p className="text-xs text-muted-foreground mt-1">{user.roleHint}</p>
          )}
        </div>
      </div>
      <div className="h-1 w-24 mt-3 rounded-full bg-gradient-to-r from-accent via-accent to-accent/30" />
    </div>
  )
}

// ── Center: Detail Body (permission toggles) ──────────

function DetailBody({
  user, keys, isUpdating, onToggle,
}: {
  user: PermissionUser | null
  keys: PermissionKeyDef[]
  isUpdating: boolean
  onToggle: (key: string, nextValue: boolean) => void
}) {
  if (!user) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="icon-box-gold h-16 w-16 mx-auto"><Shield className="h-8 w-8" /></div>
        <p className="text-muted-foreground text-sm">Sélectionnez un utilisateur dans la liste</p>
      </div>
    </div>
  )

  const isVin = isVincent(user)
  const grantedSet = new Set(user.granted)

  // Group keys by category
  const grouped = useMemo(() => {
    const g = new Map<string, PermissionKeyDef[]>()
    for (const k of keys) {
      const cat = k.category || 'Général'
      if (!g.has(cat)) g.set(cat, [])
      g.get(cat)!.push(k)
    }
    return Array.from(g.entries())
  }, [keys])

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-auto pr-1 scrollbar-transparent">
      {isVin && (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-accent/40 bg-accent/[0.06]">
          <Shield className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-primary">Cet utilisateur est administrateur</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Les administrateurs disposent automatiquement de toutes les permissions, indépendamment des
              cases ci-dessous. Aucun toggle ne peut leur retirer un droit.
            </p>
          </div>
        </div>
      )}

      {grouped.map(([category, items]) => (
        <div key={category} className="rounded-lg border border-border/60 bg-white shadow-sm">
          <div className="px-4 py-2 border-b border-border/60 bg-zinc-100/80 rounded-t-lg">
            <p className="text-xs font-bold text-primary uppercase tracking-wide">{category}</p>
          </div>
          <div className="divide-y divide-border/60">
            {items.map((k) => {
              const checked = isVin || grantedSet.has(k.key)
              return (
                <label
                  key={k.key}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 transition-colors',
                    isVin || isUpdating ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-zinc-50',
                  )}
                >
                  <ToggleSwitch
                    checked={checked}
                    disabled={isVin || isUpdating}
                    onChange={(next) => onToggle(k.key, next)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{k.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{k.description}</p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Toggle switch (styled checkbox) ───────────────────

function ToggleSwitch({
  checked, disabled, onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => { e.preventDefault(); onChange(!checked) }}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-gold' : 'bg-zinc-300',
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
      {checked && (
        <Check className="absolute left-0.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-gold-foreground/70" />
      )}
    </button>
  )
}
