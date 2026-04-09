import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  Leaf,
  Recycle,
  CheckCircle2,
  ShieldCheck,
  Calendar,
  MapPin,
  Factory,
  Package,
  MessageSquare,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'

// ── Types ──────────────────────────────────────────────

interface StockRow {
  IDstock_fil: number
  IDfournisseur: number | null
  IDref_fil: number | null
  IDcolori_fil: number | null
  IDref_fil_commande: number | null
  IDMagasin: number | null
  stock: number | null
  stock_initial: number | null
  lot: string | null
  lot_frs: string | null
  emplacement: string | null
  date_entree: string | null
  dernier_mouvement: string | null
  dernier_pointage: string | null
  niveau: number | null
  termine: number | null
  controle: number | null
  commentaire: string | null
  observation_freinte: string | null
  ref_fil: string | null
  titrage: number | null
  bio: number | null
  recycle: number | null
  colori_reference: string | null
  fournisseur_nom: string | null
}

interface StockDetail extends StockRow {
  has_certif_bio: boolean
  has_certif_recycle: boolean
}

// ── API helpers ────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'

async function apiFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!res.ok) throw new Error('Erreur API')
  return res.json() as Promise<T>
}

function useStockList(filters: { hideFinished: boolean }) {
  const params = new URLSearchParams()
  if (!filters.hideFinished) params.set('termine', 'all')
  const qs = params.toString()
  return useQuery<StockRow[]>({
    queryKey: ['stock-fil', filters],
    queryFn: () => apiFetch<StockRow[]>(`/stock/fil${qs ? `?${qs}` : ''}`),
  })
}

function useStockDetail(id: number | null) {
  return useQuery<StockDetail>({
    queryKey: ['stock-fil', 'detail', id],
    queryFn: () => apiFetch<StockDetail>(`/stock/fil/${id}`),
    enabled: id !== null,
  })
}

// ── Helpers ────────────────────────────────────────────

function formatKg(v: number | null): string {
  if (v == null) return '—'
  return `${v.toFixed(1)} kg`
}

function ageDays(dateEntree: string | null): number | null {
  if (!dateEntree || dateEntree.length !== 8) return null
  const d = new Date(`${dateEntree.slice(0, 4)}-${dateEntree.slice(4, 6)}-${dateEntree.slice(6, 8)}`)
  if (isNaN(d.getTime())) return null
  const diff = Date.now() - d.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

const niveauLabel = (n: number | null) => (n === 0 ? 'Bas' : n === 2 ? 'Haut' : 'Normal')
const niveauClass = (n: number | null) =>
  n === 0
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : n === 2
      ? 'bg-blue-100 text-blue-700 border-blue-200'
      : 'bg-green-100 text-green-700 border-green-200'

// ── Sort handling ──────────────────────────────────────

type SortKey =
  | 'ref_fil'
  | 'colori_reference'
  | 'lot'
  | 'lot_frs'
  | 'fournisseur_nom'
  | 'stock'
  | 'stock_initial'
  | 'emplacement'
  | 'date_entree'

interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

// Column widths shared by header and body tables (must match for alignment)
const COLUMNS: { key: SortKey; label: string; width: string; align?: 'left' | 'right' }[] = [
  { key: 'ref_fil', label: 'Référence', width: '14%' },
  { key: 'colori_reference', label: 'Coloris', width: '11%' },
  { key: 'lot', label: 'Lot interne', width: '8%' },
  { key: 'lot_frs', label: 'Lot fournisseur', width: '11%' },
  { key: 'fournisseur_nom', label: 'Fournisseur', width: '15%' },
  { key: 'stock', label: 'Stock', width: '9%', align: 'right' },
  { key: 'stock_initial', label: 'Stock initial', width: '9%', align: 'right' },
  { key: 'emplacement', label: 'Emplacement', width: '10%' },
  { key: 'date_entree', label: 'Date entrée', width: '10%' },
]
const ICON_COL_WIDTH = '3%'

function compareRows(a: StockRow, b: StockRow, key: SortKey): number {
  const va = a[key]
  const vb = b[key]
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'fr', { numeric: true, sensitivity: 'base' })
}

