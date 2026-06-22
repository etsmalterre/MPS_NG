import { useState, useMemo, useCallback, useEffect, useRef, useTransition, memo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import {
  Boxes,
  Search,
  Loader2,
  AlertCircle,
  Pencil,
  X,
  Check,
  Save,
  ArrowUp,
  ArrowDown,
  Activity,
  Send,
  MapPin,
  Factory,
  Package,
  MessageSquare,
  Sparkles,
  Gift,
  Trash2,
  Scissors,
  Plus,
  Minus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { FiniRollIcon } from '@/components/icons/FiniRollIcon'
import { cn } from '@/lib/utils'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { apiFetch } from '@/lib/api'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { PopoverSelect, SearchableCombobox } from '@/components/ui/popover-select'

// ── Types ──────────────────────────────────────────────

interface StockFiniRow {
  IDstock_fini: number
  IDref_fini: number | null
  IDColoris: number | null
  IDetat_stock_fini: number | null
  IDligne_commande_client: number | null
  IDref_commande_source: number | null
  IDstock_ecru: number | null
  IDmagasin: number | null
  IDligne_expedition: number | null
  IDProprietaire: number | null
  IDcommande_donation: number | null
  poids: number | null
  metrage: number | null
  lot: string | null
  numero: string | null
  observations: string | null
  observation_sst: string | null
  second_choix: number | null
  date_saisie: string | null
  destockage: number | null
  don: number | null
  pointage: string | null
  emplacement: string | null
  conteneur: string | null
  ref_fini: string | null
  designation: string | null
  coloris_reference: string | null
  etat_libelle: string | null
  magasin_nom: string | null
}

interface EtatOption {
  IDetat_stock_fini: number
  libelle: string
}

// ── API helpers ────────────────────────────────────────

function useStockFiniList(filters: { hideShipped: boolean }) {
  const params = new URLSearchParams()
  if (!filters.hideShipped) params.set('expedie', 'all')
  const qs = params.toString()
  return useQuery<StockFiniRow[]>({
    queryKey: ['stock-fini', filters],
    queryFn: () => apiFetch<StockFiniRow[]>(`/stock/fini${qs ? `?${qs}` : ''}`),
  })
}

function useStockFiniDetail(id: number | null) {
  return useQuery<StockFiniRow>({
    queryKey: ['stock-fini', 'detail', id],
    queryFn: () => apiFetch<StockFiniRow>(`/stock/fini/${id}`),
    enabled: id !== null,
  })
}

function useEtatsLookup() {
  return useQuery<EtatOption[]>({
    queryKey: ['stock-fini', 'etats'],
    queryFn: () => apiFetch<EtatOption[]>('/stock/fini/lookups/etats'),
  })
}

// ── Helpers ────────────────────────────────────────────

function formatKg(v: number | null): string {
  if (v == null) return '—'
  return `${v.toFixed(1)} kg`
}

function formatMeters(v: number | null): string {
  if (v == null) return '—'
  return `${v.toFixed(1)} m`
}

// État libellé → pill colour. Falls back to neutral zinc for unknown values.
function etatPillClass(libelle: string | null): string {
  if (!libelle) return 'bg-zinc-100 text-zinc-700 border-zinc-200'
  const l = libelle.toLowerCase()
  if (l.includes('contrôle') || l.includes('controle')) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (l.includes('reprise')) return 'bg-orange-100 text-orange-800 border-orange-200'
  if (l.includes('disponible') || l.includes('prêt') || l.includes('pret')) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (l.includes('refus') || l.includes('rebut')) return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-zinc-100 text-zinc-700 border-zinc-200'
}

// ── Sort handling ──────────────────────────────────────

type SortKey =
  | 'ref_fini'
  | 'coloris_reference'
  | 'lot'
  | 'numero'
  | 'poids'
  | 'metrage'
  | 'etat_libelle'
  | 'emplacement'
  | 'magasin_nom'
  | 'date_saisie'
  | 'observations'

interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

const COLUMNS: { key: SortKey; label: string; width: string; align?: 'left' | 'right' }[] = [
  { key: 'ref_fini', label: 'Référence', width: '11%' },
  { key: 'coloris_reference', label: 'Coloris', width: '13%' },
  { key: 'lot', label: 'Lot', width: '7%' },
  { key: 'numero', label: 'Numéro', width: '7%' },
  { key: 'poids', label: 'Poids', width: '7%', align: 'right' },
  { key: 'metrage', label: 'Métrage', width: '7%', align: 'right' },
  { key: 'etat_libelle', label: 'État', width: '11%' },
  { key: 'emplacement', label: 'Emplacement', width: '8%' },
  { key: 'magasin_nom', label: 'Magasin', width: '9%' },
  { key: 'date_saisie', label: 'Date saisie', width: '8%' },
  { key: 'observations', label: 'Observations', width: '9%' },
]
const ICON_COL_WIDTH = '3%'
const SELECT_COL_WIDTH = '4%' // leading selection box column, edit mode only

function compareRows(a: StockFiniRow, b: StockFiniRow, key: SortKey): number {
  const va = a[key]
  const vb = b[key]
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'fr', { numeric: true, sensitivity: 'base' })
}

// ── Main Page ──────────────────────────────────────────

export function FinisStock() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [hideShipped, setHideShipped] = useState(true)
  const [sort, setSort] = useState<SortState>({ key: 'date_saisie', dir: 'desc' })
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Permission gates — admins always pass; non-admins need the matching key.
  // The API enforces the same keys independently.
  const canCut = useHasPermission('cut_stock_fini')
  const canCreate = useHasPermission('create_stock_fini')
  const [createOpen, setCreateOpen] = useState(false)

  // Edit mode — multi-roll selection.
  const [isEditing, setIsEditing] = useState(false)
  const [selectedRollIds, setSelectedRollIds] = useState<Set<number>>(new Set())
  const lastSelectedRollIdRef = useRef<number | null>(null)
  const [cutOpen, setCutOpen] = useState(false)
  // The edit-mode toggle re-renders the whole (large) table; mark it as a
  // transition so the click stays responsive instead of freezing the UI.
  const [, startModeTransition] = useTransition()

  const { data: rows, isLoading, isError, error } = useStockFiniList({ hideShipped })

  const filteredSorted = useMemo(() => {
    let out = rows ?? []
    // Split the query on whitespace and require EVERY term to match SOME
    // column (AND across terms, OR across columns). This lets one search combine
    // criteria from different columns — e.g. "029A marine" matches a row whose
    // ref_fini is "029A" AND whose coloris is "marine". A single term behaves
    // exactly as the old substring search.
    const terms = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length > 0) {
      out = out.filter((r) => {
        const haystacks = [
          r.ref_fini,
          r.coloris_reference,
          r.lot,
          r.numero,
          r.emplacement,
          r.conteneur,
          r.magasin_nom,
          r.observations,
          r.observation_sst,
        ]
          .filter((f): f is string => !!f)
          .map((f) => f.toLowerCase())
        return terms.every((t) => haystacks.some((h) => h.includes(t)))
      })
    }
    out = [...out].sort((a, b) => {
      const cmp = compareRows(a, b, sort.key)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return out
  }, [rows, searchQuery, sort])

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }, [])

  // Drawer dirty tracking — populated by the drawer via refs.
  const [drawerDirty, setDrawerDirty] = useState(false)
  const drawerSaveRef = useRef<() => Promise<void>>(async () => {})
  const drawerDiscardRef = useRef<() => void>(() => {})

  const guard = useUnsavedGuard({
    isDirty: drawerDirty,
    save: async () => { await drawerSaveRef.current() },
    onDiscard: () => drawerDiscardRef.current(),
  })

  const handleClose = useCallback(() => {
    guard.guardAction(() => setSelectedId(null))
  }, [guard])

  const handleRowClick = useCallback((rowId: number) => {
    guard.guardAction(() => {
      setSelectedId((prev) => (prev === rowId ? null : rowId))
    })
  }, [guard])

  // Anchor-based multi-select (mirrors the "Affecté" tab of the sst drawer):
  // plain click toggles the row and becomes the anchor; Shift+click adds the
  // inclusive range between the anchor and the clicked row, in the current
  // sort/filter order.
  const handleSelectRoll = useCallback((id: number, shiftKey: boolean) => {
    const ids = filteredSorted.map((r) => r.IDstock_fini)
    const anchor = lastSelectedRollIdRef.current
    if (shiftKey && anchor !== null && anchor !== id) {
      const a = ids.indexOf(anchor)
      const b = ids.indexOf(id)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSelectedRollIds((prev) => {
          const next = new Set(prev)
          for (let i = lo; i <= hi; i++) next.add(ids[i])
          return next
        })
        return
      }
    }
    setSelectedRollIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastSelectedRollIdRef.current = id
  }, [filteredSorted])

  const enterEditMode = useCallback(() => {
    // Close the drawer first (guarded, so unsaved drawer edits prompt).
    guard.guardAction(() => {
      setSelectedId(null)
      startModeTransition(() => setIsEditing(true))
    })
  }, [guard])

  const exitEditMode = useCallback(() => {
    lastSelectedRollIdRef.current = null
    startModeTransition(() => {
      setIsEditing(false)
      setSelectedRollIds(new Set())
    })
  }, [])

  const onMutationSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['stock-fini'] })
  }, [queryClient])

  // The single selected roll (only when exactly one is selected) — drives the
  // "Couper" button + cut dialog.
  const selectedRow =
    selectedRollIds.size === 1
      ? filteredSorted.find((r) => r.IDstock_fini === [...selectedRollIds][0]) ?? null
      : null

  // Totalizer over the currently-visible (filtered) rows
  const rollCount = filteredSorted.length
  const totalPoids = filteredSorted.reduce((sum, r) => sum + (r.poids ?? 0), 0)
  const totalMetrage = filteredSorted.reduce((sum, r) => sum + (r.metrage ?? 0), 0)

  // Selection summary (edit mode) — shown inside the totalizer card.
  const selectedRows = isEditing
    ? filteredSorted.filter((r) => selectedRollIds.has(r.IDstock_fini))
    : []
  const selCount = selectedRows.length
  const selPoids = selectedRows.reduce((sum, r) => sum + (r.poids ?? 0), 0)
  const selMetrage = selectedRows.reduce((sum, r) => sum + (r.metrage ?? 0), 0)

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-3">
        {isEditing && (
          <Badge className="bg-accent text-accent-foreground gap-1 shadow-sm flex-shrink-0">
            <Pencil className="h-3 w-3" />
            Mode édition
          </Badge>
        )}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher (réf, coloris, lot, numéro, emplacement, conteneur, observations…)"
            className="h-9 w-full pl-8 pr-3 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none flex-shrink-0">
          <input
            type="checkbox"
            checked={hideShipped}
            onChange={(e) => setHideShipped(e.target.checked)}
            className="h-4 w-4 rounded border-input text-accent focus:ring-2 focus:ring-ring cursor-pointer"
          />
          <span>Masquer les rouleaux expédiés</span>
        </label>

        {!isEditing ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            {canCreate && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Nouveau
              </Button>
            )}
            <Button variant="gold" size="sm" onClick={enterEditMode}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Modifier
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            {canCut && selectedRollIds.size === 1 && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                title="Couper le rouleau"
                onClick={() => setCutOpen(true)}
              >
                <Scissors className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" onClick={exitEditMode}>
              <X className="h-3.5 w-3.5 mr-1.5" />
              Terminer
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border/60 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-full text-destructive gap-2">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">{(error as Error)?.message || 'Erreur de chargement'}</p>
          </div>
        ) : filteredSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Boxes className="h-12 w-12 opacity-30" />
            <p className="text-sm">Aucun rouleau en stock</p>
          </div>
        ) : (
          <>
            {/* Header table (non-scrolling) */}
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                {/* Selection column: always present (kept structurally stable so
                    toggling edit mode doesn't mount/unmount a cell on every row),
                    collapsed to 0 width in view mode. */}
                <col style={{ width: isEditing ? SELECT_COL_WIDTH : '0' }} />
                {COLUMNS.map((c) => (
                  <col key={c.key} style={{ width: c.width }} />
                ))}
                <col style={{ width: ICON_COL_WIDTH }} />
              </colgroup>
              <thead className="bg-zinc-200/60 border-b border-border/60">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className={isEditing ? 'px-3 py-2.5' : 'p-0'}></th>
                  {COLUMNS.map((c) => (
                    <SortHeader
                      key={c.key}
                      label={c.label}
                      sortKey={c.key}
                      sort={sort}
                      onSort={handleSort}
                      align={c.align}
                    />
                  ))}
                  <th className="px-3 py-2.5 text-left font-semibold"></th>
                </tr>
              </thead>
            </table>

            {/* Body table (scrolling) */}
            <div className="flex-1 min-h-0 overflow-auto scrollbar-transparent">
              <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: isEditing ? SELECT_COL_WIDTH : '0' }} />
                  {COLUMNS.map((c) => (
                    <col key={c.key} style={{ width: c.width }} />
                  ))}
                  <col style={{ width: ICON_COL_WIDTH }} />
                </colgroup>
                <tbody>
                  {filteredSorted.map((r) => (
                    <StockRow
                      key={r.IDstock_fini}
                      row={r}
                      isEditing={isEditing}
                      selected={
                        isEditing ? selectedRollIds.has(r.IDstock_fini) : r.IDstock_fini === selectedId
                      }
                      onSelect={handleSelectRoll}
                      onOpen={handleRowClick}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Totalizer — standalone summary bar, detached from the table */}
      {!isLoading && !isError && filteredSorted.length > 0 && (
        <div className="flex-shrink-0 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-zinc-100/80 shadow-sm px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-accent" />
            <span className="font-semibold">{rollCount}</span>
            <span className="text-muted-foreground">rouleau{rollCount > 1 ? 'x' : ''}</span>
            {selCount > 0 && (
              <span className="ml-3 pl-3 border-l border-border/60 flex items-center gap-1.5 text-accent">
                <Check className="h-3.5 w-3.5" />
                <span className="font-semibold tabular-nums">{selCount}</span>
                <span>sélectionné{selCount > 1 ? 's' : ''}</span>
                <span className="text-muted-foreground/50">·</span>
                <span className="font-medium tabular-nums">{fmtNum(selPoids, 1)} kg</span>
                <span className="text-muted-foreground/50">·</span>
                <span className="font-medium tabular-nums">{fmtNum(selMetrage, 1)} m</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-baseline gap-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Poids total</span>
              <span className="text-base font-bold tabular-nums">{fmtNum(totalPoids, 1)} kg</span>
            </div>
            <div className="flex items-baseline gap-2 border-l border-border/60 pl-5">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Métrage total</span>
              <span className="text-base font-bold tabular-nums">{fmtNum(totalMetrage, 1)} m</span>
            </div>
          </div>
        </div>
      )}

      <StockFiniDrawer
        id={selectedId}
        onClose={handleClose}
        onMutationSuccess={onMutationSuccess}
        onDirtyChange={setDrawerDirty}
        saveRef={drawerSaveRef}
        discardRef={drawerDiscardRef}
      />

      <UnsavedChangesDialog
        open={guard.showDialog}
        onAction={guard.handleAction}
        isSaving={guard.isSaving}
      />

      <CutRollDialog
        open={cutOpen}
        row={selectedRow}
        onClose={() => setCutOpen(false)}
        onSuccess={() => {
          onMutationSuccess()
          setCutOpen(false)
          setSelectedRollIds(new Set())
          lastSelectedRollIdRef.current = null
        }}
      />

      <CreateFiniRollDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(newId) => {
          setCreateOpen(false)
          onMutationSuccess()
          if (newId && newId > 0) setSelectedId(newId)
        }}
      />
    </div>
  )
}

// ── Cut-roll dialog ────────────────────────────────────
// Split one physical roll into N rolls. Pieces 1..N-1 are editable; the LAST
// piece is auto-computed as the remainder so the weight & length totals always
// equal the original (value conservation). Piece 1 keeps the original numero;
// the others preview as "<base>-2", "<base>-3", …

interface CutPieceDraft {
  poids: string
  metrage: string
}

function CutRollDialog({
  open,
  row,
  onClose,
  onSuccess,
}: {
  open: boolean
  row: StockFiniRow | null
  onClose: () => void
  onSuccess: () => void
}) {
  // `editable` holds the first N-1 pieces (the user-controlled ones). The last
  // piece is always derived. Two editable entries → 3 pieces total by default? No:
  // we start with ONE editable + the auto remainder = 2 pieces total.
  const [editable, setEditable] = useState<CutPieceDraft[]>([{ poids: '', metrage: '' }])

  const origId = row?.IDstock_fini ?? null
  // Reset the draft whenever the dialog opens for a different roll.
  useEffect(() => {
    if (open) setEditable([{ poids: '', metrage: '' }])
  }, [open, origId])

  const origPoids = Number(row?.poids) || 0
  const origMetrage = Number(row?.metrage) || 0
  const base = ((row?.numero ?? '').trim() || (origId != null ? `#${origId}` : '')).slice(0, 18)

  const num = (s: string) => {
    const v = Number(String(s).replace(',', '.'))
    return Number.isFinite(v) ? v : 0
  }
  const sumEditPoids = editable.reduce((s, p) => s + num(p.poids), 0)
  const sumEditMetrage = editable.reduce((s, p) => s + num(p.metrage), 0)
  const lastPoids = origPoids - sumEditPoids
  const lastMetrage = origMetrage - sumEditMetrage

  const negative = lastPoids < -0.0001 || lastMetrage < -0.0001
  const valid = !negative && editable.every((p) => p.poids.trim() !== '' && p.metrage.trim() !== '')

  const cutMutation = useMutation({
    mutationFn: () => {
      const pieces = [
        ...editable.map((p) => ({ poids: num(p.poids), metrage: num(p.metrage) })),
        { poids: Math.max(0, lastPoids), metrage: Math.max(0, lastMetrage) },
      ]
      return apiFetch(`/stock/fini/${origId}/cut`, {
        method: 'POST',
        body: JSON.stringify({ pieces }),
      })
    },
    onSuccess: () => onSuccess(),
  })

  const pieceLabel = (idx: number) => (idx === 0 ? row?.numero || base : `${base}-${idx + 1}`)
  const totalPieces = editable.length + 1

  // Cross-multiplication (règle de trois): a cut preserves the original roll's
  // linear density, so poids and metrage stay proportional. Editing one field
  // auto-fills the other from the original ratio. Guarded against a zero
  // original dimension (can't derive a ratio from 0).
  const round2 = (v: number) => Math.round(v * 100) / 100
  const mPerKg = origPoids > 0 ? origMetrage / origPoids : 0
  const kgPerM = origMetrage > 0 ? origPoids / origMetrage : 0

  const setPoids = (idx: number, value: string) =>
    setEditable((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p
        if (value.trim() === '') return { poids: '', metrage: origPoids > 0 ? '' : p.metrage }
        const metrage = origPoids > 0 ? String(round2(num(value) * mPerKg)) : p.metrage
        return { poids: value, metrage }
      }),
    )
  const setMetrage = (idx: number, value: string) =>
    setEditable((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p
        if (value.trim() === '') return { metrage: '', poids: origMetrage > 0 ? '' : p.poids }
        const poids = origMetrage > 0 ? String(round2(num(value) * kgPerM)) : p.poids
        return { metrage: value, poids }
      }),
    )
  const addPiece = () =>
    setEditable((prev) => (prev.length + 1 < 10 ? [...prev, { poids: '', metrage: '' }] : prev))
  const removePiece = (idx: number) =>
    setEditable((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))

  return (
    <Dialog open={open && !!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-accent" />
            Couper le rouleau{row?.numero ? ` ${row.numero}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {/* Original summary */}
          <div className="rounded-lg border border-border/60 bg-zinc-100/80 px-3 py-2 text-sm">
            <div className="font-medium truncate">
              {row?.ref_fini ?? '—'}
              {row?.coloris_reference ? ` · ${row.coloris_reference}` : ''}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
              Original : {fmtNum(origPoids, 1)} kg · {fmtNum(origMetrage, 1)} m
            </div>
          </div>

          {/* Piece rows */}
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              <span>Numéro</span>
              <span className="w-24 text-right">Poids (kg)</span>
              <span className="w-24 text-right">Métrage (m)</span>
              <span className="w-6" />
            </div>

            {editable.map((p, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                <span className="text-sm tabular-nums truncate">{pieceLabel(idx)}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={p.poids}
                  onChange={(e) => setPoids(idx, e.target.value)}
                  className="h-8 w-24 px-2 text-sm text-right rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={p.metrage}
                  onChange={(e) => setMetrage(idx, e.target.value)}
                  className="h-8 w-24 px-2 text-sm text-right rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  title="Retirer ce morceau"
                  disabled={editable.length <= 1}
                  onClick={() => removePiece(idx)}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            {/* Auto-balanced last piece */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
              <span className="text-sm tabular-nums truncate text-muted-foreground">
                {pieceLabel(editable.length)}
                <span className="ml-1.5 text-[10px] uppercase tracking-wide">auto</span>
              </span>
              <span
                className={cn(
                  'h-8 w-24 px-2 inline-flex items-center justify-end text-sm tabular-nums rounded-md border bg-zinc-100/60',
                  lastPoids < -0.0001 ? 'border-destructive text-destructive' : 'border-border/60 text-muted-foreground',
                )}
              >
                {fmtNum(lastPoids, 1)}
              </span>
              <span
                className={cn(
                  'h-8 w-24 px-2 inline-flex items-center justify-end text-sm tabular-nums rounded-md border bg-zinc-100/60',
                  lastMetrage < -0.0001 ? 'border-destructive text-destructive' : 'border-border/60 text-muted-foreground',
                )}
              >
                {fmtNum(lastMetrage, 1)}
              </span>
              <span className="w-6" />
            </div>
          </div>

          {/* Add piece + totals */}
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-accent hover:text-accent hover:bg-accent/10"
              disabled={totalPieces >= 10}
              onClick={addPiece}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Ajouter un morceau
            </Button>
            <div className="text-xs text-muted-foreground tabular-nums flex items-center gap-1.5">
              {negative ? (
                <span className="text-destructive font-medium">Le dernier morceau serait négatif</span>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5 text-success" />
                  {totalPieces} morceaux · {fmtNum(origPoids, 1)} kg · {fmtNum(origMetrage, 1)} m
                </>
              )}
            </div>
          </div>

          {cutMutation.isError && (
            <p className="text-sm text-destructive mt-3">
              {(cutMutation.error as Error)?.message || 'Erreur lors de la découpe'}
            </p>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={cutMutation.isPending}>
            Annuler
          </Button>
          <Button onClick={() => cutMutation.mutate()} disabled={!valid || cutMutation.isPending}>
            {cutMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Scissors className="h-4 w-4 mr-1.5" />
            )}
            Couper
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Create finished-roll dialog ────────────────────────
// Manually register a new physical finished roll (Finis > Stock "Nouveau",
// gated by the create_stock_fini permission). Référence + Coloris + Poids are
// required; coloris options are polymorphic by the ref's avec_teinture and come
// from /lookups/coloris (the returned id is already the right IDColoris).

interface RefFiniOption {
  IDref_fini: number
  reference: string | null
  designation: string | null
  avec_teinture: number
}
interface ColorisOption {
  id: number
  reference: string | null
}
interface MagasinOption {
  IDsous_traitant: number
  nom: string | null
}

function CreateFiniRollDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (newId: number | null) => void
}) {
  const [IDref_fini, setIDrefFini] = useState(0)
  const [IDColoris, setIDColoris] = useState(0)
  const [lot, setLot] = useState('')
  const [numero, setNumero] = useState('')
  const [poids, setPoids] = useState('')
  const [metrage, setMetrage] = useState('')
  const [IDetat, setIDetat] = useState(1) // default "En Contrôle"
  const [IDmagasin, setIDmagasin] = useState(0)
  const [emplacement, setEmplacement] = useState('')
  const [observations, setObservations] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refsQuery = useQuery<RefFiniOption[]>({
    queryKey: ['stock-fini', 'lookups', 'refs'],
    queryFn: () => apiFetch<RefFiniOption[]>('/stock/fini/lookups/refs'),
    enabled: open,
  })
  const colorisQuery = useQuery<ColorisOption[]>({
    queryKey: ['stock-fini', 'lookups', 'coloris', IDref_fini],
    queryFn: () => apiFetch<ColorisOption[]>(`/stock/fini/lookups/coloris?ref_fini=${IDref_fini}`),
    enabled: open && IDref_fini > 0,
  })
  const { data: etats } = useEtatsLookup()
  const magasinsQuery = useQuery<MagasinOption[]>({
    queryKey: ['stock-fini', 'lookups', 'magasins'],
    queryFn: () => apiFetch<MagasinOption[]>('/stock/fini/lookups/magasins'),
    enabled: open,
  })

  // Reset every field when the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setIDrefFini(0)
      setIDColoris(0)
      setLot('')
      setNumero('')
      setPoids('')
      setMetrage('')
      setIDetat(1)
      setIDmagasin(0)
      setEmplacement('')
      setObservations('')
      setError(null)
    }
  }, [open])

  // Coloris belongs to a ref — clear the pick when the ref changes.
  useEffect(() => { setIDColoris(0) }, [IDref_fini])

  const num = (s: string) => {
    const v = Number(String(s).replace(',', '.'))
    return Number.isFinite(v) ? v : NaN
  }
  const canSubmit =
    IDref_fini > 0 && IDColoris > 0 && poids.trim() !== '' && !isNaN(num(poids)) && num(poids) >= 0

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ IDstock_fini: number | null }>('/stock/fini', {
        method: 'POST',
        body: JSON.stringify({
          IDref_fini,
          IDColoris,
          lot,
          numero,
          poids: num(poids),
          metrage: metrage.trim() === '' ? 0 : num(metrage),
          IDetat_stock_fini: IDetat,
          IDmagasin,
          emplacement,
          observations,
        }),
      }),
    onSuccess: (res) => onCreated(res?.IDstock_fini ?? null),
    onError: (err: Error) => setError(err.message || 'Erreur lors de la création'),
  })

  const inputClass =
    'w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FiniRollIcon className="h-5 w-5 text-accent" />
            Nouveau rouleau fini
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Référence *</label>
            <SearchableCombobox<RefFiniOption>
              options={refsQuery.data ?? []}
              value={IDref_fini}
              onChange={setIDrefFini}
              getId={(r) => r.IDref_fini}
              getPrimary={(r) => r.reference ?? ''}
              getSecondary={(r) => r.designation ?? undefined}
              placeholder="Rechercher une référence"
              loading={refsQuery.isLoading}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Coloris *</label>
            <PopoverSelect
              options={(colorisQuery.data ?? []).map((c) => ({ id: c.id, primary: c.reference ?? '' }))}
              value={IDColoris}
              onChange={setIDColoris}
              disabled={IDref_fini === 0}
              emptyLabel={
                IDref_fini === 0
                  ? '— Choisir une référence —'
                  : colorisQuery.isLoading
                    ? 'Chargement…'
                    : (colorisQuery.data ?? []).length === 0
                      ? 'Aucun coloris'
                      : '— Sélectionner —'
              }
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Lot</label>
            <input type="text" value={lot} onChange={(e) => setLot(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Numéro</label>
            <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Poids (kg) *</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={poids}
              onChange={(e) => setPoids(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Métrage (m)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={metrage}
              onChange={(e) => setMetrage(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">État</label>
            <PopoverSelect
              options={(etats ?? []).map((e) => ({ id: e.IDetat_stock_fini, primary: e.libelle }))}
              value={IDetat}
              onChange={setIDetat}
              hideEmpty
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Magasin</label>
            <SearchableCombobox<MagasinOption>
              options={magasinsQuery.data ?? []}
              value={IDmagasin}
              onChange={setIDmagasin}
              getId={(m) => m.IDsous_traitant}
              getPrimary={(m) => m.nom ?? ''}
              placeholder="Rechercher un magasin"
              loading={magasinsQuery.isLoading}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Emplacement</label>
            <input
              type="text"
              value={emplacement}
              onChange={(e) => setEmplacement(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Observations</label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={2}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            Annuler
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Table row (memoized) ──────────────────────────────
// Extracted + React.memo'd so selecting a single roll in edit mode re-renders
// only the affected row, not all ~1.4k rows. The selection cell is always
// rendered (collapsed via `p-0` in view mode) so the column structure never
// changes — toggling edit mode is a cheap className/width flip, not a per-row
// cell mount.

const StockRow = memo(function StockRow({
  row,
  isEditing,
  selected,
  onSelect,
  onOpen,
}: {
  row: StockFiniRow
  isEditing: boolean
  selected: boolean
  onSelect: (id: number, shiftKey: boolean) => void
  onOpen: (id: number) => void
}) {
  return (
    <tr
      data-stock-row
      onClick={(e) =>
        isEditing ? onSelect(row.IDstock_fini, e.shiftKey) : onOpen(row.IDstock_fini)
      }
      className={cn(
        'border-b border-border/40 cursor-pointer transition-colors',
        isEditing && 'select-none',
        selected ? 'bg-accent/10' : 'hover:bg-accent/5',
      )}
    >
      <td className={isEditing ? 'px-3 py-2' : 'p-0'}>
        {isEditing && (
          <div
            className={cn(
              'h-5 w-5 rounded border flex items-center justify-center transition-colors',
              selected ? 'bg-accent border-accent text-accent-foreground' : 'bg-white border-input',
            )}
          >
            {selected && <Check className="h-3.5 w-3.5" />}
          </div>
        )}
      </td>
      <td className="px-3 py-2 font-medium truncate">{row.ref_fini ?? '—'}</td>
      <td className="px-3 py-2 truncate">{row.coloris_reference ?? '—'}</td>
      <td className="px-3 py-2 tabular-nums truncate">{row.lot ?? '—'}</td>
      <td className="px-3 py-2 tabular-nums truncate text-muted-foreground">{row.numero ?? '—'}</td>
      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatKg(row.poids)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatMeters(row.metrage)}</td>
      <td className="px-3 py-2">
        {row.etat_libelle ? (
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border',
              etatPillClass(row.etat_libelle),
            )}
          >
            {row.etat_libelle}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 truncate">{row.emplacement ?? '—'}</td>
      <td className="px-3 py-2 truncate text-muted-foreground">{row.magasin_nom ?? '—'}</td>
      <td className="px-3 py-2 tabular-nums text-muted-foreground">
        {row.date_saisie ? formatHfsqlDate(row.date_saisie) : '—'}
      </td>
      <td className="px-3 py-2 text-muted-foreground truncate" title={row.observations ?? undefined}>
        {row.observations?.trim() || ''}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {!!row.second_choix && (
            <Badge variant="outline" className="text-[10px] py-0 border-red-300 text-red-700">2C</Badge>
          )}
          {!!row.don && <Gift className="h-3.5 w-3.5 text-amber-600" />}
          {!!row.destockage && <Trash2 className="h-3.5 w-3.5 text-zinc-500" />}
        </div>
      </td>
    </tr>
  )
})

// ── Sort header cell ───────────────────────────────────

interface SortHeaderProps {
  label: string
  sortKey: SortKey
  sort: SortState
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}
function SortHeader({ label, sortKey, sort, onSort, align = 'left' }: SortHeaderProps) {
  const active = sort.key === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={cn(
        'px-3 py-2.5 font-semibold cursor-pointer select-none whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
        active && 'text-accent',
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  )
}

// ── Side drawer ────────────────────────────────────────

interface DrawerProps {
  id: number | null
  onClose: () => void
  onMutationSuccess: () => void
  onDirtyChange: (dirty: boolean) => void
  saveRef: React.MutableRefObject<() => Promise<void>>
  discardRef: React.MutableRefObject<() => void>
}

function StockFiniDrawer({ id, onClose, onMutationSuccess, onDirtyChange, saveRef, discardRef }: DrawerProps) {
  const { data: detail, isLoading } = useStockFiniDetail(id)
  const { data: etats } = useEtatsLookup()
  const drawerRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()
  const embed = searchParams.get('embed') === 'true'

  const [isEditing, setIsEditing] = useState(false)
  const [editObservations, setEditObservations] = useState('')
  const [editObservationSst, setEditObservationSst] = useState('')
  const [editEmplacement, setEditEmplacement] = useState('')
  const [editConteneur, setEditConteneur] = useState('')
  const [editPointage, setEditPointage] = useState('')
  const [editEtat, setEditEtat] = useState<number | null>(null)
  const [editSecondChoix, setEditSecondChoix] = useState(false)
  const [editDestockage, setEditDestockage] = useState(false)
  const [editDon, setEditDon] = useState(false)

  const originalDraftRef = useRef<{
    observations: string
    observation_sst: string
    emplacement: string
    conteneur: string
    pointage: string
    etat: number | null
    secondChoix: boolean
    destockage: boolean
    don: boolean
  } | null>(null)

  useEffect(() => {
    setIsEditing(false)
  }, [id])

  useEffect(() => {
    if (id === null) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (drawerRef.current?.contains(target)) return
      if ((target as Element).closest?.('tr[data-stock-row]')) return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [id, onClose])

  const startEdit = useCallback(() => {
    if (!detail) return
    const snapshot = {
      observations: detail.observations ?? '',
      observation_sst: detail.observation_sst ?? '',
      emplacement: detail.emplacement ?? '',
      conteneur: detail.conteneur ?? '',
      pointage: hfsqlDateToInput(detail.pointage),
      etat: detail.IDetat_stock_fini,
      secondChoix: !!detail.second_choix,
      destockage: !!detail.destockage,
      don: !!detail.don,
    }
    setEditObservations(snapshot.observations)
    setEditObservationSst(snapshot.observation_sst)
    setEditEmplacement(snapshot.emplacement)
    setEditConteneur(snapshot.conteneur)
    setEditPointage(snapshot.pointage)
    setEditEtat(snapshot.etat)
    setEditSecondChoix(snapshot.secondChoix)
    setEditDestockage(snapshot.destockage)
    setEditDon(snapshot.don)
    originalDraftRef.current = snapshot
    setIsEditing(true)
  }, [detail])

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/stock/fini/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          observations: editObservations,
          observation_sst: editObservationSst,
          emplacement: editEmplacement,
          conteneur: editConteneur,
          pointage: editPointage ? inputDateToHfsql(editPointage) : '',
          IDetat_stock_fini: editEtat,
          second_choix: editSecondChoix,
          destockage: editDestockage,
          don: editDon,
        }),
      }),
    onSuccess: () => {
      onMutationSuccess()
      setIsEditing(false)
    },
  })

  const isDirty = useMemo(() => {
    if (!isEditing) return false
    const o = originalDraftRef.current
    if (!o) return false
    if (editObservations !== o.observations) return true
    if (editObservationSst !== o.observation_sst) return true
    if (editEmplacement !== o.emplacement) return true
    if (editConteneur !== o.conteneur) return true
    if (editPointage !== o.pointage) return true
    if (editEtat !== o.etat) return true
    if (editSecondChoix !== o.secondChoix) return true
    if (editDestockage !== o.destockage) return true
    if (editDon !== o.don) return true
    return false
  }, [
    isEditing,
    editObservations,
    editObservationSst,
    editEmplacement,
    editConteneur,
    editPointage,
    editEtat,
    editSecondChoix,
    editDestockage,
    editDon,
  ])

  useEffect(() => { onDirtyChange(isDirty) }, [isDirty, onDirtyChange])
  useEffect(() => () => { onDirtyChange(false) }, [onDirtyChange])

  useEffect(() => {
    saveRef.current = async () => { await saveMutation.mutateAsync() }
  })
  useEffect(() => {
    discardRef.current = () => setIsEditing(false)
  })

  const open = id !== null

  return (
    <div
      ref={drawerRef}
      className={cn(
        'fixed right-0 bottom-0 w-[440px] bg-white border-l border-border/60 shadow-xl z-30 transition-transform duration-300 flex flex-col',
        embed ? 'top-0' : 'top-14',
        open ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      <div className="flex-1 min-h-0 flex flex-col bg-zinc-100/80">
        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border/60 bg-zinc-200/50">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0',
                isEditing ? 'bg-accent/15 text-accent' : 'icon-box-gold',
              )}
            >
              <FiniRollIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              {isLoading || !detail ? (
                <div className="h-5 w-40 bg-muted animate-pulse rounded" />
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-heading font-bold tracking-tight truncate">{detail.ref_fini ?? '—'}</h2>
                    {!!detail.second_choix && (
                      <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-[10px] py-0">
                        2ᵉ choix
                      </Badge>
                    )}
                    {!!detail.don && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1 text-[10px] py-0">
                        <Gift className="h-2.5 w-2.5" />
                        Don
                      </Badge>
                    )}
                    {!!detail.IDligne_expedition && (
                      <Badge className="bg-zinc-200 text-zinc-700 border-zinc-300 gap-1 text-[10px] py-0">
                        <Send className="h-2.5 w-2.5" />
                        Expédiée
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {detail.coloris_reference ?? '—'}
                    {detail.lot ? ` · Lot ${detail.lot}` : ''}
                    {detail.numero ? ` · N° ${detail.numero}` : ''}
                  </p>
                </>
              )}
            </div>
            {detail && (
              <div className="flex items-center gap-2 flex-shrink-0 -mt-0.5">
                {isEditing ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      Annuler
                    </Button>
                    <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Enregistrer
                    </Button>
                  </>
                ) : (
                  <Button variant="gold" size="sm" onClick={startEdit}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Modifier
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scrollbar-transparent">
          {isLoading || !detail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : (
            <>
              {/* Stock card */}
              <DrawerCard icon={<Package className="h-4 w-4 text-accent" />} title="Stock">
                <div className="space-y-1.5">
                  <KV label="Poids" value={<span className="font-semibold tabular-nums">{formatKg(detail.poids)}</span>} />
                  <KV label="Métrage" value={<span className="tabular-nums">{formatMeters(detail.metrage)}</span>} />
                  {!!detail.designation && (
                    <KV label="Désignation" value={detail.designation} />
                  )}
                </div>
              </DrawerCard>

              {/* État + qualité */}
              <DrawerCard icon={<Activity className="h-4 w-4 text-accent" />} title="État" highlight={isEditing}>
                <div className="space-y-2">
                  <KV
                    label="Statut"
                    value={
                      isEditing ? (
                        <select
                          value={editEtat ?? ''}
                          onChange={(e) => setEditEtat(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                          className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring max-w-[180px]"
                        >
                          <option value="">—</option>
                          {(etats ?? []).map((opt) => (
                            <option key={opt.IDetat_stock_fini} value={opt.IDetat_stock_fini}>
                              {opt.libelle}
                            </option>
                          ))}
                        </select>
                      ) : detail.etat_libelle ? (
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border',
                            etatPillClass(detail.etat_libelle),
                          )}
                        >
                          {detail.etat_libelle}
                        </span>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <KV
                    label="2ᵉ choix"
                    value={
                      isEditing ? (
                        <input
                          type="checkbox"
                          checked={editSecondChoix}
                          onChange={(e) => setEditSecondChoix(e.target.checked)}
                          className="h-4 w-4 rounded border-input text-accent focus:ring-2 focus:ring-ring cursor-pointer"
                        />
                      ) : detail.second_choix ? (
                        <Sparkles className="h-3.5 w-3.5 text-red-600" />
                      ) : (
                        <span className="text-muted-foreground">Non</span>
                      )
                    }
                  />
                </div>
              </DrawerCard>

              {/* Provenance */}
              <DrawerCard icon={<Factory className="h-4 w-4 text-accent" />} title="Provenance">
                <div className="space-y-1.5">
                  <KV
                    label="Commande sst source"
                    value={detail.IDref_commande_source ? <span className="tabular-nums">#{detail.IDref_commande_source}</span> : '—'}
                  />
                  <KV
                    label="Rouleau écru source"
                    value={detail.IDstock_ecru ? <span className="tabular-nums">#{detail.IDstock_ecru}</span> : '—'}
                  />
                  <KV
                    label="Date saisie"
                    value={detail.date_saisie ? formatHfsqlDate(detail.date_saisie) : '—'}
                  />
                </div>
              </DrawerCard>

              {/* Stockage */}
              <DrawerCard icon={<MapPin className="h-4 w-4 text-accent" />} title="Stockage" highlight={isEditing}>
                <div className="space-y-1.5">
                  <KV
                    label="Emplacement"
                    value={
                      isEditing ? (
                        <input
                          type="text"
                          value={editEmplacement}
                          onChange={(e) => setEditEmplacement(e.target.value)}
                          className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right"
                        />
                      ) : (
                        detail.emplacement || '—'
                      )
                    }
                  />
                  <KV
                    label="Conteneur"
                    value={
                      isEditing ? (
                        <input
                          type="text"
                          value={editConteneur}
                          onChange={(e) => setEditConteneur(e.target.value)}
                          className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right"
                        />
                      ) : (
                        detail.conteneur || '—'
                      )
                    }
                  />
                  <KV label="Magasin" value={detail.magasin_nom ?? '—'} />
                  <KV
                    label="Pointage"
                    value={
                      isEditing ? (
                        <input
                          type="date"
                          value={editPointage}
                          onChange={(e) => setEditPointage(e.target.value)}
                          className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      ) : detail.pointage ? (
                        formatHfsqlDate(detail.pointage)
                      ) : (
                        '—'
                      )
                    }
                  />
                </div>
              </DrawerCard>

              {/* Affectation */}
              <DrawerCard icon={<Send className="h-4 w-4 text-accent" />} title="Affectation" highlight={isEditing}>
                <div className="space-y-1.5">
                  <KV
                    label="Commande client"
                    value={
                      detail.IDligne_commande_client
                        ? <span className="tabular-nums">Allouée à #{detail.IDligne_commande_client}</span>
                        : <span className="text-muted-foreground">—</span>
                    }
                  />
                  <KV
                    label="Expédition"
                    value={
                      detail.IDligne_expedition
                        ? <span className="tabular-nums">#{detail.IDligne_expedition}</span>
                        : <span className="text-muted-foreground">—</span>
                    }
                  />
                  <KV
                    label="Donation"
                    value={
                      isEditing ? (
                        <input
                          type="checkbox"
                          checked={editDon}
                          onChange={(e) => setEditDon(e.target.checked)}
                          className="h-4 w-4 rounded border-input text-accent focus:ring-2 focus:ring-ring cursor-pointer"
                        />
                      ) : detail.don ? (
                        <Gift className="h-3.5 w-3.5 text-amber-600" />
                      ) : (
                        <span className="text-muted-foreground">Non</span>
                      )
                    }
                  />
                  <KV
                    label="Déstockage"
                    value={
                      isEditing ? (
                        <input
                          type="checkbox"
                          checked={editDestockage}
                          onChange={(e) => setEditDestockage(e.target.checked)}
                          className="h-4 w-4 rounded border-input text-accent focus:ring-2 focus:ring-ring cursor-pointer"
                        />
                      ) : detail.destockage ? (
                        <Trash2 className="h-3.5 w-3.5 text-zinc-600" />
                      ) : (
                        <span className="text-muted-foreground">Non</span>
                      )
                    }
                  />
                </div>
              </DrawerCard>

              {/* Notes */}
              <DrawerCard icon={<MessageSquare className="h-4 w-4 text-accent" />} title="Notes" highlight={isEditing}>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Observations</p>
                    {isEditing ? (
                      <textarea
                        value={editObservations}
                        onChange={(e) => setEditObservations(e.target.value)}
                        rows={3}
                        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      />
                    ) : detail.observations?.trim() ? (
                      <p className="text-sm whitespace-pre-wrap">{detail.observations.trim()}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">—</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Observation sous-traitant</p>
                    {isEditing ? (
                      <textarea
                        value={editObservationSst}
                        onChange={(e) => setEditObservationSst(e.target.value)}
                        rows={2}
                        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      />
                    ) : detail.observation_sst?.trim() ? (
                      <p className="text-sm whitespace-pre-wrap">{detail.observation_sst.trim()}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">—</p>
                    )}
                  </div>
                </div>
              </DrawerCard>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Drawer card primitives ─────────────────────────────

function DrawerCard({
  icon,
  title,
  highlight,
  children,
}: {
  icon: React.ReactNode
  title: string
  highlight?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border/60 bg-card p-3 shadow-sm',
        highlight && 'border-l-4 border-l-accent/70 bg-accent/[0.03]',
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm text-right truncate', mono && 'tabular-nums')}>{value}</span>
    </div>
  )
}
