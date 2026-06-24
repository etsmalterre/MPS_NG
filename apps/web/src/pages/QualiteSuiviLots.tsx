// Qualité › Suivi Lots — quality-control lot tracking.
//
// Master-detail screen mirroring SousTraitantsCommandes / EtudesColoris:
//   - left list of lots (suivilot) with search + En cours / Terminé / Tous filter
//   - center: Récapitulatif de la commande (read-only) + spec banner + Pièces du
//     lot sub-table (read-only, per-roll Rdt = metrage/poids + Moyenne footer)
//   - right sidebar tabs: Contrôles (editable) / Documents / Défauts / Client
//   - status footer pill = lot état (En contrôle / En reprise / Validé / Expédié
//     / Attente), changed immediately. The En cours / Terminé filters key off the
//     état (Validé = Terminé), NOT fin_archivage.
//
// Edit mode (Modifier → Enregistrer) only touches the Contrôles measurements +
// observations + emplacement + fin d'archivage (the sample-disposal date — when
// the physical swatch can be discarded; not a status). Plugged into the shared
// unsaved-changes guard.

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck,
  Search,
  Loader2,
  AlertCircle,
  Pencil,
  X,
  Save,
  Clock,
  RotateCcw,
  CheckCircle2,
  Truck,
  User,
  ChevronUp,
  Ruler,
  Package,
  FileText,
  AlertTriangle,
  Building2,
  ClipboardCheck,
  Factory,
  MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { apiFetch, API_URL } from '@/lib/api'
import { invalidateLotQualityCaches } from '@/lib/cache-sync'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { fmtNum } from '@/lib/format'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────

type Etat = 1 | 2 | 3 | 4 | 5

interface ListRow {
  IDsuivilot: number
  lot: string
  sous_traitant_nom: string
  IDetatLot: number | null
  etat_libelle: string | null
  date: string | null
}

interface QualityEntry {
  source: string
  author: string
  text: string
}

interface PieceRow {
  IDstock_fini: number
  numero: string
  poids: number
  metrage: number
  magasin_nom: string
  rdt: number | null
  valid: boolean | null
  quality: QualityEntry[]
}

interface ClientInfo {
  IDclient: number
  nom: string
  numero: string | null
  ref_client: string | null
}

interface SuiviLotDetail {
  IDsuivilot: number
  lot: string
  DATE: string | null
  IDcommande_sous_traitant: number
  IDligne_commande_sous_traitant: number
  IDsous_traitant: number
  date_commande: string | null
  reference: string
  coloris: string
  commentaire: string
  laize_demandee: number
  poids_demande: number
  rendement_demande: number
  freinte_demandee: number
  stabH_demandee: number
  stabL_demandee: number
  laize_sst: number
  poids_sst: number
  rendement_sst: number
  freinte_sst: number
  stabH_sst: number
  stabL_sst: number
  laize_tirelle: number
  poids_tirelle: number
  rendement_tirelle: number
  stabH_tirelle: number
  stabL_tirelle: number
  observations: string
  emplacement_tirelle: string
  fin_archivage: string
  IDetatLot: number | null
  etat_libelle: string | null
  pieces: PieceRow[]
  moyenne_rdt: number | null
  rendement_mini: number | null
  rendement_maxi: number | null
  ref_bounds: RefBounds
  client: ClientInfo | null
}

interface RefBounds {
  laize_min: number
  laize_max: number
  poids_min: number
  poids_max: number
  stab_hauteur: number
  stab_largeur: number
}

interface DefautRow {
  IDdefaut_qualite: number
  roll_numero: string
  description: string
  type_defaut: string
  taille_cm: number
  nombre: number
  date: string
}

interface DocRow {
  IDged: number
  nom: string | null
  commentaire: string | null
  IDtype_doc: number
  type_nom: string | null
}

type StatusFilter = 'en_cours' | 'termine' | 'tous'

// État metadata — shared by the list-card icon and the footer pill.
const ETAT_META: Record<Etat, {
  label: string
  icon: typeof Clock
  solidBg: string
  iconColor: string
}> = {
  1: { label: 'En contrôle', icon: Clock, solidBg: 'bg-amber-500 border-amber-500', iconColor: 'text-amber-600' },
  2: { label: 'En reprise', icon: RotateCcw, solidBg: 'bg-orange-500 border-orange-500', iconColor: 'text-orange-600' },
  3: { label: 'Validé', icon: CheckCircle2, solidBg: 'bg-success border-success', iconColor: 'text-green-600' },
  4: { label: 'Expédié', icon: Truck, solidBg: 'bg-blue-500 border-blue-500', iconColor: 'text-blue-600' },
  5: { label: 'Attente Client', icon: User, solidBg: 'bg-violet-500 border-violet-500', iconColor: 'text-violet-600' },
}
const ETAT_ORDER: Etat[] = [1, 2, 3, 4, 5]

// The responsable qualité's only two manual verdicts. Other états are
// system-driven (reception → 1, soumission → 5, rework re-reception → 1).
const ETAT_ACTIONS: Etat[] = [3, 2] // Valider, Reprendre

function etatOf(id: number | null | undefined): Etat | null {
  const v = Number(id)
  return ETAT_ORDER.includes(v as Etat) ? (v as Etat) : null
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'en_cours', label: 'En cours' },
  { key: 'termine', label: 'Terminé' },
  { key: 'tous', label: 'Tous' },
]

// Editable Contrôles draft — strings so inputs allow free typing / empty.
interface EditState {
  laize_sst: string
  poids_sst: string
  rendement_sst: string
  stabH_sst: string
  stabL_sst: string
  laize_tirelle: string
  poids_tirelle: string
  rendement_tirelle: string
  stabH_tirelle: string
  stabL_tirelle: string
  observations: string
  emplacement_tirelle: string
  fin_archivage: string // yyyy-mm-dd
}

