import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode, type ComponentType } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import {
  ShoppingCart,
  Search,
  Loader2,
  AlertCircle,
  MapPin,
  Info,
  History,
  Pencil,
  Plus,
  X,
  Save,
  Trash2,
  MessageSquare,
  CheckCircle2,
  Clock,
  Package,
  Link2,
  Unlink,
  Printer,
  AtSign,
  FileText,
  Upload,
  Layers,
  Lock,
  LockOpen,
  Sparkles,
  Droplets,
} from 'lucide-react'
import { KnitIcon } from '@/components/icons/KnitIcon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PopoverSelect, SearchableCombobox } from '@/components/ui/popover-select'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { SendEmailDialog } from '@/components/email/SendEmailDialog'
import { cn } from '@/lib/utils'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { apiFetch, API_URL } from '@/lib/api'
import { postEmail } from '@/lib/email'

// ── Types ──────────────────────────────────────────────

type ClientPhase = 'a_affecter' | 'partielle' | 'terminee'

interface CommandeListRow {
  IDcommande_client: number
  IDclient: number
  numero: number | null
  date_commande: string | null
  est_soldee: number
  client_nom: string
  phase: ClientPhase
  total_eur: number
  total_qte: number
  nb_lignes: number
  earliest_delivery: string | null
}

