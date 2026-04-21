import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import {
  Search,
  Loader2,
  AlertCircle,
  Pencil,
  Plus,
  X,
  Save,
  Trash2,
  Printer,
  AtSign,
  Mail,
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  Ban,
  ChevronUp,
  MessageSquare,
  Palette,
  ChevronDown,
  Info,
  Building2,
  Factory,
  FileText,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { cn } from '@/lib/utils'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { apiFetch } from '@/lib/api'

// ── Types ────────────────────────────────────────────────

type EtudeStatut = 1 | 2 | 3 | 4
type StatutFilter = 'attente_labo' | 'soumis' | 'accepte' | 'annule' | 'all'
type SoumissionAccepte = 0 | 1 | 2 // 0=pending, 1=accepted, 2=refused

interface EtudeListRow {
  IDetude_col: number
  IDclient: number
  IDref_fini: number
  IDref_fini_colori: number
  IDsous_traitant: number
  libelle: string | null
  num_commande: string | null
  desig_client: string | null
  date_reception_type: string | null
  statut_col: EtudeStatut
  date_derniere_action: string | null
  client_nom: string | null
  ref_fini_reference: string | null
  ref_fini_colori_reference: string | null
  sous_traitant_nom: string | null
  nb_soumissions: number
  last_soumission_date: string | null
}

interface Soumission {
  IDsoum_col: number
  IDetude_col: number
  date_soum: string | null
  type_soum: string | null
  observation: string | null
  date_reponse: string | null
  accepte: SoumissionAccepte
}

interface EtudeDetail extends EtudeListRow {
  commentaire: string | null
  ref_fini_designation: string | null
  ref_fini_colori_has_photo: 0 | 1
  soumissions: Soumission[]
}

interface ClientOption { IDclient: number; nom: string | null }
interface RefFiniOption { IDref_fini: number; reference: string | null; designation: string | null }
interface RefFiniColoriOption { IDref_fini_colori: number; reference: string | null; has_photo: 0 | 1 }
interface SousTraitantOption { IDsous_traitant: number; nom: string | null }

// ── Status metadata ──────────────────────────────────────

const STATUT_META: Record<EtudeStatut, {
  label: string
  short: string
  filter: StatutFilter
  icon: typeof Clock
  /** CSS color for the list-card inset-shadow strip */
  stripRgb: string
  /** Border + ring classes for the selected list card */
  selectedRing: string
  /** Solid bg + matching border for the footer pill */
  solidBg: string
  /** Badge variant for the list-card mini chip */
  badgeVariant: 'warning' | 'default' | 'success' | 'destructive' | 'secondary'
  badgeClass?: string
}> = {
  1: {
    label: 'Attente labo',
    short: 'Labo',
    filter: 'attente_labo',
    icon: Clock,
    stripRgb: 'rgb(245 158 11)', // amber-500
    selectedRing: 'ring-amber-500 border-amber-500',
    solidBg: 'bg-amber-500 border-amber-500',
    badgeVariant: 'warning',
  },
  2: {
    label: 'Soumis au client',
    short: 'Soumis',
    filter: 'soumis',
    icon: Send,
    stripRgb: 'rgb(59 130 246)', // blue-500
    selectedRing: 'ring-blue-500 border-blue-500',
    solidBg: 'bg-blue-500 border-blue-500',
    badgeVariant: 'default',
    badgeClass: 'bg-blue-500 hover:bg-blue-500/90',
  },
  3: {
    label: 'Accepté',
    short: 'Accepté',
    filter: 'accepte',
    icon: CheckCircle2,
    stripRgb: 'rgb(34 197 94)', // green-500
    selectedRing: 'ring-green-500 border-green-500',
    solidBg: 'bg-success border-success',
    badgeVariant: 'success',
  },
  4: {
    label: 'Annulé',
    short: 'Annulé',
    filter: 'annule',
    icon: Ban,
    stripRgb: 'rgb(113 113 122)', // zinc-500
    selectedRing: 'ring-zinc-500 border-zinc-500',
    solidBg: 'bg-zinc-500 border-zinc-500',
    badgeVariant: 'secondary',
  },
}

const STATUT_ORDER: EtudeStatut[] = [1, 2, 3, 4]
const FILTER_ORDER: StatutFilter[] = ['attente_labo', 'soumis', 'accepte', 'annule', 'all']

function filterToLabel(f: StatutFilter): string {
  if (f === 'all') return 'Tous'
  const statut = STATUT_ORDER.find((s) => STATUT_META[s].filter === f)
  return statut ? STATUT_META[statut].label : 'Tous'
}

/** Days since a YYYY-MM-DD ISO string, or null if unparseable. */
function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((today.getTime() - target.getTime()) / 86_400_000)
}

/** Compute the urgency override for a list card — statut 1 or 2 AND not touched
 *  in 30+ days = stale → red. Otherwise the statut color drives the strip. */
function isStale(statut: EtudeStatut, dateDerniereAction: string | null): boolean {
  if (statut !== 1 && statut !== 2) return false
  const days = daysSince(dateDerniereAction)
  return days !== null && days > 30
}