function numStr(v: number): string {
  return v === 0 ? '' : String(v)
}

function snapshotEdit(d: SuiviLotDetail): EditState {
  return {
    laize_sst: numStr(d.laize_sst),
    poids_sst: numStr(d.poids_sst),
    rendement_sst: numStr(d.rendement_sst),
    stabH_sst: numStr(d.stabH_sst),
    stabL_sst: numStr(d.stabL_sst),
    laize_tirelle: numStr(d.laize_tirelle),
    poids_tirelle: numStr(d.poids_tirelle),
    rendement_tirelle: numStr(d.rendement_tirelle),
    stabH_tirelle: numStr(d.stabH_tirelle),
    stabL_tirelle: numStr(d.stabL_tirelle),
    observations: d.observations ?? '',
    emplacement_tirelle: d.emplacement_tirelle ?? '',
    fin_archivage: hfsqlDateToInput(d.fin_archivage),
  }
}

// ── Page ─────────────────────────────────────────────────

export function QualiteSuiviLots() {
  const queryClient = useQueryClient()
  // Only the responsable qualité (and admins) can interact — everyone else
  // sees the screen read-only (no Modifier, no status change).
  const canManage = useHasPermission('responsable_qualite')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('en_cours')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState<'controles' | 'documents' | 'defauts' | 'client'>('controles')
  const [edit, setEdit] = useState<EditState | null>(null)
  const originalRef = useRef<EditState | null>(null)

  // ── Queries ─────────────────────────────────────────────
  const {
    data: lots,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['suivi-lots', statusFilter],
    queryFn: () => apiFetch<ListRow[]>(`/suivi-lots?status=${statusFilter}`),
  })

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['suivi-lot', selectedId],
    queryFn: () => apiFetch<SuiviLotDetail>(`/suivi-lots/${selectedId}`),
    enabled: selectedId !== null,
  })

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['suivi-lots'] })
    queryClient.invalidateQueries({ queryKey: ['suivi-lot', selectedId] })
  }, [queryClient, selectedId])

  // ── Edit lifecycle ──────────────────────────────────────
  const startEdit = useCallback(() => {
    if (!detail) return
    const snap = snapshotEdit(detail)
    setEdit(snap)
    originalRef.current = snap
    setActiveTab('controles')
    setIsEditing(true)
  }, [detail])

  const cancelEdit = useCallback(() => {
    setIsEditing(false)
    setEdit(null)
    originalRef.current = null
  }, [])

  const isDirty = useMemo(() => {
    if (!isEditing || !edit || !originalRef.current) return false
    return JSON.stringify(edit) !== JSON.stringify(originalRef.current)
  }, [isEditing, edit])

  const setEditField = useCallback(<K extends keyof EditState>(key: K, value: string) => {
    setEdit((prev) => (prev ? { ...prev, [key]: value } : prev))
  }, [])

  // ── Mutations ───────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: () => {
      if (!edit) throw new Error('no edit state')
      return apiFetch(`/suivi-lots/${selectedId}`, {
        method: 'PUT',
        body: JSON.stringify({
          laize_sst: edit.laize_sst,
          poids_sst: edit.poids_sst,
          rendement_sst: edit.rendement_sst,
          stabH_sst: edit.stabH_sst,
          stabL_sst: edit.stabL_sst,
          laize_tirelle: edit.laize_tirelle,
          poids_tirelle: edit.poids_tirelle,
          rendement_tirelle: edit.rendement_tirelle,
          stabH_tirelle: edit.stabH_tirelle,
          stabL_tirelle: edit.stabL_tirelle,
          observations: edit.observations,
          emplacement_tirelle: edit.emplacement_tirelle,
          fin_archivage: inputDateToHfsql(edit.fin_archivage),
        }),
      })
    },
    onSuccess: () => {
      invalidateAll()
      setIsEditing(false)
      setEdit(null)
      originalRef.current = null
    },
  })

  const etatMut = useMutation({
    mutationFn: (etat: Etat) =>
      apiFetch(`/suivi-lots/${selectedId}/etat`, {
        method: 'POST',
        body: JSON.stringify({ etat }),
      }),
    // Valider/Reprendre changes lot état and (on Reprendre) flags the lot's
    // rolls — both surface on Sous-traitants › Commandes, so refresh both
    // screens, not just this one.
    onSuccess: () => invalidateLotQualityCaches(queryClient),
  })

  // ── Guard ───────────────────────────────────────────────
  const guard = useUnsavedGuard({
    isDirty,
    save: async () => {
      await saveMut.mutateAsync()
    },
    onDiscard: cancelEdit,
  })

  const handleSelect = useCallback(
    (id: number) => {
      guard.guardAction(() => {
        setIsEditing(false)
        setEdit(null)
        originalRef.current = null
        setSelectedId(id)
      })
    },
    [guard],
  )

  const handleBack = useCallback(() => {
    guard.guardAction(() => {
      setIsEditing(false)
      setEdit(null)
      originalRef.current = null
      setSelectedId(null)
    })
  }, [guard])

  const handleStatusFilter = useCallback(
    (f: StatusFilter) => {
      guard.guardAction(() => {
        setIsEditing(false)
        setEdit(null)
        originalRef.current = null
        setStatusFilter(f)
        setSelectedId(null)
      })
    },
    [guard],
  )

  // ── Filtering + auto-select ─────────────────────────────
  const filtered = useMemo(() => {
    if (!lots) return []
    const q = searchQuery.trim().toLowerCase()
    if (!q) return lots
    return lots.filter((l) => {
      const e = etatOf(l.IDetatLot)
      const uiLabel = e ? ETAT_META[e].label : '' // matches the renamed "Attente Client"
      return [l.lot, l.sous_traitant_nom, l.etat_libelle ?? '', uiLabel]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [lots, searchQuery])

  // Keep the selection valid against the (search-filtered) list. Skip while
  // editing so we never discard unsaved changes.
  useEffect(() => {
    if (isEditing || filtered.length === 0) return
    const stillVisible = selectedId !== null && filtered.some((l) => l.IDsuivilot === selectedId)
    if (!stillVisible) setSelectedId(filtered[0].IDsuivilot)
  }, [filtered, selectedId, isEditing])

  // ── Render ──────────────────────────────────────────────
  return (
    <>
      <MasterDetailLayout
        hasSelection={selectedId !== null}
        onBack={handleBack}
        sidebarTitle="Contrôles"
        list={
          <LotList
            rows={filtered}
            totalCount={lots?.length ?? 0}
            isLoading={isLoading}
            isError={isError}
            selectedId={selectedId}
            onSelect={handleSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={handleStatusFilter}
          />
        }
        detailHeader={
          detail ? (
            <LotDetailHeader
              detail={detail}
              isEditing={isEditing}
              saving={saveMut.isPending}
              canManage={canManage}
              onStartEdit={startEdit}
              onCancelEdit={cancelEdit}
              onSave={() => saveMut.mutate()}
            />
          ) : detailLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : null
        }
        detail={
          detail ? (
            <RecapSection detail={detail} />
          ) : selectedId === null && !isLoading ? (
            <EmptyDetailState />
          ) : null
        }
        sidebar={
          detail ? (
            <LotSidebar
              detail={detail}
              isEditing={isEditing}
              edit={edit}
              canManage={canManage}
              onEditField={setEditField}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onEtatChange={(e) => etatMut.mutate(e)}
              etatChanging={etatMut.isPending}
            />
          ) : null
        }
      />

      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />
    </>
  )
}

// ── Left list ────────────────────────────────────────────

function LotList({
  rows,
  totalCount,
  isLoading,
  isError,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}: {
  rows: ListRow[]
  totalCount: number
  isLoading: boolean
  isError: boolean
  selectedId: number | null
  onSelect: (id: number) => void
  searchQuery: string
  onSearchChange: (v: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (f: StatusFilter) => void
}) {
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      {/* Search + filter */}
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher un lot…"
            className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onStatusFilterChange(opt.key)}
              className={cn(
                'px-2 py-1 text-xs rounded-md transition-colors flex-grow basis-[calc(33.333%-0.25rem)]',
                statusFilter === opt.key
                  ? 'bg-accent text-accent-foreground shadow-sm font-medium'
                  : 'text-muted-foreground hover:bg-accent/10',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-auto p-3 space-y-2 scrollbar-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-10 text-destructive">
            <AlertCircle className="h-6 w-6 mb-2" />
            <span className="text-sm">Erreur de chargement</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <ShieldCheck className="h-12 w-12 opacity-40 mb-2" />
            <span className="text-sm">Aucun lot</span>
          </div>
        ) : (
          rows.map((row) => {
            const isSelected = selectedId === row.IDsuivilot
            const meta = etatOf(row.IDetatLot)
            const Icon = meta ? ETAT_META[meta].icon : Clock
            const iconColor = meta ? ETAT_META[meta].iconColor : 'text-muted-foreground'
            return (
              <div
                key={row.IDsuivilot}
                onClick={() => onSelect(row.IDsuivilot)}
                className={cn(
                  'p-3 border rounded-lg cursor-pointer transition-all bg-white',
                  isSelected ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-accent/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate flex-1">{row.sous_traitant_nom || '—'}</span>
                  <span className="flex-shrink-0" title={meta ? ETAT_META[meta].label : ''}>
                    <Icon className={cn('h-4 w-4', iconColor)} />
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 text-right tabular-nums">{row.lot || '—'}</div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer count */}
      <div className="p-3 border-t text-xs text-muted-foreground rounded-b-lg bg-zinc-200/50">
        {rows.length} lot{rows.length !== 1 ? 's' : ''}
        {searchQuery && totalCount !== rows.length ? ` / ${totalCount}` : ''}
      </div>
    </div>
  )
}

// ── Detail header ────────────────────────────────────────

function LotDetailHeader({
  detail,
  isEditing,
  saving,
  canManage,
  onStartEdit,
  onCancelEdit,
  onSave,
}: {
  detail: SuiviLotDetail
  isEditing: boolean
  saving: boolean
  canManage: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
}) {
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center', isEditing ? 'bg-accent/15' : 'icon-box-gold')}>
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-heading font-bold tracking-tight truncate">{detail.lot || `Lot #${detail.IDsuivilot}`}</h1>
            {isEditing && (
              <Badge className="bg-accent text-accent-foreground flex-shrink-0 gap-1 shadow-sm">
                <Pencil className="h-3 w-3" />
                Mode édition
              </Badge>
            )}
          </div>
          {!isEditing && (
            <div className="flex gap-1.5 mt-1 flex-wrap items-center text-sm text-muted-foreground">
              <span className="truncate">{detail.reference || '—'}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={onCancelEdit}>
                <X className="h-3.5 w-3.5 mr-1.5" />
                Annuler
              </Button>
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Enregistrer
              </Button>
            </>
          ) : (
            canManage && (
              <Button variant="gold" size="sm" onClick={onStartEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Modifier
              </Button>
            )
          )}
        </div>
      </div>
      <div className={cn('h-1 w-24 mt-3 rounded-full', isEditing ? 'bg-accent' : 'bg-gradient-to-r from-accent via-accent to-accent/30')} />
    </div>
  )
}

// ── Center: Récapitulatif + Pièces ───────────────────────

function RecapSection({ detail }: { detail: SuiviLotDetail }) {
  return (
    <div className="flex-1 min-h-0 overflow-auto space-y-4 scrollbar-transparent pr-1">
      {/* Récapitulatif */}
      <div className="rounded-xl border bg-card shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardCheck className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold">Récapitulatif de la commande</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <RecapField label="Date commande" value={detail.date_commande ? formatHfsqlDate(detail.date_commande) : '—'} />
          <RecapField label="Commande N°" value={detail.IDcommande_sous_traitant ? String(detail.IDcommande_sous_traitant) : '—'} />
          <RecapField label="Référence" value={detail.reference || '—'} />
          <RecapField label="Coloris" value={detail.coloris || '—'} />
          <RecapField label="Numéro de lot" value={detail.lot || '—'} />
        </div>
        {!!detail.commentaire?.trim() && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Commentaire</p>
            <p className="text-sm whitespace-pre-line">{detail.commentaire}</p>
          </div>
        )}
        {/* Spec banner */}
        <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 sm:grid-cols-6 gap-2">
          <SpecStat label="Laize" value={fmtNum(detail.laize_demandee)} />
          <SpecStat label="Poids" value={fmtNum(detail.poids_demande)} />
          <SpecStat label="Freinte" value={fmtNum(detail.freinte_demandee, 2)} suffix="%" />
          <SpecStat label="Rendement" value={fmtNum(detail.rendement_demande, 2)} highlight />
          <SpecStat label="Stab H" value={fmtNum(detail.stabH_demandee)} />
          <SpecStat label="Stab L" value={fmtNum(detail.stabL_demandee)} />
        </div>
      </div>

      {/* Pièces du lot */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 p-4 pb-2">
          <Package className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold">Pièces du lot</h2>
          {detail.rendement_mini != null && detail.rendement_maxi != null && (
            <span className="text-[11px] text-muted-foreground">
              Rdt conforme : {fmtNum(detail.rendement_mini, 2)} – {fmtNum(detail.rendement_maxi, 2)}
            </span>
          )}
          <Badge variant="secondary" className="text-xs ml-auto">{detail.pieces.length}</Badge>
        </div>
        {detail.pieces.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground italic">Aucune pièce reçue</p>
        ) : (
          <div className="px-2 pb-2">
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/60">
                  <th className="px-2 py-2 text-left font-semibold">Numéro</th>
                  <th className="px-2 py-2 text-right font-semibold">Poids</th>
                  <th className="px-2 py-2 text-right font-semibold">Métrage</th>
                  <th className="px-2 py-2 text-left font-semibold">Magasin</th>
                  <th className="px-2 py-2 text-right font-semibold">Rdt</th>
                  <th className="px-2 py-2 text-center font-semibold">Conforme</th>
                  <th className="px-2 py-2 text-center font-semibold">Qualité</th>
                </tr>
              </thead>
              <tbody>
                {detail.pieces.map((p) => (
                  <tr key={p.IDstock_fini} className="border-b border-border/40">
                    <td className="px-2 py-1.5 truncate" title={p.numero}>{p.numero}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(p.poids, 2)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(p.metrage, 2)}</td>
                    <td className="px-2 py-1.5 truncate text-muted-foreground" title={p.magasin_nom}>{p.magasin_nom || '—'}</td>
                    <td className={cn(
                      'px-2 py-1.5 text-right tabular-nums',
                      p.valid === true && 'text-green-600 font-medium',
                      p.valid === false && 'text-destructive font-medium',
                    )}>
                      {p.rdt != null ? fmtNum(p.rdt, 2) : '—'}
                    </td>
                    <td className="px-2 py-1.5">
                      {p.valid == null ? (
                        <span className="block text-center text-muted-foreground">—</span>
                      ) : p.valid ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" aria-label="Conforme" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-destructive mx-auto" aria-label="Non conforme" />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-center">
                        <QualityHistoryCell numero={p.numero} quality={p.quality} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-xs font-semibold border-t border-border/60">
                  <td className="px-2 py-2 text-muted-foreground" colSpan={4}>Moyenne</td>
                  <td className="px-2 py-2 text-right tabular-nums text-accent">
                    {detail.moyenne_rdt != null ? fmtNum(detail.moyenne_rdt, 2) : '—'}
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function RecapField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/30 py-1">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-sm text-right truncate" title={value}>{value}</span>
    </div>
  )
}

function SpecStat({ label, value, suffix, highlight }: { label: string; value: string; suffix?: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded-md border px-2 py-1.5 text-center', highlight ? 'border-accent/40 bg-accent/[0.05]' : 'border-border/60 bg-zinc-50')}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-semibold tabular-nums', highlight && 'text-accent')}>
        {value || '0'}{suffix ?? ''}
      </div>
    </div>
  )
}

function EmptyDetailState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="icon-box-gold h-16 w-16 flex items-center justify-center rounded-xl mb-4">
        <ShieldCheck className="h-8 w-8" />
      </div>
      <p className="text-sm text-muted-foreground">Sélectionnez un lot pour afficher son suivi qualité.</p>
    </div>
  )
}

// ── Right sidebar (tabs + status footer) ─────────────────

function LotSidebar({
  detail,
  isEditing,
  edit,
  canManage,
  onEditField,
  activeTab,
  onTabChange,
  onEtatChange,
  etatChanging,
}: {
  detail: SuiviLotDetail
  isEditing: boolean
  edit: EditState | null
  canManage: boolean
  onEditField: <K extends keyof EditState>(key: K, value: string) => void
  activeTab: 'controles' | 'documents' | 'defauts' | 'client'
  onTabChange: (t: 'controles' | 'documents' | 'defauts' | 'client') => void
  onEtatChange: (e: Etat) => void
  etatChanging: boolean
}) {
  const tabs = [
    { key: 'controles' as const, label: 'Contrôles', icon: Ruler },
    { key: 'documents' as const, label: 'Documents', icon: FileText },
    { key: 'defauts' as const, label: 'Défauts', icon: AlertTriangle },
    { key: 'client' as const, label: 'Client', icon: Building2 },
  ]
  const currentEtat = etatOf(detail.IDetatLot)

  return (
    <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
      <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
        <div className="flex border-b p-1 gap-1 rounded-t-xl bg-zinc-200/50">
          {tabs.map((t) => {
            const Icon = t.icon
            const active = activeTab === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTabChange(t.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium rounded-md transition-colors',
                  active ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-transparent">
          {activeTab === 'controles' && <ControlesTab detail={detail} isEditing={isEditing} edit={edit} onEditField={onEditField} />}
          {activeTab === 'documents' && <DocumentsTab commandeId={detail.IDcommande_sous_traitant} />}
          {activeTab === 'defauts' && <DefautsTab lotId={detail.IDsuivilot} />}
          {activeTab === 'client' && <ClientTab detail={detail} />}
        </div>
      </div>

      {currentEtat && (
        <EtatFooter
          current={currentEtat}
          canManage={canManage}
          onChange={onEtatChange}
          isChanging={etatChanging}
          disabled={isEditing}
        />
      )}
    </div>
  )
}

// ── Contrôles tab ────────────────────────────────────────

const editCardClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

type ConformKind = 'laize' | 'poids' | 'stabH' | 'stabL' | 'rendement'

// A measurement's tolerance: a min/max band. `null` on a bound means "not
// defined" (legacy stores 0 for undefined bounds — treat <=0 as absent). Stab
// measurements only carry a lower bound (≥ min), so `max` stays null.
interface Tolerance {
  min: number | null
  max: number | null
}

// Resolve the tolerance band for a measurement from the ref_fini bounds (laize/
// poids/stab) or the per-lot rendement bounds. <=0 bounds are dropped to null.
function resolveTolerance(kind: ConformKind, b: RefBounds | undefined, rdt: Tolerance | undefined): Tolerance {
  const pos = (n: number | null | undefined): number | null => (n != null && n > 0 ? n : null)
  // Symmetric band from a single ±figure: -5 → [-5, +5]. Returns the empty band
  // when undefined (0).
  const sym = (n: number | null | undefined): Tolerance => {
    const a = n != null ? Math.abs(n) : 0
    return a > 0 ? { min: -a, max: a } : { min: null, max: null }
  }
  switch (kind) {
    case 'laize': return { min: pos(b?.laize_min), max: pos(b?.laize_max) }
    case 'poids': return { min: pos(b?.poids_min), max: pos(b?.poids_max) }
    // Stab is a symmetric tolerance: the ref_fini stores a single figure (e.g.
    // -5) meaning the fabric may move ±5% — mostly shrink, occasionally stretch.
    // A measurement is conform when it lands in [-|x|, +|x|].
    case 'stabH': return sym(b?.stab_hauteur)
    case 'stabL': return sym(b?.stab_largeur)
    case 'rendement': return { min: pos(rdt?.min), max: pos(rdt?.max) }
  }
}

// Conformité d'une mesure vs sa tolérance. Returns null when there's nothing to
// flag: no bound defined, or value not entered (0).
function checkConform(val: number, t: Tolerance): boolean | null {
  if (t.min == null && t.max == null) return null
  // 0 = control not made yet (no marker). A real measurement is non-zero —
  // including negative stab readings (shrinkage).
  if (val === 0) return null
  if (t.min != null && val < t.min) return false
  if (t.max != null && val > t.max) return false
  return true
}

function ConformMarker({ conform }: { conform: boolean | null }) {
  if (conform == null) return null
  return conform ? (
    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" aria-label="Conforme" />
  ) : (
    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" aria-label="Non conforme" />
  )
}

// Tolerance gauge: a track showing the acceptable band. Two-bound measurements
// (laize, poids) show a min→max band; stab shows a 0-centered ±band. The
// measured value is a needle — green inside tolerance, red outside, grey when
// not yet measured. Bound labels sit under the band edges. Updates live as the
// value is typed in edit mode. Returns null when no bound is defined.
function ToleranceGauge({ value, tol, conform, dec }: { value: number; tol: Tolerance; conform: boolean | null; dec: number }) {
  if (tol.min == null && tol.max == null) return null
  const hasMax = tol.max != null
  const lo = tol.min ?? 0
  const hi = tol.max ?? lo

  // Display domain pads the band so the needle stays visible on/just past an edge.
  let domainLo: number
  let domainHi: number
  if (hasMax) {
    const pad = Math.max((hi - lo) * 0.3, lo * 0.05, 1)
    domainLo = lo - pad
    domainHi = hi + pad
  } else {
    // ≥min threshold: keep the threshold around the lower third of the track.
    const span = Math.max(Math.abs(value - lo), lo * 0.4, 1)
    domainLo = Math.max(lo - span, 0)
    domainHi = lo + span * 1.5
  }
  const range = Math.max(domainHi - domainLo, 1e-6)
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - domainLo) / range) * 100))

  const bandStart = pct(lo)
  const bandEnd = hasMax ? pct(hi) : 100
  const valuePos = pct(value)
  // 0 = control not made yet, so no needle. Any non-zero reading shows —
  // including negative stab values (shrinkage).
  const centered = hasMax && lo < 0 && hi > 0
  const showNeedle = value !== 0
  const needleColor = conform === false ? 'bg-destructive' : conform === true ? 'bg-green-600' : 'bg-zinc-400'

  return (
    <div className="mt-1.5">
      <div className="relative h-1.5 rounded-full bg-zinc-200">
        {/* Acceptable band */}
        <div
          className="absolute inset-y-0 rounded-full bg-green-500/30"
          style={{ left: `${bandStart}%`, right: `${100 - bandEnd}%` }}
        />
        {/* Band-edge ticks */}
        <div className="absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-green-600/40" style={{ left: `${bandStart}%` }} />
        {hasMax && (
          <div className="absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-green-600/40" style={{ left: `${bandEnd}%` }} />
        )}
        {/* Center (0) tick on symmetric bands — the neutral, no-deformation point */}
        {centered && (
          <div className="absolute top-1/2 h-1.5 w-px -translate-x-1/2 -translate-y-1/2 bg-zinc-400" style={{ left: `${pct(0)}%` }} />
        )}
        {/* Value needle */}
        {showNeedle && (
          <div
            className={cn('absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card', needleColor)}
            style={{ left: `${valuePos}%` }}
          />
        )}
      </div>
      {/* Bound labels under the band edges */}
      <div className="relative mt-1 h-3 text-[10px] tabular-nums text-muted-foreground">
        {hasMax ? (
          <>
            <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${bandStart}%` }}>{fmtNum(lo, dec)}</span>
            {centered && (
              <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${pct(0)}%` }}>0</span>
            )}
            <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${bandEnd}%` }}>
              {centered ? `+${fmtNum(hi, dec)}` : fmtNum(hi, dec)}
            </span>
          </>
        ) : (
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${bandStart}%` }}>≥ {fmtNum(lo, dec)}</span>
        )}
      </div>
    </div>
  )
}

function ControlesTab({
  detail,
  isEditing,
  edit,
  onEditField,
}: {
  detail: SuiviLotDetail
  isEditing: boolean
  edit: EditState | null
  onEditField: <K extends keyof EditState>(key: K, value: string) => void
}) {
  // Only flag conformity when a ref_fini is attached (otherwise there's nothing
  // to compare against and stab would falsely flag any shrinkage as non-conforme).
  const bounds = detail.reference ? detail.ref_bounds : undefined
  return (
    <>
      {/* Sous-Traitant */}
      <SidebarCard title="Sous-Traitant" icon={<Factory className="h-3.5 w-3.5 text-accent" />} highlight={isEditing}>
        <KVNum label="Laize" field="laize_sst" detailVal={detail.laize_sst} conformKind="laize" bounds={bounds} isEditing={isEditing} edit={edit} onEditField={onEditField} />
        <KVNum label="Poids" field="poids_sst" detailVal={detail.poids_sst} conformKind="poids" bounds={bounds} isEditing={isEditing} edit={edit} onEditField={onEditField} />
        {/* Freinte is computed (legacy formula), not stored — see API. Read-only. */}
        <KV label="Freinte" value={`${fmtNum(detail.freinte_sst * 100, 0)} %`} />
        <KVNum label="Stab H" field="stabH_sst" detailVal={detail.stabH_sst} conformKind="stabH" bounds={bounds} isEditing={isEditing} edit={edit} onEditField={onEditField} />
        <KVNum label="Stab L" field="stabL_sst" detailVal={detail.stabL_sst} conformKind="stabL" bounds={bounds} isEditing={isEditing} edit={edit} onEditField={onEditField} />
      </SidebarCard>

      {/* Tirelle */}
      <SidebarCard title="Tirelle" icon={<Ruler className="h-3.5 w-3.5 text-accent" />} highlight={isEditing}>
        <KVNum label="Laize" field="laize_tirelle" detailVal={detail.laize_tirelle} conformKind="laize" bounds={bounds} isEditing={isEditing} edit={edit} onEditField={onEditField} />
        <KVNum label="Poids" field="poids_tirelle" detailVal={detail.poids_tirelle} conformKind="poids" bounds={bounds} isEditing={isEditing} edit={edit} onEditField={onEditField} />
        <KVNum label="Stab H" field="stabH_tirelle" detailVal={detail.stabH_tirelle} conformKind="stabH" bounds={bounds} isEditing={isEditing} edit={edit} onEditField={onEditField} />
        <KVNum label="Stab L" field="stabL_tirelle" detailVal={detail.stabL_tirelle} conformKind="stabL" bounds={bounds} isEditing={isEditing} edit={edit} onEditField={onEditField} />
      </SidebarCard>

      {/* Observations + emplacement + archivage */}
      <SidebarCard title="Observations" icon={<ClipboardCheck className="h-3.5 w-3.5 text-accent" />} highlight={isEditing}>
        {isEditing && edit ? (
          <textarea
            rows={4}
            value={edit.observations}
            onChange={(e) => onEditField('observations', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
        ) : detail.observations?.trim() ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{detail.observations}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Aucune observation</p>
        )}
        <div className="mt-3 space-y-1.5">
          <KV
            label="Emplacement"
            value={
              isEditing && edit ? (
                <input
                  type="text"
                  value={edit.emplacement_tirelle}
                  onChange={(e) => onEditField('emplacement_tirelle', e.target.value)}
                  className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right w-[160px]"
                />
              ) : (
                detail.emplacement_tirelle || '—'
              )
            }
          />
          <KV
            label="Fin d'archivage"
            value={
              isEditing && edit ? (
                <input
                  type="date"
                  value={edit.fin_archivage}
                  onChange={(e) => onEditField('fin_archivage', e.target.value)}
                  className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right w-[160px]"
                />
              ) : detail.fin_archivage ? (
                formatHfsqlDate(detail.fin_archivage)
              ) : (
                '—'
              )
            }
          />
        </div>
      </SidebarCard>
    </>
  )
}

function SidebarCard({ title, icon, highlight, children }: { title: string; icon: React.ReactNode; highlight?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-lg border bg-card p-3 shadow-sm', highlight && editCardClass)}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 min-h-[1.75rem]">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-right truncate">{value}</span>
    </div>
  )
}

function KVNum({
  label,
  field,
  detailVal,
  dec = 0,
  isEditing,
  edit,
  onEditField,
  conformKind,
  bounds,
  rdtBounds,
}: {
  label: string
  field: keyof EditState
  detailVal: number
  dec?: number
  isEditing: boolean
  edit: EditState | null
  onEditField: <K extends keyof EditState>(key: K, value: string) => void
  conformKind?: ConformKind
  bounds?: RefBounds
  rdtBounds?: Tolerance
}) {
  // Conformity is computed off the live value: the edited string while editing,
  // the saved value otherwise — so the marker + gauge update as the user types.
  const currentVal = isEditing && edit ? Number(edit[field]) || 0 : detailVal
  const tol = conformKind ? resolveTolerance(conformKind, bounds, rdtBounds) : null
  const conform = tol ? checkConform(currentVal, tol) : null
  return (
    <div className="min-h-[1.75rem]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="inline-flex items-center justify-end gap-1.5">
          <ConformMarker conform={conform} />
          {isEditing && edit ? (
            <input
              type="number"
              step="any"
              value={edit[field]}
              onChange={(e) => onEditField(field, e.target.value)}
              className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right w-[110px] tabular-nums"
            />
          ) : (
            <span className="tabular-nums text-sm">{detailVal === 0 ? '' : fmtNum(detailVal, dec)}</span>
          )}
        </span>
      </div>
      {tol && <ToleranceGauge value={currentVal} tol={tol} conform={conform} dec={dec} />}
    </div>
  )
}

// ── Documents tab (read-only, reuses commande-sst endpoints) ──

function DocumentsTab({ commandeId }: { commandeId: number }) {
  const [viewDoc, setViewDoc] = useState<DocRow | null>(null)
  const { data: docs, isLoading } = useQuery({
    queryKey: ['suivi-lot-docs', commandeId],
    queryFn: () => apiFetch<DocRow[]>(`/commandes-sous-traitant/${commandeId}/documents`),
    enabled: commandeId > 0,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    )
  }
  if (!docs || docs.length === 0) {
    return <p className="text-sm text-muted-foreground italic">Aucun document</p>
  }
  return (
    <>
      {docs.map((d) => (
        <button
          key={d.IDged}
          type="button"
          onClick={() => setViewDoc(d)}
          className="w-full text-left p-3 rounded-lg border bg-card shadow-sm cursor-pointer hover:border-accent/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-accent flex-shrink-0" />
            <span className="text-sm font-medium truncate flex-1">{d.nom || `Document #${d.IDged}`}</span>
          </div>
          {!!d.type_nom && <p className="text-[11px] text-muted-foreground mt-1 ml-6">{d.type_nom}</p>}
          {!!d.commentaire?.trim() && <p className="text-[11px] text-muted-foreground mt-0.5 ml-6 truncate">{d.commentaire}</p>}
        </button>
      ))}
      <DocViewDialog doc={viewDoc} commandeId={commandeId} onClose={() => setViewDoc(null)} />
    </>
  )
}

function DocViewDialog({ doc, commandeId, onClose }: { doc: DocRow | null; commandeId: number; onClose: () => void }) {
  const [fichierOk, setFichierOk] = useState<boolean | null>(null)
  const url = doc ? `${API_URL}/commandes-sous-traitant/${commandeId}/documents/${doc.IDged}/fichier` : ''

  useEffect(() => {
    if (!doc) { setFichierOk(null); return }
    let cancelled = false
    fetch(url, { method: 'HEAD', credentials: 'include' })
      .then((r) => { if (!cancelled) setFichierOk(r.ok) })
      .catch(() => { if (!cancelled) setFichierOk(false) })
    return () => { cancelled = true }
  }, [doc, url])

  if (!doc) return null
  return (
    <Dialog open={!!doc} onOpenChange={() => onClose()}>
      {fichierOk ? (
        <div className="relative z-50 w-[60vw] max-w-3xl h-[90vh]" onClick={(e) => e.stopPropagation()}>
          <iframe src={`${url}#view=FitH`} className="w-full h-full rounded-lg" title={doc.nom ?? 'Document'} />
        </div>
      ) : (
        <DialogContent className="max-w-sm" onClose={onClose}>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 opacity-30 mb-2" />
            <p className="text-sm">{fichierOk === null ? 'Chargement…' : 'Aucun document attaché'}</p>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}

// ── Roll quality history (icon + hover tooltip on a piece row) ──────

// One hue per quality stage so the user reads the source at a glance.
const QUALITY_SOURCE_META: Record<string, { dot: string; text: string }> = {
  Tricotage: { dot: 'bg-amber-500', text: 'text-amber-700' },
  'Défaut tricotage': { dot: 'bg-amber-600', text: 'text-amber-800' },
  Ennoblisseur: { dot: 'bg-sky-500', text: 'text-sky-700' },
  'Contrôle fini': { dot: 'bg-teal-500', text: 'text-teal-700' },
}

function QualityHistoryCell({ numero, quality }: { numero: string; quality: QualityEntry[] }) {
  if (quality.length === 0) return null
  // Any "Défaut*" entry → flag the icon as a defect (amber triangle), else a comment bubble.
  const hasDefaut = quality.some((q) => q.source.toLowerCase().startsWith('défaut'))
  const Icon = hasDefaut ? AlertTriangle : MessageSquare
  return (
    <Tooltip
      side="left"
      content={
        <div className="w-64 space-y-2 py-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Historique qualité — {numero}
          </p>
          <ul className="space-y-1.5">
            {quality.map((q, i) => {
              const meta = QUALITY_SOURCE_META[q.source] ?? { dot: 'bg-zinc-400', text: 'text-zinc-600' }
              return (
                <li key={i} className="flex gap-1.5">
                  <span className={cn('mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0', meta.dot)} />
                  <div className="min-w-0">
                    <span className={cn('text-[11px] font-semibold', meta.text)}>{q.source}</span>
                    {!!q.author && <span className="text-[11px] text-muted-foreground"> · {q.author}</span>}
                    <p className="text-xs text-foreground whitespace-pre-line break-words">{q.text}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      }
    >
      <Icon className={cn('h-3.5 w-3.5 cursor-pointer', hasDefaut ? 'text-amber-600' : 'text-accent')} aria-label="Historique qualité" />
    </Tooltip>
  )
}

// ── Défauts tab ──────────────────────────────────────────

function DefautsTab({ lotId }: { lotId: number }) {
  const { data: defauts, isLoading } = useQuery({
    queryKey: ['suivi-lot-defauts', lotId],
    queryFn: () => apiFetch<DefautRow[]>(`/suivi-lots/${lotId}/defauts`),
    enabled: lotId > 0,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    )
  }
  if (!defauts || defauts.length === 0) {
    return <p className="text-sm text-muted-foreground italic">Aucun défaut signalé</p>
  }
  return (
    <>
      {defauts.map((d) => (
        <div key={d.IDdefaut_qualite} className="p-3 rounded-lg border-l-4 border-l-destructive/60 border bg-card shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive/70 flex-shrink-0" />
            <span className="text-sm font-medium truncate flex-1">{d.type_defaut || 'Défaut'}</span>
            {!!d.roll_numero && <Badge variant="secondary" className="text-[10px] py-0">{d.roll_numero}</Badge>}
          </div>
          {!!d.description?.trim() && <p className="text-[11px] text-muted-foreground mt-1 ml-5">{d.description}</p>}
          <div className="flex items-center gap-3 mt-1.5 ml-5 text-[11px] text-muted-foreground">
            {d.taille_cm > 0 && <span>{fmtNum(d.taille_cm)} cm</span>}
            {d.nombre > 0 && <span>×{d.nombre}</span>}
            {!!d.date && <span className="ml-auto">{formatHfsqlDate(d.date)}</span>}
          </div>
        </div>
      ))}
    </>
  )
}

// ── Client tab ───────────────────────────────────────────

function ClientTab({ detail }: { detail: SuiviLotDetail }) {
  if (!detail.client) {
    return <p className="text-sm text-muted-foreground italic">Aucun client associé</p>
  }
  const c = detail.client
  return (
    <div className="p-3 rounded-lg border bg-card shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Building2 className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold truncate">{c.nom || `Client #${c.IDclient}`}</h3>
      </div>
      <div className="space-y-1.5">
        <KV label="N° commande" value={c.numero || '—'} />
        <KV label="Réf. client" value={c.ref_client || '—'} />
      </div>
    </div>
  )
}

// ── Status footer (multi-state état pill) ────────────────

// Action verbs for the two manual transitions (target état → verb).
const ETAT_ACTION_LABEL: Record<3 | 2, string> = { 3: 'Valider', 2: 'Reprendre' }

function EtatFooter({
  current,
  canManage,
  onChange,
  isChanging,
  disabled,
}: {
  current: Etat
  canManage: boolean
  onChange: (next: Etat) => void
  isChanging: boolean
  disabled: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const meta = ETAT_META[current]
  const Icon = meta.icon

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (disabled || !canManage) setMenuOpen(false)
  }, [disabled, canManage])

  return (
    <div ref={rootRef} className="flex-shrink-0 relative">
      <div className={cn('rounded-xl border shadow-sm overflow-hidden flex items-stretch h-11', meta.solidBg)}>
        <div className="flex items-center gap-2 px-3 flex-1 text-white min-w-0">
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-bold uppercase tracking-wide truncate">{meta.label}</span>
        </div>
        {/* Read-only for non-responsables: pill only, no verdict control. */}
        {canManage && (
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={disabled || isChanging}
            title="Changer le statut"
            className="px-3.5 bg-white/15 hover:bg-white/25 active:bg-white/30 disabled:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold border-l border-white/25 flex items-center gap-1.5 transition-colors"
          >
            {isChanging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronUp className={cn('h-3.5 w-3.5 transition-transform', menuOpen && 'rotate-180')} />}
            Changer
          </button>
        )}
      </div>
      {canManage && menuOpen && (
        <div className="absolute bottom-full right-0 mb-1 w-full min-w-[220px] rounded-lg border bg-white shadow-lg overflow-hidden z-50">
          {ETAT_ACTIONS.map((s) => {
            const m = ETAT_META[s]
            const active = current === s // already in this state → non-actionable
            const SIcon = m.icon
            return (
              <button
                key={s}
                type="button"
                disabled={active}
                onClick={() => {
                  if (!active) onChange(s)
                  setMenuOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                  active ? 'bg-accent/10 text-accent cursor-default' : 'hover:bg-zinc-100',
                )}
              >
                <SIcon className={cn('h-4 w-4', active ? 'text-accent' : m.iconColor)} />
                {ETAT_ACTION_LABEL[s as 3 | 2]}
                {active && <CheckCircle2 className="h-4 w-4 ml-auto text-accent" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