interface LigneCommande {
  IDligne_commande_client: number
  IDcommande_client: number
  type: number // 1=écru, 2=fini, 3=divers
  IDreference: number
  IDcolori: number
  quantite: number
  unite: number
  unite_label: string
  prix: number
  poids: number
  date_livraison: string | null
  commentaire: string | null
  ref_label: string | null
  ref_kind: 'ecru' | 'fini' | 'divers' | null
  colori_reference: string | null
  montant: number
  nb_rolls: number
  total_metrage: number
  total_poids: number
  affecte: number
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

interface AffectationPayload {
  kind: 'ecru' | 'fini' | 'none'
  unite: number
  unite_label: string
  dim: 'metrage' | 'poids'
  target_qty: number
  linked: RollLite[]
  available: RollLite[]
}

interface SupplyTricoRow {
  id: number
  sous_traitant_nom: string | null
  date_livraison: string | null
  etat_label: string
  poids_disponible: number
  poids_affecte: number
  metrage_potentiel: number
}
interface SupplyEnnoRow {
  id: number
  sous_traitant_nom: string | null
  date_livraison: string | null
  etat_label: string
  qte_disponible: number
  qte_affecte: number
}
interface SupplyPayload {
  applicable: boolean
  tricotage: SupplyTricoRow[]
  ennoblissement: SupplyEnnoRow[]
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

// Canonical AdresseLookup → PopoverSelect option mapper (mps_designer §11bis).
// `description` renders the full address (street · postal city · pays) under the
// name on each popover row so the user can verify the pick at a glance.
function adresseOption(a: AdresseLookup) {
  const street = [a.adresse1, a.adresse2, a.adresse3].filter(Boolean).join(' · ')
  const cityLine = [a.cp, a.ville].filter(Boolean).join(' ')
  const descLines = [street, cityLine, a.pays || ''].filter((s) => s.trim().length > 0)
  return {
    id: a.IDadresse,
    primary: a.nom || `Adresse #${a.IDadresse}`,
    secondary: a.ville ?? undefined,
    description: descLines.length > 0 ? descLines.join('\n') : undefined,
  }
}

interface CommandeDetail {
  IDcommande_client: number
  IDclient: number
  client_nom: string
  numero: number | null
  date_commande: string | null
  ref_client: string | null
  IDadresse_livraison: number
  IDadresse_facturation: number
  IDmode_paiement: number
  IDecheance: number
  commentaire: string | null
  commentaire_interne: string | null
  observations_facturation: string | null
  est_soldee: number
  remise: number
  frais_port: number
  IDdossier: number
  adresse_livraison: AdresseLite | null
  adresse_facturation: AdresseLite | null
  lignes: LigneCommande[]
  phase: ClientPhase
}

interface ClientLite { IDclient: number; nom: string; IDmode_paiement?: number; IDecheance?: number }
interface ModePaiement { IDmode_paiement: number; libelle: string }
interface Echeance { IDecheance: number; libelle: string }
interface RefEcru { IDref_ecru: number; reference: string }
interface RefFini { IDref_fini: number; reference: string; designation: string; avec_teinture: number }
interface RefDivers { IDref_divers: number; designation: string; unite: number }
interface ColoriOption { id: number; reference: string }
interface LinePriceInfo {
  prix: number | null
  unite: number
  unite_label: string
  rollSize: number
  nRolls: number
  cleanQty: number
  exact: boolean
  trancheRolls: number
  nextTrancheRolls: number
  nextTrancheQty: number
  nextTrancheGapQty: number
  nextTranchePrix: number | null
  nearNextTranche: boolean
  priceable: boolean
}

// ── Shared styling ─────────────────────────────────────

const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

// ── Status / phase helpers ─────────────────────────────

const PHASE_META: Record<ClientPhase, { label: string; solid: string; icon: React.ElementType }> = {
  a_affecter: { label: 'À affecter', solid: 'bg-slate-500 border-slate-500', icon: Package },
  partielle: { label: 'Affectée', solid: 'bg-primary border-primary', icon: Link2 },
  terminee: { label: 'Terminée', solid: 'bg-success border-success', icon: CheckCircle2 },
}

function PhasePill({ phase, className }: { phase: ClientPhase; className?: string }) {
  const meta = PHASE_META[phase] ?? PHASE_META.a_affecter
  const Icon = meta.icon
  return (
    <Badge variant="outline" className={cn('text-[10px] py-0 gap-1 border text-white', meta.solid, className)}>
      <Icon className="h-2.5 w-2.5" />{meta.label}
    </Badge>
  )
}

// Line type chip — category color per écru / fini / divers.
function lineTypeChip(type: number): { label: string; classes: string } | null {
  if (type === 1) return { label: 'Écru', classes: 'bg-amber-500/15 text-amber-800 border border-amber-500/30' }
  if (type === 2) return { label: 'Fini', classes: 'bg-sky-500/10 text-sky-700 border border-sky-500/25' }
  if (type === 3) return { label: 'Divers', classes: 'bg-stone-500/10 text-stone-700 border border-stone-500/25' }
  return null
}

// Delivery-urgency flag based on the earliest line delivery date.
function deliveryUrgency(earliestHfsql: string | null, estSoldee: number): 'late' | 'soon' | null {
  if (estSoldee === 1) return null
  if (!earliestHfsql || !/^\d{8}$/.test(earliestHfsql)) return 'late'
  const target = new Date(Number(earliestHfsql.slice(0, 4)), Number(earliestHfsql.slice(4, 6)) - 1, Number(earliestHfsql.slice(6, 8)))
  target.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diffDays <= 0) return 'late'
  if (diffDays <= 3) return 'soon'
  return null
}

function lineCardColors(line: LigneCommande) {
  // Fully-reserved → green; some reserved → amber; none → neutral.
  if (line.type === 3) return { border: 'border-l-stone-400/60', iconBg: 'bg-stone-400/10', iconColor: 'text-stone-600' }
  const target = Number(line.quantite) || 0
  const done = target > 0 && line.affecte >= target - 0.001
  if (done) return { border: 'border-l-green-500/60', iconBg: 'bg-green-500/10', iconColor: 'text-green-600' }
  if (line.nb_rolls > 0) return { border: 'border-l-amber-400/60', iconBg: 'bg-amber-400/10', iconColor: 'text-amber-600' }
  return { border: 'border-l-border', iconBg: 'bg-muted', iconColor: 'text-muted-foreground' }
}

// ── Main Page ──────────────────────────────────────────

export function ClientsCommandes() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'terminee'>('open')
  const [isEditing, setIsEditing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [affectationLineId, setAffectationLineId] = useState<number | null>(null)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [autoEditForId, setAutoEditForId] = useState<number | null>(null)
  const [deleteCommandeConfirmOpen, setDeleteCommandeConfirmOpen] = useState(false)

  // Edit-mode header draft.
  const [editDateCommande, setEditDateCommande] = useState('')
  const [editRefClient, setEditRefClient] = useState('')
  const [editCommentaire, setEditCommentaire] = useState('')
  const [editCommentaireInterne, setEditCommentaireInterne] = useState('')
  const [editIDModePaiement, setEditIDModePaiement] = useState(0)
  const [editIDEcheance, setEditIDEcheance] = useState(0)
  const [editRemise, setEditRemise] = useState('')
  const [editFraisPort, setEditFraisPort] = useState('')
  const [editIDAdresseFacturation, setEditIDAdresseFacturation] = useState(0)
  const [editIDAdresseLivraison, setEditIDAdresseLivraison] = useState(0)

  const originalDraftRef = useRef<Record<string, string | number> | null>(null)
  const [linesDirty, setLinesDirty] = useState(false)

  // Debounce search (server-side).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  const { data: commandes, isLoading, isError, error, isFetching } = useQuery<CommandeListRow[]>({
    queryKey: ['commandes-client', statusFilter, debouncedQuery],
    queryFn: () => apiFetch(`/commandes-client?status=${statusFilter}&q=${encodeURIComponent(debouncedQuery)}&limit=200`),
  })

  const { data: detail, isLoading: detailLoading } = useQuery<CommandeDetail>({
    queryKey: ['commande-client', selectedId],
    queryFn: () => apiFetch(`/commandes-client/${selectedId}`),
    enabled: selectedId !== null,
  })

  useEffect(() => { setAffectationLineId(null) }, [selectedId])

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['commandes-client'] })
    queryClient.invalidateQueries({ queryKey: ['commande-client', selectedId] })
    // Affectation drawers cache the available/linked rolls per line; editing a
    // line (e.g. changing its coloris) changes which rolls are eligible, so the
    // pieces query must be invalidated too or the drawer shows a stale list.
    queryClient.invalidateQueries({ queryKey: ['commande-client-pieces'] })
    // Supply (tricotage/ennoblissement) disponible/affecté depends on roll
    // affectation, so refresh it after any line/affectation mutation too.
    queryClient.invalidateQueries({ queryKey: ['commande-client-supply'] })
  }, [queryClient, selectedId])

  const startEdit = useCallback(() => {
    if (!detail) return
    const snapshot = {
      dateCommande: hfsqlDateToInput(detail.date_commande),
      refClient: detail.ref_client?.trim() ?? '',
      commentaire: detail.commentaire?.trim() ?? '',
      commentaireInterne: detail.commentaire_interne?.trim() ?? '',
      IDmodePaiement: detail.IDmode_paiement ?? 0,
      IDecheance: detail.IDecheance ?? 0,
      remise: detail.remise ? String(detail.remise) : '',
      fraisPort: detail.frais_port ? String(detail.frais_port) : '',
      IDadresseFact: detail.IDadresse_facturation ?? 0,
      IDadresseLiv: detail.IDadresse_livraison ?? 0,
    }
    setEditDateCommande(snapshot.dateCommande)
    setEditRefClient(snapshot.refClient)
    setEditCommentaire(snapshot.commentaire)
    setEditCommentaireInterne(snapshot.commentaireInterne)
    setEditIDModePaiement(snapshot.IDmodePaiement)
    setEditIDEcheance(snapshot.IDecheance)
    setEditRemise(snapshot.remise)
    setEditFraisPort(snapshot.fraisPort)
    setEditIDAdresseFacturation(snapshot.IDadresseFact)
    setEditIDAdresseLivraison(snapshot.IDadresseLiv)
    originalDraftRef.current = snapshot
    setAffectationLineId(null)
    setIsEditing(true)
  }, [detail])

  const cancelEdit = useCallback(() => setIsEditing(false), [])

  const isDirty = useMemo(() => {
    if (!isEditing) return false
    const o = originalDraftRef.current
    if (!o) return false
    if (editDateCommande !== o.dateCommande) return true
    if (editRefClient !== o.refClient) return true
    if (editCommentaire !== o.commentaire) return true
    if (editCommentaireInterne !== o.commentaireInterne) return true
    if (editIDModePaiement !== o.IDmodePaiement) return true
    if (editIDEcheance !== o.IDecheance) return true
    if (editRemise !== o.remise) return true
    if (editFraisPort !== o.fraisPort) return true
    if (editIDAdresseFacturation !== o.IDadresseFact) return true
    if (editIDAdresseLivraison !== o.IDadresseLiv) return true
    if (linesDirty) return true
    return false
  }, [isEditing, editDateCommande, editRefClient, editCommentaire, editCommentaireInterne, editIDModePaiement, editIDEcheance, editRemise, editFraisPort, editIDAdresseFacturation, editIDAdresseLivraison, linesDirty])

  const saveHeaderMut = useMutation({
    mutationFn: () => apiFetch(`/commandes-client/${selectedId}`, {
      method: 'PUT',
      body: JSON.stringify({
        date_commande: inputDateToHfsql(editDateCommande),
        ref_client: editRefClient,
        commentaire: editCommentaire,
        commentaire_interne: editCommentaireInterne,
        IDmode_paiement: editIDModePaiement || 0,
        IDecheance: editIDEcheance || 0,
        remise: Number(editRemise) || 0,
        frais_port: Number(editFraisPort) || 0,
        IDadresse_facturation: editIDAdresseFacturation || 0,
        IDadresse_livraison: editIDAdresseLivraison || 0,
      }),
    }),
    onSuccess: () => { invalidateAll(); setIsEditing(false) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/commandes-client/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      const cached = queryClient.getQueryData<CommandeListRow[]>(['commandes-client', statusFilter, debouncedQuery]) ?? []
      const remaining = cached.filter((c) => c.IDcommande_client !== deletedId)
      queryClient.invalidateQueries({ queryKey: ['commandes-client'] })
      setIsEditing(false)
      setDeleteCommandeConfirmOpen(false)
      setSelectedId(remaining.length > 0 ? remaining[0].IDcommande_client : null)
    },
  })

  useEffect(() => {
    if (autoEditForId !== null && detail?.IDcommande_client === autoEditForId) {
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
    mutationFn: (newEtat: number) => apiFetch(`/commandes-client/${selectedId}/etat`, {
      method: 'PUT',
      body: JSON.stringify({ est_soldee: newEtat }),
    }),
    onSuccess: invalidateAll,
  })

  const handleSelect = useCallback((id: number) => {
    guard.guardAction(() => { setIsEditing(false); setSelectedId(id) })
  }, [guard])

  const handleStatusFilterChange = useCallback((s: 'all' | 'open' | 'terminee') => {
    guard.guardAction(() => { setIsEditing(false); setStatusFilter(s); setSelectedId(null) })
  }, [guard])

  const rows = commandes ?? []

  // Keep the selection valid against the (server-filtered) list. Skip while the
  // list is refetching: after creating a commande we setSelectedId(newId) before
  // the refetch settles, so the stale list wouldn't yet contain it — resetting
  // here would clobber the new selection (and break the auto-enter-edit flow).
  useEffect(() => {
    if (isEditing || isFetching || rows.length === 0) return
    const stillVisible = selectedId !== null && rows.some((c) => c.IDcommande_client === selectedId)
    if (!stillVisible) setSelectedId(rows[0].IDcommande_client)
  }, [rows, selectedId, isEditing, isFetching])

  return (
    <>
      <MasterDetailLayout
        list={
          <CommandeList
            rows={rows}
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
            onPrintClick={() => { if (selectedId !== null) window.open(`${API_URL}/commandes-client/${selectedId}/pdf`, '_blank') }}
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
            affectationLineId={affectationLineId}
            onOpenAffectation={setAffectationLineId}
          />
        }
        sidebar={selectedId !== null ? (
          <DetailSidebar
            commande={detail ?? null}
            isLoading={detailLoading}
            isEditing={isEditing}
            editDateCommande={editDateCommande} onEditDateCommandeChange={setEditDateCommande}
            editRefClient={editRefClient} onEditRefClientChange={setEditRefClient}
            editCommentaire={editCommentaire} onEditCommentaireChange={setEditCommentaire}
            editCommentaireInterne={editCommentaireInterne} onEditCommentaireInterneChange={setEditCommentaireInterne}
            editIDModePaiement={editIDModePaiement} onEditIDModePaiementChange={setEditIDModePaiement}
            editIDEcheance={editIDEcheance} onEditIDEcheanceChange={setEditIDEcheance}
            editRemise={editRemise} onEditRemiseChange={setEditRemise}
            editFraisPort={editFraisPort} onEditFraisPortChange={setEditFraisPort}
            editIDAdresseFacturation={editIDAdresseFacturation} onEditIDAdresseFacturationChange={setEditIDAdresseFacturation}
            editIDAdresseLivraison={editIDAdresseLivraison} onEditIDAdresseLivraisonChange={setEditIDAdresseLivraison}
            onToggleEtat={() => toggleEtatMut.mutate(detail?.est_soldee === 1 ? 0 : 1)}
            isTogglingEtat={toggleEtatMut.isPending}
          />
        ) : null}
        sidebarTitle="Informations"
        hasSelection={selectedId !== null}
        onBack={() => guard.guardAction(() => { setIsEditing(false); setSelectedId(null) })}
      />

      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />

      <CreateCommandeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(newId) => {
          setCreateOpen(false)
          queryClient.invalidateQueries({ queryKey: ['commandes-client'] })
          setSelectedId(newId)
          setAutoEditForId(newId)
        }}
      />

      <ConfirmDialog
        open={deleteCommandeConfirmOpen}
        title="Supprimer la commande"
        description="Cette action supprimera la commande, ses lignes et libérera le stock affecté. Elle est irréversible."
        confirmLabel="Supprimer"
        isPending={deleteMut.isPending}
        onCancel={() => setDeleteCommandeConfirmOpen(false)}
        onConfirm={() => { if (selectedId !== null) deleteMut.mutate(selectedId) }}
      />

      {selectedId !== null && (
        <SendEmailDialog
          open={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          contextLabel={detail?.client_nom ?? undefined}
          queryKey={['commande-client-email-defaults', selectedId]}
          loadDefaults={() => apiFetch(`/commandes-client/${selectedId}/email-defaults`)}
          pdfUrl={`${API_URL}/commandes-client/${selectedId}/pdf`}
          pdfAttachmentLabel={`commande-client-${selectedId}.pdf`}
          onSend={(p) => postEmail(`${API_URL}/commandes-client/${selectedId}/email`, p, { includeAttachPdf: true })}
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
}: {
  rows: CommandeListRow[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  selectedId: number | null
  onSelect: (id: number) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  statusFilter: 'all' | 'open' | 'terminee'
  onStatusFilterChange: (s: 'all' | 'open' | 'terminee') => void
  onNew: () => void
  isEditing: boolean
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
        <div className="flex gap-1">
          {([
            { key: 'open', label: 'En cours' },
            { key: 'terminee', label: 'Soldées' },
            { key: 'all', label: 'Toutes' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => onStatusFilterChange(opt.key)}
              className={cn(
                'flex-1 px-2 py-1 text-xs rounded-md transition-colors',
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
            <ShoppingCart className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">Aucune commande</p>
          </div>
        ) : rows.map((row) => {
          const isSelected = selectedId === row.IDcommande_client
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
              key={row.IDcommande_client}
              onClick={() => onSelect(row.IDcommande_client)}
              className={cn(
                'p-3 border rounded-lg cursor-pointer transition-all bg-white',
                isSelected ? selectedRingClass : hoverClass,
                urgency === 'late' && 'shadow-[inset_4px_0_0_0_rgb(239_68_68)]',
                urgency === 'soon' && 'shadow-[inset_4px_0_0_0_rgb(245_158_11)]',
              )}
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-sm">N° {row.numero ?? row.IDcommande_client}</span>
                <PhasePill phase={row.phase} className="ml-auto" />
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">{row.client_nom || '—'}</p>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                {row.date_commande && <span>{formatHfsqlDate(row.date_commande)}</span>}
                <span className="ml-auto text-muted-foreground/70">{row.nb_lignes} ligne{row.nb_lignes > 1 ? 's' : ''}</span>
                {row.total_eur > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-accent/10 font-medium text-foreground tabular-nums">
                    {fmtNum(row.total_eur)} €
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>{rows.length} commande{rows.length !== 1 ? 's' : ''}</span>
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
          <ShoppingCart className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          ) : (
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-heading font-bold tracking-tight truncate">
                N° {commande?.numero ?? commande?.IDcommande_client}
                <span className="text-muted-foreground font-normal"> · {commande?.client_nom || '—'}</span>
              </h1>
              <div className="flex items-center gap-2 flex-shrink-0">
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
  commande, isLoading, hasSelection, isEditing, onMutationSuccess, onLinesDirtyChange, affectationLineId, onOpenAffectation,
}: {
  commande: CommandeDetail | null
  isLoading: boolean
  hasSelection: boolean
  isEditing: boolean
  onMutationSuccess: () => void
  onLinesDirtyChange: (dirty: boolean) => void
  affectationLineId: number | null
  onOpenAffectation: (lineId: number | null) => void
}) {
  if (!hasSelection) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="icon-box-gold h-16 w-16 mx-auto"><ShoppingCart className="h-8 w-8" /></div>
        <p className="text-muted-foreground text-sm">Sélectionnez une commande dans la liste</p>
      </div>
    </div>
  )
  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
  if (!commande) return null

  const totalEur = commande.lignes.reduce((s, l) => s + (Number(l.montant) || 0), 0)

  return (
    <LignesSection
      commande={commande}
      isEditing={isEditing}
      totalEur={totalEur}
      onMutationSuccess={onMutationSuccess}
      onLinesDirtyChange={onLinesDirtyChange}
      affectationLineId={affectationLineId}
      onOpenAffectation={onOpenAffectation}
    />
  )
}

// ── Center: Lignes Section ─────────────────────────────

const emptyLineForm = {
  type: 2,
  IDreference: 0,
  IDcolori: 0,
  quantite: '',
  unite: 3,
  prix: '',
  date_livraison: '',
  commentaire: '',
}
type LineFormState = typeof emptyLineForm

function LignesSection({
  commande, isEditing, totalEur, onMutationSuccess, onLinesDirtyChange, affectationLineId, onOpenAffectation,
}: {
  commande: CommandeDetail
  isEditing: boolean
  totalEur: number
  onMutationSuccess: () => void
  onLinesDirtyChange: (dirty: boolean) => void
  affectationLineId: number | null
  onOpenAffectation: (lineId: number | null) => void
}) {
  const [lineDialogOpen, setLineDialogOpen] = useState(false)
  const [editingLine, setEditingLine] = useState<LigneCommande | null>(null)
  const [deleteLineConfirmId, setDeleteLineConfirmId] = useState<number | null>(null)

  const linesLocked = commande.est_soldee === 1

  useEffect(() => {
    if (!isEditing || linesLocked) { setLineDialogOpen(false); setEditingLine(null) }
  }, [isEditing, linesLocked])

  useEffect(() => {
    onLinesDirtyChange(lineDialogOpen)
  }, [lineDialogOpen, onLinesDirtyChange])

  const deleteLineMut = useMutation({
    mutationFn: (lineId: number) => apiFetch(`/commandes-client/lignes/${lineId}`, { method: 'DELETE' }),
    onSuccess: onMutationSuccess,
  })

  const startAddLine = () => { setEditingLine(null); setLineDialogOpen(true) }
  const startEditLine = (l: LigneCommande) => { setEditingLine(l); setLineDialogOpen(true) }

  const drawerOpen = affectationLineId !== null && !isEditing
  const drawerLigne = drawerOpen
    ? commande.lignes.find((l) => l.IDligne_commande_client === affectationLineId) ?? null
    : null

  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col">
        <div className={cn('overflow-auto space-y-2 p-1 scrollbar-transparent', drawerOpen ? 'flex-shrink-0 max-h-[40%]' : 'flex-1 min-h-0')}>
          {commande.lignes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Layers className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">Aucune ligne</p>
              {isEditing && !linesLocked && (
                <Button variant="outline" size="sm" className="mt-3" onClick={startAddLine}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Ajouter une ligne
                </Button>
              )}
            </div>
          ) : (
            commande.lignes.map((l) => (
              <LineCard
                key={l.IDligne_commande_client}
                line={l}
                isEditing={isEditing}
                linesLocked={linesLocked}
                isDrawerOpen={affectationLineId === l.IDligne_commande_client}
                onEdit={() => startEditLine(l)}
                onDelete={() => setDeleteLineConfirmId(l.IDligne_commande_client)}
                onOpenAffectation={onOpenAffectation}
              />
            ))
          )}

          {isEditing && !linesLocked && commande.lignes.length > 0 && (
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
            <AffectationDrawer
              key={drawerLigne.IDligne_commande_client}
              commandeId={commande.IDcommande_client}
              ligne={drawerLigne}
              onClose={() => onOpenAffectation(null)}
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
              <span className="text-accent text-base">{fmtNum(totalEur, 2)} €</span>
            </div>
          </div>
        )}
      </div>

      <LineFormDialog
        open={lineDialogOpen}
        commande={commande}
        line={editingLine}
        onClose={() => { setLineDialogOpen(false); setEditingLine(null) }}
        onSuccess={() => { setLineDialogOpen(false); setEditingLine(null); onMutationSuccess() }}
      />

      <ConfirmDialog
        open={deleteLineConfirmId !== null}
        title="Supprimer la ligne"
        description="Cette ligne sera supprimée et son stock affecté sera libéré."
        confirmLabel="Supprimer"
        isPending={deleteLineMut.isPending}
        onCancel={() => setDeleteLineConfirmId(null)}
        onConfirm={() => {
          if (deleteLineConfirmId !== null) deleteLineMut.mutate(deleteLineConfirmId, { onSuccess: () => setDeleteLineConfirmId(null) })
        }}
      />
    </>
  )
}

function LineCard({
  line, isEditing, linesLocked, isDrawerOpen, onEdit, onDelete, onOpenAffectation,
}: {
  line: LigneCommande
  isEditing: boolean
  linesLocked: boolean
  isDrawerOpen: boolean
  onEdit: () => void
  onDelete: () => void
  onOpenAffectation: (lineId: number | null) => void
}) {
  const { border, iconBg, iconColor } = lineCardColors(line)
  const chip = lineTypeChip(line.type)
  const canAffect = line.type === 1 || line.type === 2
  const clickable = !isEditing && canAffect
  const target = Number(line.quantite) || 0
  const pct = target > 0 ? Math.min(100, (line.affecte / target) * 100) : 0

  return (
    <div
      className={cn(
        'group rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3',
        border,
        clickable && 'cursor-pointer hover:bg-zinc-100 hover:border-accent/40 transition-colors',
        isDrawerOpen && 'ring-1 ring-accent bg-accent/[0.06] border-accent/50',
      )}
      onClick={clickable ? () => onOpenAffectation(isDrawerOpen ? null : line.IDligne_commande_client) : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0', iconBg)}>
            <Layers className={cn('h-3.5 w-3.5', iconColor)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {line.ref_label || '—'}
              {line.colori_reference ? <span className="text-muted-foreground"> / {line.colori_reference}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {chip && (
            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', chip.classes)}>{chip.label}</span>
          )}
          {isEditing && !linesLocked && (
            <div className="flex gap-0.5">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onEdit() }}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete() }}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 ml-9 text-[11px] text-muted-foreground tabular-nums">
        <span>{fmtNum(line.quantite, 1)} {line.unite_label}</span>
        {line.prix > 0 && <span>× {fmtNum(line.prix, 2)} €</span>}
        {line.montant > 0 && <span className="font-medium text-foreground">→ {fmtNum(line.montant, 2)} €</span>}
        {line.date_livraison && (() => {
          const u = deliveryUrgency(line.date_livraison, 0)
          return (
            <span className={cn('ml-auto', u === 'late' && 'font-bold text-red-600', u === 'soon' && 'font-bold text-amber-600')}>
              Livraison {formatHfsqlDate(line.date_livraison)}
            </span>
          )
        })()}
      </div>
      {/* Affectation gauge for écru/fini lines */}
      {canAffect && (
        <div className="mt-2 ml-9">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums mb-0.5">
            <span>Affecté</span>
            <span>{fmtNum(line.affecte, 1)} / {fmtNum(line.quantite, 1)} {line.unite_label}</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-200 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', pct >= 99.9 ? 'bg-green-500' : 'bg-accent')}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Affectation drawer (reserve écru/fini rolls) ────────

function AffectationDrawer({
  commandeId, ligne, onClose, onSuccess,
}: {
  commandeId: number
  ligne: LigneCommande
  onClose: () => void
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const queryKey = ['commande-client-pieces', commandeId, ligne.IDligne_commande_client]

  const { data, isLoading, isError } = useQuery<AffectationPayload>({
    queryKey,
    queryFn: () => apiFetch(`/commandes-client/${commandeId}/lignes/${ligne.IDligne_commande_client}/pieces`),
  })

  const kind = data?.kind ?? (ligne.type === 1 ? 'ecru' : 'fini')

  const linkMut = useMutation({
    mutationFn: (stockId: number) => apiFetch(`/commandes-client/${commandeId}/lignes/${ligne.IDligne_commande_client}/pieces/${kind}/${stockId}`, { method: 'PUT' }),
    onSuccess: (payload: AffectationPayload) => { queryClient.setQueryData(queryKey, payload); onSuccess() },
  })
  const unlinkMut = useMutation({
    mutationFn: (stockId: number) => apiFetch(`/commandes-client/${commandeId}/lignes/${ligne.IDligne_commande_client}/pieces/${kind}/${stockId}`, { method: 'DELETE' }),
    onSuccess: (payload: AffectationPayload) => { queryClient.setQueryData(queryKey, payload); onSuccess() },
  })

  // Supply view: in-progress sous-traitant orders (tricotage / ennoblissement)
  // feeding this line. Only meaningful for écru/fini lines.
  const supplyEnabled = ligne.type === 1 || ligne.type === 2
  const { data: supply, isLoading: supplyLoading } = useQuery<SupplyPayload>({
    queryKey: ['commande-client-supply', commandeId, ligne.IDligne_commande_client],
    queryFn: () => apiFetch(`/commandes-client/${commandeId}/lignes/${ligne.IDligne_commande_client}/supply`),
    enabled: supplyEnabled,
  })

  const tabs: { key: SupplyTab; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { key: 'affectation', label: 'Affectation', icon: Package },
    ...(ligne.type === 2 ? [{ key: 'enno' as const, label: 'Ennoblissement', icon: Droplets }] : []),
    ...(supplyEnabled ? [{ key: 'trico' as const, label: 'Tricotage', icon: KnitIcon }] : []),
  ]
  const [tab, setTab] = useState<SupplyTab>('affectation')

  const linked = data?.linked ?? []
  const available = data?.available ?? []
  const dim = data?.dim ?? 'poids'
  const uniteLabel = data?.unite_label ?? ligne.unite_label
  const target = data?.target_qty ?? (Number(ligne.quantite) || 0)
  const reserved = linked.reduce((s, r) => s + (dim === 'metrage' ? (Number(r.metrage) || 0) : (Number(r.poids) || 0)), 0)
  const pct = target > 0 ? Math.min(100, (reserved / target) * 100) : 0

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-zinc-100/80">
      {/* Tab strip + close (mps_designer §31.4) */}
      <div className="flex-shrink-0 flex items-center border-b bg-zinc-200/50 p-1 gap-1">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer',
                active ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
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

      {tab === 'affectation' && (
        <>
          {/* Affectation progress */}
          <div className="flex-shrink-0 px-3 py-2 border-b bg-zinc-200/30">
            <div className="flex items-center justify-between text-[11px] font-medium tabular-nums mb-1">
              <span className="text-muted-foreground uppercase tracking-wide">Stock affecté</span>
              <span className={cn(pct >= 99.9 ? 'text-green-600' : 'text-foreground')}>
                {fmtNum(reserved, 1)} / {fmtNum(target, 1)} {uniteLabel}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', pct >= 99.9 ? 'bg-green-500' : 'bg-accent')} style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-transparent">
            {isLoading && (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>
            )}
            {isError && (
              <div className="flex flex-col items-center justify-center py-6 text-destructive">
                <AlertCircle className="h-6 w-6 mb-2" /><p className="text-sm">Erreur de chargement</p>
              </div>
            )}
            {!isLoading && !isError && linked.length === 0 && available.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Package className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">Aucun rouleau en stock</p>
                <p className="text-xs mt-1">Aucun rouleau correspondant à cette référence n'est disponible.</p>
              </div>
            )}

            {linked.length > 0 && (
              <section>
                <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                  Affecté à la commande ({linked.length})
                </h3>
                <div className="space-y-1.5">
                  {linked.map((roll) => (
                    <RollRow key={roll.id} roll={roll} dim={dim} action="unlink"
                      onAction={() => unlinkMut.mutate(roll.id)}
                      isBusy={unlinkMut.isPending && unlinkMut.variables === roll.id} />
                  ))}
                </div>
              </section>
            )}

            {available.length > 0 && (
              <section>
                <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                  Stock disponible ({available.length})
                </h3>
                <div className="space-y-1.5">
                  {available.map((roll) => (
                    <RollRow key={roll.id} roll={roll} dim={dim} action="link"
                      onAction={() => linkMut.mutate(roll.id)}
                      isBusy={linkMut.isPending && linkMut.variables === roll.id} />
                  ))}
                </div>
              </section>
            )}

            {!isLoading && !isError && linked.length > 0 && available.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center">Aucun rouleau supplémentaire disponible.</p>
            )}
          </div>
        </>
      )}

      {tab === 'enno' && (
        <div className="flex-1 overflow-y-auto p-3 scrollbar-transparent">
          <SupplyTable
            loading={supplyLoading}
            rows={supply?.ennoblissement ?? []}
            emptyLabel="Aucune commande ennoblisseur en cours"
            emptyIcon={Droplets}
            columns={[
              { key: 'sst', label: 'Ennoblisseur', align: 'left', render: (r) => r.sous_traitant_nom || '—' },
              { key: 'dl', label: 'Délai', align: 'left', render: (r) => fmtSupplyDate(r.date_livraison) },
              { key: 'et', label: 'État', align: 'left', render: (r) => r.etat_label },
              { key: 'di', label: 'Disponible', align: 'right', render: (r) => `${fmtNum(r.qte_disponible, 1)} ml` },
              { key: 'af', label: 'Affecté', align: 'right', render: (r) => `${fmtNum(r.qte_affecte, 1)} ml` },
            ]}
          />
        </div>
      )}

      {tab === 'trico' && (
        <div className="flex-1 overflow-y-auto p-3 scrollbar-transparent">
          <SupplyTable
            loading={supplyLoading}
            rows={supply?.tricotage ?? []}
            emptyLabel="Aucune commande tricotage en cours"
            emptyIcon={KnitIcon}
            columns={[
              { key: 'sst', label: 'Tricoteur', align: 'left', render: (r) => r.sous_traitant_nom || '—' },
              { key: 'dl', label: 'Délai', align: 'left', render: (r) => fmtSupplyDate(r.date_livraison) },
              { key: 'di', label: 'Poids dispo.', align: 'right', render: (r) => `${fmtNum(r.poids_disponible, 1)} Kg` },
              { key: 'af', label: 'Poids affecté', align: 'right', render: (r) => `${fmtNum(r.poids_affecte, 1)} Kg` },
              { key: 'mp', label: 'Métrage pot.', align: 'right', render: (r) => `${fmtNum(r.metrage_potentiel, 0)} ml` },
            ]}
          />
        </div>
      )}
    </div>
  )
}

type SupplyTab = 'affectation' | 'enno' | 'trico'

function fmtSupplyDate(d: string | null): string {
  return d && d.length === 8 && d !== '00000000' ? formatHfsqlDate(d) : '—'
}

// Compact table for the supply tabs (ennoblissement / tricotage). Generic over
// the row shape; columns describe their own rendering + alignment.
function SupplyTable<T extends { id: number }>({
  loading, rows, columns, emptyLabel, emptyIcon: EmptyIcon,
}: {
  loading: boolean
  rows: T[]
  columns: { key: string; label: string; align: 'left' | 'right'; render: (r: T) => ReactNode }[]
  emptyLabel: string
  emptyIcon: ComponentType<{ className?: string }>
}) {
  if (loading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />)}</div>
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <EmptyIcon className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm font-medium">{emptyLabel}</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-border/60 bg-card shadow-sm overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-zinc-200/60 border-b border-border/60">
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {columns.map((c) => (
              <th key={c.key} className={cn('px-2.5 py-2 font-semibold whitespace-nowrap', c.align === 'right' ? 'text-right' : 'text-left')}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-accent/5">
              {columns.map((c) => (
                <td key={c.key} className={cn('px-2.5 py-2 whitespace-nowrap', c.align === 'right' ? 'text-right tabular-nums' : 'text-left')}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RollRow({
  roll, dim, action, onAction, isBusy,
}: {
  roll: RollLite
  dim: 'metrage' | 'poids'
  action: 'link' | 'unlink'
  onAction: () => void
  isBusy: boolean
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
      <Button size="sm" variant={action === 'link' ? 'default' : 'outline'} onClick={onAction} disabled={isBusy} className="flex-shrink-0">
        {isBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          : action === 'link' ? <Link2 className="h-3.5 w-3.5 mr-1.5" /> : <Unlink className="h-3.5 w-3.5 mr-1.5" />}
        {action === 'link' ? 'Affecter' : 'Retirer'}
      </Button>
    </div>
  )
}

// ── Line create/edit dialog ────────────────────────────

function LineFormDialog({
  open, commande, line, onClose, onSuccess,
}: {
  open: boolean
  commande: CommandeDetail
  line: LigneCommande | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isNew = line === null
  const [form, setForm] = useState<LineFormState>(emptyLineForm)
  const [error, setError] = useState<string | null>(null)
  // Price lock: when locked, the price auto-fills from the tariff and the input
  // is read-only (the legacy padlock). New lines start locked (auto); existing
  // lines start unlocked so a previously-saved/overridden price is preserved.
  const [priceLocked, setPriceLocked] = useState(true)
  // Debounced quantity for the auto-price query (avoid a request per keystroke).
  const [debouncedQuantite, setDebouncedQuantite] = useState('')

  useEffect(() => {
    if (!open) return
    if (line) {
      setForm({
        type: line.type || 2,
        IDreference: line.IDreference || 0,
        IDcolori: line.IDcolori || 0,
        quantite: line.quantite != null ? String(line.quantite) : '',
        unite: line.unite || 3,
        prix: line.prix != null ? String(line.prix) : '',
        date_livraison: hfsqlDateToInput(line.date_livraison),
        commentaire: line.commentaire ?? '',
      })
      setPriceLocked(false) // preserve the saved price until the user re-locks
    } else {
      setForm(emptyLineForm)
      setPriceLocked(true)
    }
    setError(null)
  }, [open, line])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuantite(form.quantite), 300)
    return () => clearTimeout(t)
  }, [form.quantite])

  // Auto-price + roll-count note (PrixDeVenteV4 port). Écru/fini + Kg/Ml only.
  const priceableType = form.type === 1 || form.type === 2
  // Gate every price-derived note on the CURRENT form inputs (not just on the
  // cached priceInfo) — keepPreviousData keeps the last result alive after the
  // dialog is cancelled, so without this the note lingers on a fresh empty form.
  const hasPriceInputs = priceableType && form.IDreference > 0 && Number(form.quantite) > 0
  const { data: priceInfo } = useQuery<LinePriceInfo>({
    queryKey: ['cc-line-price', form.type, form.IDreference, form.IDcolori, debouncedQuantite, form.unite],
    queryFn: () => apiFetch(
      `/commandes-client/lookups/line-price?type=${form.type}&ref=${form.IDreference}&coloris=${form.IDcolori}`
      + `&quantite=${encodeURIComponent(debouncedQuantite)}&unite=${form.unite}`,
    ),
    enabled: open && priceableType && form.IDreference > 0 && Number(debouncedQuantite) > 0,
    // Keep the previous note/price visible while the next quantity recomputes, so
    // the dialog doesn't collapse-and-reflow vertically on every keystroke.
    placeholderData: keepPreviousData,
  })

  // When locked and the tariff produced a price, push it into the form.
  useEffect(() => {
    if (!priceLocked) return
    if (priceInfo?.priceable && priceInfo.prix != null) {
      const next = String(priceInfo.prix)
      setForm((f) => (f.prix === next ? f : { ...f, prix: next }))
    }
  }, [priceLocked, priceInfo])

  // Price input is read-only only while the tariff is actively driving it.
  const autoPriceActive = priceLocked && priceableType && !!priceInfo?.priceable && priceInfo.prix != null

  // Reference lookups per type. Écru/fini are restricted to the references
  // assigned to this client in designation_client (the buyable catalogue);
  // divers are generic and stay unrestricted.
  const { data: refsEcru } = useQuery<RefEcru[]>({ queryKey: ['cc-refs-ecru', commande.IDclient], queryFn: () => apiFetch(`/commandes-client/lookups/refs-ecru?client=${commande.IDclient}`), enabled: open && form.type === 1 })
  const { data: refsFini } = useQuery<RefFini[]>({ queryKey: ['cc-refs-fini', commande.IDclient], queryFn: () => apiFetch(`/commandes-client/lookups/refs-fini?client=${commande.IDclient}`), enabled: open && form.type === 2 })
  const { data: refsDivers } = useQuery<RefDivers[]>({ queryKey: ['cc-refs-divers'], queryFn: () => apiFetch('/commandes-client/lookups/refs-divers'), enabled: open && form.type === 3 })

  // Coloris lookup for the selected ref (écru/fini only).
  const { data: coloriOptions } = useQuery<ColoriOption[]>({
    queryKey: ['cc-coloris', form.type, form.IDreference],
    queryFn: async () => {
      if (form.type === 1) {
        const rows = await apiFetch<{ IDcolori_ecru: number; reference: string }[]>(`/commandes-client/lookups/colori-ecru?ref_ecru=${form.IDreference}`)
        return rows.map((r) => ({ id: r.IDcolori_ecru, reference: r.reference }))
      }
      return apiFetch<ColoriOption[]>(`/commandes-client/lookups/colori-fini?ref_fini=${form.IDreference}`)
    },
    enabled: open && form.IDreference > 0 && (form.type === 1 || form.type === 2),
  })

  const saveMut = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        type: form.type,
        IDreference: form.IDreference,
        IDcolori: form.IDcolori,
        quantite: Number(form.quantite) || 0,
        unite: form.unite,
        prix: Number(form.prix) || 0,
        date_livraison: form.date_livraison ? inputDateToHfsql(form.date_livraison) : '',
        commentaire: form.commentaire,
      })
      return isNew
        ? apiFetch(`/commandes-client/${commande.IDcommande_client}/lignes`, { method: 'POST', body })
        : apiFetch(`/commandes-client/lignes/${line!.IDligne_commande_client}`, { method: 'PUT', body })
    },
    onSuccess,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Erreur'),
  })

  const refOptions = form.type === 1
    ? (refsEcru ?? []).map((r) => ({ id: r.IDref_ecru, primary: r.reference }))
    : form.type === 2
      ? (refsFini ?? []).map((r) => ({ id: r.IDref_fini, primary: r.reference, secondary: r.designation }))
      : (refsDivers ?? []).map((r) => ({ id: r.IDref_divers, primary: r.designation }))

  const setType = (t: number) => {
    setForm({ ...form, type: t, IDreference: 0, IDcolori: 0, unite: t === 1 ? 1 : t === 3 ? 4 : 3 })
  }

  const canSave = form.IDreference > 0 && Number(form.quantite) > 0

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-accent" />
            {isNew ? 'Nouvelle ligne' : 'Modifier la ligne'}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          {/* Type toggle */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <div className="flex gap-1">
              {([{ t: 1, l: 'Écru' }, { t: 2, l: 'Fini' }, { t: 3, l: 'Divers' }] as const).map((o) => (
                <button
                  key={o.t}
                  type="button"
                  onClick={() => setType(o.t)}
                  className={cn(
                    'flex-1 px-2 py-1.5 text-xs rounded-md transition-colors border',
                    form.type === o.t ? 'bg-accent text-accent-foreground border-accent shadow-sm font-medium' : 'border-input text-muted-foreground hover:bg-accent/10',
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Référence</label>
            <SearchableCombobox<{ id: number; primary: string; secondary?: string }>
              options={refOptions}
              value={form.IDreference}
              onChange={(id) => setForm({ ...form, IDreference: id, IDcolori: 0 })}
              getId={(r) => r.id}
              getPrimary={(r) => r.primary}
              getSecondary={(r) => r.secondary}
              placeholder="Choisir une référence"
            />
          </div>
          {form.type !== 3 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Coloris</label>
              <PopoverSelect
                options={(coloriOptions ?? []).map((c) => ({ id: c.id, primary: c.reference }))}
                value={form.IDcolori}
                onChange={(id) => setForm({ ...form, IDcolori: id })}
                disabled={!form.IDreference}
                emptyLabel="— Choisir —"
              />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Quantité</label>
              <input type="number" value={form.quantite} onChange={(e) => setForm({ ...form, quantite: e.target.value })} className={inputClass} />
            </div>
            <div className="col-span-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Unité</label>
              <PopoverSelect
                options={[{ id: 1, primary: 'Kg' }, { id: 3, primary: 'Ml' }, { id: 4, primary: 'unité' }, { id: 5, primary: 'm²' }]}
                value={form.unite}
                onChange={(id) => setForm({ ...form, unite: id })}
                hideEmpty
              />
            </div>
            <div className="col-span-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Prix (€)</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={form.prix}
                  onChange={(e) => setForm({ ...form, prix: e.target.value })}
                  readOnly={autoPriceActive}
                  className={cn(inputClass, autoPriceActive && 'bg-zinc-100 text-muted-foreground cursor-not-allowed')}
                />
                {priceableType && (
                  <button
                    type="button"
                    onClick={() => setPriceLocked((v) => !v)}
                    title={priceLocked ? 'Déverrouiller le prix (saisie manuelle)' : 'Verrouiller le prix (calcul automatique)'}
                    className={cn(
                      'flex-shrink-0 h-8 w-8 rounded-md border flex items-center justify-center transition-colors',
                      priceLocked ? 'border-accent/40 text-accent bg-accent/5 hover:bg-accent/10' : 'border-input text-muted-foreground hover:bg-zinc-100',
                    )}
                  >
                    {priceLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* Roll-count note (green when the quantity is a whole-roll multiple,
              amber when it overshoots a clean roll count). */}
          {hasPriceInputs && priceInfo?.priceable && (() => {
            const { nRolls, exact, cleanQty, unite_label } = priceInfo
            if (nRolls < 1) {
              return (
                <p className="text-xs font-medium text-amber-600 -mt-1">
                  Métrage — moins d’un rouleau
                </p>
              )
            }
            return (
              <p className={cn('text-xs font-medium -mt-1', exact ? 'text-green-600' : 'text-amber-600')}>
                {exact ? '' : '> '}{nRolls} Rouleau{nRolls > 1 ? 'x' : ''} ({fmtNum(cleanQty)} {unite_label})
              </p>
            )
          })()}
          {/* Commercial nudge: within 15% of the next (cheaper) tariff tranche —
              suggest the employee propose the round-up to the customer. */}
          {hasPriceInputs && priceInfo?.priceable && priceInfo.nearNextTranche && priceInfo.nextTranchePrix != null && (() => {
            const saving = priceInfo.prix && priceInfo.prix > 0
              ? Math.round(((priceInfo.prix - priceInfo.nextTranchePrix!) / priceInfo.prix) * 100)
              : 0
            return (
              <div className="flex items-start gap-2 rounded-md border border-gold/50 bg-gold/10 px-2.5 py-2 -mt-1">
                <Sparkles className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-900 leading-snug">
                  Plus que <b>{fmtNum(priceInfo.nextTrancheGapQty)} {priceInfo.unite_label}</b> pour atteindre{' '}
                  <b>{priceInfo.nextTrancheRolls} rouleaux</b> et passer à{' '}
                  <b>{fmtNum(priceInfo.nextTranchePrix!, 2)} €</b>/{priceInfo.unite_label}
                  {saving > 0 ? <> (<b>−{saving}%</b>)</> : null}.{' '}
                  <span className="text-amber-700">À proposer au client&nbsp;?</span>
                </p>
              </div>
            )
          })()}
          <LabeledInput label="Date livraison" type="date" value={form.date_livraison} onChange={(v) => setForm({ ...form, date_livraison: v })} />
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Commentaire</label>
            <textarea value={form.commentaire} onChange={(e) => setForm({ ...form, commentaire: e.target.value })} rows={2}
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
          </div>
          {error && (
            <div className="flex items-start gap-1.5 text-xs text-destructive mt-3">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!canSave || saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Right Panel: Sidebar with Tabs ─────────────────────

type SidebarTab = 'info' | 'adresses' | 'docs' | 'historique'

function DetailSidebar({
  commande, isLoading, isEditing,
  editDateCommande, onEditDateCommandeChange,
  editRefClient, onEditRefClientChange,
  editCommentaire, onEditCommentaireChange,
  editCommentaireInterne, onEditCommentaireInterneChange,
  editIDModePaiement, onEditIDModePaiementChange,
  editIDEcheance, onEditIDEcheanceChange,
  editRemise, onEditRemiseChange,
  editFraisPort, onEditFraisPortChange,
  editIDAdresseFacturation, onEditIDAdresseFacturationChange,
  editIDAdresseLivraison, onEditIDAdresseLivraisonChange,
  onToggleEtat, isTogglingEtat,
}: {
  commande: CommandeDetail | null
  isLoading: boolean
  isEditing: boolean
  editDateCommande: string; onEditDateCommandeChange: (v: string) => void
  editRefClient: string; onEditRefClientChange: (v: string) => void
  editCommentaire: string; onEditCommentaireChange: (v: string) => void
  editCommentaireInterne: string; onEditCommentaireInterneChange: (v: string) => void
  editIDModePaiement: number; onEditIDModePaiementChange: (v: number) => void
  editIDEcheance: number; onEditIDEcheanceChange: (v: number) => void
  editRemise: string; onEditRemiseChange: (v: string) => void
  editFraisPort: string; onEditFraisPortChange: (v: string) => void
  editIDAdresseFacturation: number; onEditIDAdresseFacturationChange: (v: number) => void
  editIDAdresseLivraison: number; onEditIDAdresseLivraisonChange: (v: number) => void
  onToggleEtat: () => void
  isTogglingEtat: boolean
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('info')

  const { data: modesPaiement } = useQuery<ModePaiement[]>({
    queryKey: ['cc-modes-paiement'],
    queryFn: () => apiFetch('/commandes-client/lookups/modes-paiement'),
    enabled: isEditing,
  })
  const { data: echeances } = useQuery<Echeance[]>({
    queryKey: ['cc-echeances'],
    queryFn: () => apiFetch('/commandes-client/lookups/echeances'),
    enabled: isEditing,
  })
  const { data: adresses } = useQuery<AdresseLookup[]>({
    queryKey: ['cc-adresses', commande?.IDclient],
    queryFn: () => apiFetch(`/commandes-client/lookups/adresses?client=${commande?.IDclient}`),
    enabled: isEditing && !!commande?.IDclient,
  })

  if (isLoading) return (
    <div className="w-96 flex-shrink-0 bg-muted/30 rounded-xl border p-4 space-y-4">
      <div className="flex gap-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 flex-1 bg-muted animate-pulse rounded-md" />)}</div>
      {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
    </div>
  )
  if (!commande) return null

  const tabs: { key: SidebarTab; label: string; icon: React.ElementType }[] = [
    { key: 'info', label: 'Info', icon: Info },
    { key: 'adresses', label: 'Adresses', icon: MapPin },
    { key: 'docs', label: 'Docs', icon: FileText },
    { key: 'historique', label: 'Historique', icon: History },
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
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-sm font-medium rounded-md transition-colors',
                  activeTab === tab.key ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10',
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
              commande={commande} isEditing={isEditing}
              modesPaiement={modesPaiement ?? []} echeances={echeances ?? []}
              editDateCommande={editDateCommande} onEditDateCommandeChange={onEditDateCommandeChange}
              editRefClient={editRefClient} onEditRefClientChange={onEditRefClientChange}
              editCommentaire={editCommentaire} onEditCommentaireChange={onEditCommentaireChange}
              editCommentaireInterne={editCommentaireInterne} onEditCommentaireInterneChange={onEditCommentaireInterneChange}
              editIDModePaiement={editIDModePaiement} onEditIDModePaiementChange={onEditIDModePaiementChange}
              editIDEcheance={editIDEcheance} onEditIDEcheanceChange={onEditIDEcheanceChange}
              editRemise={editRemise} onEditRemiseChange={onEditRemiseChange}
              editFraisPort={editFraisPort} onEditFraisPortChange={onEditFraisPortChange}
            />
          )}
          {activeTab === 'adresses' && (
            <AdressesTab
              commande={commande} isEditing={isEditing} adresses={adresses ?? []}
              editIDAdresseFacturation={editIDAdresseFacturation} onEditIDAdresseFacturationChange={onEditIDAdresseFacturationChange}
              editIDAdresseLivraison={editIDAdresseLivraison} onEditIDAdresseLivraisonChange={onEditIDAdresseLivraisonChange}
            />
          )}
          {activeTab === 'docs' && <DocsTab commande={commande} isEditing={isEditing} />}
          {activeTab === 'historique' && <HistoriqueTab commandeId={commande.IDcommande_client} />}
        </div>
      </div>
      <StatusFooter etat={commande.est_soldee} onToggle={onToggleEtat} isToggling={isTogglingEtat} disabled={isEditing} />
    </div>
  )
}

function StatusFooter({ etat, onToggle, isToggling, disabled }: { etat: number; onToggle: () => void; isToggling: boolean; disabled: boolean }) {
  const isTerminee = etat === 1
  const Icon = isTerminee ? CheckCircle2 : Clock
  const label = isTerminee ? 'Terminée' : 'En cours'
  const actionLabel = isTerminee ? 'Rouvrir' : 'Clôturer'
  const ActionIcon = isTerminee ? Clock : CheckCircle2
  return (
    <div className={cn('flex-shrink-0 rounded-xl border shadow-sm overflow-hidden flex items-stretch h-11', isTerminee ? 'bg-success border-success' : 'bg-primary border-primary')}>
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
        <ActionIcon className="h-3.5 w-3.5" />{actionLabel}
      </button>
    </div>
  )
}

// ── Sidebar Tab: Info ──────────────────────────────────

function InfoTab({
  commande, isEditing, modesPaiement, echeances,
  editDateCommande, onEditDateCommandeChange,
  editRefClient, onEditRefClientChange,
  editCommentaire, onEditCommentaireChange,
  editCommentaireInterne, onEditCommentaireInterneChange,
  editIDModePaiement, onEditIDModePaiementChange,
  editIDEcheance, onEditIDEcheanceChange,
  editRemise, onEditRemiseChange,
  editFraisPort, onEditFraisPortChange,
}: {
  commande: CommandeDetail
  isEditing: boolean
  modesPaiement: ModePaiement[]
  echeances: Echeance[]
  editDateCommande: string; onEditDateCommandeChange: (v: string) => void
  editRefClient: string; onEditRefClientChange: (v: string) => void
  editCommentaire: string; onEditCommentaireChange: (v: string) => void
  editCommentaireInterne: string; onEditCommentaireInterneChange: (v: string) => void
  editIDModePaiement: number; onEditIDModePaiementChange: (v: number) => void
  editIDEcheance: number; onEditIDEcheanceChange: (v: number) => void
  editRemise: string; onEditRemiseChange: (v: string) => void
  editFraisPort: string; onEditFraisPortChange: (v: string) => void
}) {
  const modeLabel = modesPaiement.find((m) => m.IDmode_paiement === commande.IDmode_paiement)?.libelle
  const echeanceLabel = echeances.find((e) => e.IDecheance === commande.IDecheance)?.libelle
  const smallInput = 'h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right w-[120px]'
  return (
    <div className="space-y-3">
      <div className={cn('p-3 rounded-lg border bg-card shadow-sm space-y-2', isEditing && editSectionClass)}>
        <KV label="Client" value={commande.client_nom || '—'} />
        <KV label="Date commande" value={isEditing ? (
          <input type="date" value={editDateCommande} onChange={(e) => onEditDateCommandeChange(e.target.value)}
            className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right" />
        ) : (commande.date_commande ? formatHfsqlDate(commande.date_commande) : '—')} />
        <KV label="Réf. client" value={isEditing ? (
          <input type="text" value={editRefClient} onChange={(e) => onEditRefClientChange(e.target.value)} className={smallInput} />
        ) : (commande.ref_client || '—')} />
        <KV label="Mode paiement" value={isEditing ? (
          <PopoverSelect size="sm" options={modesPaiement.map((m) => ({ id: m.IDmode_paiement, primary: m.libelle }))}
            value={editIDModePaiement} onChange={onEditIDModePaiementChange} emptyLabel="—" />
        ) : (modeLabel || '—')} />
        <KV label="Échéance" value={isEditing ? (
          <PopoverSelect size="sm" options={echeances.map((e) => ({ id: e.IDecheance, primary: e.libelle }))}
            value={editIDEcheance} onChange={onEditIDEcheanceChange} emptyLabel="—" />
        ) : (echeanceLabel || '—')} />
        <KV label="Remise (€)" value={isEditing ? (
          <input type="number" value={editRemise} onChange={(e) => onEditRemiseChange(e.target.value)} className={smallInput} />
        ) : (commande.remise ? fmtNum(commande.remise, 2) : '—')} />
        <KV label="Frais de port (€)" value={isEditing ? (
          <input type="number" value={editFraisPort} onChange={(e) => onEditFraisPortChange(e.target.value)} className={smallInput} />
        ) : (commande.frais_port ? fmtNum(commande.frais_port, 2) : '—')} />
      </div>

      <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />Commentaire
        </p>
        {isEditing ? (
          <textarea value={editCommentaire} onChange={(e) => onEditCommentaireChange(e.target.value)} rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
        ) : commande.commentaire?.trim() ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{commande.commentaire.trim()}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Aucun commentaire</p>
        )}
      </div>

      <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />Journal
        </p>
        {isEditing ? (
          <textarea value={editCommentaireInterne} onChange={(e) => onEditCommentaireInterneChange(e.target.value)} rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
        ) : commande.commentaire_interne?.trim() ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{commande.commentaire_interne.trim()}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Journal vide</p>
        )}
      </div>
    </div>
  )
}

// ── Sidebar Tab: Adresses ──────────────────────────────

function AdressesTab({
  commande, isEditing, adresses,
  editIDAdresseFacturation, onEditIDAdresseFacturationChange,
  editIDAdresseLivraison, onEditIDAdresseLivraisonChange,
}: {
  commande: CommandeDetail
  isEditing: boolean
  adresses: AdresseLookup[]
  editIDAdresseFacturation: number; onEditIDAdresseFacturationChange: (v: number) => void
  editIDAdresseLivraison: number; onEditIDAdresseLivraisonChange: (v: number) => void
}) {
  return (
    <div className="space-y-3">
      <AdresseCard label="Facturation" adresse={commande.adresse_facturation} isEditing={isEditing}
        options={adresses} selectedId={editIDAdresseFacturation} onSelect={onEditIDAdresseFacturationChange} />
      <AdresseCard label="Livraison" adresse={commande.adresse_livraison} isEditing={isEditing}
        options={adresses} selectedId={editIDAdresseLivraison} onSelect={onEditIDAdresseLivraisonChange} />
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
  const displayAdresse: AdresseLite | null = isEditing ? (options.find((o) => o.IDadresse === selectedId) ?? adresse) : adresse
  return (
    <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{label}</p>
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
      <AdressePickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} label={label}
        options={options} selectedId={selectedId} onSelect={(id) => { onSelect(id); setPickerOpen(false) }} />
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
          <DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-accent" />Choisir une adresse de {label.toLowerCase()}</DialogTitle>
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
                      {!!a.est_defaut_facturation && <Badge variant="outline" className="text-[10px] py-0">Facturation</Badge>}
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

// ── Sidebar Tab: Docs ──────────────────────────────────

interface GedDocument {
  IDged: number
  nom: string | null
  commentaire: string | null
  IDtype_doc: number
  type_nom: string | null
}
interface TypeDoc { IDtype_doc: number; nom: string }

function DocsTab({ commande, isEditing }: { commande: CommandeDetail; isEditing: boolean }) {
  const queryClient = useQueryClient()
  const commandeId = commande.IDcommande_client
  const docsQueryKey = ['commande-client-docs', commandeId] as const

  const { data, isLoading, error } = useQuery<GedDocument[]>({
    queryKey: docsQueryKey,
    queryFn: () => apiFetch(`/commandes-client/${commandeId}/documents`),
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
    mutationFn: (idged: number) => apiFetch(`/commandes-client/${commandeId}/documents/${idged}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  return (
    <>
      {isLoading && <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-accent" /></div>}
      {!!error && (
        <div className="flex items-center gap-1.5 py-3 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5" /><span>Erreur de chargement</span></div>
      )}
      {!isLoading && !error && !data?.length && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <FileText className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm font-medium">Aucun document</p>
          <p className="text-[11px] mt-1 text-center">Les bons de commande, accusés et autres documents liés à cette commande apparaîtront ici.</p>
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
                className={cn('group p-3 rounded-lg border bg-card shadow-sm cursor-pointer hover:border-accent/40 transition-colors', isEditing && editSectionClass)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 bg-amber-400/10"><FileText className="h-3.5 w-3.5 text-amber-600" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" title={title}>{title}</p>
                    {!!doc.type_nom && <p className="text-[11px] text-muted-foreground truncate">{doc.type_nom}</p>}
                  </div>
                  {isEditing && (
                    <Button variant="ghost" size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onClick={(e) => { e.stopPropagation(); setDeleteDocConfirm(doc) }} title="Supprimer">
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
        <Button variant="ghost" size="sm" className="w-full mt-2 text-muted-foreground hover:text-foreground" onClick={() => setCreateOpen(true)}>
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
        description={deleteDocConfirm ? `« ${deleteDocConfirm.nom?.trim() || `Document #${deleteDocConfirm.IDged}`} » sera supprimé définitivement.` : undefined}
        confirmLabel="Supprimer"
        isPending={deleteMut.isPending}
        onCancel={() => setDeleteDocConfirm(null)}
        onConfirm={() => { if (deleteDocConfirm) deleteMut.mutate(deleteDocConfirm.IDged, { onSuccess: () => setDeleteDocConfirm(null) }) }}
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
  const [idTypeDoc, setIdTypeDoc] = useState(0)
  const [commentaire, setCommentaire] = useState('')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [newFileUrl, setNewFileUrl] = useState<string | null>(null)
  const [removeFichier, setRemoveFichier] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: typeDocs } = useQuery<TypeDoc[]>({
    queryKey: ['cc-types-doc'],
    queryFn: () => apiFetch('/commandes-client/lookups/type-doc'),
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
    if (!open && newFileUrl) { URL.revokeObjectURL(newFileUrl); setNewFileUrl(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleFilePick = (f: File) => {
    if (newFileUrl) URL.revokeObjectURL(newFileUrl)
    setNewFile(f); setNewFileUrl(URL.createObjectURL(f)); setRemoveFichier(false)
  }
  const handleRemoveFile = () => {
    if (newFileUrl) URL.revokeObjectURL(newFileUrl)
    setNewFile(null); setNewFileUrl(null); setRemoveFichier(true)
  }

  const handleSave = async () => {
    setError(null); setIsSaving(true)
    try {
      const formData = new FormData()
      formData.append('nom', nom)
      formData.append('commentaire', commentaire)
      formData.append('IDtype_doc', String(idTypeDoc))
      if (newFile) formData.append('fichier', newFile)
      if (removeFichier && !newFile) formData.append('remove_fichier', '1')
      const url = isNew
        ? `${API_URL}/commandes-client/${commandeId}/documents`
        : `${API_URL}/commandes-client/${commandeId}/documents/${doc!.IDged}`
      const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', body: formData, credentials: 'include' })
      if (!res.ok) throw new Error((await res.text().catch(() => '')) || `HTTP ${res.status}`)
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue'); setIsSaving(false)
    }
  }

  const previewUrl = newFileUrl ? newFileUrl
    : !isNew && !removeFichier && doc ? `${API_URL}/commandes-client/${commandeId}/documents/${doc.IDged}/fichier#view=FitH` : null

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-accent" />{isNew ? 'Ajouter un document' : 'Modifier le document'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 flex gap-4">
          <div className="w-80 flex-shrink-0 overflow-y-auto space-y-3 px-1">
            <LabeledInput label="Nom" value={nom} onChange={setNom} autoFocus />
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type de document</label>
              <PopoverSelect options={(typeDocs ?? []).map((t) => ({ id: t.IDtype_doc, primary: t.nom }))}
                value={idTypeDoc} onChange={setIdTypeDoc} emptyLabel="— Aucun —" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Commentaire</label>
              <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={4}
                className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
            </div>
            {!!error && (
              <div className="flex items-start gap-1.5 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /><span className="break-all">{error}</span></div>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="flex-1 min-h-0 rounded-lg border border-border/60 bg-zinc-50 overflow-hidden">
              {previewUrl ? (
                <iframe src={previewUrl} className="w-full h-full" title="Document" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                  <FileText className="h-12 w-12 mb-2 opacity-30" /><p className="text-sm">Aucun fichier</p><p className="text-[11px]">Choisissez un fichier ci-dessous</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input type="file" className="hidden"
                  onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePick(f) }} />
                <span className={cn(inputClass, 'inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/5 w-auto px-3')}>
                  <Upload className="h-3.5 w-3.5" />{newFile ? newFile.name : 'Choisir un fichier'}
                </span>
              </label>
              {(newFile || (!isNew && !removeFichier && doc)) && (
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleRemoveFile} title="Retirer le fichier"><X className="h-3.5 w-3.5" /></Button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>Annuler</Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}<Save className="h-3.5 w-3.5 mr-1.5" />Enregistrer
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DocViewDialog({ commandeId, doc, onClose }: { commandeId: number; doc: GedDocument | null; onClose: () => void }) {
  const [fichierOk, setFichierOk] = useState<boolean | null>(null)
  useEffect(() => {
    if (!doc) { setFichierOk(null); return }
    setFichierOk(null)
    fetch(`${API_URL}/commandes-client/${commandeId}/documents/${doc.IDged}/fichier`, { method: 'HEAD', credentials: 'include' })
      .then((r) => setFichierOk(r.ok)).catch(() => setFichierOk(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.IDged, commandeId])
  if (!doc) return null
  return (
    <Dialog open={!!doc} onOpenChange={() => onClose()}>
      {fichierOk ? (
        <div className="relative z-50 w-[60vw] max-w-3xl h-[95vh]" onClick={(e) => e.stopPropagation()}>
          <iframe src={`${API_URL}/commandes-client/${commandeId}/documents/${doc.IDged}/fichier#view=FitH`} className="w-full h-full rounded-lg" title={doc.nom ?? 'Document'} />
        </div>
      ) : (
        <DialogContent className="max-w-sm" onClose={onClose}>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="text-center space-y-2">
              <FileText className="h-12 w-12 mx-auto opacity-30" />
              <p className="text-sm">{fichierOk === null ? 'Chargement...' : 'Aucun document attaché'}</p>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}

// ── Sidebar Tab: Historique ────────────────────────────

interface HistoriqueEvent { kind: 'email'; type_label: string; recipients: string[]; DATE: string }

function HistoriqueTab({ commandeId }: { commandeId: number }) {
  const { data, isLoading, error } = useQuery<HistoriqueEvent[]>({
    queryKey: ['commande-client-historique', commandeId],
    queryFn: () => apiFetch(`/commandes-client/${commandeId}/historique`),
  })
  if (isLoading) return <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-accent" /></div>
  if (error) return <div className="flex items-center gap-1.5 py-3 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5" /><span>Erreur de chargement</span></div>
  if (!data?.length) return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <History className="h-10 w-10 mb-3 opacity-40" />
      <p className="text-sm font-medium">Aucun évènement</p>
      <p className="text-[11px] mt-1 text-center">Les envois d'emails liés à cette commande apparaîtront ici.</p>
    </div>
  )
  return (
    <div className="space-y-2">
      {data.map((ev, i) => (
        <div key={i} className="p-3 rounded-lg border bg-card shadow-sm">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 bg-accent/10"><AtSign className="h-3.5 w-3.5 text-accent" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{ev.type_label}</p>
              <p className="text-[11px] text-muted-foreground">{ev.DATE ? formatDateTime(ev.DATE) : ''}</p>
            </div>
          </div>
          {ev.recipients.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1.5 ml-9 truncate" title={ev.recipients.join(', ')}>
              À : {ev.recipients.join(', ')}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function formatDateTime(raw: string): string {
  // envoi_email.DATE is "YYYY-MM-DD HH:MM:SS.sss"
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return raw
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`
}

// ── Create Dialog ──────────────────────────────────────

function CreateCommandeDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (newId: number) => void }) {
  const [clientId, setClientId] = useState(0)
  const [dateCommande, setDateCommande] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [refClient, setRefClient] = useState('')
  const [modePaiementId, setModePaiementId] = useState(0)
  const [echeanceId, setEcheanceId] = useState(0)
  const [adresseFactId, setAdresseFactId] = useState(0)
  const [adresseLivId, setAdresseLivId] = useState(0)

  const { data: clients } = useQuery<ClientLite[]>({ queryKey: ['cc-clients'], queryFn: () => apiFetch('/commandes-client/lookups/clients'), enabled: open })
  const { data: modesPaiement } = useQuery<ModePaiement[]>({ queryKey: ['cc-modes-paiement'], queryFn: () => apiFetch('/commandes-client/lookups/modes-paiement'), enabled: open })
  const { data: echeances } = useQuery<Echeance[]>({ queryKey: ['cc-echeances'], queryFn: () => apiFetch('/commandes-client/lookups/echeances'), enabled: open })
  const { data: adresses } = useQuery<AdresseLookup[]>({
    queryKey: ['cc-create-adresses', clientId],
    queryFn: () => apiFetch(`/commandes-client/lookups/adresses?client=${clientId}`),
    enabled: open && clientId > 0,
  })

  useEffect(() => {
    if (!adresses) return
    const defaultFact = adresses.find((a) => a.est_defaut_facturation) ?? adresses.find((a) => a.est_defaut) ?? adresses[0]
    const defaultLiv = adresses.find((a) => a.est_defaut_livraison) ?? adresses.find((a) => a.est_defaut) ?? adresses[0]
    setAdresseFactId(defaultFact?.IDadresse ?? 0)
    setAdresseLivId(defaultLiv?.IDadresse ?? 0)
  }, [adresses])

  // Prefill payment fields from the selected client's sheet (client.IDmode_paiement
  // / IDecheance). Keyed on clientId so re-picking a client re-applies its defaults.
  useEffect(() => {
    if (clientId <= 0 || !clients) return
    const c = clients.find((x) => x.IDclient === clientId)
    if (!c) return
    setModePaiementId(c.IDmode_paiement ?? 0)
    setEcheanceId(c.IDecheance ?? 0)
  }, [clientId, clients])

  useEffect(() => {
    if (!open) {
      setClientId(0); setDateCommande(new Date().toISOString().slice(0, 10)); setRefClient('')
      setModePaiementId(0); setEcheanceId(0); setAdresseFactId(0); setAdresseLivId(0)
    }
  }, [open])

  const createMut = useMutation({
    mutationFn: () => apiFetch('/commandes-client', {
      method: 'POST',
      body: JSON.stringify({
        IDclient: clientId,
        date_commande: inputDateToHfsql(dateCommande),
        ref_client: refClient,
        IDmode_paiement: modePaiementId || 0,
        IDecheance: echeanceId || 0,
        IDadresse_facturation: adresseFactId || 0,
        IDadresse_livraison: adresseLivId || 0,
      }),
    }),
    onSuccess: (data: { IDcommande_client: number }) => onCreated(data.IDcommande_client),
  })

  const canSave = clientId > 0 && dateCommande.length > 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-accent" />Nouvelle commande</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Client</label>
            <SearchableCombobox<ClientLite>
              options={clients ?? []}
              value={clientId}
              onChange={setClientId}
              getId={(c) => c.IDclient}
              getPrimary={(c) => c.nom}
              placeholder="Choisir un client"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Date commande</label>
              <input type="date" value={dateCommande} onChange={(e) => setDateCommande(e.target.value)} className={cn(inputClass, 'h-9')} />
            </div>
            <LabeledInput label="Réf. client" value={refClient} onChange={setRefClient} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mode paiement</label>
              <PopoverSelect options={(modesPaiement ?? []).map((m) => ({ id: m.IDmode_paiement, primary: m.libelle }))} value={modePaiementId} onChange={setModePaiementId} emptyLabel="—" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Échéance</label>
              <PopoverSelect options={(echeances ?? []).map((e) => ({ id: e.IDecheance, primary: e.libelle }))} value={echeanceId} onChange={setEcheanceId} emptyLabel="—" />
            </div>
          </div>
          {clientId > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Adr. facturation</label>
                <PopoverSelect options={(adresses ?? []).map(adresseOption)} value={adresseFactId} onChange={setAdresseFactId} emptyLabel="—" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Adr. livraison</label>
                <PopoverSelect options={(adresses ?? []).map(adresseOption)} value={adresseLivId} onChange={setAdresseLivId} emptyLabel="—" />
              </div>
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

// ── Shared components ──────────────────────────────────

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-right truncate">{value}</span>
    </div>
  )
}

function LabeledInput({ label, value, onChange, type = 'text', autoFocus }: { label: string; value: string; onChange: (v: string) => void; type?: string; autoFocus?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} autoComplete="off" className={inputClass} />
    </div>
  )
}
