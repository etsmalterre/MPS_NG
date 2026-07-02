import { useState, useMemo, useEffect, useCallback, useRef, type ComponentType } from 'react'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import {
  Truck,
  Search,
  Loader2,
  AlertCircle,
  MapPin,
  Info,
  Pencil,
  Plus,
  X,
  Save,
  Trash2,
  AtSign,
  Printer,
  Layers,
  Package,
  Link2,
  Unlink,
  CheckCircle2,
  Clock,
  Gift,
  FileText,
  Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PopoverSelect, SearchableCombobox } from '@/components/ui/popover-select'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { cn } from '@/lib/utils'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { apiFetch, API_URL } from '@/lib/api'

// ── Types ──────────────────────────────────────────────

const LIST_PAGE_SIZE = 200

type Kind = 'formelle' | 'divers'

interface ExpeditionListRow {
  id: number
  kind: Kind
  IDcommande_client?: number
  commande_numero?: number | null
  IDclient: number
  client_nom: string
  ref_client?: string
  transporteur_nom: string
  date: string | null
  est_valide: number
  est_facture: number
  donation?: number
  nb_rolls?: number
  total_poids?: number
  total_metrage?: number
  nb_lignes?: number
}

interface AdresseLite {
  IDadresse: number
  nom: string | null
  adresse1: string | null
  adresse2: string | null
  adresse3: string | null
  cp: string | null
  ville: string | null
  pays: string | null
}
interface AdresseLookup extends AdresseLite {
  est_defaut: number
  est_defaut_facturation: number
  est_defaut_livraison: number
}

interface FormelleLigne {
  IDligne_commande_client: number
  IDligne_expedition: number
  type: number
  stock_kind: 'ecru' | 'fini' | 'none'
  ref_label: string | null
  colori_reference: string | null
  quantite: number
  unite: number
  unite_label: string
  dim: 'metrage' | 'poids'
  nb_rolls_exp: number
  poids_exp: number
  metrage_exp: number
  nb_rolls_dispo: number
}
interface DiversLigne {
  IDligne_expedition_divers: number
  detail_ligne: string
}

interface ExpeditionDetail {
  id: number
  kind: Kind
  IDcommande_client?: number
  commande_numero?: number | null
  IDclient: number
  client_nom: string
  ref_client?: string
  date: string | null
  IDtransporteur: number
  transporteur_nom: string
  IDadresse: number
  adresse_livraison: AdresseLite | null
  IDcontact?: number
  contact_nom?: string | null
  donation?: number
  affiche_observations?: number
  inclureRapportQualite?: number
  observation_bl?: string
  est_valide: number
  est_facture: number
  lignes: FormelleLigne[] | DiversLigne[]
}

interface RollLite {
  id: number
  numero: string | null
  lot: string | null
  poids: number | null
  metrage: number | null
  coloris_reference: string | null
  magasin_nom: string | null
  second_choix: number | null
  observations: string | null
  etat_label: string | null
}
interface RollPayload {
  kind: 'ecru' | 'fini' | 'none'
  dim: 'metrage' | 'poids'
  unite_label: string
  target_qty: number
  onExp: RollLite[]
  dispo: RollLite[]
}

interface ClientLite { IDclient: number; nom: string }
interface TransporteurLite { IDtransporteur: number; nom: string }
interface ContactLite { IDcontact: number; nom: string; mail: string }
interface CommandeLite { IDcommande_client: number; numero: number | null; date_commande: string | null; IDclient: number; client_nom: string }

// ── Shared styling ─────────────────────────────────────

const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

// ── Main Page ──────────────────────────────────────────

