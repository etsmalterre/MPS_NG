// Sous-traitants / Commandes — Phase 1.
//
// Mirrors `FilsCommandes.tsx` for the master-detail / sidebar / unsaved-guard
// machinery. Specific to this screen:
//   - header status is `est_soldee` BOOLEAN (not commande_fil's `etat` int)
//   - per-line status is the legacy string `sstatut` — Phase 1 binary toggle
//     maps to the literal values 'En_Cours' / 'Terminé'
//   - lines reference ref_ecru / colori_ecru (Phase 1 = ennoblisseur flow)
//   - no mode_paiement / echeance fields (don't exist on the entity)
//   - line drawer is the "pièces" drawer:
//       * affecter: link existing stock_ecru (tombé-de-métier rolls) to the line
//       * réception: record stock_fini rolls returned dyed
//   - "Délai initial" indicator on each line when date_delai !== date_livraison
//   - Phase 1 gates create + line CRUD to **Ennoblisseur** sous-traitants only;
//     existing non-ennoblisseur commandes remain readable.

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import {
  ShoppingCart,
  Building2,
  Search,
  Loader2,
  AlertCircle,
  MapPin,
  Info,
  BookOpen,
  Pencil,
  Plus,
  X,
  Save,
  Trash2,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  Link2,
  Unlink,
  Printer,
  AtSign,
  FileText,
  Upload,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PopoverSelect, SearchableCombobox } from '@/components/ui/popover-select'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { FiniRollIcon } from '@/components/icons/FiniRollIcon'
import { TmRollIcon } from '@/components/icons/TmRollIcon'
import { SendEmailDialog } from '@/components/email/SendEmailDialog'
import { cn } from '@/lib/utils'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { apiFetch, API_URL } from '@/lib/api'
import { postEmail } from '@/lib/email'

// ── Constants ──────────────────────────────────────────

const TYPE_ENNOBLISSEUR = 'Ennoblisseur'
const SSTATUT_OPEN = 'En_Cours'
const SSTATUT_DONE = 'Terminé'

// IDtype_sst values from production: 1 Tricoteur, 2 Ennoblisseur, 3 Autre,
// 4 Confectionneur. The PopoverSelect for "Type sous-traitant" is keyed on
// these ids. Phase 1 only lists Ennoblisseur; the others land in Phase 2
// once their drawer flows are built.
const TYPE_SST_ID_BY_LABEL: Record<string, number> = {
  Tricoteur: 1,
  Ennoblisseur: 2,
  Autre: 3,
  Confectionneur: 4,
}
const TYPE_SST_LABEL_BY_ID: Record<number, string> = {
  1: 'Tricoteur',
  2: 'Ennoblisseur',
  3: 'Autre',
  4: 'Confectionneur',
}
const TYPE_SST_OPTIONS_PHASE1: Array<{ id: number; primary: string }> = [
  { id: TYPE_SST_ID_BY_LABEL.Ennoblisseur, primary: 'Ennoblisseur' },
]

function isLineDone(sstatut: string | null | undefined): boolean {
  return (sstatut ?? '').trim() === SSTATUT_DONE
}

// ── Types ──────────────────────────────────────────────

interface CommandeListRow {
  IDcommande_sous_traitant: number
  IDsous_traitant: number
  date_commande: string | null
  est_soldee: number | null
  commentaire: string | null
  sous_traitant_nom: string
  sous_traitant_type: string | null
  total_eur: number
  total_qte: number
  nb_lignes: number
  earliest_delivery: string | null
}

interface LigneCommande {
  IDligne_commande_sous_traitant: number
  IDcommande_sous_traitant: number
  type: number | null
  IDreference: number | null
  IDColoris: number | null
  quantite: number | null
  unite: number | null
  prix: number | null
  date_livraison: string | null
  date_delai: string | null
  date_reception: string | null
  commentaire: string | null
  sstatut: string | null
  num_facture: string | null
  ref_label: string | null
  ref_kind: 'ecru' | 'fini' | 'fil' | null
  // `ref_fini.rendement` in Ml/kg — used to compute "Ml potentiel" =
  // total_kg_ecru_lie × rendement once écru rolls are attached. 0 means
  // either not a fini line or the catalog has no rendement on file.
  ref_rendement?: number
  colori_reference: string | null
  // Drawer-fed per-line aggregates. The line's actual € total is
  // `total_kg_ecru_lie × prix` (the user-entered prix is €/Kg, applied to
  // the real attached weight, not the nominal qty in Ml).
  nb_ecru_lies?: number
  total_kg_ecru_lie?: number
  nb_fini_recu?: number
  total_metrage_fini_recu?: number
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

interface CommandeDetail {
  IDcommande_sous_traitant: number
  IDsous_traitant: number
  date_commande: string | null
  est_soldee: number | null
  commentaire: string | null
  journal: string | null
  IDadresse_sous_traitant: number | null
  IDadresse_livraison: number | null
  sous_traitant_nom: string
  sous_traitant_tel: string | null
  sous_traitant_type: string | null
  sous_traitant_IDtype_sst: number
  adresse_sous_traitant: AdresseLite | null
  adresse_livraison: AdresseLite | null
  lignes: LigneCommande[]
  /** True when this commande's sous-traitant has rows in
   *  `tranche_tarif_ennoblissement`. Drives the read-only lock on the
   *  prix input — suppliers without a catalog (e.g. FRANCE TEINTURE)
   *  keep manual prix entry instead. */
  auto_pricing_enabled?: boolean
}

interface SousTraitantLite {
  IDsous_traitant: number
  nom: string
  tel: string | null
  IDtype_sst: number | null
  type: string | null
}

interface RefFiniLookup {
  IDref_fini: number
  ref_fini: string
  designation: string
}

interface AdresseLookup extends AdresseLite {
  est_defaut: number
  est_defaut_facturation: number
  est_defaut_livraison: number
}

interface MagasinLite {
  IDmagasin: number
  nom: string
}

// Pieces drawer payload
/** Quality defect logged in the legacy `defaut_qualite` table. Multiple
 *  defects can be recorded per écru roll. The combo of `description`
 *  (precise human-readable) + `type_defaut` (category) + `taille_cm`
 *  size lets the UI render each defect as a structured red bullet
 *  inside the defect banner. */
interface DefautQualite {
  IDdefaut_qualite: number
  description: string | null
  type_defaut: string | null
  taille_cm: number | null
}

interface StockEcruLite {
  IDstock_ecru: number
  numero: string | null
  lot: string | null
  poids: number | null
  metrage: number | null
  IDref_ecru: number
  IDcolori_ecru: number
  IDmagasin: number
  IDordre_fabrication: number
  date_saisie: string | null
  /** Textile industry quality flag — >0 means the roll is downgraded
   *  ("second choix"). Surfaced as a destructive badge on the card. */
  second_choix: number | null
  /** Free-text inspection note captured by the visiteur (qualité
   *  inspector). Rendered as an italic line under the card. */
  observations: string | null
  /** Structured defects from `defaut_qualite` — rendered inside the
   *  red "Défaut" banner alongside `observations`. */
  defects?: DefautQualite[]
  // Customer reservation — populated only on linked rolls. See server-side
  // comment on the same field for the full join chain.
  IDligne_commande_client?: number
  client_nom?: string | null
}
interface StockFiniLite {
  IDstock_fini: number
  numero: string | null
  lot: string | null
  poids: number | null
  metrage: number | null
  IDref_fini: number
  IDColoris: number
  IDstock_ecru: number
  IDmagasin: number
  date_saisie: string | null
  /** Same semantic as on écru — >0 = second choix. */
  second_choix: number | null
  /** Visiteur's note at reception. */
  observations: string | null
  /** Ennoblisseur's note (separate from the visiteur's). Surfaced as a
   *  second italic line so the source of each comment stays clear. */
  observation_sst: string | null
}
interface PiecesPayload {
  ecruLinked: StockEcruLite[]
  ecruAvailable: StockEcruLite[]
  finiReceived: StockFiniLite[]
  /** The line's `prix` (€/Kg) after any auto-recalc triggered by the
   *  link/unlink mutation that produced this payload. Mirrors what the
   *  server-side `recalcLignePrix` just wrote to HFSQL. Used to patch the
   *  commande detail React Query cache so the LineCard re-renders with
   *  the new value without a full refetch. */
  prix: number
}

// ── Shared styling ─────────────────────────────────────

const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

// Build a PopoverSelect option for an adresse: name on top + collapsed
// "street · cp ville · pays" descriptor below so the user can verify the
// pick at a glance from the dropdown.
function adresseOption(a: AdresseLookup) {
  const street = [a.adresse1, a.adresse2, a.adresse3].filter((s) => !!s && s.trim()).join(' · ')
  const cityLine = [a.cp, a.ville].filter((s) => !!s && s.toString().trim()).join(' ')
  const descLines = [street, cityLine, a.pays || '']
    .map((s) => (s ?? '').trim())
    .filter((s) => s.length > 0)
  return {
    id: a.IDadresse,
    primary: a.nom || `Adresse #${a.IDadresse}`,
    secondary: a.ville ?? undefined,
    description: descLines.length > 0 ? descLines.join('\n') : undefined,
  }
}

// ── Status helpers ─────────────────────────────────────

function CommandeEtatBadge({ est_soldee, className }: { est_soldee: number | null; className?: string }) {
  if (est_soldee === 1) return <Badge variant="success" className={cn('text-[10px] py-0 gap-1', className)}><CheckCircle2 className="h-2.5 w-2.5" />Terminée</Badge>
  return <Badge variant="default" className={cn('text-[10px] py-0 gap-1', className)}><Clock className="h-2.5 w-2.5" />En cours</Badge>
}

function LineSstatutBadge({ sstatut, className }: { sstatut: string | null; className?: string }) {
  if (isLineDone(sstatut)) {
    return <Badge variant="success" className={cn('text-[10px] py-0 gap-1', className)}><CheckCircle2 className="h-2.5 w-2.5" />Terminée</Badge>
  }
  return <Badge variant="default" className={cn('text-[10px] py-0 gap-1', className)}><Clock className="h-2.5 w-2.5" />En cours</Badge>
}

function deliveryUrgency(earliestHfsql: string | null, est_soldee: number | null): 'late' | 'soon' | null {
  if (est_soldee === 1) return null
  if (!earliestHfsql || !/^\d{8}$/.test(earliestHfsql)) return 'late'
  const y = Number(earliestHfsql.slice(0, 4))
  const m = Number(earliestHfsql.slice(4, 6)) - 1
  const d = Number(earliestHfsql.slice(6, 8))
  const target = new Date(y, m, d)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diffDays <= 0) return 'late'
  if (diffDays <= 3) return 'soon'
  return null
}

function lineEtatColors(sstatut: string | null) {
  if (isLineDone(sstatut)) {
    return {
      border: 'border-l-green-500/60',
      iconBg: 'bg-green-500/10',
      iconColor: 'text-green-600',
    }
  }
  return {
    border: 'border-l-amber-400/60',
    iconBg: 'bg-amber-400/10',
    iconColor: 'text-amber-600',
  }
}

function isEnnoblisseurType(type: string | null): boolean {
  if (!type) return false
  return type.trim().toLowerCase() === TYPE_ENNOBLISSEUR.toLowerCase()
}

// Debounce a fast-changing value (typically a search input). Returns the
// last value that has been stable for `delay` ms. Used to throttle the
// commandes list refetch while the user is still typing.
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Main Page ──────────────────────────────────────────