/** Format an ISO YYYY-MM-DD as fr-FR locale. */
function formatIsoFr(iso: string | null): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]}`
}

function soumissionStatut(s: Soumission): 'pending' | 'accepted' | 'refused' {
  const hasResponse = s.date_reponse && s.date_reponse.trim().length > 0
  if (!hasResponse || s.accepte === 0) return 'pending'
  if (s.accepte === 1) return 'accepted'
  return 'refused'
}

// ── Main page ────────────────────────────────────────────

export function EtudesColoris() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatutFilter>('attente_labo')
  const [isEditing, setIsEditing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [openSoumissionId, setOpenSoumissionId] = useState<number | null>(null)
  const [autoEditForId, setAutoEditForId] = useState<number | null>(null)
  const [deleteEtudeConfirmOpen, setDeleteEtudeConfirmOpen] = useState(false)
  const [deleteSoumissionId, setDeleteSoumissionId] = useState<number | null>(null)
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [emailModalOpen, setEmailModalOpen] = useState(false)

  // Edit-mode draft state
  const [editLibelle, setEditLibelle] = useState('')
  const [editNumCommande, setEditNumCommande] = useState('')
  const [editDesigClient, setEditDesigClient] = useState('')
  const [editCommentaire, setEditCommentaire] = useState('')
  const [editDateRecep, setEditDateRecep] = useState('')
  const [editIDClient, setEditIDClient] = useState(0)
  const [editIDRefFini, setEditIDRefFini] = useState(0)
  const [editIDRefFiniColori, setEditIDRefFiniColori] = useState(0)
  const [editIDSousTraitant, setEditIDSousTraitant] = useState(0)

  const originalDraftRef = useRef<{
    libelle: string
    numCommande: string
    desigClient: string
    commentaire: string
    dateRecep: string
    IDclient: number
    IDref_fini: number
    IDref_fini_colori: number
    IDsous_traitant: number
  } | null>(null)

  // Per-key dirty registry so inline forms in soumissions don't clobber each other
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
  const reportDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((prev) => {
      if (dirty === prev.has(key)) return prev
      const next = new Set(prev)
      if (dirty) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])
  const subFormsDirty = dirtyKeys.size > 0

  // ── Queries ─────────────────────────────────────────────

  const { data: etudes, isLoading, isError } = useQuery<EtudeListRow[]>({
    queryKey: ['etudes-coloris', statusFilter],
    queryFn: () => apiFetch(`/etudes-coloris?statut=${statusFilter}`),
  })

  const { data: detail, isLoading: detailLoading } = useQuery<EtudeDetail>({
    queryKey: ['etude-coloris', selectedId],
    queryFn: () => apiFetch(`/etudes-coloris/${selectedId}`),
    enabled: selectedId !== null,
  })

  useEffect(() => {
    if (etudes && etudes.length > 0 && selectedId === null) {
      setSelectedId(etudes[0].IDetude_col)
    }
  }, [etudes, selectedId])

  // Drawer closes whenever the active étude changes
  useEffect(() => {
    setOpenSoumissionId(null)
  }, [selectedId])

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['etudes-coloris'] })
    queryClient.invalidateQueries({ queryKey: ['etude-coloris', selectedId] })
  }, [queryClient, selectedId])

  // ── Edit state ──────────────────────────────────────────

  const startEdit = useCallback(() => {
    if (!detail) return
    const snap = {
      libelle: detail.libelle ?? '',
      numCommande: detail.num_commande ?? '',
      desigClient: detail.desig_client ?? '',
      commentaire: detail.commentaire ?? '',
      dateRecep: hfsqlDateToInput(detail.date_reception_type),
      IDclient: detail.IDclient,
      IDref_fini: detail.IDref_fini,
      IDref_fini_colori: detail.IDref_fini_colori,
      IDsous_traitant: detail.IDsous_traitant,
    }
    setEditLibelle(snap.libelle)
    setEditNumCommande(snap.numCommande)
    setEditDesigClient(snap.desigClient)
    setEditCommentaire(snap.commentaire)
    setEditDateRecep(snap.dateRecep)
    setEditIDClient(snap.IDclient)
    setEditIDRefFini(snap.IDref_fini)
    setEditIDRefFiniColori(snap.IDref_fini_colori)
    setEditIDSousTraitant(snap.IDsous_traitant)
    originalDraftRef.current = snap
    setOpenSoumissionId(null) // §31.3 — edit mode closes the drawer
    setIsEditing(true)
  }, [detail])

  const cancelEdit = useCallback(() => {
    setIsEditing(false)
    setDirtyKeys(new Set())
  }, [])

  const isDirty = useMemo(() => {
    if (!isEditing) return false
    const o = originalDraftRef.current
    if (!o) return false
    if (editLibelle !== o.libelle) return true
    if (editNumCommande !== o.numCommande) return true
    if (editDesigClient !== o.desigClient) return true
    if (editCommentaire !== o.commentaire) return true
    if (editDateRecep !== o.dateRecep) return true
    if (editIDClient !== o.IDclient) return true
    if (editIDRefFini !== o.IDref_fini) return true
    if (editIDRefFiniColori !== o.IDref_fini_colori) return true
    if (editIDSousTraitant !== o.IDsous_traitant) return true
    if (subFormsDirty) return true
    return false
  }, [isEditing, editLibelle, editNumCommande, editDesigClient, editCommentaire, editDateRecep, editIDClient, editIDRefFini, editIDRefFiniColori, editIDSousTraitant, subFormsDirty])

  // ── Mutations ───────────────────────────────────────────

  const saveMut = useMutation({
    mutationFn: () =>
      apiFetch(`/etudes-coloris/${selectedId}`, {
        method: 'PUT',
        body: JSON.stringify({
          libelle: editLibelle,
          num_commande: editNumCommande,
          desig_client: editDesigClient,
          commentaire: editCommentaire,
          date_reception_type: inputDateToHfsql(editDateRecep),
          IDclient: editIDClient,
          IDref_fini: editIDRefFini,
          IDref_fini_colori: editIDRefFiniColori,
          IDsous_traitant: editIDSousTraitant,
        }),
      }),
    onSuccess: () => {
      invalidateAll()
      setIsEditing(false)
      setDirtyKeys(new Set())
    },
  })

  const changeStatutMut = useMutation({
    mutationFn: (newStatut: EtudeStatut) =>
      apiFetch(`/etudes-coloris/${selectedId}`, {
        method: 'PUT',
        body: JSON.stringify({ statut_col: newStatut }),
      }),
    onSuccess: invalidateAll,
  })

  const deleteEtudeMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/etudes-coloris/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      const cached =
        queryClient.getQueryData<EtudeListRow[]>(['etudes-coloris', statusFilter]) ?? []
      const remaining = cached.filter((e) => e.IDetude_col !== deletedId)
      queryClient.invalidateQueries({ queryKey: ['etudes-coloris'] })
      setIsEditing(false)
      setDeleteEtudeConfirmOpen(false)
      setDirtyKeys(new Set())
      setSelectedId(remaining.length > 0 ? remaining[0].IDetude_col : null)
    },
  })

  // Auto-enter edit mode after Create
  useEffect(() => {
    if (autoEditForId !== null && detail?.IDetude_col === autoEditForId) {
      startEdit()
      setAutoEditForId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditForId, detail])

  // ── Guard ───────────────────────────────────────────────

  const guard = useUnsavedGuard({
    isDirty,
    save: async () => {
      await saveMut.mutateAsync()
    },
    onDiscard: () => {
      setIsEditing(false)
      setDirtyKeys(new Set())
    },
  })

  const handleSelect = useCallback(
    (id: number) => {
      guard.guardAction(() => {
        setIsEditing(false)
        setDirtyKeys(new Set())
        setSelectedId(id)
      })
    },
    [guard],
  )

  const handleBack = useCallback(() => {
    guard.guardAction(() => {
      setIsEditing(false)
      setDirtyKeys(new Set())
      setSelectedId(null)
    })
  }, [guard])

  const handleStatusFilter = useCallback(
    (f: StatutFilter) => {
      guard.guardAction(() => {
        setIsEditing(false)
        setDirtyKeys(new Set())
        setStatusFilter(f)
        setSelectedId(null)
      })
    },
    [guard],
  )

  const handleOpenCreate = useCallback(() => {
    guard.guardAction(() => setCreateOpen(true))
  }, [guard])

  // ── Filtering ───────────────────────────────────────────

  const filteredEtudes = useMemo(() => {
    if (!etudes) return []
    const q = searchQuery.trim().toLowerCase()
    if (!q) return etudes
    return etudes.filter((e) => {
      const hay = [
        e.IDetude_col,
        e.libelle ?? '',
        e.num_commande ?? '',
        e.desig_client ?? '',
        e.client_nom ?? '',
        e.ref_fini_reference ?? '',
        e.ref_fini_colori_reference ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [etudes, searchQuery])

  // ── Render ──────────────────────────────────────────────

  return (
    <>
      <MasterDetailLayout
        list={
          <EtudeList
            etudes={filteredEtudes}
            isLoading={isLoading}
            isError={isError}
            selectedId={selectedId}
            onSelect={handleSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={handleStatusFilter}
            isEditing={isEditing}
            onNewClick={handleOpenCreate}
            totalCount={etudes?.length ?? 0}
          />
        }
        detailHeader={
          detail ? (
            <EtudeDetailHeader
              detail={detail}
              isEditing={isEditing}
              editLibelle={editLibelle}
              onLibelleChange={setEditLibelle}
              onStartEdit={startEdit}
              onCancelEdit={cancelEdit}
              onSaveEdit={() => saveMut.mutate()}
              onDeleteClick={() => setDeleteEtudeConfirmOpen(true)}
              onPrintClick={() => setPrintModalOpen(true)}
              onEmailClick={() => setEmailModalOpen(true)}
              saving={saveMut.isPending}
            />
          ) : detailLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : null
        }
        detail={
          detail ? (
            <EtudeDetailMain
              detail={detail}
              isEditing={isEditing}
              openSoumissionId={openSoumissionId}
              onOpenSoumission={setOpenSoumissionId}
              onDeleteSoumission={setDeleteSoumissionId}
              onMutationSuccess={invalidateAll}
              reportDirty={reportDirty}
            />
          ) : selectedId === null && !isLoading ? (
            <EmptyDetailState
              hasEtudes={(etudes?.length ?? 0) > 0}
              statusFilter={statusFilter}
              onShowAll={() => handleStatusFilter('all')}
            />
          ) : null
        }
        sidebar={
          detail ? (
            <EtudeDetailSidebar
              detail={detail}
              isEditing={isEditing}
              editNumCommande={editNumCommande}
              editDesigClient={editDesigClient}
              editCommentaire={editCommentaire}
              editDateRecep={editDateRecep}
              editIDClient={editIDClient}
              editIDRefFini={editIDRefFini}
              editIDRefFiniColori={editIDRefFiniColori}
              editIDSousTraitant={editIDSousTraitant}
              onNumCommandeChange={setEditNumCommande}
              onDesigClientChange={setEditDesigClient}
              onCommentaireChange={setEditCommentaire}
              onDateRecepChange={setEditDateRecep}
              onIDClientChange={setEditIDClient}
              onIDRefFiniChange={(v) => {
                setEditIDRefFini(v)
                // Cascading: reset colori if ref_fini changes
                setEditIDRefFiniColori(0)
              }}
              onIDRefFiniColoriChange={setEditIDRefFiniColori}
              onIDSousTraitantChange={setEditIDSousTraitant}
              onChangeStatut={(s) => changeStatutMut.mutate(s)}
              isChangingStatut={changeStatutMut.isPending}
            />
          ) : null
        }
        sidebarTitle="Informations"
        hasSelection={selectedId !== null}
        onBack={handleBack}
      />

      <CreateEtudeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(newId) => {
          setCreateOpen(false)
          queryClient.invalidateQueries({ queryKey: ['etudes-coloris'] })
          setSelectedId(newId)
          setAutoEditForId(newId)
        }}
      />

      <ConfirmDialog
        open={deleteEtudeConfirmOpen}
        title="Supprimer l'étude"
        description="Cette action supprimera l'étude et toutes ses soumissions. Elle est irréversible."
        isPending={deleteEtudeMut.isPending}
        onCancel={() => setDeleteEtudeConfirmOpen(false)}
        onConfirm={() => {
          if (selectedId !== null) deleteEtudeMut.mutate(selectedId)
        }}
      />

      <DeleteSoumissionConfirm
        soumissionId={deleteSoumissionId}
        etudeId={selectedId}
        onClose={() => setDeleteSoumissionId(null)}
        onDeleted={invalidateAll}
      />

      <PlaceholderDialog
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title="Imprimer"
        titleIcon={Printer}
        centerIcon={Printer}
      />

      <PlaceholderDialog
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        title="Envoyer un email"
        titleIcon={AtSign}
        centerIcon={Mail}
      />

      <UnsavedChangesDialog
        open={guard.showDialog}
        onAction={guard.handleAction}
        isSaving={guard.isSaving}
      />
    </>
  )
}

// ── Empty detail state ───────────────────────────────────

function EmptyDetailState({
  hasEtudes, statusFilter, onShowAll,
}: {
  hasEtudes: boolean
  statusFilter: StatutFilter
  onShowAll: () => void
}) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="icon-box-gold h-16 w-16 mx-auto mb-4">
          <Palette className="h-8 w-8" />
        </div>
        {!hasEtudes && statusFilter !== 'all' ? (
          <>
            <p className="text-base font-semibold mb-1">
              Toutes les études « {filterToLabel(statusFilter)} » sont à jour
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Aucune étude ne correspond à ce filtre.
            </p>
            <Button variant="outline" size="sm" onClick={onShowAll}>
              Voir toutes les études
            </Button>
          </>
        ) : (
          <>
            <p className="text-base font-semibold mb-1">Sélectionnez une étude</p>
            <p className="text-sm text-muted-foreground">
              Choisissez une étude dans la liste pour voir ses soumissions.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Left panel: list ─────────────────────────────────────

function EtudeList({
  etudes, isLoading, isError, selectedId, onSelect,
  searchQuery, onSearchChange,
  statusFilter, onStatusFilterChange,
  isEditing, onNewClick, totalCount,
}: {
  etudes: EtudeListRow[]
  isLoading: boolean
  isError: boolean
  selectedId: number | null
  onSelect: (id: number) => void
  searchQuery: string
  onSearchChange: (s: string) => void
  statusFilter: StatutFilter
  onStatusFilterChange: (f: StatutFilter) => void
  isEditing: boolean
  onNewClick: () => void
  totalCount: number
}) {
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      {/* Top: search + status filter */}
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher..."
            className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTER_ORDER.map((f) => {
            const active = statusFilter === f
            return (
              <button
                key={f}
                type="button"
                onClick={() => onStatusFilterChange(f)}
                className={cn(
                  'px-2 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 whitespace-nowrap',
                  active
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent/10 hover:text-accent',
                )}
              >
                {filterToLabel(f)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Scroll body */}
      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-2 scrollbar-transparent">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        )}
        {isError && (
          <div className="flex items-center gap-2 text-destructive text-sm py-4">
            <AlertCircle className="h-4 w-4" />
            Erreur lors du chargement
          </div>
        )}
        {!isLoading && !isError && etudes.length === 0 && (
          <p className="text-sm text-muted-foreground italic text-center py-6">
            Aucune étude trouvée.
          </p>
        )}
        {etudes.map((e) => (
          <EtudeListCard
            key={e.IDetude_col}
            etude={e}
            isSelected={selectedId === e.IDetude_col}
            onClick={() => onSelect(e.IDetude_col)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>
          {etudes.length} / {totalCount} étude{totalCount !== 1 ? 's' : ''}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="text-accent hover:text-accent hover:bg-accent/10"
          onClick={onNewClick}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Nouveau
        </Button>
      </div>
    </div>
  )
}

function EtudeListCard({
  etude, isSelected, onClick,
}: {
  etude: EtudeListRow
  isSelected: boolean
  onClick: () => void
}) {
  const meta = STATUT_META[etude.statut_col]
  const stale = isStale(etude.statut_col, etude.date_derniere_action)
  const stripColor = stale ? 'rgb(239 68 68)' : meta.stripRgb
  const selectedRingClass = stale
    ? 'border-red-500 ring-1 ring-red-500'
    : `${meta.selectedRing} ring-1`
  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 border rounded-lg cursor-pointer transition-all bg-white',
        isSelected ? selectedRingClass : 'border-border hover:border-accent/50',
      )}
      style={{ boxShadow: `inset 4px 0 0 0 ${stripColor}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">
            {etude.libelle ?? `Étude #${etude.IDetude_col}`}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {etude.client_nom ?? '—'}
          </p>
        </div>
        <Badge
          variant={meta.badgeVariant}
          className={cn('flex-shrink-0 text-[10px]', meta.badgeClass)}
        >
          <meta.icon className="h-2.5 w-2.5 mr-0.5" />
          {meta.short}
        </Badge>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
        <span className="truncate">
          {etude.ref_fini_reference ?? '—'}
          {etude.ref_fini_colori_reference && ` · ${etude.ref_fini_colori_reference}`}
        </span>
        <span className="ml-auto flex-shrink-0 flex items-center gap-1 tabular-nums">
          {etude.nb_soumissions > 0 && (
            <span className="flex items-center gap-0.5">
              <FileText className="h-3 w-3" />
              {etude.nb_soumissions}
            </span>
          )}
          {etude.date_derniere_action && <span>{formatIsoFr(etude.date_derniere_action)}</span>}
        </span>
      </div>
    </div>
  )
}