// ── Main Page ──────────────────────────────────────────

export function FournisseursStock() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [hideFinished, setHideFinished] = useState(true)
  const [sort, setSort] = useState<SortState>({ key: 'date_entree', dir: 'desc' })
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data: rows, isLoading, isError, error } = useStockList({ hideFinished })

  const filteredSorted = useMemo(() => {
    let out = rows ?? []
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      out = out.filter((r) => {
        const fields = [r.ref_fil, r.colori_reference, r.lot, r.lot_frs, r.emplacement, r.fournisseur_nom]
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

  const handleClose = useCallback(() => setSelectedId(null), [])

  const onMutationSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['stock-fil'] })
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
            placeholder="Rechercher (réf, coloris, lot, fournisseur, emplacement…)"
            className="h-9 w-full pl-8 pr-3 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none flex-shrink-0">
          <input
            type="checkbox"
            checked={hideFinished}
            onChange={(e) => setHideFinished(e.target.checked)}
            className="h-4 w-4 rounded border-input text-accent focus:ring-2 focus:ring-ring cursor-pointer"
          />
          <span>Masquer les lots terminés</span>
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
            <p className="text-sm">Aucun lot en stock</p>
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
                    const isSelected = r.IDstock_fil === selectedId
                    return (
                      <tr
                        key={r.IDstock_fil}
                        data-stock-row
                        onClick={() => setSelectedId((prev) => (prev === r.IDstock_fil ? null : r.IDstock_fil))}
                        className={cn(
                          'border-b border-border/40 cursor-pointer transition-colors',
                          isSelected ? 'bg-accent/10' : 'hover:bg-accent/5'
                        )}
                      >
                        <td className="px-3 py-2 font-medium truncate">{r.ref_fil ?? '—'}</td>
                        <td className="px-3 py-2 truncate">{r.colori_reference ?? '—'}</td>
                        <td className="px-3 py-2 tabular-nums truncate">{r.lot ?? '—'}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground truncate">{r.lot_frs ?? '—'}</td>
                        <td className="px-3 py-2 truncate">{r.fournisseur_nom ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{formatKg(r.stock)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatKg(r.stock_initial)}</td>
                        <td className="px-3 py-2 truncate">{r.emplacement ?? '—'}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {r.date_entree ? formatHfsqlDate(r.date_entree) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!!r.bio && <Leaf className="h-3.5 w-3.5 text-green-600" />}
                            {!!r.recycle && <Recycle className="h-3.5 w-3.5 text-blue-600" />}
                            {!!r.termine && <Badge variant="outline" className="text-[10px] py-0">T</Badge>}
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

      <StockDetailDrawer id={selectedId} onClose={handleClose} onMutationSuccess={onMutationSuccess} />
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
        active && 'text-accent'
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
}

function StockDetailDrawer({ id, onClose, onMutationSuccess }: DrawerProps) {
  const { data: detail, isLoading } = useStockDetail(id)
  const drawerRef = useRef<HTMLDivElement>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [editCommentaire, setEditCommentaire] = useState('')
  const [editFreinte, setEditFreinte] = useState('')
  const [editEmplacement, setEditEmplacement] = useState('')
  const [editNiveau, setEditNiveau] = useState<number>(1)
  const [editTermine, setEditTermine] = useState(false)
  const [editControle, setEditControle] = useState(false)
  const [editPointage, setEditPointage] = useState('')

  // Reset edit state when selecting a different lot
  useEffect(() => {
    setIsEditing(false)
  }, [id])

  // Close on outside click (but ignore clicks on table rows — they switch selection)
  useEffect(() => {
    if (id === null) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (drawerRef.current?.contains(target)) return
      // Ignore clicks on rows of the stock table — they handle selection themselves
      if ((target as Element).closest?.('tr[data-stock-row]')) return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [id, onClose])

  const startEdit = useCallback(() => {
    if (!detail) return
    setEditCommentaire(detail.commentaire ?? '')
    setEditFreinte(detail.observation_freinte ?? '')
    setEditEmplacement(detail.emplacement ?? '')
    setEditNiveau(detail.niveau ?? 1)
    setEditTermine(!!detail.termine)
    setEditControle(!!detail.controle)
    setEditPointage(hfsqlDateToInput(detail.dernier_pointage))
    setIsEditing(true)
  }, [detail])

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/stock/fil/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          commentaire: editCommentaire,
          observation_freinte: editFreinte,
          emplacement: editEmplacement,
          niveau: editNiveau,
          termine: editTermine,
          controle: editControle,
          dernier_pointage: editPointage ? inputDateToHfsql(editPointage) : '',
        }),
      }),
    onSuccess: () => {
      onMutationSuccess()
      setIsEditing(false)
    },
  })

  const open = id !== null
  const age = detail ? ageDays(detail.date_entree) : null

  return (
    <div
      ref={drawerRef}
      className={cn(
        'fixed right-0 top-14 bottom-0 w-[440px] bg-white border-l border-border/60 shadow-xl z-30 transition-transform duration-300 flex flex-col',
        open ? 'translate-x-0' : 'translate-x-full'
      )}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border/60 bg-zinc-100/60">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0',
              isEditing ? 'bg-accent/15' : 'icon-box-gold'
            )}
          >
            <Package className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            {isLoading || !detail ? (
              <div className="h-5 w-40 bg-muted animate-pulse rounded" />
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-heading font-bold tracking-tight truncate">{detail.ref_fil ?? '—'}</h2>
                  {!!detail.bio && (
                    <Badge className="bg-green-100 text-green-700 border-green-200 gap-1 text-[10px] py-0">
                      <Leaf className="h-2.5 w-2.5" />
                      Bio
                    </Badge>
                  )}
                  {!!detail.recycle && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1 text-[10px] py-0">
                      <Recycle className="h-2.5 w-2.5" />
                      Recyclé
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {detail.colori_reference ?? '—'} • Lot {detail.lot ?? '—'}
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
                <Button variant="outline" size="sm" onClick={startEdit}>
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
            <DrawerCard icon={<Package className="h-4 w-4 text-accent" />} title="Stock" highlight={isEditing}>
              <div className="grid grid-cols-2 gap-2">
                <KV label="Stock actuel" value={<span className="font-semibold tabular-nums">{formatKg(detail.stock)}</span>} />
                <KV label="Stock initial" value={<span className="tabular-nums">{formatKg(detail.stock_initial)}</span>} />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Niveau</p>
                  {isEditing ? (
                    <select
                      value={editNiveau}
                      onChange={(e) => setEditNiveau(parseInt(e.target.value, 10))}
                      className="w-full h-8 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                    >
                      <option value={0}>Bas</option>
                      <option value={1}>Normal</option>
                      <option value={2}>Haut</option>
                    </select>
                  ) : (
                    <Badge className={cn('border', niveauClass(detail.niveau))}>{niveauLabel(detail.niveau)}</Badge>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">État</p>
                  {isEditing ? (
                    <div className="flex flex-col gap-1">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editTermine}
                          onChange={(e) => setEditTermine(e.target.checked)}
                          className="h-3.5 w-3.5"
                        />
                        Terminé
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editControle}
                          onChange={(e) => setEditControle(e.target.checked)}
                          className="h-3.5 w-3.5"
                        />
                        Contrôlé
                      </label>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {!!detail.termine && (
                        <Badge variant="outline" className="text-[10px] py-0">
                          Terminé
                        </Badge>
                      )}
                      {!!detail.controle && (
                        <Badge className="bg-green-100 text-green-700 border-green-200 gap-1 text-[10px] py-0">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Contrôlé
                        </Badge>
                      )}
                      {!detail.termine && !detail.controle && (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </DrawerCard>

            {/* Provenance */}
            <DrawerCard icon={<Factory className="h-4 w-4 text-accent" />} title="Provenance">
              <div className="space-y-1.5">
                <KV label="Fournisseur" value={detail.fournisseur_nom ?? '—'} />
                <KV label="Lot fournisseur" value={detail.lot_frs ?? '—'} mono />
                <KV
                  label="Date d'entrée"
                  value={detail.date_entree ? formatHfsqlDate(detail.date_entree) : '—'}
                />
                {detail.IDref_fil_commande ? (
                  <KV label="Commande" value={`#${detail.IDref_fil_commande}`} mono />
                ) : null}
              </div>
            </DrawerCard>

            {/* Stockage */}
            <DrawerCard icon={<MapPin className="h-4 w-4 text-accent" />} title="Stockage" highlight={isEditing}>
              <div className="space-y-1.5">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Emplacement</p>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editEmplacement}
                      onChange={(e) => setEditEmplacement(e.target.value)}
                      className="w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  ) : (
                    <p className="text-sm">{detail.emplacement || '—'}</p>
                  )}
                </div>
                <KV label="Magasin" value={detail.IDMagasin ? `#${detail.IDMagasin}` : '—'} />
                <KV
                  label="Dernier mouvement"
                  value={detail.dernier_mouvement ? formatHfsqlDate(detail.dernier_mouvement) : '—'}
                />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Dernier pointage</p>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editPointage}
                      onChange={(e) => setEditPointage(e.target.value)}
                      className="w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  ) : (
                    <p className="text-sm">
                      {detail.dernier_pointage ? formatHfsqlDate(detail.dernier_pointage) : '—'}
                    </p>
                  )}
                </div>
                {age != null && (
                  <KV
                    label="Âge"
                    value={
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {age} jour{age > 1 ? 's' : ''}
                      </span>
                    }
                  />
                )}
              </div>
            </DrawerCard>

            {/* Notes */}
            <DrawerCard icon={<MessageSquare className="h-4 w-4 text-accent" />} title="Notes" highlight={isEditing}>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Commentaire</p>
                  {isEditing ? (
                    <textarea
                      value={editCommentaire}
                      onChange={(e) => setEditCommentaire(e.target.value)}
                      rows={3}
                      className="w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  ) : detail.commentaire?.trim() ? (
                    <p className="text-sm whitespace-pre-wrap">{detail.commentaire.trim()}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">—</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Observation freinte</p>
                  {isEditing ? (
                    <textarea
                      value={editFreinte}
                      onChange={(e) => setEditFreinte(e.target.value)}
                      rows={2}
                      className="w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  ) : detail.observation_freinte?.trim() ? (
                    <p className="text-sm whitespace-pre-wrap">{detail.observation_freinte.trim()}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">—</p>
                  )}
                </div>
              </div>
            </DrawerCard>

            {/* Certificats */}
            {(detail.has_certif_bio || detail.has_certif_recycle) && (
              <DrawerCard icon={<ShieldCheck className="h-4 w-4 text-accent" />} title="Certificats du lot">
                <div className="flex flex-col gap-2">
                  {detail.has_certif_bio && (
                    <a
                      href={`${API_URL}/stock/fil/${detail.IDstock_fil}/certif/bio`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-green-700">
                        <Leaf className="h-4 w-4" />
                        Certificat bio
                      </span>
                      <Eye className="h-3.5 w-3.5 text-green-600" />
                    </a>
                  )}
                  {detail.has_certif_recycle && (
                    <a
                      href={`${API_URL}/stock/fil/${detail.IDstock_fil}/certif/recycle`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-blue-700">
                        <Recycle className="h-4 w-4" />
                        Certificat recyclé
                      </span>
                      <Eye className="h-3.5 w-3.5 text-blue-600" />
                    </a>
                  )}
                </div>
              </DrawerCard>
            )}
          </>
        )}
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
        'rounded-lg border border-border/60 bg-white p-3 shadow-sm',
        highlight && 'border-l-4 border-l-accent/70 bg-accent/[0.03]'
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