export function SousTraitantsCommandes() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'en_cours' | 'terminee'>('en_cours')
  const [isEditing, setIsEditing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [piecesDrawerLineId, setPiecesDrawerLineId] = useState<number | null>(null)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [autoEditForId, setAutoEditForId] = useState<number | null>(null)
  const [deleteCommandeConfirmOpen, setDeleteCommandeConfirmOpen] = useState(false)

  // Edit-mode draft state
  const [editDateCommande, setEditDateCommande] = useState('')
  const [editCommentaire, setEditCommentaire] = useState('')
  const [editJournal, setEditJournal] = useState('')
  const [editIDAdresseSousTraitant, setEditIDAdresseSousTraitant] = useState<number>(0)
  const [editIDAdresseLivraison, setEditIDAdresseLivraison] = useState<number>(0)

  const originalDraftRef = useRef<{
    dateCommande: string
    commentaire: string
    journal: string
    IDadresseSt: number
    IDadresseLiv: number
  } | null>(null)

  const [linesDirty, setLinesDirty] = useState(false)

  // Keyset-paginated list. The first fetch returns the 100 most recent
  // commandes for the current statusFilter; each subsequent fetch passes
  // the last-seen IDcommande_sous_traitant as `before_id`. Solves the
  // "click 'terminé' → wait forever" problem on this multi-thousand-row
  // table by capping the wire payload at 100 rows per round-trip.
  //
  // When the user types in the search box, we debounce the input (300 ms)
  // and route the query through the same `useInfiniteQuery` but with `q`
  // baked into the key + URL. The backend bypasses pagination for that
  // case so the search scans every matching commande, not just the loaded
  // page. The single page returned is treated as the "last" page (no
  // `getNextPageParam` cursor), so the infinite-scroll logic naturally
  // disables itself while searching.
  const COMMANDES_PAGE_SIZE = 100
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300)
  const isSearching = debouncedSearch.length > 0
  const {
    data: commandesPages,
    isLoading,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<CommandeListRow[], Error>({
    queryKey: ['commandes-sst', statusFilter, debouncedSearch],
    queryFn: async ({ pageParam }) => {
      if (isSearching) {
        return apiFetch(
          `/commandes-sous-traitant?status=${statusFilter}&q=${encodeURIComponent(debouncedSearch)}`,
        )
      }
      const cursor = typeof pageParam === 'number' && pageParam > 0
        ? `&before_id=${pageParam}` : ''
      return apiFetch(
        `/commandes-sous-traitant?status=${statusFilter}&limit=${COMMANDES_PAGE_SIZE}${cursor}`,
      )
    },
    initialPageParam: 0,
    // While searching, the backend always returns the complete set in one
    // page — never request more. Otherwise a short page (<100) signals
    // end-of-list and a full page advances the cursor to the last id.
    getNextPageParam: (lastPage) => {
      if (isSearching) return undefined
      if (!lastPage || lastPage.length < COMMANDES_PAGE_SIZE) return undefined
      const last = lastPage[lastPage.length - 1]
      return last?.IDcommande_sous_traitant ?? undefined
    },
  })
  const commandes = useMemo<CommandeListRow[] | undefined>(
    () => commandesPages?.pages.flatMap((p) => p),
    [commandesPages],
  )

  const { data: detail, isLoading: detailLoading } = useQuery<CommandeDetail>({
    queryKey: ['commande-sst', selectedId],
    queryFn: () => apiFetch(`/commandes-sous-traitant/${selectedId}`),
    enabled: selectedId !== null,
  })

  // Auto-select first on load
  useEffect(() => {
    if (commandes && commandes.length > 0 && selectedId === null) {
      setSelectedId(commandes[0].IDcommande_sous_traitant)
    }
  }, [commandes, selectedId])

  // Reset the pieces drawer when the active commande changes — avoids stale
  // drawer state leaking into the next commande's lines.
  useEffect(() => {
    setPiecesDrawerLineId(null)
  }, [selectedId])

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['commandes-sst'] })
    queryClient.invalidateQueries({ queryKey: ['commande-sst', selectedId] })
  }, [queryClient, selectedId])

  const startEdit = useCallback(() => {
    if (!detail) return
    const snapshot = {
      dateCommande: hfsqlDateToInput(detail.date_commande),
      commentaire: detail.commentaire?.trim() ?? '',
      journal: detail.journal?.trim() ?? '',
      IDadresseSt: detail.IDadresse_sous_traitant ?? 0,
      IDadresseLiv: detail.IDadresse_livraison ?? 0,
    }
    setEditDateCommande(snapshot.dateCommande)
    setEditCommentaire(snapshot.commentaire)
    setEditJournal(snapshot.journal)
    setEditIDAdresseSousTraitant(snapshot.IDadresseSt)
    setEditIDAdresseLivraison(snapshot.IDadresseLiv)
    originalDraftRef.current = snapshot
    setPiecesDrawerLineId(null)
    setIsEditing(true)
  }, [detail])

  const cancelEdit = useCallback(() => setIsEditing(false), [])

  const isDirty = useMemo(() => {
    if (!isEditing) return false
    const o = originalDraftRef.current
    if (!o) return false
    if (editDateCommande !== o.dateCommande) return true
    if (editCommentaire !== o.commentaire) return true
    if (editJournal !== o.journal) return true
    if (editIDAdresseSousTraitant !== o.IDadresseSt) return true
    if (editIDAdresseLivraison !== o.IDadresseLiv) return true
    if (linesDirty) return true
    return false
  }, [isEditing, editDateCommande, editCommentaire, editJournal, editIDAdresseSousTraitant, editIDAdresseLivraison, linesDirty])

  const saveHeaderMut = useMutation({
    mutationFn: () => apiFetch(`/commandes-sous-traitant/${selectedId}`, {
      method: 'PUT',
      body: JSON.stringify({
        date_commande: inputDateToHfsql(editDateCommande),
        commentaire: editCommentaire,
        journal: editJournal,
        IDadresse_sous_traitant: editIDAdresseSousTraitant || 0,
        IDadresse_livraison: editIDAdresseLivraison || 0,
      }),
    }),
    onSuccess: () => { invalidateAll(); setIsEditing(false) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/commandes-sous-traitant/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      // The list cache is now an `InfiniteData<CommandeListRow[]>`. Flatten
      // its pages to find the next-best row to auto-select once the current
      // one is gone.
      const cached = queryClient.getQueryData<InfiniteData<CommandeListRow[]>>(['commandes-sst', statusFilter])
      const flat = cached?.pages.flatMap((p) => p) ?? []
      const remaining = flat.filter((c) => c.IDcommande_sous_traitant !== deletedId)
      queryClient.invalidateQueries({ queryKey: ['commandes-sst'] })
      setIsEditing(false)
      setDeleteCommandeConfirmOpen(false)
      setSelectedId(remaining.length > 0 ? remaining[0].IDcommande_sous_traitant : null)
    },
  })

  // Auto-enter edit mode after create
  useEffect(() => {
    if (autoEditForId !== null && detail?.IDcommande_sous_traitant === autoEditForId) {
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

  const toggleEtatMut = useMutation({
    mutationFn: (newEtat: number) => apiFetch(`/commandes-sous-traitant/${selectedId}/etat`, {
      method: 'PUT',
      body: JSON.stringify({ est_soldee: newEtat }),
    }),
    onSuccess: invalidateAll,
  })

  const handleSelect = useCallback((id: number) => {
    guard.guardAction(() => {
      setIsEditing(false)
      setSelectedId(id)
    })
  }, [guard])

  const handleStatusFilterChange = useCallback((s: 'all' | 'en_cours' | 'terminee') => {
    guard.guardAction(() => {
      setIsEditing(false)
      setStatusFilter(s)
      setSelectedId(null)
    })
  }, [guard])

  const filtered = useMemo(() => {
    if (!commandes) return []
    if (!searchQuery.trim()) return commandes
    const q = searchQuery.toLowerCase()
    return commandes.filter((c) =>
      String(c.IDcommande_sous_traitant).includes(q)
      || (c.sous_traitant_nom ?? '').toLowerCase().includes(q)
      || (c.commentaire ?? '').toLowerCase().includes(q)
    )
  }, [commandes, searchQuery])

  return (
    <>
      <MasterDetailLayout
        list={
          <CommandeList
            rows={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            selectedId={selectedId}
            onSelect={handleSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={handleStatusFilterChange}
            onNew={() => setCreateOpen(true)}
            isEditing={isEditing}
            hasNextPage={!!hasNextPage}
            onLoadMore={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
            isFetchingNextPage={isFetchingNextPage}
          />
        }
        detailHeader={
          <DetailHeader
            commande={detail ?? null}
            isLoading={detailLoading && selectedId !== null}
            isEditing={isEditing}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSave={() => saveHeaderMut.mutate()}
            isSaving={saveHeaderMut.isPending}
            onDelete={() => setDeleteCommandeConfirmOpen(true)}
            onPrintClick={() => setPrintModalOpen(true)}
            onEmailClick={() => setEmailModalOpen(true)}
          />
        }
        detail={
          <DetailMain
            commande={detail ?? null}
            isLoading={detailLoading && selectedId !== null}
            hasSelection={selectedId !== null}
            isEditing={isEditing}
            onMutationSuccess={invalidateAll}
            onLinesDirtyChange={setLinesDirty}
            piecesDrawerLineId={piecesDrawerLineId}
            onOpenPiecesDrawer={setPiecesDrawerLineId}
          />
        }
        sidebar={selectedId !== null ? (
          <DetailSidebar
            commande={detail ?? null}
            isLoading={detailLoading}
            isEditing={isEditing}
            editDateCommande={editDateCommande}
            onEditDateCommandeChange={setEditDateCommande}
            editCommentaire={editCommentaire}
            onEditCommentaireChange={setEditCommentaire}
            editJournal={editJournal}
            onEditJournalChange={setEditJournal}
            editIDAdresseSousTraitant={editIDAdresseSousTraitant}
            onEditIDAdresseSousTraitantChange={setEditIDAdresseSousTraitant}
            editIDAdresseLivraison={editIDAdresseLivraison}
            onEditIDAdresseLivraisonChange={setEditIDAdresseLivraison}
            onToggleEtat={() => toggleEtatMut.mutate(detail?.est_soldee === 1 ? 0 : 1)}
            isTogglingEtat={toggleEtatMut.isPending}
          />
        ) : null}
        sidebarTitle="Informations"
        hasSelection={selectedId !== null}
        onBack={() => guard.guardAction(() => { setIsEditing(false); setSelectedId(null) })}
      />

      <UnsavedChangesDialog
        open={guard.showDialog}
        onAction={guard.handleAction}
        isSaving={guard.isSaving}
      />

      <CreateCommandeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(newId) => {
          setCreateOpen(false)
          queryClient.invalidateQueries({ queryKey: ['commandes-sst'] })
          setSelectedId(newId)
          setAutoEditForId(newId)
        }}
      />

      <ConfirmDialog
        open={deleteCommandeConfirmOpen}
        title="Supprimer la commande"
        description="Cette action supprimera la commande, toutes ses lignes et libérera les rouleaux écru affectés. Elle est irréversible."
        confirmLabel="Supprimer"
        isPending={deleteMut.isPending}
        onCancel={() => setDeleteCommandeConfirmOpen(false)}
        onConfirm={() => { if (selectedId !== null) deleteMut.mutate(selectedId) }}
      />

      {/* "En developpement" placeholder for the print button per §18.A-bis */}
      <Dialog open={printModalOpen} onOpenChange={setPrintModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-accent" />
              Imprimer
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Printer className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm font-medium">PDF disponible</p>
            <p className="text-xs mt-1">Le PDF s'ouvre via le bouton « Envoyer un email » ci-contre.</p>
            {selectedId !== null && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  window.open(`${API_URL}/commandes-sous-traitant/${selectedId}/pdf`, '_blank')
                  setPrintModalOpen(false)
                }}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />Ouvrir le PDF
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedId !== null && (
        <SendEmailDialog
          open={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          contextLabel={detail?.sous_traitant_nom ?? undefined}
          queryKey={['commande-sst-email-defaults', selectedId]}
          loadDefaults={() => apiFetch(`/commandes-sous-traitant/${selectedId}/email-defaults`)}
          pdfUrl={`${API_URL}/commandes-sous-traitant/${selectedId}/pdf`}
          pdfAttachmentLabel={`commande-sous-traitant-${selectedId}.pdf`}
          onSend={(p) => postEmail(`${API_URL}/commandes-sous-traitant/${selectedId}/email`, p, { includeAttachPdf: true })}
        />
      )}
    </>
  )
}

// ── Left Panel: List ───────────────────────────────────

function CommandeList({
  rows, isLoading, isError, error,
  selectedId, onSelect,
  searchQuery, onSearchChange,
  statusFilter, onStatusFilterChange,
  onNew, isEditing,
  hasNextPage, onLoadMore, isFetchingNextPage,
}: {
  rows: CommandeListRow[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  selectedId: number | null
  onSelect: (id: number) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  statusFilter: 'all' | 'en_cours' | 'terminee'
  onStatusFilterChange: (s: 'all' | 'en_cours' | 'terminee') => void
  onNew: () => void
  isEditing: boolean
  /** True while the backend has more rows behind the current cursor. */
  hasNextPage: boolean
  /** Trigger the next page fetch. Caller debounces. */
  onLoadMore: () => void
  /** True while the next page is currently in-flight. */
  isFetchingNextPage: boolean
}) {
  // IntersectionObserver-driven infinite scroll. The sentinel sits at the
  // bottom of the list's scroll container; the moment it enters the
  // viewport we call `onLoadMore`. The observer's `root` is the scroll
  // container itself (not the page viewport) — otherwise the sentinel
  // never intersects because the surrounding scroll-area clips it.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore()
      },
      { root, rootMargin: '200px 0px 200px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, onLoadMore, rows.length])
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher (n°, sous-traitant...)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off"
            className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1">
          {([
            { key: 'en_cours', label: 'En cours' },
            { key: 'terminee', label: 'Terminées' },
            { key: 'all', label: 'Toutes' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => onStatusFilterChange(opt.key)}
              className={cn(
                'flex-1 px-2 py-1 text-xs rounded-md transition-colors',
                statusFilter === opt.key
                  ? 'bg-accent text-accent-foreground shadow-sm font-medium'
                  : 'text-muted-foreground hover:bg-accent/10'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-2 scrollbar-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-8 text-destructive">
            <AlertCircle className="h-6 w-6 mb-2" />
            <p className="text-sm">{error?.message || 'Erreur'}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Building2 className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">Aucune commande</p>
          </div>
        ) : rows.map((row) => {
          const isSelected = selectedId === row.IDcommande_sous_traitant
          const urgency = deliveryUrgency(row.earliest_delivery, row.est_soldee)
          const selectedRingClass =
            urgency === 'late' ? 'border-red-500 ring-1 ring-red-500'
            : urgency === 'soon' ? 'border-amber-500 ring-1 ring-amber-500'
            : 'border-zinc-400 ring-1 ring-zinc-400'
          const hoverClass =
            urgency === 'late' ? 'border-border hover:border-red-500/50'
            : urgency === 'soon' ? 'border-border hover:border-amber-500/50'
            : 'border-border hover:border-zinc-400/60'
          return (
            <div
              key={row.IDcommande_sous_traitant}
              onClick={() => onSelect(row.IDcommande_sous_traitant)}
              className={cn(
                'p-3 border rounded-lg cursor-pointer transition-all bg-white',
                isSelected ? selectedRingClass : hoverClass,
                urgency === 'late' && 'shadow-[inset_4px_0_0_0_rgb(239_68_68)]',
                urgency === 'soon' && 'shadow-[inset_4px_0_0_0_rgb(245_158_11)]'
              )}
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-sm">N° {row.IDcommande_sous_traitant}</span>
                <CommandeEtatBadge est_soldee={row.est_soldee} className="ml-auto" />
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">{row.sous_traitant_nom || '—'}</p>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                {row.date_commande && <span>{formatHfsqlDate(row.date_commande)}</span>}
                {!!row.sous_traitant_type && (
                  <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px]">
                    {row.sous_traitant_type}
                  </span>
                )}
                {row.total_eur > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 rounded bg-zinc-200/80 font-medium tabular-nums">
                    {fmtNum(row.total_eur)} €
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {/* Bottom sentinel — invisible div that triggers `onLoadMore` when
            scrolled into view. Rendered only when there are still pages to
            fetch. The spinner below it appears while the new page is on
            the wire so the user knows progress is happening. */}
        {hasNextPage && !isLoading && !isError && rows.length > 0 && (
          <>
            <div ref={sentinelRef} aria-hidden="true" className="h-1" />
            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-3 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>
          {rows.length} commande{rows.length !== 1 ? 's' : ''}
          {hasNextPage && <span className="text-muted-foreground/70"> (faire défiler pour charger plus)</span>}
        </span>
        {!isEditing && (
          <Button size="sm" variant="ghost" onClick={onNew} className="text-accent hover:text-accent hover:bg-accent/10">
            <Plus className="h-3.5 w-3.5 mr-1" />Nouvelle
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Center: Detail Header ──────────────────────────────

function DetailHeader({
  commande, isLoading, isEditing,
  onStartEdit, onCancelEdit, onSave, isSaving,
  onDelete, onPrintClick, onEmailClick,
}: {
  commande: CommandeDetail | null
  isLoading: boolean
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  isSaving: boolean
  onDelete: () => void
  onPrintClick: () => void
  onEmailClick: () => void
}) {
  if (!commande && !isLoading) return null

  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center', isEditing ? 'bg-accent/15' : 'icon-box-gold')}>
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          ) : (
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-heading font-bold tracking-tight truncate">
                N° {commande?.IDcommande_sous_traitant}
                <span className="text-muted-foreground font-normal"> · {commande?.sous_traitant_nom || '—'}</span>
              </h1>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!!commande?.sous_traitant_type && (
                  <Badge variant="secondary" className="text-xs">{commande.sous_traitant_type}</Badge>
                )}
                {commande?.date_commande && (
                  <Badge variant="secondary" className="text-xs">{formatHfsqlDate(commande.date_commande)}</Badge>
                )}
                {isEditing && (
                  <Badge className="bg-accent text-accent-foreground gap-1 shadow-sm">
                    <Pencil className="h-3 w-3" />Mode edition
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
        {!isLoading && commande && (
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
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
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
                <Button variant="gold" size="sm" onClick={onStartEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />Modifier
                </Button>
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
  commande, isLoading, hasSelection, isEditing, onMutationSuccess, onLinesDirtyChange, piecesDrawerLineId, onOpenPiecesDrawer,
}: {
  commande: CommandeDetail | null
  isLoading: boolean
  hasSelection: boolean
  isEditing: boolean
  onMutationSuccess: () => void
  onLinesDirtyChange: (dirty: boolean) => void
  piecesDrawerLineId: number | null
  onOpenPiecesDrawer: (lineId: number | null) => void
}) {
  if (!hasSelection) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="icon-box-gold h-16 w-16 mx-auto"><Building2 className="h-8 w-8" /></div>
        <p className="text-muted-foreground text-sm">Sélectionnez une commande dans la liste</p>
      </div>
    </div>
  )
  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
  if (!commande) return null

  // Nominal projection (qty × prix) and actual (attached kg × prix). The
  // line cards show both; the footer surfaces the actual € total because
  // that's what will actually be billed.
  const totalQte = commande.lignes.reduce((s, l) => s + (l.quantite != null ? Number(l.quantite) : 0), 0)
  const totalKgEcru = commande.lignes.reduce((s, l) => s + (Number(l.total_kg_ecru_lie) || 0), 0)
  const totalMetrageFini = commande.lignes.reduce((s, l) => s + (Number(l.total_metrage_fini_recu) || 0), 0)
  const totalEurReal = commande.lignes.reduce(
    (s, l) => s + ((Number(l.total_kg_ecru_lie) || 0) * (Number(l.prix) || 0)),
    0,
  )

  return (
    <LignesSection
      commande={commande}
      isEditing={isEditing}
      totalQte={totalQte}
      totalKgEcru={totalKgEcru}
      totalMetrageFini={totalMetrageFini}
      totalEurReal={totalEurReal}
      onMutationSuccess={onMutationSuccess}
      onLinesDirtyChange={onLinesDirtyChange}
      piecesDrawerLineId={piecesDrawerLineId}
      onOpenPiecesDrawer={onOpenPiecesDrawer}
    />
  )
}

// ── Center: Lignes Section ─────────────────────────────

function LignesSection({
  commande, isEditing, totalQte, totalKgEcru, totalMetrageFini, totalEurReal,
  onMutationSuccess, onLinesDirtyChange, piecesDrawerLineId, onOpenPiecesDrawer,
}: {
  commande: CommandeDetail
  isEditing: boolean
  totalQte: number
  totalKgEcru: number
  totalMetrageFini: number
  totalEurReal: number
  onMutationSuccess: () => void
  onLinesDirtyChange: (dirty: boolean) => void
  piecesDrawerLineId: number | null
  onOpenPiecesDrawer: (lineId: number | null) => void
}) {
  const [editingLineId, setEditingLineId] = useState<number | null>(null)
  const [showLineForm, setShowLineForm] = useState(false)
  const [deleteLineConfirmId, setDeleteLineConfirmId] = useState<number | null>(null)
  // For ennoblisseur lines, IDreference holds an IDref_fini (the desired
  // dyed/finished reference). The drawer maps fini → écru via ref_fini.IDref_ecru
  // when offering compatible greige rolls.
  const [lineForm, setLineForm] = useState({
    IDreference: 0,
    IDColoris: 0,
    quantite: '',
    prix: '',
    date_livraison: '',
  })

  const linesLocked = commande.est_soldee === 1
  const isEnnoblisseur = isEnnoblisseurType(commande.sous_traitant_type)

  useEffect(() => {
    if (!isEditing || linesLocked) {
      setEditingLineId(null)
      setShowLineForm(false)
    }
  }, [isEditing, linesLocked])

  useEffect(() => {
    onLinesDirtyChange(showLineForm || editingLineId !== null)
  }, [showLineForm, editingLineId, onLinesDirtyChange])

  // Phase 1: ennoblisseur line picker is a flat list of ref_fini. Other
  // line types can't add lines (the affordance is hidden) but existing
  // lines render as-is via their resolved labels.
  const { data: refLookup } = useQuery<RefFiniLookup[]>({
    queryKey: ['commande-sst-refs-fini'],
    queryFn: () => apiFetch('/commandes-sous-traitant/lookups/refs-fini'),
    enabled: isEditing && isEnnoblisseur,
  })

  const createLineMut = useMutation({
    mutationFn: () => apiFetch(`/commandes-sous-traitant/${commande.IDcommande_sous_traitant}/lignes`, {
      method: 'POST',
      body: JSON.stringify({
        IDreference: lineForm.IDreference,
        // IDColoris on a fini line points at ref_fini_colori (the legacy
        // table — see commandes-sous-traitant.ts /lookups/colori-fini).
        IDColoris: lineForm.IDColoris,
        quantite: Number(lineForm.quantite) || 0,
        prix: Number(lineForm.prix) || 0,
        // unite=0 → "Ml" (mètre linéaire), the only unit ennoblisseur
        // commandes use in Phase 1.
        unite: 0,
        date_livraison: inputDateToHfsql(lineForm.date_livraison),
      }),
    }),
    onSuccess: () => { onMutationSuccess(); resetLineForm() },
  })

  const updateLineMut = useMutation({
    mutationFn: (lineId: number) => apiFetch(`/commandes-sous-traitant/lignes/${lineId}`, {
      method: 'PUT',
      body: JSON.stringify({
        IDreference: lineForm.IDreference,
        IDColoris: lineForm.IDColoris,
        quantite: Number(lineForm.quantite) || 0,
        prix: Number(lineForm.prix) || 0,
        date_livraison: inputDateToHfsql(lineForm.date_livraison),
      }),
    }),
    onSuccess: () => { onMutationSuccess(); setEditingLineId(null); resetLineForm() },
  })

  const deleteLineMut = useMutation({
    mutationFn: (lineId: number) => apiFetch(`/commandes-sous-traitant/lignes/${lineId}`, { method: 'DELETE' }),
    onSuccess: onMutationSuccess,
  })

  const toggleLineSstatutMut = useMutation({
    mutationFn: ({ lineId, sstatut }: { lineId: number; sstatut: string }) =>
      apiFetch(`/commandes-sous-traitant/lignes/${lineId}`, {
        method: 'PUT',
        body: JSON.stringify({ sstatut }),
      }),
    onSuccess: onMutationSuccess,
  })

  const resetLineForm = () => {
    setLineForm({ IDreference: 0, IDColoris: 0, quantite: '', prix: '', date_livraison: '' })
    setShowLineForm(false)
  }

  // HFSQL stores quantites as float32 — round-trip via String() leaks digits
  // like "36,20000076293945". Format to a clean decimal for the input.
  const fmtNumberInput = (v: number | null | undefined): string => {
    if (v == null) return ''
    const n = Number(v)
    if (Number.isNaN(n)) return ''
    // Up to 2 decimals, trim trailing zeros and a dangling dot.
    return n.toFixed(2).replace(/\.?0+$/, '')
  }

  const startEditLine = (l: LigneCommande) => {
    setShowLineForm(false)
    setEditingLineId(l.IDligne_commande_sous_traitant)
    setLineForm({
      IDreference: l.IDreference ?? 0,
      IDColoris: l.IDColoris ?? 0,
      quantite: fmtNumberInput(l.quantite),
      prix: fmtNumberInput(l.prix),
      date_livraison: hfsqlDateToInput(l.date_livraison),
    })
  }

  const startAddLine = () => {
    setEditingLineId(null)
    setLineForm({ IDreference: 0, IDColoris: 0, quantite: '', prix: '', date_livraison: '' })
    setShowLineForm(true)
  }

  // Pieces drawer is only available for ennoblisseur sous-traitants in Phase 1.
  const drawerOpen = piecesDrawerLineId !== null && !isEditing && isEnnoblisseur
  const drawerLigne = drawerOpen
    ? commande.lignes.find((l) => l.IDligne_commande_sous_traitant === piecesDrawerLineId) ?? null
    : null

  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col">
        <div
          className={cn(
            'overflow-auto space-y-2 p-1 scrollbar-transparent',
            drawerOpen ? 'flex-shrink-0 max-h-[40%]' : 'flex-1 min-h-0'
          )}
        >
          {commande.lignes.length === 0 && !showLineForm ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FiniRollIcon className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">Aucune ligne</p>
              {isEditing && !linesLocked && isEnnoblisseur && (
                <Button variant="outline" size="sm" className="mt-3" onClick={startAddLine}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Ajouter une ligne
                </Button>
              )}
              {isEditing && !linesLocked && !isEnnoblisseur && (
                <p className="text-[11px] text-muted-foreground italic mt-3 max-w-xs text-center">
                  L'ajout de ligne n'est disponible pour ce type de sous-traitant qu'à partir de la phase 2.
                </p>
              )}
            </div>
          ) : (
            commande.lignes.map((l) => {
              if (isEditing && editingLineId === l.IDligne_commande_sous_traitant) {
                return (
                  <InlineForm
                    key={l.IDligne_commande_sous_traitant}
                    title="Modifier la ligne"
                    onSave={() => updateLineMut.mutate(l.IDligne_commande_sous_traitant)}
                    onCancel={() => { setEditingLineId(null); resetLineForm() }}
                    isSaving={updateLineMut.isPending}
                  >
                    <LineFormFields
                      form={lineForm}
                      setForm={setLineForm}
                      refsFini={refLookup ?? []}
                      editable={isEnnoblisseur}
                      autoPricing={commande.auto_pricing_enabled}
                    />
                  </InlineForm>
                )
              }
              return (
                <LineCard
                  key={l.IDligne_commande_sous_traitant}
                  line={l}
                  isEditing={isEditing}
                  linesLocked={linesLocked}
                  isEnnoblisseur={isEnnoblisseur}
                  isDrawerOpen={piecesDrawerLineId === l.IDligne_commande_sous_traitant}
                  onEdit={() => startEditLine(l)}
                  onDelete={() => setDeleteLineConfirmId(l.IDligne_commande_sous_traitant)}
                  onToggleSstatut={() => toggleLineSstatutMut.mutate({
                    lineId: l.IDligne_commande_sous_traitant,
                    sstatut: isLineDone(l.sstatut) ? SSTATUT_OPEN : SSTATUT_DONE,
                  })}
                  onOpenDrawer={onOpenPiecesDrawer}
                />
              )
            })
          )}

          {isEditing && !linesLocked && isEnnoblisseur && showLineForm && (
            <InlineForm
              title="Nouvelle ligne"
              onSave={() => createLineMut.mutate()}
              onCancel={resetLineForm}
              isSaving={createLineMut.isPending}
            >
              <LineFormFields
                form={lineForm}
                setForm={setLineForm}
                refsFini={refLookup ?? []}
                editable={true}
                autoPricing={commande.auto_pricing_enabled}
              />
            </InlineForm>
          )}

          {isEditing && !linesLocked && isEnnoblisseur && commande.lignes.length > 0 && !showLineForm && editingLineId === null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={startAddLine}
              className="w-full text-muted-foreground hover:text-accent hover:bg-accent/5 border border-dashed border-border/60 hover:border-accent/40"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />Ajouter une ligne
            </Button>
          )}
        </div>

        {drawerOpen && drawerLigne && (
          <div className="flex-1 min-h-0 flex flex-col mt-3 rounded-lg border border-border/60 overflow-hidden bg-zinc-50/80 animate-in slide-in-from-bottom-4 fade-in-0 duration-200">
            <PiecesDrawer
              commandeId={commande.IDcommande_sous_traitant}
              ligne={drawerLigne}
              commandeSoldee={commande.est_soldee === 1}
              onClose={() => onOpenPiecesDrawer(null)}
              onSuccess={onMutationSuccess}
            />
          </div>
        )}

        {commande.lignes.length > 0 && (
          <div className="flex-shrink-0 mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-sm font-medium">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">
              Total · {commande.lignes.length} ligne{commande.lignes.length > 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-4 tabular-nums">
              <span className="text-muted-foreground text-xs">Prévu {fmtNum(totalQte, 1)} Ml</span>
              {totalKgEcru > 0 && (
                <span className="text-muted-foreground text-xs">
                  · {fmtNum(totalKgEcru, 1)} kg affectés
                </span>
              )}
              {totalMetrageFini > 0 && (
                <span className="text-green-700 text-xs">
                  · {fmtNum(totalMetrageFini, 1)} Ml reçus
                </span>
              )}
              <span className="text-accent text-base">{fmtNum(totalEurReal, 2)} €</span>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteLineConfirmId !== null}
        title="Supprimer la ligne"
        description="Cette ligne sera supprimée et les rouleaux écru affectés seront libérés."
        confirmLabel="Supprimer"
        isPending={deleteLineMut.isPending}
        onCancel={() => setDeleteLineConfirmId(null)}
        onConfirm={() => {
          if (deleteLineConfirmId !== null) {
            deleteLineMut.mutate(deleteLineConfirmId, {
              onSuccess: () => setDeleteLineConfirmId(null),
            })
          }
        }}
      />
    </>
  )
}

function LineCard({
  line, isEditing, linesLocked, isEnnoblisseur, isDrawerOpen, onEdit, onDelete, onToggleSstatut, onOpenDrawer,
}: {
  line: LigneCommande
  isEditing: boolean
  linesLocked: boolean
  isEnnoblisseur: boolean
  isDrawerOpen: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleSstatut: () => void
  onOpenDrawer: (lineId: number | null) => void
}) {
  const { border, iconBg, iconColor } = lineEtatColors(line.sstatut)
  const prix = Number(line.prix) || 0
  const qty = Number(line.quantite) || 0
  const totalKgEcru = Number(line.total_kg_ecru_lie) || 0
  const totalMetrageFini = Number(line.total_metrage_fini_recu) || 0
  // Actual € total: sum of attached écru weight × prix/kg. Falls back to 0
  // (and we hide the line) until the user attaches at least one roll.
  const totalEur = totalKgEcru * prix
  // Ml potentiel = kg écru affecté × rendement (Ml/kg from ref_fini).
  // A pre-réception estimate of how much fini the order should yield, used
  // to flag under/over-orders before the worker even starts dyeing.
  const rendement = Number(line.ref_rendement) || 0
  const mlPotentiel = totalKgEcru > 0 && rendement > 0 ? totalKgEcru * rendement : 0
  // Tolerance bands vs the ordered Ml. Green is "ideal yield" (between qty
  // and +5%), amber is "within tolerance" (qty-5% to qty+10% but outside the
  // green sweet spot), red is everything else. null = undecidable (no qty
  // or no rendement).
  //
  // Comparison is done on values rounded to 1 decimal (the display
  // precision) so the colour always matches what the user reads on the
  // card. Without this, e.g. potentiel=38.38 vs qty=38.40 — both shown as
  // "38,4 Ml" — falls into the amber band by 0.02 Ml of float noise, even
  // though the user reads two identical numbers and expects green.
  const potentielStatus: 'green' | 'amber' | 'red' | null = (() => {
    if (qty <= 0 || mlPotentiel <= 0) return null
    const pR = Math.round(mlPotentiel * 10) / 10
    const qR = Math.round(qty * 10) / 10
    if (qR <= 0) return null
    if (pR >= qR && pR <= qR * 1.05) return 'green'
    if (pR > qR * 0.95 && pR < qR * 1.10) return 'amber'
    return 'red'
  })()
  const clickable = !isEditing && isEnnoblisseur

  // "Délai initial" indicator: HFSQL stores YYYYMMDD; show only when rescheduled.
  const dateDelaiRaw = line.date_delai && /^\d{8}$/.test(line.date_delai) ? line.date_delai : ''
  const dateLivRaw = line.date_livraison && /^\d{8}$/.test(line.date_livraison) ? line.date_livraison : ''
  const showDelaiInitial = !!dateDelaiRaw && !!dateLivRaw && dateDelaiRaw !== dateLivRaw

  return (
    <div
      className={cn(
        'group rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3',
        border,
        clickable && 'cursor-pointer hover:bg-zinc-100 hover:border-accent/40 transition-colors',
        isDrawerOpen && 'ring-1 ring-accent bg-accent/[0.06] border-accent/50'
      )}
      onClick={clickable ? () => onOpenDrawer(isDrawerOpen ? null : line.IDligne_commande_sous_traitant) : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0', iconBg)}>
            <FiniRollIcon className={cn('h-6 w-6', iconColor)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {line.ref_label || '—'}
              {line.colori_reference ? <span className="text-muted-foreground"> / {line.colori_reference}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <LineSstatutBadge sstatut={line.sstatut} />
          {isEditing && !linesLocked && (
            <div className="flex gap-0.5">
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                onClick={(e) => { e.stopPropagation(); onToggleSstatut() }}
                title={isLineDone(line.sstatut) ? 'Marquer en cours' : 'Marquer terminée'}
              >
                {isLineDone(line.sstatut) ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              </Button>
              {isEnnoblisseur && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onEdit() }}>
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete() }}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
      {/* Production metrics: Quantité commandée + Prix unitaire are two
          independent inputs (the employee enters them separately at
          line-creation), so they get their own rows. Then Affecté (kg +
          potentiel Ml + €) and Reçu (actual Ml) appear as work progresses.
          Each row is conditional on its values existing. */}
      {/* Production metrics grid. Each row is intentionally one line tall
          (label + value + right-aligned context) so vertical rhythm is
          uniform — past versions stacked Livraison + Délai initial in the
          right column of the Quantité row, which inflated that row to
          ~32px while the others stayed ~20px and made the gap to "Prix
          unit." feel off. The Délai initial reminder now sits inline next
          to Livraison as a small italic parenthetical.

          The line's € total (kg × prix) lives in its own footer row at
          the bottom with a thin top divider — it's a SUMMARY of all the
          metrics above, not a piece of the Affecté row. */}
      <div className="mt-1.5 ml-12 space-y-1.5 text-sm tabular-nums">
        {/* Quantité commandée — nominal Ml. The right side carries the
            Livraison date; if a rescheduled date exists, the original
            "(initial: ...)" date appears inline so this row stays a
            single line. */}
        {(qty > 0 || dateLivRaw) && (
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground/80 w-24 flex-shrink-0">Quantité</span>
            <span className="text-foreground">
              {qty > 0 ? `${fmtNum(qty, 1)} Ml` : '—'}
            </span>
            {dateLivRaw && (() => {
              const lineUrgency = deliveryUrgency(dateLivRaw, isLineDone(line.sstatut) ? 1 : 0)
              return (
                <span
                  className={cn(
                    'ml-auto flex items-baseline gap-2',
                    lineUrgency === 'late' ? 'text-red-600'
                      : lineUrgency === 'soon' ? 'text-amber-600'
                      : 'text-foreground'
                  )}
                >
                  <span className="font-medium">Livraison {formatHfsqlDate(dateLivRaw)}</span>
                  {showDelaiInitial && (
                    <span className="text-xs italic text-muted-foreground">
                      (initial: {formatHfsqlDate(dateDelaiRaw)})
                    </span>
                  )}
                </span>
              )
            })()}
          </div>
        )}
        {/* Prix unitaire — independent value, €/Kg of finished fabric. */}
        {prix > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground/80 w-24 flex-shrink-0">Prix unit.</span>
            <span className="text-foreground">{fmtNum(prix, 2)} €/Kg</span>
            <PrixBreakdownInfo
              commandeId={line.IDcommande_sous_traitant}
              ligneId={line.IDligne_commande_sous_traitant}
            />
          </div>
        )}
        {/* Affecté — once écru is linked. Total kg + derived potentiel
            Ml (green/amber/red vs ordered Ml). The € total is no longer
            on this row — it has its own footer line below. */}
        {totalKgEcru > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground/80 w-24 flex-shrink-0">Affecté</span>
            <span className="text-foreground">{fmtNum(totalKgEcru, 1)} kg</span>
            {mlPotentiel > 0 && (
              <span
                className={cn(
                  'font-medium',
                  potentielStatus === 'green' && 'text-green-700',
                  potentielStatus === 'amber' && 'text-amber-600',
                  potentielStatus === 'red' && 'text-red-600',
                  potentielStatus === null && 'text-muted-foreground',
                )}
                title={qty > 0 ? `Commandé : ${fmtNum(qty, 1)} Ml` : undefined}
              >
                ~ {fmtNum(mlPotentiel, 1)} Ml
              </span>
            )}
          </div>
        )}
        {/* Reçu — once fini rolls have come back. The optional tolerance
            badge compares the received metrage to the ordered Ml: green
            inside ±5 %, red outside. Hidden when qty is 0 (can't compute
            a percentage against a zero baseline). */}
        {totalMetrageFini > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground/80 w-24 flex-shrink-0">Reçu</span>
            <span className="font-medium text-green-700">{fmtNum(totalMetrageFini, 1)} Ml</span>
            {qty > 0 && (() => {
              const diffPct = (totalMetrageFini - qty) / qty * 100
              const withinTolerance = Math.abs(diffPct) <= 5
              const sign = diffPct >= 0 ? '+' : '−'
              return (
                <span
                  className={cn(
                    'text-xs font-medium',
                    withinTolerance ? 'text-green-700' : 'text-red-600',
                  )}
                  title={`Commandé : ${fmtNum(qty, 1)} Ml`}
                >
                  ({sign}{fmtNum(Math.abs(diffPct), 1)} %)
                </span>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Prix unit. tooltip — breakdown of the auto-calc ────

interface PrixBreakdownData {
  enabled: true
  sst_nom: string
  teinture_nom: string | null
  traitement_names: Record<string, string>
  breakdown: {
    IDsous_traitant: number
    xPoids: number
    rendement: number
    avec_teinture: number
    IDteinture: number
    matel_multiplier: number
    base:
      | { kind: 'combination'; IDtranche: number; covered: number[]; raw_prix: number; applied_prix: number }
      | { kind: 'dye-only'; IDtranche: number; IDteinture: number; raw_prix: number; applied_prix: number }
      | null
    treatments: Array<{
      IDtraitement: number
      IDtranche: number
      raw_prix: number
      applied_prix: number
      matel_applied: boolean
    }>
    unpriced_treatments: number[]
    total: number
  }
}
type PrixBreakdownResponse = PrixBreakdownData | { enabled: false; reason: string }

function PrixBreakdownInfo({ commandeId, ligneId }: { commandeId: number; ligneId: number }) {
  const [hovering, setHovering] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Position the portal popover above the icon — fixed coordinates from
  // the trigger's bounding rect. We compute on hover-in (not on every
  // render) so it stays anchored even if a parent container scrolls.
  useEffect(() => {
    if (!hovering) { setPos(null); return }
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Open above the icon, horizontally aligned to its left edge so the
    // 280px popover doesn't overflow the right side of narrow cards.
    setPos({ top: r.top - 8, left: r.left })
  }, [hovering])

  const { data, isLoading } = useQuery<PrixBreakdownResponse>({
    queryKey: ['commande-sst-prix-breakdown', commandeId, ligneId],
    queryFn: () => apiFetch(`/commandes-sous-traitant/${commandeId}/lignes/${ligneId}/prix-breakdown`),
    enabled: hovering,
    staleTime: 30_000,
  })

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setHovering(true)}
        onBlur={() => setHovering(false)}
        onClick={(e) => e.stopPropagation()}
        className="text-muted-foreground/60 hover:text-accent transition-colors cursor-help"
        aria-label="Voir le détail du calcul"
      >
        <Info className="h-3 w-3" />
      </button>
      {hovering && pos && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}
          className="z-50 w-[300px] rounded-md border bg-popover shadow-lg p-3 text-[11px] text-popover-foreground animate-in fade-in-0 zoom-in-95 pointer-events-none"
          role="tooltip"
        >
          <PrixBreakdownContent data={data} isLoading={isLoading} />
        </div>,
        document.body,
      )}
    </>
  )
}

function PrixBreakdownContent({ data, isLoading }: { data: PrixBreakdownResponse | undefined; isLoading: boolean }) {
  if (isLoading || !data) {
    return <p className="text-muted-foreground">Chargement…</p>
  }
  if (!data.enabled) {
    const reasons: Record<string, string> = {
      'not-ennoblisseur': 'Ligne non-ennoblisseur (saisie manuelle).',
      'no-tariff-data': 'Aucun tarif catalogue pour ce sous-traitant — prix saisi manuellement.',
      'no-weight': 'Aucun rouleau écru affecté.',
    }
    return <p className="text-muted-foreground italic">{reasons[data.reason] ?? 'Calcul indisponible.'}</p>
  }
  const { sst_nom, teinture_nom, traitement_names, breakdown: bd } = data
  const showMatelLine = bd.matel_multiplier !== 1
  return (
    <div className="space-y-2 tabular-nums">
      {/* Header: sst + weight + (matel multiplier when applicable) */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/60">
        <span className="font-semibold text-foreground">{sst_nom}</span>
        <span className="text-muted-foreground">{fmtNum(bd.xPoids, 1)} kg</span>
      </div>
      {showMatelLine && (
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Multiplicateur Matel</span>
          <span>rendement {fmtNum(bd.rendement, 2)} → ×{fmtNum(bd.matel_multiplier, 2)}</span>
        </div>
      )}
      {/* Base price */}
      {!!bd.base && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80">Base</p>
          {bd.base.kind === 'dye-only' && (
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-foreground">{teinture_nom ?? `Teinture #${bd.base.IDteinture}`}</span>
              <span className="text-foreground font-medium">
                {bd.base.raw_prix === bd.base.applied_prix
                  ? `${fmtNum(bd.base.raw_prix, 2)} €`
                  : `${fmtNum(bd.base.raw_prix, 2)} × ${fmtNum(bd.matel_multiplier, 2)} = ${fmtNum(bd.base.applied_prix, 2)} €`}
              </span>
            </div>
          )}
          {bd.base.kind === 'combination' && (
            <div className="flex items-start justify-between mt-0.5 gap-2">
              <span className="text-foreground">
                Combinaison ({bd.base.covered.map((id) => traitement_names[id] || `#${id}`).join(', ')})
              </span>
              <span className="text-foreground font-medium flex-shrink-0">{fmtNum(bd.base.applied_prix, 2)} €</span>
            </div>
          )}
        </div>
      )}
      {/* Remaining treatments */}
      {bd.treatments.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80">Traitements</p>
          <div className="space-y-0.5 mt-0.5">
            {bd.treatments.map((t) => (
              <div key={t.IDtraitement} className="flex items-center justify-between">
                <span className="text-foreground">
                  {traitement_names[t.IDtraitement] || `#${t.IDtraitement}`}
                  {t.matel_applied && (
                    <span className="ml-1 text-[9px] uppercase tracking-wide text-accent">×Matel</span>
                  )}
                </span>
                <span className="text-foreground font-medium">
                  {t.matel_applied
                    ? `${fmtNum(t.raw_prix, 2)} × ${fmtNum(bd.matel_multiplier, 2)} = ${fmtNum(t.applied_prix, 2)} €`
                    : `${fmtNum(t.applied_prix, 2)} €`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Unpriced — shouldn't usually happen but worth surfacing for catalog gaps */}
      {bd.unpriced_treatments.length > 0 && (
        <p className="text-[10px] text-amber-700 italic">
          Tarif manquant pour : {bd.unpriced_treatments.map((id) => traitement_names[id] || `#${id}`).join(', ')}
        </p>
      )}
      {/* Total */}
      <div className="flex items-center justify-between pt-1.5 border-t border-border/60">
        <span className="font-semibold text-foreground">Total</span>
        <span className="font-semibold text-foreground">{fmtNum(bd.total, 2)} €/Kg</span>
      </div>
    </div>
  )
}

// ── Pieces drawer (ennoblisseur-only) ──────────────────

function PiecesDrawer({
  commandeId, ligne, commandeSoldee, onClose, onSuccess,
}: {
  commandeId: number
  ligne: LigneCommande
  /** True when the parent commande is `est_soldee = 1` (terminée). In
   *  that state the drawer is read-only: we hide the "+ Affecter" and
   *  "+ Réceptionner" trigger buttons so the user can't mutate a closed
   *  commande's pieces. (The detail-header status footer is the only
   *  legitimate path back to en-cours.) */
  commandeSoldee: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const queryKey = ['commande-sst-pieces', commandeId, ligne.IDligne_commande_sous_traitant] as const

  const { data, isLoading, isError } = useQuery<PiecesPayload>({
    queryKey,
    queryFn: () => apiFetch(`/commandes-sous-traitant/${commandeId}/lignes/${ligne.IDligne_commande_sous_traitant}/pieces`),
  })

  // Patch the commande detail cache so the LineCard re-renders with the
  // freshly-recalculated prix without waiting for a refetch. The parent's
  // `onSuccess()` callback still fires after, which invalidates the detail
  // query — so if the patch ever drifts from server truth, the next
  // refetch corrects it.
  const patchLinePrix = (newPrix: number) => {
    queryClient.setQueryData<CommandeDetail | undefined>(['commande-sst', commandeId], (old) => {
      if (!old) return old
      return {
        ...old,
        lignes: old.lignes.map((l) =>
          l.IDligne_commande_sous_traitant === ligne.IDligne_commande_sous_traitant
            ? { ...l, prix: newPrix }
            : l,
        ),
      }
    })
  }

  const linkEcruMut = useMutation({
    mutationFn: (stockEcruId: number) => apiFetch(
      `/commandes-sous-traitant/${commandeId}/lignes/${ligne.IDligne_commande_sous_traitant}/pieces/ecru/${stockEcruId}`,
      { method: 'PUT' }
    ),
    onSuccess: (payload: PiecesPayload) => {
      queryClient.setQueryData(queryKey, payload)
      patchLinePrix(payload.prix)
      onSuccess()
    },
  })

  const unlinkEcruMut = useMutation({
    mutationFn: (stockEcruId: number) => apiFetch(
      `/commandes-sous-traitant/${commandeId}/lignes/${ligne.IDligne_commande_sous_traitant}/pieces/ecru/${stockEcruId}`,
      { method: 'DELETE' }
    ),
    onSuccess: (payload: PiecesPayload) => {
      queryClient.setQueryData(queryKey, payload)
      patchLinePrix(payload.prix)
      onSuccess()
    },
  })

  const deleteFiniMut = useMutation({
    mutationFn: (stockFiniId: number) => apiFetch(
      `/commandes-sous-traitant/${commandeId}/lignes/${ligne.IDligne_commande_sous_traitant}/pieces/fini/${stockFiniId}`,
      { method: 'DELETE' }
    ),
    onSuccess: (payload: PiecesPayload) => {
      queryClient.setQueryData(queryKey, payload)
      onSuccess()
    },
  })

  const [deleteFiniConfirm, setDeleteFiniConfirm] = useState<StockFiniLite | null>(null)
  const [showReceptionForm, setShowReceptionForm] = useState(false)
  const [showLinkEcruDialog, setShowLinkEcruDialog] = useState(false)
  const [activeTab, setActiveTab] = useState<'affectes' | 'reception'>('reception')

  const ecruLinked = data?.ecruLinked ?? []
  const ecruAvailable = data?.ecruAvailable ?? []
  const finiReceived = data?.finiReceived ?? []

  // Roll-up still used by the "Affectés" section header below the tab bar.
  const totalKgAffectes = ecruLinked.reduce((s, r) => s + (Number(r.poids) || 0), 0)
  const totalMlReception = finiReceived.reduce((s, r) => s + (Number(r.metrage) || 0), 0)

  const tabs = [
    { key: 'reception' as const, label: 'Réception', icon: FiniRollIcon },
    { key: 'affectes' as const, label: 'Affectés', icon: TmRollIcon },
  ]

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Tab bar lives in the existing top gray strip alongside the close X. */}
      <div className="flex-shrink-0 flex items-stretch border-b bg-zinc-200/50 pl-1">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px cursor-pointer',
                active
                  ? 'border-accent text-accent bg-white/60'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/30',
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span>{t.label}</span>
            </button>
          )
        })}
        <div className="ml-auto flex items-center pr-1">
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7" title="Fermer">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-transparent">
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center justify-center py-6 text-destructive">
            <AlertCircle className="h-6 w-6 mb-2" />
            <p className="text-sm">Erreur de chargement</p>
          </div>
        )}

        {!isLoading && !isError && activeTab === 'affectes' && (
          <>
            {/* Linked écru rolls */}
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Tombé métier — affectés ({ecruLinked.length}{ecruLinked.length > 0 ? ` · ${fmtNum(totalKgAffectes, 1)} kg` : ''})
                </h3>
                {!commandeSoldee && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-accent hover:text-accent hover:bg-accent/10"
                    onClick={() => setShowLinkEcruDialog(true)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Affecter
                  </Button>
                )}
              </div>
              {ecruLinked.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Aucun rouleau affecté.</p>
              ) : (() => {
                // An écru can only be retired from the affectation if no fini
                // roll has been received against it — once stock_fini exists
                // with IDstock_ecru pointing here, the link is locked in.
                const ecruIdsWithFini = new Set(
                  finiReceived.map((f) => f.IDstock_ecru).filter((id) => id > 0)
                )
                return (
                  <div className="space-y-1.5">
                    {ecruLinked.map((roll) => (
                      <EcruRollRow
                        key={roll.IDstock_ecru}
                        roll={roll}
                        action="unlink"
                        onAction={() => unlinkEcruMut.mutate(roll.IDstock_ecru)}
                        isBusy={unlinkEcruMut.isPending && unlinkEcruMut.variables === roll.IDstock_ecru}
                        hideAction={ecruIdsWithFini.has(roll.IDstock_ecru)}
                      />
                    ))}
                  </div>
                )
              })()}
            </section>
            {showLinkEcruDialog && (
              <LinkEcruDialog
                available={ecruAvailable}
                onBulkLink={async (ids) => {
                  for (const id of ids) {
                    await linkEcruMut.mutateAsync(id)
                  }
                }}
                onClose={() => setShowLinkEcruDialog(false)}
              />
            )}
          </>
        )}

        {!isLoading && !isError && activeTab === 'reception' && (
          <>
            {/* Réceptions finis */}
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Rouleaux finis reçus ({finiReceived.length}{finiReceived.length > 0 ? ` · ${fmtNum(totalMlReception, 1)} Ml` : ''})
                </h3>
                {!commandeSoldee && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-accent hover:text-accent hover:bg-accent/10"
                    onClick={() => setShowReceptionForm(true)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Réceptionner
                  </Button>
                )}
              </div>
              {finiReceived.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Aucun rouleau reçu pour le moment.</p>
              ) : (
                <div className="space-y-1.5">
                  {finiReceived.map((roll) => (
                    <FiniRollRow
                      key={roll.IDstock_fini}
                      roll={roll}
                      onDelete={() => setDeleteFiniConfirm(roll)}
                    />
                  ))}
                </div>
              )}
            </section>
            {showReceptionForm && (
              <ReceptionForm
                commandeId={commandeId}
                ligne={ligne}
                ecruLinked={ecruLinked}
                onCancel={() => setShowReceptionForm(false)}
                onCreated={(payload) => {
                  queryClient.setQueryData(queryKey, payload)
                  onSuccess()
                  setShowReceptionForm(false)
                }}
              />
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={deleteFiniConfirm !== null}
        title="Annuler la réception"
        description={deleteFiniConfirm
          ? `Le rouleau fini « ${deleteFiniConfirm.numero || `#${deleteFiniConfirm.IDstock_fini}`} » sera supprimé du stock. Cette action ne peut pas être annulée.`
          : undefined}
        confirmLabel="Supprimer"
        isPending={deleteFiniMut.isPending}
        onCancel={() => setDeleteFiniConfirm(null)}
        onConfirm={() => {
          if (deleteFiniConfirm) {
            deleteFiniMut.mutate(deleteFiniConfirm.IDstock_fini, {
              onSuccess: () => setDeleteFiniConfirm(null),
            })
          }
        }}
      />
    </div>
  )
}

function EcruRollRow({
  roll, action, onAction, isBusy, hideAction,
}: {
  roll: StockEcruLite
  action: 'link' | 'unlink'
  onAction: () => void
  isBusy: boolean
  /** When true, the action button is omitted entirely. Used for linked
   *  écru rolls that already have a received fini — at that point the
   *  affectation is locked. */
  hideAction?: boolean
}) {
  return (
    <div className="group rounded-lg border border-border/60 bg-white p-3 flex items-center gap-3">
      <div className="h-10 w-10 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0">
        <TmRollIcon className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">
            {roll.numero || `#${roll.IDstock_ecru}`}
          </span>
          {roll.lot && (
            <span className="text-xs text-muted-foreground truncate">· lot {roll.lot}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground tabular-nums">
          {Number(roll.poids) > 0 && (
            <span className="font-medium text-foreground">{fmtNum(Number(roll.poids), 1)} kg</span>
          )}
          {Number(roll.metrage) > 0 && (
            <span>{fmtNum(Number(roll.metrage), 1)} m</span>
          )}
          {roll.date_saisie && (
            <span>entré {formatHfsqlDate(roll.date_saisie)}</span>
          )}
        </div>
        <RollNotes
          secondChoix={Number(roll.second_choix) > 0}
          observations={[
            { label: null, text: roll.observations?.trim() ?? '' },
          ]}
          defects={roll.defects}
        />
      </div>
      {/* Client-reservation badge — pinned to the right end of the card,
          just before the action button, so it reads as a "tag" on the
          roll itself rather than a sub-detail of the title. */}
      {!!roll.client_nom && (
        <Badge
          variant="secondary"
          className="text-xs py-1 px-2 gap-1 flex-shrink-0"
          title="Rouleau réservé à ce client"
        >
          <Building2 className="h-3 w-3" />
          {roll.client_nom}
        </Badge>
      )}
      {!hideAction && (
        action === 'unlink' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive flex-shrink-0"
            onClick={onAction}
            disabled={isBusy}
            title="Retirer ce rouleau de l'affectation"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="default"
            onClick={onAction}
            disabled={isBusy}
            className="flex-shrink-0"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
            Affecter
          </Button>
        )
      )}
    </div>
  )
}

/** Shared notes block under a roll card. Two visual treatments:
 *
 *  1. `secondChoix = true` OR `defects` non-empty → loud red banner with
 *     an AlertTriangle icon, a "DÉFAUT" header, the structured defects
 *     (description + type + size when present) and the free-text
 *     observations all rendered inside the banner in red. The user
 *     must not miss this — a quality issue is the most important thing
 *     on the card.
 *
 *  2. No defects AND `secondChoix = false`, but at least one non-empty
 *     observation → muted italic lines with a MessageSquare icon so the
 *     note has visual weight without screaming.
 *
 *  Each `observation` can carry a `label` ("Visiteur", "Ennoblisseur" on
 *  fini rolls) that prefixes the text; pass `null` when there's only a
 *  single source (écru). Empty observations are filtered out.
 */
function RollNotes({
  secondChoix,
  observations,
  defects = [],
}: {
  secondChoix: boolean
  observations: Array<{ label: string | null; text: string }>
  defects?: DefautQualite[]
}) {
  const visibleObs = observations.filter((o) => o.text.length > 0)
  const hasDefects = defects.length > 0
  const isAlert = secondChoix || hasDefects
  if (!isAlert && visibleObs.length === 0) return null

  if (isAlert) {
    return (
      <div className="mt-2 flex items-start gap-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-red-600 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-red-700 leading-tight">
            Défaut{secondChoix ? ' · 2e choix' : ''}
          </p>
          {/* Structured defects from defaut_qualite — each gets its own
              bullet so multiple defects on the same roll are clearly
              separated. Description is the primary text; if missing we
              fall back to type_defaut + size to still surface something. */}
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
          {/* Free-text observations also rendered inside the banner. */}
          {visibleObs.map((o, i) => (
            <p key={`obs-${i}`} className="text-xs text-red-700 leading-snug italic">
              {o.label && (
                <span className="font-semibold not-italic text-red-800">{o.label} : </span>
              )}
              {o.text}
            </p>
          ))}
          {/* Edge: defect flag is on but neither defects nor obs exist. */}
          {!hasDefects && visibleObs.length === 0 && (
            <p className="text-xs text-red-700/80 italic">Sans description.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-1.5 space-y-0.5">
      {visibleObs.map((o, i) => (
        <p
          key={i}
          className="text-[11px] text-muted-foreground italic flex items-start gap-1.5 leading-snug"
        >
          <MessageSquare className="h-3 w-3 mt-0.5 opacity-60 flex-shrink-0" />
          <span>
            {o.label && (
              <span className="font-medium not-italic text-muted-foreground/80">{o.label} : </span>
            )}
            {o.text}
          </span>
        </p>
      ))}
    </div>
  )
}

function FiniRollRow({
  roll, onDelete,
}: {
  roll: StockFiniLite
  onDelete: () => void
}) {
  return (
    <div className="group rounded-lg border border-border/60 bg-white p-3 flex items-center gap-3">
      <div className="h-10 w-10 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
        <FiniRollIcon className="h-7 w-7 text-green-600" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">
            {roll.numero || `#${roll.IDstock_fini}`}
          </span>
          {roll.lot && (
            <span className="text-xs text-muted-foreground truncate">· lot {roll.lot}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground tabular-nums">
          {Number(roll.poids) > 0 && (
            <span className="font-medium text-foreground">{fmtNum(Number(roll.poids), 1)} kg</span>
          )}
          {Number(roll.metrage) > 0 && (
            <span>{fmtNum(Number(roll.metrage), 1)} m</span>
          )}
          {roll.date_saisie && (
            <span>reçu {formatHfsqlDate(roll.date_saisie)}</span>
          )}
        </div>
        <RollNotes
          secondChoix={Number(roll.second_choix) > 0}
          observations={[
            { label: 'Visiteur', text: roll.observations?.trim() ?? '' },
            { label: 'Ennoblisseur', text: roll.observation_sst?.trim() ?? '' },
          ]}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={onDelete}
        title="Annuler cette réception"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function ReceptionForm({
  commandeId, ligne, ecruLinked, onCancel, onCreated,
}: {
  commandeId: number
  ligne: LigneCommande
  ecruLinked: StockEcruLite[]
  onCancel: () => void
  onCreated: (payload: PiecesPayload) => void
}) {
  const [numero, setNumero] = useState('')
  const [lot, setLot] = useState('')
  const [poids, setPoids] = useState('')
  const [metrage, setMetrage] = useState('')
  const [idStockEcru, setIdStockEcru] = useState<number>(0)
  const [idRefFini, setIdRefFini] = useState<number>(0)
  const [idMagasin, setIdMagasin] = useState<number>(0)
  const [observations, setObservations] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: refsFini } = useQuery<RefFiniLookup[]>({
    queryKey: ['commande-sst-refs-fini'],
    queryFn: () => apiFetch('/commandes-sous-traitant/lookups/refs-fini'),
  })
  const { data: magasins } = useQuery<MagasinLite[]>({
    queryKey: ['commande-sst-magasins'],
    queryFn: () => apiFetch('/commandes-sous-traitant/lookups/magasins'),
  })

  const createMut = useMutation({
    mutationFn: (): Promise<PiecesPayload> => apiFetch(
      `/commandes-sous-traitant/${commandeId}/lignes/${ligne.IDligne_commande_sous_traitant}/pieces/fini`,
      {
        method: 'POST',
        body: JSON.stringify({
          numero,
          lot: lot || undefined,
          poids: Number(poids) || 0,
          metrage: Number(metrage) || 0,
          IDstock_ecru: idStockEcru || undefined,
          IDref_fini: idRefFini,
          // IDColoris is inherited server-side from the source écru's
          // IDcolori_ecru when IDstock_ecru is set.
          IDmagasin: idMagasin || undefined,
          observations: observations || undefined,
        }),
      },
    ),
    onSuccess: (payload: PiecesPayload) => onCreated(payload),
    onError: (err: Error) => setError(err.message || 'Erreur'),
  })

  const canSave = numero.trim().length > 0 && idRefFini > 0

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="max-w-lg" onClose={onCancel}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FiniRollIcon className="h-6 w-6 text-accent" />
            Nouvelle réception
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput label="N°" value={numero} onChange={setNumero} autoFocus />
            <LabeledInput label="Lot" value={lot} onChange={setLot} />
            <LabeledInput label="Poids (kg)" type="number" value={poids} onChange={setPoids} />
            <LabeledInput label="Métrage (m)" type="number" value={metrage} onChange={setMetrage} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Source écru (optionnel)</label>
            <PopoverSelect
              options={ecruLinked.map((r) => {
                const bits = [r.lot ? `lot ${r.lot}` : '', r.poids != null && Number(r.poids) > 0 ? `${fmtNum(Number(r.poids), 1)} kg` : '']
                  .filter(Boolean)
                  .join(' · ')
                return {
                  id: r.IDstock_ecru,
                  primary: r.numero || `#${r.IDstock_ecru}`,
                  secondary: bits || undefined,
                }
              })}
              value={idStockEcru}
              onChange={setIdStockEcru}
              emptyLabel="— Aucune source —"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Référence fini</label>
            <SearchableCombobox<RefFiniLookup>
              options={refsFini ?? []}
              value={idRefFini}
              onChange={setIdRefFini}
              getId={(r) => r.IDref_fini}
              getPrimary={(r) => r.ref_fini}
              getSecondary={(r) => r.designation || null}
              placeholder="Choisir une référence fini"
            />
            <p className="text-[10px] text-muted-foreground">
              Le coloris est repris automatiquement du rouleau écru source.
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Magasin</label>
            <PopoverSelect
              options={(magasins ?? []).map((m) => ({ id: m.IDmagasin, primary: m.nom }))}
              value={idMagasin}
              onChange={setIdMagasin}
              emptyLabel="—"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Observations</label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>
          {!!error && (
            <div className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span className="break-all">{error}</span>
            </div>
          )}
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onCancel}>Annuler</Button>
          <Button onClick={() => createMut.mutate()} disabled={!canSave || createMut.isPending}>
            {createMut.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LinkEcruDialog({
  available, onBulkLink, onClose,
}: {
  available: StockEcruLite[]
  onBulkLink: (ids: number[]) => Promise<void>
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [isLinking, setIsLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allSelected = available.length > 0 && selected.size === available.length
  const selectedTotalKg = available
    .filter((r) => selected.has(r.IDstock_ecru))
    .reduce((s, r) => s + (Number(r.poids) || 0), 0)

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(available.map((r) => r.IDstock_ecru)))
  }

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async () => {
    if (selected.size === 0 || isLinking) return
    setError(null)
    setIsLinking(true)
    try {
      await onBulkLink(Array.from(selected))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'affectation')
    } finally {
      setIsLinking(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !isLinking) onClose() }}>
      <DialogContent className="max-w-lg" onClose={isLinking ? undefined : onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-accent" />
            Affecter un tombé métier
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          {available.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm font-medium">Aucun rouleau disponible</p>
              <p className="text-xs mt-1">Aucun rouleau écru ne correspond à cette référence et coloris.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={toggleAll}
                  disabled={isLinking}
                  className="text-accent hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
                <span className="text-muted-foreground tabular-nums">
                  {selected.size} / {available.length}
                  {selected.size > 0 && ` · ${fmtNum(selectedTotalKg, 1)} kg`}
                </span>
              </div>
              <div className="space-y-1.5 max-h-[55vh] overflow-y-auto scrollbar-transparent p-0.5">
                {available.map((roll) => (
                  <SelectableEcruRow
                    key={roll.IDstock_ecru}
                    roll={roll}
                    selected={selected.has(roll.IDstock_ecru)}
                    onToggle={() => toggleOne(roll.IDstock_ecru)}
                    disabled={isLinking}
                  />
                ))}
              </div>
            </div>
          )}
          {!!error && (
            <div className="flex items-start gap-1.5 text-xs text-destructive mt-3">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span className="break-all">{error}</span>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={isLinking}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={selected.size === 0 || isLinking}>
            {isLinking ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Affectation...
              </>
            ) : (
              `Affecter${selected.size > 0 ? ` (${selected.size})` : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SelectableEcruRow({
  roll, selected, onToggle, disabled,
}: {
  roll: StockEcruLite
  selected: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'w-full rounded-lg border bg-white p-3 flex items-center gap-3 text-left transition-colors',
        selected
          ? 'border-accent ring-1 ring-accent bg-accent/[0.06]'
          : 'border-border/60 hover:border-accent/50 hover:bg-accent/[0.03]',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      <div className={cn(
        'h-5 w-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
        selected
          ? 'bg-accent border-accent text-accent-foreground'
          : 'bg-white border-input',
      )}>
        {selected && <Check className="h-3.5 w-3.5" />}
      </div>
      <div className="h-10 w-10 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0">
        <TmRollIcon className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">
            {roll.numero || `#${roll.IDstock_ecru}`}
          </span>
          {roll.lot && (
            <span className="text-xs text-muted-foreground truncate">· lot {roll.lot}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground tabular-nums">
          {Number(roll.poids) > 0 && (
            <span className="font-medium text-foreground">{fmtNum(Number(roll.poids), 1)} kg</span>
          )}
          {Number(roll.metrage) > 0 && (
            <span>{fmtNum(Number(roll.metrage), 1)} m</span>
          )}
          {roll.date_saisie && (
            <span>entré {formatHfsqlDate(roll.date_saisie)}</span>
          )}
        </div>
        <RollNotes
          secondChoix={Number(roll.second_choix) > 0}
          observations={[
            { label: null, text: roll.observations?.trim() ?? '' },
          ]}
          defects={roll.defects}
        />
      </div>
    </button>
  )
}

// ── Line form fields ──────────────────────────────────

function LineFormFields({
  form, setForm, refsFini, editable, autoPricing,
}: {
  form: { IDreference: number; IDColoris: number; quantite: string; prix: string; date_livraison: string }
  setForm: (f: typeof form) => void
  refsFini: RefFiniLookup[]
  editable: boolean
  /** When true (default), the Prix (€/Kg) input is read-only because the
   *  server is auto-managing it via recalcLignePrix. Pass `false` for
   *  out-of-catalog sous-traitants (e.g. FRANCE TEINTURE) where the algo
   *  has no opinion — the user types prix manually in that case. */
  autoPricing?: boolean
}) {
  const prixDisabled = autoPricing !== false
  // Coloris options for the picked ref_fini — `ref_fini_colori` rows whose
  // IDref_fini matches. The PK there (IDref_fini_colori) is what gets stored
  // in `ligne_commande_sous_traitant.IDColoris`.
  const { data: colorisOptions } = useQuery<Array<{ IDref_fini_colori: number; reference: string }>>({
    queryKey: ['commande-sst-colori-fini', form.IDreference],
    queryFn: () => apiFetch(`/commandes-sous-traitant/lookups/colori-fini?ref_fini=${form.IDreference}`),
    enabled: editable && form.IDreference > 0,
  })

  return (
    <>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Référence fini</label>
        <SearchableCombobox<RefFiniLookup>
          options={refsFini}
          value={form.IDreference}
          onChange={(id) => setForm({ ...form, IDreference: id, IDColoris: 0 })}
          getId={(r) => r.IDref_fini}
          getPrimary={(r) => r.ref_fini}
          getSecondary={(r) => r.designation || null}
          disabled={!editable}
          placeholder="Choisir une référence fini"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Coloris</label>
        <PopoverSelect
          options={(colorisOptions ?? []).map((c) => ({ id: c.IDref_fini_colori, primary: c.reference }))}
          value={form.IDColoris}
          onChange={(id) => setForm({ ...form, IDColoris: id })}
          disabled={!editable || form.IDreference === 0}
          emptyLabel={form.IDreference === 0 ? '— Choisir une référence d\'abord —' : '— Aucun —'}
        />
        <p className="text-[10px] text-muted-foreground">
          Le tombé métier écru à envoyer est sélectionné dans le tiroir « pièces ».
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <LabeledInput label="Quantité (Ml)" type="number" value={form.quantite} onChange={(v) => setForm({ ...form, quantite: v })} />
        {/* Prix is server-managed only when the sous-traitant has tariff
            data (`auto_pricing_enabled` on the commande detail). For
            out-of-catalog suppliers (FRANCE TEINTURE, etc.) the field
            stays editable so the user can enter a manual €/Kg. */}
        <LabeledInput
          label="Prix (€/Kg)"
          type="number"
          value={form.prix}
          onChange={(v) => setForm({ ...form, prix: v })}
          disabled={prixDisabled}
          helper={prixDisabled ? 'Calculé automatiquement à partir des rouleaux affectés.' : undefined}
        />
      </div>
      <LabeledInput label="Date livraison" type="date" value={form.date_livraison} onChange={(v) => setForm({ ...form, date_livraison: v })} />
    </>
  )
}

// ── Right Panel: Sidebar with Tabs ─────────────────────

type SidebarTab = 'info' | 'adresses' | 'docs'

function DetailSidebar({
  commande, isLoading, isEditing,
  editDateCommande, onEditDateCommandeChange,
  editCommentaire, onEditCommentaireChange,
  editJournal, onEditJournalChange,
  editIDAdresseSousTraitant, onEditIDAdresseSousTraitantChange,
  editIDAdresseLivraison, onEditIDAdresseLivraisonChange,
  onToggleEtat, isTogglingEtat,
}: {
  commande: CommandeDetail | null
  isLoading: boolean
  isEditing: boolean
  editDateCommande: string
  onEditDateCommandeChange: (v: string) => void
  editCommentaire: string
  onEditCommentaireChange: (v: string) => void
  editJournal: string
  onEditJournalChange: (v: string) => void
  editIDAdresseSousTraitant: number
  onEditIDAdresseSousTraitantChange: (v: number) => void
  editIDAdresseLivraison: number
  onEditIDAdresseLivraisonChange: (v: number) => void
  onToggleEtat: () => void
  isTogglingEtat: boolean
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('info')

  const { data: adresses } = useQuery<AdresseLookup[]>({
    queryKey: ['commande-sst-adresses', commande?.IDsous_traitant],
    queryFn: () => apiFetch(`/commandes-sous-traitant/lookups/adresses?sous_traitant=${commande?.IDsous_traitant}`),
    enabled: isEditing && !!commande?.IDsous_traitant,
  })

  if (isLoading) return (
    <div className="w-96 flex-shrink-0 bg-muted/30 rounded-xl border p-4 space-y-4">
      <div className="flex gap-2">
        <div className="h-8 flex-1 bg-muted animate-pulse rounded-md" />
        <div className="h-8 flex-1 bg-muted animate-pulse rounded-md" />
        <div className="h-8 flex-1 bg-muted animate-pulse rounded-md" />
      </div>
      {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
    </div>
  )
  if (!commande) return null

  // The Journal lives as a section *inside* the Info tab — no separate
  // tab. Keeps the sidebar three-tabbed and lets the user see commentaire
  // and journal entries side by side without flipping back and forth.
  const tabs: { key: SidebarTab; label: string; icon: React.ElementType }[] = [
    { key: 'info', label: 'Info', icon: Info },
    { key: 'adresses', label: 'Adresses', icon: MapPin },
    { key: 'docs', label: 'Docs', icon: FileText },
  ]

  return (
    <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
      <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
        <div className="flex border-b p-1 gap-1 rounded-t-xl bg-zinc-200/50">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  activeTab === tab.key
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent/10'
                )}
              >
                <Icon className="h-3.5 w-3.5" />{tab.label}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
          {activeTab === 'info' && (
            <InfoTab
              commande={commande}
              isEditing={isEditing}
              editDateCommande={editDateCommande}
              onEditDateCommandeChange={onEditDateCommandeChange}
              editCommentaire={editCommentaire}
              onEditCommentaireChange={onEditCommentaireChange}
              editJournal={editJournal}
              onEditJournalChange={onEditJournalChange}
            />
          )}
          {activeTab === 'adresses' && (
            <AdressesTab
              commande={commande}
              isEditing={isEditing}
              adresses={adresses ?? []}
              editIDAdresseSousTraitant={editIDAdresseSousTraitant}
              onEditIDAdresseSousTraitantChange={onEditIDAdresseSousTraitantChange}
              editIDAdresseLivraison={editIDAdresseLivraison}
              onEditIDAdresseLivraisonChange={onEditIDAdresseLivraisonChange}
            />
          )}
          {activeTab === 'docs' && (
            <DocsTab commande={commande} isEditing={isEditing} />
          )}
        </div>
      </div>
      <StatusFooter
        est_soldee={commande.est_soldee}
        onToggle={onToggleEtat}
        isToggling={isTogglingEtat}
        disabled={isEditing}
      />
    </div>
  )
}

// ── Sidebar Status Footer ──────────────────────────────

function StatusFooter({
  est_soldee, onToggle, isToggling, disabled,
}: {
  est_soldee: number | null
  onToggle: () => void
  isToggling: boolean
  disabled: boolean
}) {
  const isTerminee = est_soldee === 1
  const Icon = isTerminee ? CheckCircle2 : Clock
  const label = isTerminee ? 'Terminée' : 'En cours'
  const actionLabel = isTerminee ? 'Rouvrir' : 'Clôturer'
  const ActionIcon = isTerminee ? Clock : CheckCircle2

  return (
    <div
      className={cn(
        'flex-shrink-0 rounded-xl border shadow-sm overflow-hidden flex items-stretch h-11',
        isTerminee ? 'bg-success border-success' : 'bg-primary border-primary'
      )}
    >
      <div className="flex items-center gap-2 px-3 flex-1 text-white min-w-0">
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-bold uppercase tracking-wide truncate">{label}</span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled || isToggling}
        title={isTerminee ? 'Marquer en cours' : 'Marquer terminée'}
        className="px-3.5 bg-white/15 hover:bg-white/25 active:bg-white/30 disabled:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold border-l border-white/25 flex items-center gap-1.5 transition-colors"
      >
        <ActionIcon className="h-3.5 w-3.5" />
        {actionLabel}
      </button>
    </div>
  )
}

// ── Sidebar Tab: Info ──────────────────────────────────

function InfoTab({
  commande, isEditing,
  editDateCommande, onEditDateCommandeChange,
  editCommentaire, onEditCommentaireChange,
  editJournal, onEditJournalChange,
}: {
  commande: CommandeDetail
  isEditing: boolean
  editDateCommande: string
  onEditDateCommandeChange: (v: string) => void
  editCommentaire: string
  onEditCommentaireChange: (v: string) => void
  editJournal: string
  onEditJournalChange: (v: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className={cn('p-3 rounded-lg border bg-card shadow-sm space-y-2', isEditing && editSectionClass)}>
        <KV label="Sous-traitant" value={commande.sous_traitant_nom || '—'} />
        <KV label="Type" value={commande.sous_traitant_type ?? '—'} />
        {commande.sous_traitant_tel && (
          <KV label="Téléphone" value={commande.sous_traitant_tel} />
        )}
        <KV
          label="Date commande"
          value={isEditing ? (
            <input
              type="date"
              value={editDateCommande}
              onChange={(e) => onEditDateCommandeChange(e.target.value)}
              className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right"
            />
          ) : (commande.date_commande ? formatHfsqlDate(commande.date_commande) : '—')}
        />
      </div>

      <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />Commentaire
        </p>
        {isEditing ? (
          <textarea
            value={editCommentaire}
            onChange={(e) => onEditCommentaireChange(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
        ) : commande.commentaire?.trim() ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{commande.commentaire.trim()}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Aucun commentaire</p>
        )}
      </div>

      {/* Journal — moved here from its own tab. Same content as the legacy
          `JournalTab` rendered inline so commentaire and journal sit side
          by side in one scroll. */}
      <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />Journal
        </p>
        {isEditing ? (
          <textarea
            value={editJournal}
            onChange={(e) => onEditJournalChange(e.target.value)}
            rows={12}
            placeholder="Entrées de journal..."
            className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y font-mono"
          />
        ) : commande.journal?.trim() ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line font-mono">{commande.journal.trim()}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Aucune entrée de journal</p>
        )}
      </div>
    </div>
  )
}

// ── Sidebar Tab: Adresses ──────────────────────────────

function AdressesTab({
  commande, isEditing, adresses,
  editIDAdresseSousTraitant, onEditIDAdresseSousTraitantChange,
  editIDAdresseLivraison, onEditIDAdresseLivraisonChange,
}: {
  commande: CommandeDetail
  isEditing: boolean
  adresses: AdresseLookup[]
  editIDAdresseSousTraitant: number
  onEditIDAdresseSousTraitantChange: (v: number) => void
  editIDAdresseLivraison: number
  onEditIDAdresseLivraisonChange: (v: number) => void
}) {
  return (
    <div className="space-y-3">
      <AdresseCard
        label="Sous-traitant"
        adresse={commande.adresse_sous_traitant}
        isEditing={isEditing}
        options={adresses}
        selectedId={editIDAdresseSousTraitant}
        onSelect={onEditIDAdresseSousTraitantChange}
      />
      <AdresseCard
        label="Livraison"
        adresse={commande.adresse_livraison}
        isEditing={isEditing}
        options={adresses}
        selectedId={editIDAdresseLivraison}
        onSelect={onEditIDAdresseLivraisonChange}
      />
    </div>
  )
}

function AdresseCard({
  label, adresse, isEditing, options, selectedId, onSelect,
}: {
  label: string
  adresse: AdresseLite | null
  isEditing: boolean
  options: AdresseLookup[]
  selectedId: number
  onSelect: (id: number) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const displayAdresse: AdresseLite | null = isEditing
    ? (options.find((o) => o.IDadresse === selectedId) ?? adresse)
    : adresse

  return (
    <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />{label}
        </p>
        {isEditing && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px] gap-1"
            onClick={() => setPickerOpen(true)}
          >
            <Search className="h-3 w-3" />
            Choisir
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
      <AdressePickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        label={label}
        options={options}
        selectedId={selectedId}
        onSelect={(id) => { onSelect(id); setPickerOpen(false) }}
      />
    </div>
  )
}

function AdressePickerDialog({
  open, onClose, label, options, selectedId, onSelect,
}: {
  open: boolean
  onClose: () => void
  label: string
  options: AdresseLookup[]
  selectedId: number
  onSelect: (id: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg space-y-4" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-accent" />
            Choisir une adresse {label.toLowerCase()}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-2 px-1">
          {options.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <MapPin className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">Aucune adresse disponible</p>
            </div>
          ) : options.map((a) => {
            const isSelected = a.IDadresse === selectedId
            return (
              <button
                key={a.IDadresse}
                type="button"
                onClick={() => onSelect(a.IDadresse)}
                className={cn(
                  'w-full text-left p-3 rounded-lg border transition-all',
                  isSelected
                    ? 'border-accent bg-accent/5 ring-1 ring-accent'
                    : 'border-border bg-card hover:border-accent/50 hover:bg-accent/[0.02]'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{a.nom || `Adresse #${a.IDadresse}`}</p>
                      {!!a.est_defaut && (
                        <Badge variant="secondary" className="text-[10px] py-0">Principale</Badge>
                      )}
                      {!!a.est_defaut_livraison && (
                        <Badge variant="outline" className="text-[10px] py-0">Livraison</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {a.adresse1 && <p className="truncate">{a.adresse1}</p>}
                      {a.adresse2 && <p className="truncate">{a.adresse2}</p>}
                      {a.adresse3 && <p className="truncate">{a.adresse3}</p>}
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
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Sidebar Tab: Docs ──────────────────────────────────

interface GedDocument {
  IDged: number
  nom: string | null
  commentaire: string | null
  IDtype_doc: number
  type_nom: string | null
}

interface TypeDoc {
  IDtype_doc: number
  nom: string
}

function DocsTab({ commande, isEditing }: { commande: CommandeDetail; isEditing: boolean }) {
  const queryClient = useQueryClient()
  const commandeId = commande.IDcommande_sous_traitant
  const docsQueryKey = ['commande-sst-docs', commandeId] as const

  const { data, isLoading, error } = useQuery<GedDocument[]>({
    queryKey: docsQueryKey,
    queryFn: () => apiFetch(`/commandes-sous-traitant/${commandeId}/documents`),
  })

  const [viewDoc, setViewDoc] = useState<GedDocument | null>(null)
  const [editingDoc, setEditingDoc] = useState<GedDocument | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteDocConfirm, setDeleteDocConfirm] = useState<GedDocument | null>(null)

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: docsQueryKey })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, commandeId])

  const deleteMut = useMutation({
    mutationFn: (idged: number) =>
      apiFetch(`/commandes-sous-traitant/${commandeId}/documents/${idged}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  return (
    <>
      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
        </div>
      )}
      {!!error && (
        <div className="flex items-center gap-1.5 py-3 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>Erreur de chargement</span>
        </div>
      )}
      {!isLoading && !error && !data?.length && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <FileText className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm font-medium">Aucun document</p>
          <p className="text-[11px] mt-1 text-center">
            Bons de retour ennoblisseur, soumissions, factures et autres documents apparaîtront ici.
          </p>
        </div>
      )}

      {!!data?.length && (
        <div className="space-y-2">
          {data.map((doc) => {
            const title = doc.nom?.trim() || `Document #${doc.IDged}`
            return (
              <div
                key={doc.IDged}
                onClick={() => isEditing ? setEditingDoc(doc) : setViewDoc(doc)}
                className={cn(
                  'group p-3 rounded-lg border bg-card shadow-sm cursor-pointer hover:border-accent/40 transition-colors',
                  isEditing && editSectionClass,
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 bg-amber-400/10">
                    <FileText className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" title={title}>{title}</p>
                    {!!doc.type_nom && (
                      <p className="text-[11px] text-muted-foreground truncate">{doc.type_nom}</p>
                    )}
                  </div>
                  {isEditing && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onClick={(e) => { e.stopPropagation(); setDeleteDocConfirm(doc) }}
                      title="Supprimer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {!!doc.commentaire?.trim() && (
                  <div className="flex items-start gap-1.5 mt-2 ml-9">
                    <MessageSquare className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-muted-foreground italic">{doc.commentaire.trim()}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {isEditing && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-muted-foreground hover:text-foreground"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1.5" />Ajouter un document
        </Button>
      )}

      <DocViewDialog commandeId={commandeId} doc={viewDoc} onClose={() => setViewDoc(null)} />
      <DocCreateEditDialog
        open={createOpen || editingDoc !== null}
        commandeId={commandeId}
        doc={editingDoc}
        onClose={() => { setCreateOpen(false); setEditingDoc(null) }}
        onSuccess={() => { setCreateOpen(false); setEditingDoc(null); invalidate() }}
      />

      <ConfirmDialog
        open={deleteDocConfirm !== null}
        title="Supprimer le document"
        description={deleteDocConfirm ? `« ${deleteDocConfirm.nom?.trim() || `Document #${deleteDocConfirm.IDged}`} » sera supprimé définitivement.` : undefined}
        confirmLabel="Supprimer"
        isPending={deleteMut.isPending}
        onCancel={() => setDeleteDocConfirm(null)}
        onConfirm={() => {
          if (deleteDocConfirm) {
            deleteMut.mutate(deleteDocConfirm.IDged, {
              onSuccess: () => setDeleteDocConfirm(null),
            })
          }
        }}
      />
    </>
  )
}

function DocCreateEditDialog({
  open, commandeId, doc, onClose, onSuccess,
}: {
  open: boolean
  commandeId: number
  doc: GedDocument | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isNew = doc === null
  const [nom, setNom] = useState('')
  const [idTypeDoc, setIdTypeDoc] = useState<number>(0)
  const [commentaire, setCommentaire] = useState('')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [newFileUrl, setNewFileUrl] = useState<string | null>(null)
  const [removeFichier, setRemoveFichier] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: typeDocs } = useQuery<TypeDoc[]>({
    queryKey: ['commande-sst-types-doc'],
    queryFn: () => apiFetch('/commandes-sous-traitant/lookups/type-doc'),
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    setNom(doc?.nom ?? '')
    setIdTypeDoc(doc?.IDtype_doc ?? 0)
    setCommentaire(doc?.commentaire ?? '')
    setNewFile(null)
    if (newFileUrl) URL.revokeObjectURL(newFileUrl)
    setNewFileUrl(null)
    setRemoveFichier(false)
    setError(null)
    setIsSaving(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc?.IDged])

  useEffect(() => {
    if (!open && newFileUrl) {
      URL.revokeObjectURL(newFileUrl)
      setNewFileUrl(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleFilePick = (f: File) => {
    if (newFileUrl) URL.revokeObjectURL(newFileUrl)
    setNewFile(f)
    setNewFileUrl(URL.createObjectURL(f))
    setRemoveFichier(false)
  }

  const handleRemoveFile = () => {
    if (newFileUrl) URL.revokeObjectURL(newFileUrl)
    setNewFile(null)
    setNewFileUrl(null)
    setRemoveFichier(true)
  }

  const handleSave = async () => {
    setError(null)
    setIsSaving(true)
    try {
      const formData = new FormData()
      formData.append('nom', nom)
      formData.append('commentaire', commentaire)
      formData.append('IDtype_doc', String(idTypeDoc))
      if (newFile) formData.append('fichier', newFile)
      if (removeFichier && !newFile) formData.append('remove_fichier', '1')

      const url = isNew
        ? `${API_URL}/commandes-sous-traitant/${commandeId}/documents`
        : `${API_URL}/commandes-sous-traitant/${commandeId}/documents/${doc!.IDged}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await fetch(url, { method, body: formData, credentials: 'include' })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(txt || `HTTP ${res.status}`)
      }
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      setIsSaving(false)
    }
  }

  const previewUrl = newFileUrl
    ? newFileUrl
    : !isNew && !removeFichier && doc
      ? `${API_URL}/commandes-sous-traitant/${commandeId}/documents/${doc.IDged}/fichier#view=FitH`
      : null

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-accent" />
            {isNew ? 'Ajouter un document' : 'Modifier le document'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 flex gap-4">
          <div className="w-80 flex-shrink-0 overflow-y-auto space-y-3 px-1">
            <LabeledInput label="Nom" value={nom} onChange={setNom} autoFocus />
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type de document</label>
              <PopoverSelect
                options={(typeDocs ?? []).map((t) => ({ id: t.IDtype_doc, primary: t.nom }))}
                value={idTypeDoc}
                onChange={setIdTypeDoc}
                emptyLabel="— Aucun —"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Commentaire</label>
              <textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
            </div>
            {!!error && (
              <div className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span className="break-all">{error}</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="flex-1 min-h-0 rounded-lg border border-border/60 bg-zinc-50 overflow-hidden">
              {previewUrl ? (
                <iframe src={previewUrl} className="w-full h-full" title="Document" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                  <FileText className="h-12 w-12 mb-2 opacity-30" />
                  <p className="text-sm">Aucun fichier</p>
                  <p className="text-[11px]">Choisissez un fichier ci-dessous</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,image/*"
                  onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFilePick(f)
                  }}
                />
                <span className={cn(inputClass, 'inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/5 w-auto px-3')}>
                  <Upload className="h-3.5 w-3.5" />
                  {newFile ? newFile.name : 'Choisir un fichier'}
                </span>
              </label>
              {(newFile || (!isNew && !removeFichier && doc)) && (
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleRemoveFile} title="Retirer le fichier">
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>Annuler</Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Enregistrer
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DocViewDialog({
  commandeId, doc, onClose,
}: { commandeId: number; doc: GedDocument | null; onClose: () => void }) {
  const [fichierOk, setFichierOk] = useState<boolean | null>(null)

  useEffect(() => {
    if (!doc) { setFichierOk(null); return }
    setFichierOk(null)
    fetch(`${API_URL}/commandes-sous-traitant/${commandeId}/documents/${doc.IDged}/fichier`, {
      method: 'HEAD',
      credentials: 'include',
    })
      .then((r) => setFichierOk(r.ok))
      .catch(() => setFichierOk(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.IDged, commandeId])

  if (!doc) return null

  return (
    <Dialog open={!!doc} onOpenChange={() => onClose()}>
      {fichierOk ? (
        <div className="relative z-50 w-[60vw] max-w-3xl h-[95vh]" onClick={(e) => e.stopPropagation()}>
          <iframe
            src={`${API_URL}/commandes-sous-traitant/${commandeId}/documents/${doc.IDged}/fichier#view=FitH`}
            className="w-full h-full rounded-lg"
            title={doc.nom ?? 'Document'}
          />
        </div>
      ) : (
        <DialogContent className="max-w-sm" onClose={onClose}>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="text-center space-y-2">
              <FileText className="h-12 w-12 mx-auto opacity-30" />
              <p className="text-sm">
                {fichierOk === null ? 'Chargement...' : 'Aucun document attaché'}
              </p>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}

// ── Create Dialog (filtered to Ennoblisseur) ───────────

function CreateCommandeDialog({
  open, onClose, onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (newId: number) => void
}) {
  // Phase 1: typeSst is locked to "Ennoblisseur" — kept as state so the
  // field is visible (and ready to expand to Tricoteur / Confectionneur in
  // Phase 2 by simply enabling the other options).
  const [typeSst, setTypeSst] = useState<string>(TYPE_ENNOBLISSEUR)
  const [sousTraitantId, setSousTraitantId] = useState<number>(0)
  const [dateCommande, setDateCommande] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [adresseStId, setAdresseStId] = useState<number>(0)
  const [adresseLivId, setAdresseLivId] = useState<number>(0)
  const [commentaire, setCommentaire] = useState('')

  // Sous-traitants list filtered by the picked type.
  const { data: sousTraitants } = useQuery<SousTraitantLite[]>({
    queryKey: ['create-cmd-sst-sous-traitants', typeSst],
    queryFn: () => apiFetch(`/commandes-sous-traitant/lookups/sous-traitants?type=${typeSst.toLowerCase()}`),
    enabled: open && !!typeSst,
  })
  const { data: adresses } = useQuery<AdresseLookup[]>({
    queryKey: ['create-cmd-sst-adresses', sousTraitantId],
    queryFn: () => apiFetch(`/commandes-sous-traitant/lookups/adresses?sous_traitant=${sousTraitantId}`),
    enabled: open && sousTraitantId > 0,
  })

  useEffect(() => {
    if (!adresses) return
    const defaultSt = adresses.find((a) => a.est_defaut) ?? adresses[0]
    const defaultLiv = adresses.find((a) => a.est_defaut_livraison) ?? adresses.find((a) => a.est_defaut) ?? adresses[0]
    setAdresseStId(defaultSt?.IDadresse ?? 0)
    setAdresseLivId(defaultLiv?.IDadresse ?? 0)
  }, [adresses])

  useEffect(() => {
    if (!open) {
      setTypeSst(TYPE_ENNOBLISSEUR)
      setSousTraitantId(0)
      setDateCommande(new Date().toISOString().slice(0, 10))
      setAdresseStId(0)
      setAdresseLivId(0)
      setCommentaire('')
    }
  }, [open])

  // Switching the type clears the sous-traitant pick (the previous one
  // doesn't necessarily belong to the new type).
  useEffect(() => { setSousTraitantId(0) }, [typeSst])

  const createMut = useMutation({
    mutationFn: () => apiFetch('/commandes-sous-traitant', {
      method: 'POST',
      body: JSON.stringify({
        IDsous_traitant: sousTraitantId,
        date_commande: inputDateToHfsql(dateCommande),
        IDadresse_sous_traitant: adresseStId || 0,
        IDadresse_livraison: adresseLivId || 0,
        commentaire,
      }),
    }),
    onSuccess: (data: { IDcommande_sous_traitant: number }) => onCreated(data.IDcommande_sous_traitant),
  })

  const canSave = sousTraitantId > 0 && dateCommande.length > 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-accent" />
            Nouvelle commande sous-traitant
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Type sous-traitant</label>
            <PopoverSelect
              options={TYPE_SST_OPTIONS_PHASE1}
              value={TYPE_SST_ID_BY_LABEL[typeSst] ?? TYPE_SST_ID_BY_LABEL.Ennoblisseur}
              onChange={(id) => setTypeSst(TYPE_SST_LABEL_BY_ID[id] ?? TYPE_ENNOBLISSEUR)}
              hideEmpty
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sous-traitant</label>
            <PopoverSelect
              options={(sousTraitants ?? []).map((s) => ({
                id: s.IDsous_traitant,
                primary: s.nom ?? `#${s.IDsous_traitant}`,
              }))}
              value={sousTraitantId}
              onChange={setSousTraitantId}
              disabled={!typeSst}
              emptyLabel="— Choisir —"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date commande</label>
            <input
              type="date"
              value={dateCommande}
              onChange={(e) => setDateCommande(e.target.value)}
              className={cn(inputClass, 'h-9')}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Adresse sous-traitant</label>
            <PopoverSelect
              options={(adresses ?? []).map(adresseOption)}
              value={adresseStId}
              onChange={setAdresseStId}
              disabled={!adresses?.length}
              // Once the sous-traitant has at least one address, force the
              // user to pick one — no "—" escape hatch.
              hideEmpty={(adresses?.length ?? 0) > 0}
              emptyLabel="—"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Adresse livraison</label>
            <PopoverSelect
              options={(adresses ?? []).map(adresseOption)}
              value={adresseLivId}
              onChange={setAdresseLivId}
              disabled={!adresses?.length}
              hideEmpty={(adresses?.length ?? 0) > 0}
              emptyLabel="—"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Commentaire</label>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => createMut.mutate()} disabled={!canSave || createMut.isPending}>
            {createMut.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Création...</>
            ) : (
              <><Save className="h-3.5 w-3.5 mr-1.5" />Créer</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Shared components ──────────────────────────────────

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-right truncate">{value}</span>
    </div>
  )
}

function LabeledInput({
  label, value, onChange, type = 'text', autoFocus, disabled, helper,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoFocus?: boolean
  /** When true the input becomes read-only and styled muted. Used by
   *  fields whose value is computed by the server (e.g. ennoblisseur prix
   *  driven by `recalcLignePrix`). */
  disabled?: boolean
  /** Optional secondary text rendered under a disabled input to explain
   *  why the field is locked. */
  helper?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        autoComplete="off"
        data-form-type="other"
        data-lpignore="true"
        disabled={disabled}
        className={cn(inputClass, disabled && 'bg-muted text-muted-foreground cursor-not-allowed')}
      />
      {disabled && helper && (
        <p className="text-[10px] text-muted-foreground italic">{helper}</p>
      )}
    </div>
  )
}

function InlineForm({
  title, children, onSave, onCancel, isSaving,
}: {
  title: string
  children: React.ReactNode
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
}) {
  return (
    <div className="rounded-lg border border-accent/25 bg-accent/[0.03] p-4 space-y-3">
      <p className="text-xs font-semibold text-accent uppercase tracking-wide">{title}</p>
      {children}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
        <Button size="sm" onClick={onSave} disabled={isSaving}>
          {isSaving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  )
}