// ── Center: detail header ────────────────────────────────

function EtudeDetailHeader({
  detail, isEditing,
  editLibelle,
  onLibelleChange,
  onStartEdit, onCancelEdit, onSaveEdit, onDeleteClick, onPrintClick, onEmailClick,
  saving,
}: {
  detail: EtudeDetail
  isEditing: boolean
  editLibelle: string
  onLibelleChange: (s: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onDeleteClick: () => void
  onPrintClick: () => void
  onEmailClick: () => void
  saving: boolean
}) {
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'h-11 w-11 rounded-lg flex items-center justify-center',
            isEditing ? 'bg-accent/15' : 'icon-box-gold',
          )}
        >
          <Palette className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={editLibelle}
                onChange={(e) => onLibelleChange(e.target.value)}
                placeholder="Libellé de l'étude"
                className="flex-1 text-xl font-heading font-bold h-10 px-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Badge className="bg-accent text-accent-foreground flex-shrink-0 gap-1 shadow-sm">
                <Pencil className="h-3 w-3" />
                Mode édition
              </Badge>
            </div>
          ) : (
            <h1 className="text-2xl font-heading font-bold tracking-tight truncate">
              {detail.libelle ?? `Étude #${detail.IDetude_col}`}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={onCancelEdit} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1.5" />
                Annuler
              </Button>
              <Button size="sm" onClick={onSaveEdit} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                )}
                Enregistrer
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onDeleteClick}
                disabled={saving}
                title="Supprimer l'étude"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                title="Imprimer"
                onClick={onPrintClick}
              >
                <Printer className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                title="Envoyer un email"
                onClick={onEmailClick}
              >
                <AtSign className="h-4 w-4" />
              </Button>
              <Button variant="gold" size="sm" onClick={onStartEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Modifier
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Gold accent line */}
      <div
        className={cn(
          'h-1 w-24 mt-3 rounded-full',
          isEditing ? 'bg-accent' : 'bg-gradient-to-r from-accent via-accent to-accent/30',
        )}
      />
    </div>
  )
}