export function ClientsExpeditions() {
  const queryClient = useQueryClient()
  const [bucket, setBucket] = useState<Kind>('formelle')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [stateFilter, setStateFilter] = useState<'nonfacture' | 'facture'>('nonfacture')
  const [isEditing, setIsEditing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [autoEditForId, setAutoEditForId] = useState<number | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)

  // Formelle roll drawer (page-level so startEdit can close it — mps_designer §31.2).
  const [rollDrawerLcc, setRollDrawerLcc] = useState<number | null>(null)

  // Edit-mode header draft.
  const [editDate, setEditDate] = useState('')
  const [editIDTransporteur, setEditIDTransporteur] = useState(0)
  const [editIDAdresse, setEditIDAdresse] = useState(0)
  const [editIDContact, setEditIDContact] = useState(0)
  const [editDonation, setEditDonation] = useState(0)
  const [editObservation, setEditObservation] = useState('')
  const [editIDClient, setEditIDClient] = useState(0) // divers
  const [editRefClient, setEditRefClient] = useState('') // divers

  const originalDraftRef = useRef<Record<string, string | number> | null>(null)
  const [linesDirty, setLinesDirty] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Infinite list: pages of 200, cursor = last row id (API `before`). Search returns a single page.
  const {
    data: rowPages, isLoading, isError, error,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['expeditions', bucket, stateFilter, debouncedQuery],
    queryFn: ({ pageParam }): Promise<ExpeditionListRow[]> =>
      apiFetch(`/expeditions?bucket=${bucket}&state=${stateFilter}&q=${encodeURIComponent(debouncedQuery)}&limit=${LIST_PAGE_SIZE}${pageParam ? `&before=${pageParam}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: (lastPage: ExpeditionListRow[]) =>
      debouncedQuery || lastPage.length < LIST_PAGE_SIZE ? undefined : lastPage[lastPage.length - 1].id,
  })

  const { data: detail, isLoading: detailLoading } = useQuery<ExpeditionDetail>({
    queryKey: ['expedition', bucket, selectedId],
    queryFn: () => apiFetch(`/expeditions/${bucket}/${selectedId}`),
    enabled: selectedId !== null,
  })

  // A shipment is editable only while it is not validated (locked).
  const editable = !!detail && detail.est_valide !== 1

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['expeditions'] })
    queryClient.invalidateQueries({ queryKey: ['expedition', bucket, selectedId] })
  }, [queryClient, bucket, selectedId])

  const startEdit = useCallback(() => {
    if (!detail || detail.est_valide === 1) return
    const snapshot: Record<string, string | number> = {
      date: hfsqlDateToInput(detail.date),
      IDtransporteur: detail.IDtransporteur ?? 0,
      IDadresse: detail.IDadresse ?? 0,
      IDcontact: detail.IDcontact ?? 0,
      donation: detail.donation ?? 0,
      observation: detail.observation_bl ?? '',
      IDclient: detail.IDclient ?? 0,
      refClient: detail.ref_client ?? '',
    }
    setEditDate(snapshot.date as string)
    setEditIDTransporteur(snapshot.IDtransporteur as number)
    setEditIDAdresse(snapshot.IDadresse as number)
    setEditIDContact(snapshot.IDcontact as number)
    setEditDonation(snapshot.donation as number)
    setEditObservation(snapshot.observation as string)
    setEditIDClient(snapshot.IDclient as number)
    setEditRefClient(snapshot.refClient as string)
    originalDraftRef.current = snapshot
    setRollDrawerLcc(null) // edit mode hides the roll drawer (mps_designer §31.3)
    setIsEditing(true)
  }, [detail])

  const cancelEdit = useCallback(() => setIsEditing(false), [])

  const isDirty = useMemo(() => {
    if (!isEditing) return false
    const o = originalDraftRef.current
    if (!o) return false
    if (editDate !== o.date) return true
    if (editIDTransporteur !== o.IDtransporteur) return true
    if (editIDAdresse !== o.IDadresse) return true
    if (editIDContact !== o.IDcontact) return true
    if (editDonation !== o.donation) return true
    if (editObservation !== o.observation) return true
    if (editIDClient !== o.IDclient) return true
    if (editRefClient !== o.refClient) return true
    if (linesDirty) return true
    return false
  }, [isEditing, editDate, editIDTransporteur, editIDAdresse, editIDContact, editDonation, editObservation, editIDClient, editRefClient, linesDirty])

  const saveHeaderMut = useMutation({
    mutationFn: () => apiFetch(`/expeditions/${bucket}/${selectedId}`, {
      method: 'PUT',
      body: JSON.stringify(
        bucket === 'formelle'
          ? {
              date: inputDateToHfsql(editDate),
              IDtransporteur: editIDTransporteur || 0,
              IDadresse: editIDAdresse || 0,
              IDcontact: editIDContact || 0,
              donation: editDonation ? 1 : 0,
              observation_bl: editObservation,
            }
          : {
              date: inputDateToHfsql(editDate),
              IDtransporteur: editIDTransporteur || 0,
              IDadresse: editIDAdresse || 0,
              IDclient: editIDClient || 0,
              ref_client: editRefClient,
            },
      ),
    }),
    onSuccess: () => { invalidateAll(); setIsEditing(false) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/expeditions/${bucket}/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      const cached = queryClient.getQueryData<ExpeditionListRow[]>(['expeditions', bucket, stateFilter, debouncedQuery]) ?? []
      const remaining = cached.filter((r) => r.id !== deletedId)
      queryClient.invalidateQueries({ queryKey: ['expeditions'] })
      setIsEditing(false)
      setDeleteConfirmOpen(false)
      setSelectedId(remaining.length > 0 ? remaining[0].id : null)
    },
  })

  const validateMut = useMutation({
    mutationFn: (valide: boolean) => apiFetch(`/expeditions/${bucket}/${selectedId}/validate`, {
      method: 'POST',
      body: JSON.stringify({ valide }),
    }),
    onSuccess: () => invalidateAll(),
  })

  useEffect(() => {
    if (autoEditForId !== null && detail?.id === autoEditForId && detail.est_valide !== 1) {
      startEdit()
      setAutoEditForId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditForId, detail])

  const guard = useUnsavedGuard({
    isDirty,
    save: async () => { await saveHeaderMut.mutateAsync() },
    onDiscard: () => { setIsEditing(false) },
  })

  const handleSelect = useCallback((id: number) => {
    guard.guardAction(() => { setIsEditing(false); setRollDrawerLcc(null); setSelectedId(id) })
  }, [guard])

  const handleBucketChange = useCallback((b: Kind) => {
    if (b === bucket) return
    guard.guardAction(() => { setIsEditing(false); setRollDrawerLcc(null); setBucket(b); setSelectedId(null) })
  }, [guard, bucket])

  const handleStateFilterChange = useCallback((s: 'nonfacture' | 'facture') => {
    guard.guardAction(() => { setIsEditing(false); setStateFilter(s); setSelectedId(null) })
  }, [guard])

  const list = useMemo(() => (rowPages?.pages ?? []).flat(), [rowPages])

  useEffect(() => {
    if (isEditing || list.length === 0) return
    const stillVisible = selectedId !== null && list.some((r) => r.id === selectedId)
    if (!stillVisible) setSelectedId(list[0].id)
  }, [list, selectedId, isEditing])

  return (
    <>
      <MasterDetailLayout
        list={
          <ExpeditionListPanel
            rows={list}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            selectedId={selectedId}
            onSelect={handleSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            bucket={bucket}
            onBucketChange={handleBucketChange}
            stateFilter={stateFilter}
            onStateFilterChange={handleStateFilterChange}
            onNew={() => setCreateOpen(true)}
            isEditing={isEditing}
            hasMore={!!hasNextPage}
            onLoadMore={() => fetchNextPage()}
            isLoadingMore={isFetchingNextPage}
          />
        }
        detailHeader={
          <DetailHeader
            expedition={detail ?? null}
            isLoading={detailLoading && selectedId !== null}
            isEditing={isEditing}
            editable={editable}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSave={() => saveHeaderMut.mutate()}
            isSaving={saveHeaderMut.isPending}
            onDelete={() => setDeleteConfirmOpen(true)}
            onPrintClick={() => setPrintOpen(true)}
            onEmailClick={() => setEmailOpen(true)}
          />
        }
        detail={
          <DetailMain
            expedition={detail ?? null}
            isLoading={detailLoading && selectedId !== null}
            hasSelection={selectedId !== null}
            isEditing={isEditing}
            editable={editable}
            rollDrawerLcc={rollDrawerLcc}
            onOpenRollDrawer={setRollDrawerLcc}
            onMutationSuccess={invalidateAll}
            onLinesDirtyChange={setLinesDirty}
          />
        }
        sidebar={selectedId !== null ? (
          <DetailSidebar
            expedition={detail ?? null}
            isLoading={detailLoading}
            isEditing={isEditing}
            editDate={editDate} onEditDateChange={setEditDate}
            editIDTransporteur={editIDTransporteur} onEditIDTransporteurChange={setEditIDTransporteur}
            editIDAdresse={editIDAdresse} onEditIDAdresseChange={setEditIDAdresse}
            editIDContact={editIDContact} onEditIDContactChange={setEditIDContact}
            editDonation={editDonation} onEditDonationChange={setEditDonation}
            editObservation={editObservation} onEditObservationChange={setEditObservation}
            editIDClient={editIDClient} onEditIDClientChange={setEditIDClient}
            editRefClient={editRefClient} onEditRefClientChange={setEditRefClient}
            onValidate={(v) => validateMut.mutate(v)}
            isValidating={validateMut.isPending}
          />
        ) : null}
        sidebarTitle="Informations"
        hasSelection={selectedId !== null}
        onBack={() => guard.guardAction(() => { setIsEditing(false); setRollDrawerLcc(null); setSelectedId(null) })}
      />

      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />

      <CreateExpeditionDialog
        open={createOpen}
        bucket={bucket}
        onClose={() => setCreateOpen(false)}
        onCreated={(newId, newKind) => {
          setCreateOpen(false)
          queryClient.invalidateQueries({ queryKey: ['expeditions'] })
          setBucket(newKind)
          setSelectedId(newId)
          setAutoEditForId(newId)
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Supprimer l'expédition"
        description={
          detail?.kind === 'formelle'
            ? 'Cette expédition et ses lignes seront supprimées. Les rouleaux affectés seront libérés. Cette action est irréversible.'
            : 'Cette expédition et toutes ses lignes seront supprimées. Cette action est irréversible.'
        }
        confirmLabel="Supprimer"
        isPending={deleteMut.isPending}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => { if (selectedId !== null) deleteMut.mutate(selectedId) }}
      />

      <PlaceholderDialog open={printOpen} onClose={() => setPrintOpen(false)} title="Imprimer" Icon={Printer} CenterIcon={FileText} />
      <PlaceholderDialog open={emailOpen} onClose={() => setEmailOpen(false)} title="Envoyer un email" Icon={AtSign} CenterIcon={AtSign} />
    </>
  )
}

// ── Left Panel: List ───────────────────────────────────

function ExpeditionListPanel({
  rows, isLoading, isError, error,
  selectedId, onSelect,
  searchQuery, onSearchChange,
  bucket, onBucketChange,
  stateFilter, onStateFilterChange,
  onNew, isEditing,
  hasMore, onLoadMore, isLoadingMore,
}: {
  rows: ExpeditionListRow[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  selectedId: number | null
  onSelect: (id: number) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  bucket: Kind
  onBucketChange: (b: Kind) => void
  stateFilter: 'nonfacture' | 'facture'
  onStateFilterChange: (s: 'nonfacture' | 'facture') => void
  onNew: () => void
  isEditing: boolean
  hasMore: boolean
  onLoadMore: () => void
  isLoadingMore: boolean
}) {
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher (n°, client...)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off"
            className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {/* Category switch — formal shipments vs miscellaneous. Dominant control. */}
        <div className="flex gap-1 p-1 rounded-lg border border-border bg-background shadow-sm">
          {([
            { key: 'formelle', label: 'Textile' },
            { key: 'divers', label: 'Diverses' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => onBucketChange(opt.key)}
              className={cn(
                'flex-1 px-3 py-2 text-sm rounded-md transition-colors font-semibold',
                bucket === opt.key ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* State filter within the current category. */}
        <div className="flex flex-wrap gap-1">
          {([
            { key: 'nonfacture', label: 'Non facturées' },
            { key: 'facture', label: 'Facturées' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onStateFilterChange(opt.key)}
              className={cn(
                'px-2 py-1 text-xs rounded-md transition-colors flex-grow basis-[calc(50%-0.25rem)] whitespace-nowrap',
                stateFilter === opt.key ? 'bg-accent text-accent-foreground shadow-sm font-medium' : 'text-muted-foreground hover:bg-accent/10',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2 scrollbar-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-8 text-destructive">
            <AlertCircle className="h-6 w-6 mb-2" />
            <p className="text-sm">{error?.message || 'Erreur'}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Truck className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">{bucket === 'formelle' ? 'Aucune expédition' : 'Aucune expédition diverse'}</p>
          </div>
        ) : (<>
        {rows.map((row) => {
          const isSelected = selectedId === row.id
          const valid = row.est_valide === 1
          return (
            <div
              key={row.id}
              onClick={() => onSelect(row.id)}
              className={cn(
                'p-3 border rounded-lg cursor-pointer transition-all bg-white',
                isSelected ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-accent/50',
              )}
            >
              <div className="flex items-center gap-2">
                <Truck className={cn('h-4 w-4 flex-shrink-0', valid ? 'text-green-600' : 'text-muted-foreground')} />
                <span className="font-medium text-sm">N° {row.id}</span>
                {!!row.donation && <Gift className="h-3 w-3 text-accent" />}
                <StatePill valid={valid} className="ml-auto" />
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">{row.client_nom || '—'}</p>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                {row.date && <span>{formatHfsqlDate(row.date)}</span>}
                {row.kind === 'formelle' && row.commande_numero != null && <span>· Cmd {row.commande_numero}</span>}
                {row.kind === 'formelle' ? (
                  <span className="ml-auto text-muted-foreground/80 tabular-nums">
                    {row.nb_rolls ?? 0} rlx · {fmtNum(row.total_poids ?? 0, 0)} kg
                  </span>
                ) : (
                  <span className="ml-auto text-muted-foreground/80 tabular-nums">{row.nb_lignes ?? 0} ligne{(row.nb_lignes ?? 0) > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          )
        })}
        {hasMore && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full text-muted-foreground hover:text-foreground"
          >
            {isLoadingMore
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            Charger plus
          </Button>
        )}
        </>)}
      </div>

      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>{rows.length} expédition{rows.length !== 1 ? 's' : ''}{hasMore ? '+' : ''}</span>
        {!isEditing && (
          <Button size="sm" variant="ghost" onClick={onNew} className="text-accent hover:text-accent hover:bg-accent/10">
            <Plus className="h-3.5 w-3.5 mr-1" />Nouveau
          </Button>
        )}
      </div>
    </div>
  )
}

function StatePill({ valid, className }: { valid: boolean; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] py-0 gap-1 border text-white', valid ? 'bg-success border-success' : 'bg-primary border-primary', className)}
    >
      {valid ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
      {valid ? 'Validée' : 'Brouillon'}
    </Badge>
  )
}

// ── Center: Detail Header ──────────────────────────────

function DetailHeader({
  expedition, isLoading, isEditing, editable,
  onStartEdit, onCancelEdit, onSave, isSaving,
  onDelete, onPrintClick, onEmailClick,
}: {
  expedition: ExpeditionDetail | null
  isLoading: boolean
  isEditing: boolean
  editable: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  isSaving: boolean
  onDelete: () => void
  onPrintClick: () => void
  onEmailClick: () => void
}) {
  if (!expedition && !isLoading) return null
  const valid = expedition?.est_valide === 1
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center', isEditing ? 'bg-accent/15' : 'icon-box-gold')}>
          <Truck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          ) : (
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-heading font-bold tracking-tight truncate">
                Expédition N° {expedition?.id}
                <span className="text-muted-foreground font-normal"> · {expedition?.client_nom || '—'}</span>
              </h1>
              <div className="flex items-center gap-2 flex-shrink-0">
                {valid ? (
                  <Badge variant="secondary" className="text-xs gap-1"><Lock className="h-3 w-3" />Validée</Badge>
                ) : (
                  <Badge className="bg-amber-400/15 text-amber-700 border border-amber-500/30 text-xs gap-1"><Clock className="h-3 w-3" />Brouillon</Badge>
                )}
                {!!expedition?.donation && <Badge variant="secondary" className="text-xs gap-1"><Gift className="h-3 w-3" />Donation</Badge>}
                {expedition?.date && <Badge variant="secondary" className="text-xs">{formatHfsqlDate(expedition.date)}</Badge>}
                {isEditing && (
                  <Badge className="bg-accent text-accent-foreground gap-1 shadow-sm"><Pencil className="h-3 w-3" />Mode edition</Badge>
                )}
              </div>
            </div>
          )}
        </div>
        {!isLoading && expedition && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isEditing ? (
              <>
                <Button variant="outline" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" title="Supprimer" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={onCancelEdit}>
                  <X className="h-3.5 w-3.5 mr-1.5" />Annuler
                </Button>
                <Button size="sm" onClick={onSave} disabled={isSaving}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />{isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="icon" className="h-9 w-9" title="Imprimer" onClick={onPrintClick}>
                  <Printer className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9" title="Envoyer un email" onClick={onEmailClick}>
                  <AtSign className="h-4 w-4" />
                </Button>
                {editable && (
                  <Button variant="gold" size="sm" onClick={onStartEdit}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />Modifier
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div className={cn('h-1 w-24 mt-3 rounded-full', isEditing ? 'bg-accent' : 'bg-gradient-to-r from-accent via-accent to-accent/30')} />
    </div>
  )
}

// ── Center: Detail Main ────────────────────────────────

function DetailMain({
  expedition, isLoading, hasSelection, isEditing, editable,
  rollDrawerLcc, onOpenRollDrawer, onMutationSuccess, onLinesDirtyChange,
}: {
  expedition: ExpeditionDetail | null
  isLoading: boolean
  hasSelection: boolean
  isEditing: boolean
  editable: boolean
  rollDrawerLcc: number | null
  onOpenRollDrawer: (lcc: number | null) => void
  onMutationSuccess: () => void
  onLinesDirtyChange: (dirty: boolean) => void
}) {
  if (!hasSelection) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="icon-box-gold h-16 w-16 mx-auto"><Truck className="h-8 w-8" /></div>
        <p className="text-muted-foreground text-sm">Sélectionnez une expédition dans la liste</p>
      </div>
    </div>
  )
  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
  if (!expedition) return null

  if (expedition.kind === 'formelle') {
    return (
      <FormelleLignesSection
        expedition={expedition}
        isEditing={isEditing}
        editable={editable}
        rollDrawerLcc={rollDrawerLcc}
        onOpenRollDrawer={onOpenRollDrawer}
        onMutationSuccess={onMutationSuccess}
      />
    )
  }
  return (
    <DiversLignesSection
      expedition={expedition}
      isEditing={isEditing}
      onMutationSuccess={onMutationSuccess}
      onLinesDirtyChange={onLinesDirtyChange}
    />
  )
}

// ── Formelle: commande lines + roll drawer (mps_designer §31) ──

function FormelleLignesSection({
  expedition, isEditing, editable, rollDrawerLcc, onOpenRollDrawer, onMutationSuccess,
}: {
  expedition: ExpeditionDetail
  isEditing: boolean
  editable: boolean
  rollDrawerLcc: number | null
  onOpenRollDrawer: (lcc: number | null) => void
  onMutationSuccess: () => void
}) {
  const lignes = expedition.lignes as FormelleLigne[]
  const drawerOpen = rollDrawerLcc !== null && !isEditing
  const drawerLigne = drawerOpen ? lignes.find((l) => l.IDligne_commande_client === rollDrawerLcc) ?? null : null

  const totalRolls = lignes.reduce((s, l) => s + l.nb_rolls_exp, 0)
  const totalPoids = lignes.reduce((s, l) => s + l.poids_exp, 0)
  const totalMetrage = lignes.reduce((s, l) => s + l.metrage_exp, 0)

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className={cn('overflow-auto space-y-2 p-1 scrollbar-transparent', drawerOpen ? 'flex-shrink-0 max-h-[40%]' : 'flex-1 min-h-0')}>
        {lignes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Layers className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm">Aucune ligne sur la commande</p>
          </div>
        ) : (
          lignes.map((l) => (
            <FormelleLineCard
              key={l.IDligne_commande_client}
              line={l}
              isDrawerOpen={rollDrawerLcc === l.IDligne_commande_client}
              // Open to pick rolls when editable; when locked, still open to VIEW shipped rolls.
              clickable={!isEditing && l.stock_kind !== 'none' && (editable || l.nb_rolls_exp > 0)}
              onClick={() => onOpenRollDrawer(rollDrawerLcc === l.IDligne_commande_client ? null : l.IDligne_commande_client)}
            />
          ))
        )}
      </div>

      {drawerOpen && drawerLigne && (
        <div className="flex-1 min-h-0 flex flex-col mt-3 rounded-lg border border-border/60 overflow-hidden bg-zinc-100/80 animate-in slide-in-from-bottom-4 fade-in-0 duration-200">
          <RollDrawer
            expeditionId={expedition.id}
            ligne={drawerLigne}
            editable={editable}
            onClose={() => onOpenRollDrawer(null)}
            onSuccess={onMutationSuccess}
          />
        </div>
      )}

      {lignes.length > 0 && (
        <div className="flex-shrink-0 mt-3 pt-3 border-t border-border/60">
          <div className="flex flex-col items-end gap-1 text-sm tabular-nums">
            <div className="flex items-center gap-6">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Rouleaux expédiés</span>
              <span className="w-32 text-right font-medium">{totalRolls}</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Poids total</span>
              <span className="w-32 text-right">{fmtNum(totalPoids, 1)} kg</span>
            </div>
            {totalMetrage > 0 && (
              <div className="flex items-center gap-6">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Métrage total</span>
                <span className="w-32 text-right">{fmtNum(totalMetrage, 1)} Ml</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FormelleLineCard({
  line, isDrawerOpen, clickable, onClick,
}: {
  line: FormelleLigne
  isDrawerOpen: boolean
  clickable: boolean
  onClick: () => void
}) {
  const hasRolls = line.nb_rolls_exp > 0
  const border = hasRolls ? 'border-l-amber-400/60' : 'border-l-border'
  const iconBg = hasRolls ? 'bg-amber-400/10' : 'bg-muted'
  const iconColor = hasRolls ? 'text-amber-600' : 'text-muted-foreground'
  const typeLabel = line.stock_kind === 'fini' ? 'Fini' : line.stock_kind === 'ecru' ? 'Écru' : 'Divers'
  return (
    <div
      className={cn(
        'group rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3',
        border,
        clickable && 'cursor-pointer hover:bg-zinc-100 hover:border-accent/40 transition-colors',
        isDrawerOpen && 'ring-1 ring-accent bg-accent/[0.06] border-accent/50',
      )}
      onClick={clickable ? onClick : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0', iconBg)}>
            <Package className={cn('h-3.5 w-3.5', iconColor)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{line.ref_label || '—'}</p>
            {line.colori_reference && <p className="text-[11px] text-muted-foreground truncate">{line.colori_reference}</p>}
          </div>
        </div>
        <Badge variant="secondary" className="text-[10px] py-0 flex-shrink-0">{typeLabel}</Badge>
      </div>
      <div className="flex items-center gap-3 mt-2 ml-9 text-[11px] text-muted-foreground tabular-nums">
        <span className="font-medium text-foreground">{line.nb_rolls_exp} rouleau{line.nb_rolls_exp > 1 ? 'x' : ''}</span>
        {line.poids_exp > 0 && <span>· {fmtNum(line.poids_exp, 1)} kg</span>}
        {line.metrage_exp > 0 && <span>· {fmtNum(line.metrage_exp, 1)} Ml</span>}
        {line.stock_kind !== 'none' && (
          <span className="ml-auto text-muted-foreground/70">{line.nb_rolls_dispo} dispo.</span>
        )}
      </div>
    </div>
  )
}

// ── Roll drawer (assign/unassign stock to the shipment line) ──

function RollDrawer({
  expeditionId, ligne, editable, onClose, onSuccess,
}: {
  expeditionId: number
  ligne: FormelleLigne
  editable: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const queryKey = ['expedition-rolls', expeditionId, ligne.IDligne_commande_client]
  const base = `/expeditions/formelle/${expeditionId}/lignes/${ligne.IDligne_commande_client}/rolls`

  const { data, isLoading, isError } = useQuery<RollPayload>({
    queryKey,
    queryFn: () => apiFetch(base),
  })

  const linkMut = useMutation({
    mutationFn: (stockId: number) => apiFetch(`${base}/${stockId}`, { method: 'PUT' }),
    onSuccess: (payload: RollPayload) => { queryClient.setQueryData(queryKey, payload); onSuccess() },
  })
  const unlinkMut = useMutation({
    mutationFn: (stockId: number) => apiFetch(`${base}/${stockId}`, { method: 'DELETE' }),
    onSuccess: (payload: RollPayload) => { queryClient.setQueryData(queryKey, payload); onSuccess() },
  })

  const onExp = data?.onExp ?? []
  const dispo = data?.dispo ?? []
  const dim = data?.dim ?? ligne.dim

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-zinc-100/80">
      <div className="flex-shrink-0 px-3 py-1.5 border-b bg-zinc-200/50 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground truncate">
          {ligne.ref_label || 'Rouleaux'}{ligne.colori_reference ? ` · ${ligne.colori_reference}` : ''}
        </span>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7" title="Fermer">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-transparent">
        {isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>}
        {isError && (
          <div className="flex flex-col items-center justify-center py-6 text-destructive">
            <AlertCircle className="h-6 w-6 mb-2" /><p className="text-sm">Erreur de chargement</p>
          </div>
        )}
        {!isLoading && !isError && onExp.length === 0 && dispo.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Package className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm font-medium">Aucun rouleau</p>
            <p className="text-xs mt-1">Aucun rouleau affecté à cette ligne de commande.</p>
          </div>
        )}

        {onExp.length > 0 && (
          <section>
            <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Sur l'expédition ({onExp.length})</h3>
            <div className="space-y-1.5">
              {onExp.map((roll) => (
                <RollRow key={roll.id} roll={roll} dim={dim} action="unlink" disabled={!editable}
                  onAction={() => unlinkMut.mutate(roll.id)}
                  isBusy={unlinkMut.isPending && unlinkMut.variables === roll.id} />
              ))}
            </div>
          </section>
        )}

        {/* "Disponibles" only matters when the shipment can still be edited. */}
        {editable && dispo.length > 0 && (
          <section>
            <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Disponibles ({dispo.length})</h3>
            <div className="space-y-1.5">
              {dispo.map((roll) => (
                <RollRow key={roll.id} roll={roll} dim={dim} action="link" disabled={!editable}
                  onAction={() => linkMut.mutate(roll.id)}
                  isBusy={linkMut.isPending && linkMut.variables === roll.id} />
              ))}
            </div>
          </section>
        )}

        {!isLoading && !isError && editable && onExp.length > 0 && dispo.length === 0 && (
          <p className="text-xs text-muted-foreground italic text-center">Aucun rouleau supplémentaire disponible.</p>
        )}
      </div>
    </div>
  )
}

function RollRow({
  roll, dim, action, onAction, isBusy, disabled,
}: {
  roll: RollLite
  dim: 'metrage' | 'poids'
  action: 'link' | 'unlink'
  onAction: () => void
  isBusy: boolean
  disabled: boolean
}) {
  const primary = dim === 'metrage' ? Number(roll.metrage) || 0 : Number(roll.poids) || 0
  const primaryLabel = dim === 'metrage' ? 'Ml' : 'kg'
  const secondary = dim === 'metrage' ? Number(roll.poids) || 0 : Number(roll.metrage) || 0
  const secondaryLabel = dim === 'metrage' ? 'kg' : 'Ml'
  return (
    <div className="rounded-lg border border-border/60 bg-card shadow-sm p-3 flex items-center gap-3">
      <div className="h-8 w-8 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0">
        <Package className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{roll.numero || `Rouleau ${roll.id}`}</span>
          {roll.lot && <span className="text-xs text-muted-foreground truncate">· Lot {roll.lot}</span>}
          {!!roll.second_choix && <Badge variant="secondary" className="text-[10px] py-0 px-1.5">2nd choix</Badge>}
          {roll.etat_label && <Badge variant="outline" className="text-[10px] py-0 px-1.5">{roll.etat_label}</Badge>}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{fmtNum(primary, 1)} {primaryLabel}</span>
          {secondary > 0 && <span>· {fmtNum(secondary, 1)} {secondaryLabel}</span>}
          {roll.coloris_reference && <span className="truncate">· {roll.coloris_reference}</span>}
          {roll.magasin_nom && <span className="flex items-center gap-0.5 truncate"><MapPin className="h-2.5 w-2.5" />{roll.magasin_nom}</span>}
        </div>
      </div>
      {!disabled && (
        <Button size="sm" variant={action === 'link' ? 'default' : 'outline'} onClick={onAction} disabled={isBusy} className="flex-shrink-0">
          {isBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            : action === 'link' ? <Link2 className="h-3.5 w-3.5 mr-1.5" /> : <Unlink className="h-3.5 w-3.5 mr-1.5" />}
          {action === 'link' ? 'Ajouter' : 'Retirer'}
        </Button>
      )}
    </div>
  )
}

// ── Divers: free-text lines ────────────────────────────

function DiversLignesSection({
  expedition, isEditing, onMutationSuccess, onLinesDirtyChange,
}: {
  expedition: ExpeditionDetail
  isEditing: boolean
  onMutationSuccess: () => void
  onLinesDirtyChange: (dirty: boolean) => void
}) {
  const lignes = expedition.lignes as DiversLigne[]
  const [lineDialogOpen, setLineDialogOpen] = useState(false)
  const [editingLine, setEditingLine] = useState<DiversLigne | null>(null)
  const [deleteLineId, setDeleteLineId] = useState<number | null>(null)

  useEffect(() => {
    if (!isEditing) { setLineDialogOpen(false); setEditingLine(null) }
  }, [isEditing])
  useEffect(() => { onLinesDirtyChange(lineDialogOpen) }, [lineDialogOpen, onLinesDirtyChange])

  const deleteLineMut = useMutation({
    mutationFn: (lineId: number) => apiFetch(`/expeditions/divers/lignes/${lineId}`, { method: 'DELETE' }),
    onSuccess: onMutationSuccess,
  })

  const startAdd = () => { setEditingLine(null); setLineDialogOpen(true) }
  const startEditLine = (l: DiversLigne) => { setEditingLine(l); setLineDialogOpen(true) }

  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto space-y-2 p-1 scrollbar-transparent">
          {lignes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Layers className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">Aucune ligne</p>
              {isEditing && (
                <Button variant="outline" size="sm" className="mt-3" onClick={startAdd}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Ajouter une ligne
                </Button>
              )}
            </div>
          ) : (
            lignes.map((l) => (
              <DiversLineCard key={l.IDligne_expedition_divers} line={l} isEditing={isEditing}
                onEdit={() => startEditLine(l)} onDelete={() => setDeleteLineId(l.IDligne_expedition_divers)} />
            ))
          )}
          {isEditing && lignes.length > 0 && (
            <Button variant="ghost" size="sm" onClick={startAdd}
              className="w-full text-muted-foreground hover:text-accent hover:bg-accent/5 border border-dashed border-border/60 hover:border-accent/40">
              <Plus className="h-3.5 w-3.5 mr-1.5" />Ajouter une ligne
            </Button>
          )}
        </div>
      </div>

      <DiversLineDialog
        open={lineDialogOpen}
        expeditionId={expedition.id}
        line={editingLine}
        onClose={() => { setLineDialogOpen(false); setEditingLine(null) }}
        onSuccess={() => { setLineDialogOpen(false); setEditingLine(null); onMutationSuccess() }}
      />

      <ConfirmDialog
        open={deleteLineId !== null}
        title="Supprimer la ligne"
        description="Cette ligne sera définitivement supprimée."
        confirmLabel="Supprimer"
        isPending={deleteLineMut.isPending}
        onCancel={() => setDeleteLineId(null)}
        onConfirm={() => { if (deleteLineId !== null) deleteLineMut.mutate(deleteLineId, { onSuccess: () => setDeleteLineId(null) }) }}
      />
    </>
  )
}

function DiversLineCard({
  line, isEditing, onEdit, onDelete,
}: {
  line: DiversLigne
  isEditing: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const lines = String(line.detail_ligne ?? '').split(/\r?\n/).filter((s) => s.trim().length > 0)
  const title = lines[0] || '—'
  const rest = lines.slice(1)
  return (
    <div className="group rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3 border-l-amber-400/60">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 bg-amber-400/10 mt-0.5">
            <Layers className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium whitespace-pre-line">{title}</p>
            {rest.map((r, i) => <p key={i} className="text-[11px] text-muted-foreground">{r}</p>)}
          </div>
        </div>
        {isEditing && (
          <div className="flex gap-0.5 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}><Pencil className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
          </div>
        )}
      </div>
    </div>
  )
}

function DiversLineDialog({
  open, expeditionId, line, onClose, onSuccess,
}: {
  open: boolean
  expeditionId: number
  line: DiversLigne | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isNew = line === null
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setText(line?.detail_ligne ?? '')
    setError(null)
  }, [open, line])

  const saveMut = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ detail_ligne: text })
      return isNew
        ? apiFetch(`/expeditions/divers/${expeditionId}/lignes`, { method: 'POST', body })
        : apiFetch(`/expeditions/divers/lignes/${line!.IDligne_expedition_divers}`, { method: 'PUT', body })
    },
    onSuccess,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Erreur'),
  })
  const canSave = text.trim().length > 0

  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-accent" />{isNew ? 'Nouvelle ligne' : 'Modifier la ligne'}</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Détail</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              autoFocus
              placeholder="Description de l'article expédié…"
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>
          {error && (
            <div className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!canSave || saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Right Panel: Sidebar (Info tab) + status footer ────

function DetailSidebar({
  expedition, isLoading, isEditing,
  editDate, onEditDateChange,
  editIDTransporteur, onEditIDTransporteurChange,
  editIDAdresse, onEditIDAdresseChange,
  editIDContact, onEditIDContactChange,
  editDonation, onEditDonationChange,
  editObservation, onEditObservationChange,
  editIDClient, onEditIDClientChange,
  editRefClient, onEditRefClientChange,
  onValidate, isValidating,
}: {
  expedition: ExpeditionDetail | null
  isLoading: boolean
  isEditing: boolean
  editDate: string; onEditDateChange: (v: string) => void
  editIDTransporteur: number; onEditIDTransporteurChange: (v: number) => void
  editIDAdresse: number; onEditIDAdresseChange: (v: number) => void
  editIDContact: number; onEditIDContactChange: (v: number) => void
  editDonation: number; onEditDonationChange: (v: number) => void
  editObservation: string; onEditObservationChange: (v: string) => void
  editIDClient: number; onEditIDClientChange: (v: number) => void
  editRefClient: string; onEditRefClientChange: (v: string) => void
  onValidate: (v: boolean) => void
  isValidating: boolean
}) {
  // Lookups (loaded only in edit mode).
  const { data: transporteurs } = useQuery<TransporteurLite[]>({
    queryKey: ['exp-transporteurs'], queryFn: () => apiFetch('/expeditions/lookups/transporteurs'), enabled: isEditing,
  })
  const clientForAdr = expedition?.kind === 'divers' ? (editIDClient || expedition?.IDclient || 0) : (expedition?.IDclient ?? 0)
  const { data: adresses } = useQuery<AdresseLookup[]>({
    queryKey: ['exp-adresses', clientForAdr], queryFn: () => apiFetch(`/expeditions/lookups/adresses?client=${clientForAdr}`), enabled: isEditing && clientForAdr > 0,
  })
  const { data: contacts } = useQuery<ContactLite[]>({
    queryKey: ['exp-contacts', expedition?.IDclient], queryFn: () => apiFetch(`/expeditions/lookups/contacts?client=${expedition?.IDclient}`),
    enabled: isEditing && expedition?.kind === 'formelle' && !!expedition?.IDclient,
  })
  const { data: clients } = useQuery<ClientLite[]>({
    queryKey: ['exp-clients'], queryFn: () => apiFetch('/expeditions/lookups/clients'), enabled: isEditing && expedition?.kind === 'divers',
  })

  if (isLoading) return (
    <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
      <div className="flex-1 bg-muted/30 rounded-xl border p-4 space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
      </div>
    </div>
  )
  if (!expedition) return null

  return (
    <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
      <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
        <div className="flex border-b p-1 gap-1 rounded-t-xl bg-zinc-200/50">
          <div className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-sm font-medium rounded-md bg-accent text-accent-foreground shadow-sm">
            <Info className="h-3.5 w-3.5" />Info
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-transparent">
          <InfoTab
            expedition={expedition} isEditing={isEditing}
            transporteurs={transporteurs ?? []} adresses={adresses ?? []} contacts={contacts ?? []} clients={clients ?? []}
            editDate={editDate} onEditDateChange={onEditDateChange}
            editIDTransporteur={editIDTransporteur} onEditIDTransporteurChange={onEditIDTransporteurChange}
            editIDAdresse={editIDAdresse} onEditIDAdresseChange={onEditIDAdresseChange}
            editIDContact={editIDContact} onEditIDContactChange={onEditIDContactChange}
            editDonation={editDonation} onEditDonationChange={onEditDonationChange}
            editObservation={editObservation} onEditObservationChange={onEditObservationChange}
            editIDClient={editIDClient} onEditIDClientChange={onEditIDClientChange}
            editRefClient={editRefClient} onEditRefClientChange={onEditRefClientChange}
          />
        </div>
      </div>

      <StatusFooter valid={expedition.est_valide === 1} onToggle={() => onValidate(expedition.est_valide !== 1)} isToggling={isValidating} disabled={isEditing} />
    </div>
  )
}

function InfoTab({
  expedition, isEditing, transporteurs, adresses, contacts, clients,
  editDate, onEditDateChange,
  editIDTransporteur, onEditIDTransporteurChange,
  editIDAdresse, onEditIDAdresseChange,
  editIDContact, onEditIDContactChange,
  editDonation, onEditDonationChange,
  editObservation, onEditObservationChange,
  editIDClient, onEditIDClientChange,
  editRefClient, onEditRefClientChange,
}: {
  expedition: ExpeditionDetail
  isEditing: boolean
  transporteurs: TransporteurLite[]
  adresses: AdresseLookup[]
  contacts: ContactLite[]
  clients: ClientLite[]
  editDate: string; onEditDateChange: (v: string) => void
  editIDTransporteur: number; onEditIDTransporteurChange: (v: number) => void
  editIDAdresse: number; onEditIDAdresseChange: (v: number) => void
  editIDContact: number; onEditIDContactChange: (v: number) => void
  editDonation: number; onEditDonationChange: (v: number) => void
  editObservation: string; onEditObservationChange: (v: string) => void
  editIDClient: number; onEditIDClientChange: (v: number) => void
  editRefClient: string; onEditRefClientChange: (v: string) => void
}) {
  const isFormelle = expedition.kind === 'formelle'
  return (
    <div className="space-y-3">
      <div className={cn('p-3 rounded-lg border bg-card shadow-sm space-y-2', isEditing && editSectionClass)}>
        {isFormelle ? (
          <>
            <KV label="Client" value={expedition.client_nom || '—'} />
            <KV label="Commande" value={expedition.commande_numero != null ? `N° ${expedition.commande_numero}` : '—'} />
          </>
        ) : (
          <>
            <KV label="Client" value={isEditing ? (
              <SearchableCombobox<ClientLite>
                options={clients} value={editIDClient} onChange={onEditIDClientChange}
                getId={(c) => c.IDclient} getPrimary={(c) => c.nom} placeholder="Client enregistré" size="sm"
              />
            ) : (expedition.IDclient ? (expedition.client_nom || '—') : '—')} />
            <KV label="Nom libre" value={isEditing ? (
              <input type="text" value={editRefClient} onChange={(e) => onEditRefClientChange(e.target.value)}
                placeholder="Destinataire libre" className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right w-[170px]" />
            ) : ((!expedition.IDclient && expedition.ref_client) ? expedition.ref_client : '—')} />
          </>
        )}
        <KV label="Date" value={isEditing ? (
          <input type="date" value={editDate} onChange={(e) => onEditDateChange(e.target.value)}
            className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right" />
        ) : (expedition.date ? formatHfsqlDate(expedition.date) : '—')} />
        <KV label="Transporteur" value={isEditing ? (
          <PopoverSelect size="sm" options={transporteurs.map((t) => ({ id: t.IDtransporteur, primary: t.nom }))}
            value={editIDTransporteur} onChange={onEditIDTransporteurChange} emptyLabel="—" />
        ) : (expedition.transporteur_nom || '—')} />
        {isFormelle && (
          <>
            <KV label="Contact" value={isEditing ? (
              <PopoverSelect size="sm" options={contacts.map((c) => ({ id: c.IDcontact, primary: c.nom, secondary: c.mail || undefined }))}
                value={editIDContact} onChange={onEditIDContactChange} emptyLabel="—" />
            ) : (expedition.contact_nom || '—')} />
            <KV label="Donation" value={isEditing ? (
              <ToggleSwitch value={editDonation === 1} onChange={(v) => onEditDonationChange(v ? 1 : 0)} />
            ) : (expedition.donation ? 'Oui' : 'Non')} />
            {!!expedition.est_facture && <KV label="Facturée" value="Oui" />}
          </>
        )}
      </div>

      <AdresseCard
        adresse={expedition.adresse_livraison}
        isEditing={isEditing}
        options={adresses}
        selectedId={editIDAdresse}
        onSelect={onEditIDAdresseChange}
      />

      {isFormelle && (
        <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2"><FileText className="h-3.5 w-3.5" />Observations (BL)</p>
          {isEditing ? (
            <textarea value={editObservation} onChange={(e) => onEditObservationChange(e.target.value)} rows={3}
              placeholder="Observations imprimées sur le bon de livraison…"
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
          ) : (
            expedition.observation_bl?.trim()
              ? <p className="text-sm text-muted-foreground whitespace-pre-line">{expedition.observation_bl}</p>
              : <p className="text-sm text-muted-foreground italic">Aucune observation</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Status footer pill (mps_designer §29.3 binary) ─────

function StatusFooter({
  valid, onToggle, isToggling, disabled,
}: {
  valid: boolean
  onToggle: () => void
  isToggling: boolean
  disabled: boolean
}) {
  const Icon = valid ? CheckCircle2 : Clock
  const label = valid ? 'Validée' : 'Brouillon'
  const actionLabel = valid ? 'Rouvrir' : 'Valider'
  const ActionIcon = valid ? Clock : CheckCircle2
  return (
    <div className={cn('flex-shrink-0 rounded-xl border shadow-sm overflow-hidden flex items-stretch h-11', valid ? 'bg-success border-success' : 'bg-primary border-primary')}>
      <div className="flex items-center gap-2 px-3 flex-1 text-white min-w-0">
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-bold uppercase tracking-wide truncate">{label}</span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled || isToggling}
        title={valid ? 'Rouvrir l\'expédition' : 'Valider l\'expédition'}
        className="px-3.5 bg-white/15 hover:bg-white/25 active:bg-white/30 disabled:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold border-l border-white/25 flex items-center gap-1.5 transition-colors"
      >
        {isToggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ActionIcon className="h-3.5 w-3.5" />}
        {actionLabel}
      </button>
    </div>
  )
}

// ── Address card + picker (mirror ClientsFacturation) ──

function AdresseCard({
  adresse, isEditing, options, selectedId, onSelect,
}: {
  adresse: AdresseLite | null
  isEditing: boolean
  options: AdresseLookup[]
  selectedId: number
  onSelect: (id: number) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const displayAdresse: AdresseLite | null = isEditing ? (options.find((o) => o.IDadresse === selectedId) ?? adresse) : adresse
  return (
    <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Adresse de livraison</p>
        {isEditing && (
          <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] gap-1" onClick={() => setPickerOpen(true)}>
            <Search className="h-3 w-3" />Choisir
          </Button>
        )}
      </div>
      {displayAdresse ? (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {displayAdresse.nom && <p className="font-medium text-foreground">{displayAdresse.nom}</p>}
          {displayAdresse.adresse1 && <p>{displayAdresse.adresse1}</p>}
          {displayAdresse.adresse2 && <p>{displayAdresse.adresse2}</p>}
          {displayAdresse.adresse3 && <p>{displayAdresse.adresse3}</p>}
          {(displayAdresse.cp || displayAdresse.ville) && <p>{[displayAdresse.cp, displayAdresse.ville].filter(Boolean).join(' ')}</p>}
          {displayAdresse.pays && <p>{displayAdresse.pays}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">Aucune adresse</p>
      )}
      <AdressePickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)}
        options={options} selectedId={selectedId} onSelect={(id) => { onSelect(id); setPickerOpen(false) }} />
    </div>
  )
}

function AdressePickerDialog({
  open, onClose, options, selectedId, onSelect,
}: {
  open: boolean
  onClose: () => void
  options: AdresseLookup[]
  selectedId: number
  onSelect: (id: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg space-y-4" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-accent" />Choisir une adresse de livraison</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-2 px-1">
          {options.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <MapPin className="h-10 w-10 mb-2 opacity-40" /><p className="text-sm">Aucune adresse disponible</p>
            </div>
          ) : options.map((a) => {
            const isSelected = a.IDadresse === selectedId
            return (
              <button
                key={a.IDadresse}
                type="button"
                onClick={() => onSelect(a.IDadresse)}
                className={cn('w-full text-left p-3 rounded-lg border transition-all',
                  isSelected ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border bg-card hover:border-accent/50 hover:bg-accent/[0.02]')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{a.nom || `Adresse #${a.IDadresse}`}</p>
                      {!!a.est_defaut_livraison && <Badge variant="outline" className="text-[10px] py-0">Livraison</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {a.adresse1 && <p className="truncate">{a.adresse1}</p>}
                      {(a.cp || a.ville) && <p>{[a.cp, a.ville].filter(Boolean).join(' ')}</p>}
                      {a.pays && <p>{a.pays}</p>}
                    </div>
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />}
                </div>
              </button>
            )
          })}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Annuler</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Create dialog (bucket-aware) ───────────────────────

function CreateExpeditionDialog({
  open, bucket, onClose, onCreated,
}: {
  open: boolean
  bucket: Kind
  onClose: () => void
  onCreated: (newId: number, kind: Kind) => void
}) {
  const [kind, setKind] = useState<Kind>(bucket)
  const [commandeId, setCommandeId] = useState(0)
  const [clientId, setClientId] = useState(0)
  const [refClient, setRefClient] = useState('')
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)

  const { data: commandes } = useQuery<CommandeLite[]>({
    queryKey: ['exp-create-commandes'], queryFn: () => apiFetch('/expeditions/lookups/commandes'), enabled: open && kind === 'formelle',
  })
  const { data: clients } = useQuery<ClientLite[]>({
    queryKey: ['exp-create-clients'], queryFn: () => apiFetch('/expeditions/lookups/clients'), enabled: open && kind === 'divers',
  })

  useEffect(() => {
    if (open) { setKind(bucket); setCommandeId(0); setClientId(0); setRefClient(''); setDate(new Date().toISOString().slice(0, 10)); setError(null) }
  }, [open, bucket])

  const createMut = useMutation({
    mutationFn: () => apiFetch(`/expeditions/${kind}`, {
      method: 'POST',
      body: JSON.stringify(
        kind === 'formelle'
          ? { IDcommande_client: commandeId, date: inputDateToHfsql(date) }
          : { IDclient: clientId || 0, ref_client: refClient, date: inputDateToHfsql(date) },
      ),
    }),
    onSuccess: (data: { id: number; kind: Kind }) => onCreated(data.id, data.kind),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Erreur'),
  })

  const canSave = kind === 'formelle' ? commandeId > 0 : (clientId > 0 || refClient.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-accent" />Nouvelle expédition</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <div className="flex gap-1">
              {([
                { k: 'formelle', l: 'Textile' },
                { k: 'divers', l: 'Diverse' },
              ] as const).map((o) => (
                <button
                  key={o.k}
                  type="button"
                  onClick={() => setKind(o.k)}
                  className={cn('flex-1 px-2 py-1.5 text-xs rounded-md transition-colors border',
                    kind === o.k ? 'bg-accent text-accent-foreground border-accent shadow-sm font-medium' : 'border-input text-muted-foreground hover:bg-accent/10')}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {kind === 'formelle'
                ? "Liée à une commande client — les rouleaux reçus sont rattachés à l'expédition."
                : 'Envoi divers (échantillons, retours…) — lignes libres, sans lien stock.'}
            </p>
          </div>

          {kind === 'formelle' ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Commande</label>
              <SearchableCombobox<CommandeLite>
                options={commandes ?? []}
                value={commandeId}
                onChange={setCommandeId}
                getId={(c) => c.IDcommande_client}
                getPrimary={(c) => `N° ${c.numero ?? c.IDcommande_client} · ${c.client_nom}`}
                getSecondary={(c) => (c.date_commande ? formatHfsqlDate(c.date_commande) : undefined)}
                placeholder="Choisir une commande"
              />
              <p className="text-[11px] text-muted-foreground">Le transporteur et l'adresse de livraison seront pré-remplis.</p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Client enregistré</label>
                <SearchableCombobox<ClientLite>
                  options={clients ?? []}
                  value={clientId}
                  onChange={setClientId}
                  getId={(c) => c.IDclient}
                  getPrimary={(c) => c.nom}
                  placeholder="Choisir un client (optionnel)"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">ou nom libre</label>
                <input type="text" value={refClient} onChange={(e) => setRefClient(e.target.value)} placeholder="Destinataire libre" className={cn(inputClass, 'h-9')} />
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputClass, 'h-9')} />
          </div>

          {error && (
            <div className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => createMut.mutate()} disabled={!canSave || createMut.isPending}>
            {createMut.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Création...</> : <><Save className="h-3.5 w-3.5 mr-1.5" />Créer</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Shared bits ────────────────────────────────────────

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-right truncate">{value}</span>
    </div>
  )
}

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        value ? 'bg-accent shadow-inner' : 'bg-zinc-300 hover:bg-zinc-400/80',
      )}
    >
      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out', value ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  )
}

function PlaceholderDialog({
  open, onClose, title, Icon, CenterIcon,
}: {
  open: boolean
  onClose: () => void
  title: string
  Icon: ComponentType<{ className?: string }>
  CenterIcon: ComponentType<{ className?: string }>
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-accent" />{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <CenterIcon className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm font-medium">En developpement</p>
          <p className="text-xs mt-1">Cette fonctionnalite sera disponible prochainement.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
