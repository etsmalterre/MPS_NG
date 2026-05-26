import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FiniRollIcon } from '@/components/icons/FiniRollIcon'
import { cn } from '@/lib/utils'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { apiFetch } from '@/lib/api'

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

  const { data: rows, isLoading, isError, error } = useStockFiniList({ hideShipped })

  const filteredSorted = useMemo(() => {
    let out = rows ?? []
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      out = out.filter((r) => {
        const fields = [
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
        return fields.some((f) => f && f.toLowerCase().includes(q))
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

  const onMutationSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['stock-fini'] })
  }, [queryClient])

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-3">
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
                {COLUMNS.map((c) => (
                  <col key={c.key} style={{ width: c.width }} />
                ))}
                <col style={{ width: ICON_COL_WIDTH }} />
              </colgroup>
              <thead className="bg-zinc-200/60 border-b border-border/60">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
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
                  {COLUMNS.map((c) => (
                    <col key={c.key} style={{ width: c.width }} />
                  ))}
                  <col style={{ width: ICON_COL_WIDTH }} />
                </colgroup>
                <tbody>
                  {filteredSorted.map((r) => {
                    const isSelected = r.IDstock_fini === selectedId
                    return (
                      <tr
                        key={r.IDstock_fini}
                        data-stock-row
                        onClick={() => handleRowClick(r.IDstock_fini)}
                        className={cn(
                          'border-b border-border/40 cursor-pointer transition-colors',
                          isSelected ? 'bg-accent/10' : 'hover:bg-accent/5',
                        )}
                      >
                        <td className="px-3 py-2 font-medium truncate">{r.ref_fini ?? '—'}</td>
                        <td className="px-3 py-2 truncate">{r.coloris_reference ?? '—'}</td>
                        <td className="px-3 py-2 tabular-nums truncate">{r.lot ?? '—'}</td>
                        <td className="px-3 py-2 tabular-nums truncate text-muted-foreground">{r.numero ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{formatKg(r.poids)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatMeters(r.metrage)}</td>
                        <td className="px-3 py-2">
                          {r.etat_libelle ? (
                            <span
                              className={cn(
                                'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border',
                                etatPillClass(r.etat_libelle),
                              )}
                            >
                              {r.etat_libelle}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 truncate">{r.emplacement ?? '—'}</td>
                        <td className="px-3 py-2 truncate text-muted-foreground">{r.magasin_nom ?? '—'}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {r.date_saisie ? formatHfsqlDate(r.date_saisie) : '—'}
                        </td>
                        <td
                          className="px-3 py-2 text-muted-foreground truncate"
                          title={r.observations ?? undefined}
                        >
                          {r.observations?.trim() || ''}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!!r.second_choix && (
                              <Badge variant="outline" className="text-[10px] py-0 border-red-300 text-red-700">2C</Badge>
                            )}
                            {!!r.don && <Gift className="h-3.5 w-3.5 text-amber-600" />}
                            {!!r.destockage && <Trash2 className="h-3.5 w-3.5 text-zinc-500" />}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

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
    </div>
  )
}

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