// ── Center: main body (soumissions) ──────────────────────

function EtudeDetailMain({
  detail, isEditing,
  openSoumissionId, onOpenSoumission, onDeleteSoumission, onMutationSuccess, reportDirty,
}: {
  detail: EtudeDetail
  isEditing: boolean
  openSoumissionId: number | null
  onOpenSoumission: (id: number | null) => void
  onDeleteSoumission: (id: number) => void
  onMutationSuccess: () => void
  reportDirty: (key: string, dirty: boolean) => void
}) {
  return (
    <div className="flex-1 min-h-0 overflow-auto space-y-4">
      <SoumissionsSection
        detail={detail}
        isEditing={isEditing}
        openSoumissionId={openSoumissionId}
        onOpenSoumission={onOpenSoumission}
        onDeleteSoumission={onDeleteSoumission}
        onMutationSuccess={onMutationSuccess}
        reportDirty={reportDirty}
      />
    </div>
  )
}

// ── Soumissions section ──────────────────────────────────

function SoumissionsSection({
  detail, isEditing, openSoumissionId, onOpenSoumission, onDeleteSoumission, onMutationSuccess, reportDirty,
}: {
  detail: EtudeDetail
  isEditing: boolean
  openSoumissionId: number | null
  onOpenSoumission: (id: number | null) => void
  onDeleteSoumission: (id: number) => void
  onMutationSuccess: () => void
  reportDirty: (key: string, dirty: boolean) => void
}) {
  const [open, setOpen] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  // Surface dirty state for create/edit forms
  useEffect(() => {
    reportDirty('etu-soumissions', creating || editingId !== null)
    return () => reportDirty('etu-soumissions', false)
  }, [creating, editingId, reportDirty])

  // When leaving edit mode, collapse any open inline form
  useEffect(() => {
    if (!isEditing) {
      setCreating(false)
      setEditingId(null)
    }
  }, [isEditing])

  const drawerOpen = openSoumissionId !== null && !isEditing
  const drawerSoumission = drawerOpen
    ? detail.soumissions.find((s) => s.IDsoum_col === openSoumissionId) ?? null
    : null

  return (
    <Card className="card-premium">
      <CardHeader
        className="flex flex-row items-center gap-2 p-4 space-y-0 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <FileText className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Soumissions</CardTitle>
        {isEditing && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-accent hover:text-accent hover:bg-accent/10"
            onClick={(e) => {
              e.stopPropagation()
              setCreating(true)
              setEditingId(null)
              setOpen(true)
            }}
            title="Ajouter une soumission"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
        <Badge variant="secondary" className="text-xs ml-auto">
          {detail.soumissions.length}
        </Badge>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </CardHeader>
      {open && (
        <CardContent className="flex-1 min-h-0 flex flex-col">
          <div
            className={cn(
              'space-y-2 p-1 scrollbar-transparent',
              drawerOpen ? 'flex-shrink-0 max-h-[40%] overflow-auto' : 'flex-1 min-h-0 overflow-auto',
            )}
          >
            {creating && (
              <SoumissionInlineForm
                etudeId={detail.IDetude_col}
                mode="create"
                onClose={() => setCreating(false)}
                onSuccess={() => {
                  setCreating(false)
                  onMutationSuccess()
                }}
              />
            )}
            {detail.soumissions.length === 0 && !creating && (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                Aucune soumission.
              </p>
            )}
            {detail.soumissions.map((s) =>
              editingId === s.IDsoum_col ? (
                <SoumissionInlineForm
                  key={s.IDsoum_col}
                  etudeId={detail.IDetude_col}
                  mode="edit"
                  soumission={s}
                  onClose={() => setEditingId(null)}
                  onSuccess={() => {
                    setEditingId(null)
                    onMutationSuccess()
                  }}
                />
              ) : (
                <SoumissionCard
                  key={s.IDsoum_col}
                  soumission={s}
                  isEditing={isEditing}
                  isDrawerOpen={openSoumissionId === s.IDsoum_col && !isEditing}
                  onClick={() => {
                    if (isEditing) {
                      setEditingId(s.IDsoum_col)
                      setCreating(false)
                    } else {
                      onOpenSoumission(openSoumissionId === s.IDsoum_col ? null : s.IDsoum_col)
                    }
                  }}
                  onDelete={() => onDeleteSoumission(s.IDsoum_col)}
                />
              ),
            )}
          </div>

          {drawerOpen && drawerSoumission && (
            <div className="flex-1 min-h-0 flex flex-col mt-3 rounded-lg border border-border/60 overflow-hidden bg-zinc-50/80 animate-in slide-in-from-bottom-4 fade-in-0 duration-200">
              <SoumissionDrawer
                etudeId={detail.IDetude_col}
                soumission={drawerSoumission}
                onClose={() => onOpenSoumission(null)}
                onMutationSuccess={onMutationSuccess}
              />
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ── Soumission card ──────────────────────────────────────

function SoumissionCard({
  soumission, isEditing, isDrawerOpen, onClick, onDelete,
}: {
  soumission: Soumission
  isEditing: boolean
  isDrawerOpen: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const s = soumissionStatut(soumission)
  const borderCls =
    s === 'accepted' ? 'border-l-green-500/60'
    : s === 'refused' ? 'border-l-destructive/60'
    : 'border-l-amber-400/60'
  const iconBg =
    s === 'accepted' ? 'bg-green-500/10'
    : s === 'refused' ? 'bg-destructive/10'
    : 'bg-amber-400/10'
  const iconColor =
    s === 'accepted' ? 'text-green-600'
    : s === 'refused' ? 'text-destructive/70'
    : 'text-amber-600'
  const Icon = s === 'accepted' ? CheckCircle2 : s === 'refused' ? XCircle : Clock
  const labelText =
    s === 'accepted' ? `Acceptée le ${formatHfsqlDate(soumission.date_reponse ?? '')}`
    : s === 'refused' ? `Refusée le ${formatHfsqlDate(soumission.date_reponse ?? '')}`
    : 'En attente'
  return (
    <div
      onClick={onClick}
      className={cn(
        'group rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3 cursor-pointer transition-colors',
        borderCls,
        isDrawerOpen && 'ring-1 ring-accent bg-accent/[0.06] border-accent/50',
        isEditing && 'border-l-4 border-l-accent/70 bg-accent/[0.03]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0', iconBg)}>
            <Icon className={cn('h-3.5 w-3.5', iconColor)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {soumission.type_soum ?? '—'}
              {soumission.date_soum && (
                <span className="text-muted-foreground font-normal ml-2">
                  · {formatHfsqlDate(soumission.date_soum)}
                </span>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{labelText}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              title="Supprimer"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      {soumission.observation?.trim() && !isDrawerOpen && (
        <div className="flex items-start gap-1.5 mt-2 ml-9">
          <MessageSquare className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground italic line-clamp-2">
            {soumission.observation.trim()}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Soumission inline form (create + edit) ───────────────

function SoumissionInlineForm({
  etudeId, mode, soumission, onClose, onSuccess,
}: {
  etudeId: number
  mode: 'create' | 'edit'
  soumission?: Soumission
  onClose: () => void
  onSuccess: () => void
}) {
  const [typeSoum, setTypeSoum] = useState(soumission?.type_soum ?? '')
  const [dateSoum, setDateSoum] = useState(
    soumission ? hfsqlDateToInput(soumission.date_soum) : hfsqlDateToInput(''),
  )
  const [observation, setObservation] = useState(soumission?.observation ?? '')
  const [error, setError] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({
        type_soum: typeSoum,
        date_soum: inputDateToHfsql(dateSoum),
        observation,
      })
      if (mode === 'create') {
        return apiFetch(`/etudes-coloris/${etudeId}/soumissions`, { method: 'POST', body })
      }
      return apiFetch(`/etudes-coloris/soumissions/${soumission!.IDsoum_col}`, {
        method: 'PUT',
        body,
      })
    },
    onSuccess: () => { setError(null); onSuccess() },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <div className="rounded-lg border border-accent/25 bg-accent/[0.03] p-4 space-y-3">
      <p className="text-xs font-semibold text-accent uppercase tracking-wide">
        {mode === 'create' ? 'Nouvelle soumission' : 'Modifier la soumission'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Version</label>
          <input
            type="text"
            value={typeSoum}
            onChange={(e) => setTypeSoum(e.target.value)}
            placeholder="v1, v2, essai…"
            className="w-full h-8 px-2.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Date d'envoi</label>
          <input
            type="date"
            value={dateSoum}
            onChange={(e) => setDateSoum(e.target.value)}
            className="w-full h-8 px-2.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Observation</label>
        <textarea
          rows={3}
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          placeholder="Notes laboratoire, détails couleur…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onClose} disabled={mut.isPending}>
          Annuler
        </Button>
        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Enregistrer
        </Button>
      </div>
    </div>
  )
}

// ── Soumission drawer (§31) ──────────────────────────────

function SoumissionDrawer({
  etudeId, soumission, onClose, onMutationSuccess,
}: {
  etudeId: number
  soumission: Soumission
  onClose: () => void
  onMutationSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const s = soumissionStatut(soumission)

  const respondMut = useMutation({
    mutationFn: (vars: { accepte: 0 | 1 | 2 }) =>
      apiFetch(`/etudes-coloris/soumissions/${soumission.IDsoum_col}/respond`, {
        method: 'POST',
        body: JSON.stringify({ accepte: vars.accepte }),
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(['etude-coloris', etudeId], payload)
      onMutationSuccess()
    },
  })

  const createNewVersionMut = useMutation({
    mutationFn: () =>
      apiFetch(`/etudes-coloris/${etudeId}/soumissions`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(['etude-coloris', etudeId], payload)
      onMutationSuccess()
      onClose()
    },
  })

  const pending = respondMut.isPending || createNewVersionMut.isPending

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-3 py-2 border-b bg-zinc-200/50 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 text-accent flex-shrink-0" />
          <p className="text-xs font-semibold truncate">
            {soumission.type_soum ?? '—'}
            {soumission.date_soum && (
              <span className="font-normal text-muted-foreground ml-2">
                · {formatHfsqlDate(soumission.date_soum)}
              </span>
            )}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7" title="Fermer">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 scrollbar-transparent">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
            Observation
          </p>
          {soumission.observation?.trim() ? (
            <p className="text-sm whitespace-pre-line">{soumission.observation.trim()}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Aucune observation.</p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
            Réponse client
          </p>
          {s === 'pending' ? (
            <p className="text-sm text-muted-foreground italic">En attente.</p>
          ) : (
            <p className="text-sm">
              {s === 'accepted' ? 'Acceptée' : 'Refusée'}
              {soumission.date_reponse && (
                <span className="text-muted-foreground ml-2">
                  le {formatHfsqlDate(soumission.date_reponse)}
                </span>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 px-4 py-3 border-t bg-zinc-200/50 flex flex-wrap items-center gap-2">
        {s === 'pending' ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => respondMut.mutate({ accepte: 2 })}
              disabled={pending}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Refuser
            </Button>
            <Button
              size="sm"
              className="bg-success hover:bg-success/90 text-white"
              onClick={() => respondMut.mutate({ accepte: 1 })}
              disabled={pending}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Accepter
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => respondMut.mutate({ accepte: 0 })}
              disabled={pending}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Annuler la réponse
            </Button>
            {s === 'refused' && (
              <Button
                size="sm"
                variant="gold"
                onClick={() => createNewVersionMut.mutate()}
                disabled={pending}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Nouvelle version
              </Button>
            )}
          </>
        )}
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent ml-auto" />}
      </div>
    </div>
  )
}

// ── Right sidebar: Info card ─────────────────────────────

function EtudeDetailSidebar({
  detail, isEditing,
  editNumCommande, editDesigClient, editCommentaire, editDateRecep,
  editIDClient, editIDRefFini, editIDRefFiniColori, editIDSousTraitant,
  onNumCommandeChange, onDesigClientChange, onCommentaireChange, onDateRecepChange,
  onIDClientChange, onIDRefFiniChange, onIDRefFiniColoriChange, onIDSousTraitantChange,
  onChangeStatut, isChangingStatut,
}: {
  detail: EtudeDetail
  isEditing: boolean
  editNumCommande: string
  editDesigClient: string
  editCommentaire: string
  editDateRecep: string
  editIDClient: number
  editIDRefFini: number
  editIDRefFiniColori: number
  editIDSousTraitant: number
  onNumCommandeChange: (s: string) => void
  onDesigClientChange: (s: string) => void
  onCommentaireChange: (s: string) => void
  onDateRecepChange: (s: string) => void
  onIDClientChange: (n: number) => void
  onIDRefFiniChange: (n: number) => void
  onIDRefFiniColoriChange: (n: number) => void
  onIDSousTraitantChange: (n: number) => void
  onChangeStatut: (s: EtudeStatut) => void
  isChangingStatut: boolean
}) {
  const editCardClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

  // Lookup data
  const { data: clients } = useQuery<ClientOption[]>({
    queryKey: ['etudes-coloris-clients'],
    queryFn: () => apiFetch('/etudes-coloris/lookups/clients'),
    enabled: isEditing,
    staleTime: 5 * 60 * 1000,
  })
  const { data: refsFini } = useQuery<RefFiniOption[]>({
    queryKey: ['etudes-coloris-refs-fini'],
    queryFn: () => apiFetch('/etudes-coloris/lookups/refs-fini'),
    enabled: isEditing,
    staleTime: 5 * 60 * 1000,
  })
  const { data: coloris } = useQuery<RefFiniColoriOption[]>({
    queryKey: ['etudes-coloris-ref-fini-coloris', editIDRefFini],
    queryFn: () => apiFetch(`/etudes-coloris/lookups/ref-fini-coloris?ref_fini=${editIDRefFini}`),
    enabled: isEditing && editIDRefFini > 0,
    staleTime: 60 * 1000,
  })
  const { data: sousTraitants } = useQuery<SousTraitantOption[]>({
    queryKey: ['etudes-coloris-sous-traitants'],
    queryFn: () => apiFetch('/etudes-coloris/lookups/sous-traitants'),
    enabled: isEditing,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 scrollbar-transparent pr-0.5">
      <Card className={cn('card-premium', isEditing && editCardClass)}>
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <Info className="h-4 w-4 text-accent" />
          <CardTitle className="text-sm font-semibold">Informations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <KV
            label="Client"
            icon={Building2}
            value={
              isEditing ? (
                <select
                  value={editIDClient}
                  onChange={(e) => onIDClientChange(Number(e.target.value))}
                  className="w-full h-8 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                >
                  <option value={0}>— sélectionner —</option>
                  {clients?.map((c) => (
                    <option key={c.IDclient} value={c.IDclient}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              ) : (
                detail.client_nom ?? '—'
              )
            }
          />
          <KV
            label="Référence fini"
            icon={Tag}
            value={
              isEditing ? (
                <select
                  value={editIDRefFini}
                  onChange={(e) => onIDRefFiniChange(Number(e.target.value))}
                  className="w-full h-8 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                >
                  <option value={0}>— sélectionner —</option>
                  {refsFini?.map((r) => (
                    <option key={r.IDref_fini} value={r.IDref_fini}>
                      {r.reference} {r.designation && `— ${r.designation}`}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  {detail.ref_fini_reference ?? '—'}
                  {detail.ref_fini_designation && (
                    <span className="text-muted-foreground ml-1">· {detail.ref_fini_designation}</span>
                  )}
                </>
              )
            }
          />
          <KV
            label="Coloris"
            icon={Palette}
            value={
              isEditing ? (
                <select
                  value={editIDRefFiniColori}
                  onChange={(e) => onIDRefFiniColoriChange(Number(e.target.value))}
                  disabled={editIDRefFini === 0}
                  className="w-full h-8 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer disabled:bg-zinc-100 disabled:text-muted-foreground disabled:cursor-not-allowed"
                >
                  <option value={0}>— à définir —</option>
                  {coloris?.map((c) => (
                    <option key={c.IDref_fini_colori} value={c.IDref_fini_colori}>
                      {c.reference}
                    </option>
                  ))}
                </select>
              ) : (
                detail.ref_fini_colori_reference ?? '—'
              )
            }
          />
          <KV
            label="Sous-traitant"
            icon={Factory}
            value={
              isEditing ? (
                <select
                  value={editIDSousTraitant}
                  onChange={(e) => onIDSousTraitantChange(Number(e.target.value))}
                  className="w-full h-8 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                >
                  <option value={0}>— aucun —</option>
                  {sousTraitants?.map((s) => (
                    <option key={s.IDsous_traitant} value={s.IDsous_traitant}>
                      {s.nom}
                    </option>
                  ))}
                </select>
              ) : (
                detail.sous_traitant_nom ?? '—'
              )
            }
          />
          <div className="border-t border-border/50 pt-3 space-y-3">
            <KV
              label="N° commande"
              value={
                isEditing ? (
                  <input
                    type="text"
                    value={editNumCommande}
                    onChange={(e) => onNumCommandeChange(e.target.value)}
                    className="w-full h-8 px-2.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  detail.num_commande?.trim() || '—'
                )
              }
            />
            <KV
              label="Désignation client"
              value={
                isEditing ? (
                  <input
                    type="text"
                    value={editDesigClient}
                    onChange={(e) => onDesigClientChange(e.target.value)}
                    className="w-full h-8 px-2.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  detail.desig_client?.trim() || '—'
                )
              }
            />
            <KV
              label="Réception labo"
              value={
                isEditing ? (
                  <input
                    type="date"
                    value={editDateRecep}
                    onChange={(e) => onDateRecepChange(e.target.value)}
                    className="w-full h-8 px-2.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  formatHfsqlDate(detail.date_reception_type ?? '') || '—'
                )
              }
            />
            <KV
              label="Dernière action"
              value={formatIsoFr(detail.date_derniere_action) || '—'}
            />
          </div>
        </CardContent>
      </Card>

      <Card className={cn('card-premium', isEditing && editCardClass)}>
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <MessageSquare className="h-4 w-4 text-accent" />
          <CardTitle className="text-sm font-semibold">Commentaire</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <textarea
              rows={4}
              value={editCommentaire}
              onChange={(e) => onCommentaireChange(e.target.value)}
              placeholder="Notes internes…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          ) : detail.commentaire?.trim() ? (
            <p className="text-sm text-muted-foreground whitespace-pre-line">
              {detail.commentaire.trim()}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Aucun commentaire.</p>
          )}
        </CardContent>
      </Card>
      </div>

      <EtudeStatutFooter
        current={detail.statut_col}
        onChange={onChangeStatut}
        isChanging={isChangingStatut}
        disabled={isEditing}
      />
    </div>
  )
}

// ── Status footer (multi-state pill + menu) — §29.4 ──────

function EtudeStatutFooter({
  current, onChange, isChanging, disabled,
}: {
  current: EtudeStatut
  onChange: (next: EtudeStatut) => void
  isChanging: boolean
  disabled: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const meta = STATUT_META[current]
  const Icon = meta.icon

  // Close the menu on outside click or Escape
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

  // Force-close when disabled (e.g. user just entered edit mode)
  useEffect(() => {
    if (disabled) setMenuOpen(false)
  }, [disabled])

  return (
    <div ref={rootRef} className="flex-shrink-0 relative">
      <div
        className={cn(
          'rounded-xl border shadow-sm overflow-hidden flex items-stretch h-11',
          meta.solidBg,
        )}
      >
        <div className="flex items-center gap-2 px-3 flex-1 text-white min-w-0">
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-bold uppercase tracking-wide truncate">
            {meta.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={disabled || isChanging}
          title="Changer le statut"
          className="px-3.5 bg-white/15 hover:bg-white/25 active:bg-white/30 disabled:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold border-l border-white/25 flex items-center gap-1.5 transition-colors"
        >
          {isChanging ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ChevronUp
              className={cn('h-3.5 w-3.5 transition-transform', menuOpen && 'rotate-180')}
            />
          )}
          Changer
        </button>
      </div>
      {menuOpen && (
        <div className="absolute bottom-full right-0 mb-1 w-full min-w-[220px] rounded-lg border bg-white shadow-lg overflow-hidden z-50">
          {STATUT_ORDER.map((s) => {
            const m = STATUT_META[s]
            const active = current === s
            const SIcon = m.icon
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  if (!active) onChange(s)
                  setMenuOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                  active
                    ? 'bg-accent/10 text-accent cursor-default'
                    : 'hover:bg-zinc-100',
                )}
              >
                <SIcon className="h-4 w-4" />
                {m.label}
                {active && <CheckCircle2 className="h-4 w-4 ml-auto text-accent" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function KV({
  label, icon: Icon, value,
}: {
  label: string
  icon?: typeof Info
  value: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </label>
      <div className="text-sm">{value}</div>
    </div>
  )
}

// ── Create dialog ────────────────────────────────────────

function CreateEtudeDialog({
  open, onClose, onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (newId: number) => void
}) {
  const [libelle, setLibelle] = useState('')
  const [IDclient, setIDclient] = useState(0)
  const [IDref_fini, setIDRefFini] = useState(0)
  const [IDref_fini_colori, setIDRefFiniColori] = useState(0)
  const [IDsous_traitant, setIDsoustraitant] = useState(0)
  const [numCommande, setNumCommande] = useState('')
  const [desigClient, setDesigClient] = useState('')
  const [dateRecep, setDateRecep] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setLibelle('')
      setIDclient(0)
      setIDRefFini(0)
      setIDRefFiniColori(0)
      setIDsoustraitant(0)
      setNumCommande('')
      setDesigClient('')
      setDateRecep('')
      setError(null)
    }
  }, [open])

  const { data: clients } = useQuery<ClientOption[]>({
    queryKey: ['etudes-coloris-clients'],
    queryFn: () => apiFetch('/etudes-coloris/lookups/clients'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })
  const { data: refsFini } = useQuery<RefFiniOption[]>({
    queryKey: ['etudes-coloris-refs-fini'],
    queryFn: () => apiFetch('/etudes-coloris/lookups/refs-fini'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })
  const { data: coloris } = useQuery<RefFiniColoriOption[]>({
    queryKey: ['etudes-coloris-ref-fini-coloris', IDref_fini],
    queryFn: () => apiFetch(`/etudes-coloris/lookups/ref-fini-coloris?ref_fini=${IDref_fini}`),
    enabled: open && IDref_fini > 0,
    staleTime: 60 * 1000,
  })
  const { data: sousTraitants } = useQuery<SousTraitantOption[]>({
    queryKey: ['etudes-coloris-sous-traitants'],
    queryFn: () => apiFetch('/etudes-coloris/lookups/sous-traitants'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const canSubmit = libelle.trim().length > 0 && IDclient > 0 && IDref_fini > 0

  const mut = useMutation({
    mutationFn: () =>
      apiFetch<EtudeDetail>('/etudes-coloris', {
        method: 'POST',
        body: JSON.stringify({
          IDclient,
          IDref_fini,
          IDref_fini_colori: IDref_fini_colori || 0,
          IDsous_traitant: IDsous_traitant || 0,
          libelle: libelle.trim(),
          num_commande: numCommande.trim(),
          desig_client: desigClient.trim(),
          date_reception_type: inputDateToHfsql(dateRecep),
        }),
      }),
    onSuccess: (data) => {
      setError(null)
      onCreated(data.IDetude_col)
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-xl" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-accent" />
            Nouvelle étude coloris
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Libellé <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Ex : 0903 iced coffee 15-1040-TCX"
              className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Client <span className="text-destructive">*</span>
              </label>
              <select
                value={IDclient}
                onChange={(e) => setIDclient(Number(e.target.value))}
                className="w-full h-9 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              >
                <option value={0}>— sélectionner —</option>
                {clients?.map((c) => (
                  <option key={c.IDclient} value={c.IDclient}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Référence fini <span className="text-destructive">*</span>
              </label>
              <select
                value={IDref_fini}
                onChange={(e) => {
                  setIDRefFini(Number(e.target.value))
                  setIDRefFiniColori(0)
                }}
                className="w-full h-9 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              >
                <option value={0}>— sélectionner —</option>
                {refsFini?.map((r) => (
                  <option key={r.IDref_fini} value={r.IDref_fini}>
                    {r.reference}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Coloris</label>
              <select
                value={IDref_fini_colori}
                onChange={(e) => setIDRefFiniColori(Number(e.target.value))}
                disabled={IDref_fini === 0}
                className="w-full h-9 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer disabled:bg-zinc-100 disabled:text-muted-foreground disabled:cursor-not-allowed"
              >
                <option value={0}>— à définir plus tard —</option>
                {coloris?.map((c) => (
                  <option key={c.IDref_fini_colori} value={c.IDref_fini_colori}>
                    {c.reference}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Sous-traitant</label>
              <select
                value={IDsous_traitant}
                onChange={(e) => setIDsoustraitant(Number(e.target.value))}
                className="w-full h-9 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              >
                <option value={0}>— aucun —</option>
                {sousTraitants?.map((s) => (
                  <option key={s.IDsous_traitant} value={s.IDsous_traitant}>
                    {s.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">N° commande</label>
              <input
                type="text"
                value={numCommande}
                onChange={(e) => setNumCommande(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Réception labo
              </label>
              <input
                type="date"
                value={dateRecep}
                onChange={(e) => setDateRecep(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Désignation client
            </label>
            <input
              type="text"
              value={desigClient}
              onChange={(e) => setDesigClient(e.target.value)}
              placeholder="Nom du coloris côté client"
              className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            Annuler
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}>
            {mut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Soumission delete confirmation ───────────────────────

function DeleteSoumissionConfirm({
  soumissionId, etudeId, onClose, onDeleted,
}: {
  soumissionId: number | null
  etudeId: number | null
  onClose: () => void
  onDeleted: () => void
}) {
  const queryClient = useQueryClient()
  const mut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/etudes-coloris/soumissions/${id}`, { method: 'DELETE' }),
    onSuccess: (payload) => {
      if (etudeId !== null) queryClient.setQueryData(['etude-coloris', etudeId], payload)
      onDeleted()
      onClose()
    },
  })
  return (
    <ConfirmDialog
      open={soumissionId !== null}
      title="Supprimer la soumission"
      description="Cette action est irréversible."
      isPending={mut.isPending}
      onCancel={onClose}
      onConfirm={() => {
        if (soumissionId !== null) mut.mutate(soumissionId)
      }}
    />
  )
}

// ── Placeholder dialog (§18.A-bis) ───────────────────────

function PlaceholderDialog({
  open, onClose, title, titleIcon: TitleIcon, centerIcon: CenterIcon,
}: {
  open: boolean
  onClose: () => void
  title: string
  titleIcon: typeof Printer
  centerIcon: typeof Printer
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TitleIcon className="h-5 w-5 text-accent" />
            {title}
          </DialogTitle>
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
