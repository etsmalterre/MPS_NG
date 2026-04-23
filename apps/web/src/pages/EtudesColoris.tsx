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
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  Ban,
  ChevronUp,
  MessageSquare,
  Palette,
  Info,
  Building2,
  Factory,
  FileText,
  MapPin,
  History,
  Inbox,
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
import { apiFetch, API_URL } from '@/lib/api'
import { SendEmailDialog } from '@/components/email/SendEmailDialog'
import { postEmail } from '@/lib/email'

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
  /** Number of envoi_email rows logged for this soumission (0 when never sent). */
  envoi_count: number
  /** ISO datetime of the most recent send, or null. */
  last_envoi_date: string | null
}

interface EnvoiEmailRow {
  IDenvoi_email: number
  date: string | null
  adresse: string | null
  societe: string | null
}

interface EtudeDetail extends EtudeListRow {
  commentaire: string | null
  ref_fini_designation: string | null
  ref_fini_colori_has_photo: 0 | 1
  soumissions: Soumission[]
}

interface ClientOption { IDclient: number; nom: string | null }
interface ClientCommandeOption {
  IDcommande_client: number
  numero: number
  ref_client: string | null
  date_commande: string | null
}
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

// envoi_email DATE is a full datetime like "2026-04-23 10:03:07.245".
// Render as "23/04/2026 10:03".
function formatEnvoiDate(raw: string | null): string {
  if (!raw) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(raw)
  if (!m) return ''
  const base = `${m[3]}/${m[2]}/${m[1]}`
  return m[4] && m[5] ? `${base} ${m[4]}:${m[5]}` : base
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
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailSoumissionId, setEmailSoumissionId] = useState<number | null>(null)

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

  // When the selected étude's statut changes to a value that no longer
  // matches the current filter (e.g. Accepter flips 1/2 → 3), auto-switch
  // to the matching tab so the card stays in view during the transition.
  // 'all' passes everything, so skip the jump in that case.
  useEffect(() => {
    if (!detail) return
    if (statusFilter === 'all') return
    const target = STATUT_META[detail.statut_col]?.filter
    if (target && target !== statusFilter) {
      setStatusFilter(target)
    }
  }, [detail?.statut_col, statusFilter, detail])

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
              onPrintClick={(kind) => {
                if (selectedId === null) return
                const path = kind === 'feuille' ? 'feuille-pdf' : 'pdf'
                window.open(`${API_URL}/etudes-coloris/${selectedId}/${path}`, '_blank')
              }}
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
            <SoumissionsSection
              detail={detail}
              isEditing={isEditing}
              openSoumissionId={openSoumissionId}
              onOpenSoumission={setOpenSoumissionId}
              onDeleteSoumission={setDeleteSoumissionId}
              onEmailSoumission={setEmailSoumissionId}
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

      {selectedId !== null && (
        <SendEmailDialog
          open={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          contextLabel={detail?.sous_traitant_nom ?? undefined}
          queryKey={['etude-coloris-email-defaults', selectedId]}
          loadDefaults={() => apiFetch(`/etudes-coloris/${selectedId}/email-defaults`)}
          pdfUrl={`${API_URL}/etudes-coloris/${selectedId}/pdf`}
          pdfAttachmentLabel={`demande-etude-coloris-${selectedId}.pdf`}
          onSend={(p) =>
            postEmail(`${API_URL}/etudes-coloris/${selectedId}/email`, p, {
              includeAttachPdf: true,
            })
          }
        />
      )}

      {emailSoumissionId !== null && (
        <SendEmailDialog
          open={emailSoumissionId !== null}
          onClose={() => setEmailSoumissionId(null)}
          contextLabel={detail?.sous_traitant_nom ?? undefined}
          queryKey={['etude-soumission-email-defaults', emailSoumissionId]}
          loadDefaults={() =>
            apiFetch(`/etudes-coloris/soumissions/${emailSoumissionId}/email-defaults`)
          }
          pdfUrl={`${API_URL}/etudes-coloris/soumissions/${emailSoumissionId}/pdf`}
          pdfAttachmentLabel={`soumission-${emailSoumissionId}.pdf`}
          onSend={(p) =>
            postEmail(
              `${API_URL}/etudes-coloris/soumissions/${emailSoumissionId}/email`,
              p,
              { includeAttachPdf: true },
            )
          }
        />
      )}

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
  onPrintClick: (kind: 'etude' | 'feuille') => void
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
              <PrintMenuButton onPrint={onPrintClick} />
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

// ── Print dropdown (Étude vs Feuille coloris) ─────────────

function PrintMenuButton({
  onPrint,
}: {
  onPrint: (kind: 'etude' | 'feuille') => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const items: { kind: 'etude' | 'feuille'; label: string }[] = [
    { kind: 'etude',   label: 'Étude coloris' },
    { kind: 'feuille', label: 'Feuille coloris' },
  ]

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        title="Imprimer"
        onClick={() => setOpen((v) => !v)}
      >
        <Printer className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute z-50 right-0 top-full mt-1 w-48 rounded-lg border bg-white shadow-lg overflow-hidden">
          {items.map((item) => (
            <button
              key={item.kind}
              type="button"
              onClick={() => { onPrint(item.kind); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/10 transition-colors"
            >
              <Printer className="h-3.5 w-3.5 text-accent" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Center: main body (soumissions) ──────────────────────

// ── Soumissions section (center panel body) ─────────────
// Follows §31 in-screen drawer pattern. When the center panel holds a single
// list like this, do NOT wrap in a §23 collapsible Card — the center panel IS
// the list, and a framing Card with a "Soumissions" title would just duplicate
// the étude header above. Matches the `LignesSection` shape in `FilsCommandes.tsx`.

function SoumissionsSection({
  detail, isEditing, openSoumissionId, onOpenSoumission, onDeleteSoumission, onEmailSoumission, onMutationSuccess, reportDirty,
}: {
  detail: EtudeDetail
  isEditing: boolean
  openSoumissionId: number | null
  onOpenSoumission: (id: number | null) => void
  onDeleteSoumission: (id: number) => void
  onEmailSoumission: (id: number) => void
  onMutationSuccess: () => void
  reportDirty: (key: string, dirty: boolean) => void
}) {
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
  const hasAny = detail.soumissions.length > 0

  const startCreate = () => {
    setEditingId(null)
    setCreating(true)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div
        className={cn(
          'overflow-auto space-y-2 p-1 scrollbar-transparent',
          drawerOpen ? 'flex-shrink-0 max-h-[40%]' : 'flex-1 min-h-0',
        )}
      >
        {!hasAny && !creating ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm">Aucune soumission</p>
            {isEditing && (
              <Button variant="outline" size="sm" className="mt-3" onClick={startCreate}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Ajouter une soumission
              </Button>
            )}
          </div>
        ) : (
          <>
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
                  onOpenDrawer={() =>
                    onOpenSoumission(openSoumissionId === s.IDsoum_col ? null : s.IDsoum_col)
                  }
                  onEdit={() => {
                    setEditingId(s.IDsoum_col)
                    setCreating(false)
                  }}
                  onDelete={() => onDeleteSoumission(s.IDsoum_col)}
                  onEmail={() => onEmailSoumission(s.IDsoum_col)}
                />
              ),
            )}

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

            {isEditing && hasAny && !creating && editingId === null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={startCreate}
                className="w-full text-muted-foreground hover:text-accent hover:bg-accent/5 border border-dashed border-border/60 hover:border-accent/40"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Ajouter une soumission
              </Button>
            )}
          </>
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
    </div>
  )
}

// ── Soumission card ──────────────────────────────────────

function SoumissionCard({
  soumission, isEditing, isDrawerOpen, onOpenDrawer, onEdit, onDelete, onEmail,
}: {
  soumission: Soumission
  isEditing: boolean
  isDrawerOpen: boolean
  onOpenDrawer: () => void
  onEdit: () => void
  onDelete: () => void
  onEmail: () => void
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
  const clickable = !isEditing

  return (
    <div
      onClick={clickable ? onOpenDrawer : undefined}
      className={cn(
        'group rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3',
        borderCls,
        clickable && 'cursor-pointer hover:bg-zinc-100 hover:border-accent/40 transition-colors',
        isDrawerOpen && 'ring-1 ring-accent bg-accent/[0.06] border-accent/50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0', iconBg)}>
            <Icon className={cn('h-3.5 w-3.5', iconColor)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate flex items-center gap-1.5">
              <span className="truncate">
                {soumission.date_soum ? formatHfsqlDate(soumission.date_soum) : '—'}
              </span>
              {soumission.envoi_count > 0 && (
                <Badge
                  variant="secondary"
                  className="text-[10px] py-0 px-1.5 h-4 gap-1 bg-accent/15 text-accent border-accent/20 flex-shrink-0"
                  title={
                    soumission.last_envoi_date
                      ? `Dernier envoi : ${formatIsoFr(soumission.last_envoi_date) || soumission.last_envoi_date}`
                      : 'Envoyée'
                  }
                >
                  <AtSign className="h-2.5 w-2.5" />
                  {soumission.envoi_count > 1
                    ? `Envoyée ${soumission.envoi_count}×`
                    : 'Envoyée'}
                </Badge>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{labelText}</p>
          </div>
        </div>
        {isEditing ? (
          <div className="flex gap-0.5 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              title="Modifier"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              title="Supprimer"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-accent hover:bg-accent/10"
              onClick={(e) => { e.stopPropagation(); onEmail() }}
              title="Envoyer au client"
            >
              <AtSign className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
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
  const [observation, setObservation] = useState(soumission?.observation ?? '')
  const [error, setError] = useState<string | null>(null)

  // Create: backend auto-assigns the next type_soum (v1, v2, …) and
  //         auto-defaults date_soum to today, so we only send observation.
  // Edit:   only observation is editable here — existing type_soum and
  //         date_soum are left untouched.
  const mut = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({ observation })
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
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Observation</label>
        <textarea
          rows={3}
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          placeholder="Notes laboratoire, détails couleur…"
          className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          autoFocus
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

  // Envoi history — only fetched when the drawer is open. Keyed on the
  // soumission id AND the envoi_count so sending a new email invalidates
  // the cached list automatically.
  const { data: envois = [], isLoading: envoisLoading } = useQuery<EnvoiEmailRow[]>({
    queryKey: ['soumission-envois', soumission.IDsoum_col, soumission.envoi_count],
    queryFn: () =>
      apiFetch(`/etudes-coloris/soumissions/${soumission.IDsoum_col}/envois`),
  })

  const respondMut = useMutation({
    mutationFn: (vars: { accepte: 0 | 1 | 2; sampleNumber?: string }) =>
      apiFetch(`/etudes-coloris/soumissions/${soumission.IDsoum_col}/respond`, {
        method: 'POST',
        body: JSON.stringify({
          accepte: vars.accepte,
          ...(vars.sampleNumber ? { sampleNumber: vars.sampleNumber } : {}),
        }),
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(['etude-coloris', etudeId], payload)
      onMutationSuccess()
    },
  })

  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false)

  const pending = respondMut.isPending

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-3 py-2 border-b bg-zinc-200/50 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 text-accent flex-shrink-0" />
          <p className="text-xs font-semibold truncate">
            {soumission.date_soum ? formatHfsqlDate(soumission.date_soum) : '—'}
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
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 flex items-center gap-1.5">
            <AtSign className="h-3 w-3" />Historique d'envoi
          </p>
          {envoisLoading ? (
            <p className="text-sm text-muted-foreground italic flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />Chargement…
            </p>
          ) : envois.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Jamais envoyée.</p>
          ) : (
            <div className="space-y-1">
              {envois.map((e) => (
                <div
                  key={e.IDenvoi_email}
                  className="flex items-center justify-between gap-2 text-xs rounded-md border border-border/60 bg-white px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.adresse || '—'}</p>
                    {e.societe?.trim() && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {e.societe.trim()}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">
                    {formatEnvoiDate(e.date)}
                  </span>
                </div>
              ))}
            </div>
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
              onClick={() => setAcceptDialogOpen(true)}
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
          </>
        )}
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent ml-auto" />}
      </div>

      <AcceptSoumissionDialog
        open={acceptDialogOpen}
        onClose={() => setAcceptDialogOpen(false)}
        isPending={respondMut.isPending}
        onConfirm={(sampleNumber) => {
          respondMut.mutate(
            { accepte: 1, sampleNumber: sampleNumber || undefined },
            { onSuccess: () => setAcceptDialogOpen(false) },
          )
        }}
      />
    </div>
  )
}

// ── Accept-soumission dialog ─────────────────────────────
// Appears when the user clicks "Accepter" on a soumission. Always creates
// a new ref_fini_colori scoped to the étude's IDref_fini when a sample
// number is provided: the étude libellé becomes "<libellé>/<N>", the new
// colori is linked on the étude, and statut_col is advanced to 3.

function AcceptSoumissionDialog({
  open, onClose, onConfirm, isPending,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (sampleNumber: string) => void
  isPending: boolean
}) {
  const [sampleNumber, setSampleNumber] = useState('')

  useEffect(() => {
    if (open) setSampleNumber('')
  }, [open])

  const canSubmit = sampleNumber.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !isPending ? onClose() : undefined)}>
      <DialogContent className="max-w-sm" onClose={isPending ? undefined : onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Accepter la soumission
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <p className="text-sm text-muted-foreground">
            Un nouveau coloris sera créé pour cette référence. Le numéro
            d'échantillon sera ajouté à la fin du libellé.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Numéro d'échantillon <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={sampleNumber}
              onChange={(e) => setSampleNumber(e.target.value)}
              placeholder="Ex : 1"
              autoFocus
              className="w-full h-9 px-3 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit && !isPending) {
                  onConfirm(sampleNumber.trim())
                }
              }}
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button
            className="bg-success hover:bg-success/90 text-white"
            onClick={() => onConfirm(sampleNumber.trim())}
            disabled={!canSubmit || isPending}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Accepter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Right sidebar: Info + Adresses tabs + standalone status footer ─
// Structure mirrors FilsCommandes DetailSidebar exactly — §8 tab container
// + §29.2 flex-col gap-3 with the status pill as a standalone sibling.

type EtudeSidebarTab = 'info' | 'adresses' | 'historique'

interface EtudeHistoryEvent {
  id: number | string
  kind: 'etude' | 'soumission' | 'reception_type' | 'acceptance'
  date: string | null
  adresse: string | null
  societe: string | null
  soumissionId: number | null
  soumissionObservation: string | null
}

const editCardClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

interface AdresseLite {
  nom: string | null
  adresse1: string | null
  adresse2: string | null
  adresse3: string | null
  cp: string | null
  ville: string | null
  pays: string | null
}

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
  const [activeTab, setActiveTab] = useState<EtudeSidebarTab>('info')

  // Lookup data for edit mode
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

  // Adresse previews — follow the edit-mode IDs so the display updates live
  // when the user picks a new client / sous-traitant. In view mode we fall
  // back to the saved IDs from the detail payload.
  const effIDClient = isEditing ? editIDClient : detail.IDclient
  const effIDSousTraitant = isEditing ? editIDSousTraitant : detail.IDsous_traitant

  const { data: clientAdresse } = useQuery<AdresseLite | null>({
    queryKey: ['etude-default-adresse', 'client', effIDClient],
    queryFn: () => apiFetch(`/etudes-coloris/lookups/default-adresse?type=client&id=${effIDClient}`),
    enabled: effIDClient > 0,
    staleTime: 30 * 1000,
  })
  const { data: stAdresse } = useQuery<AdresseLite | null>({
    queryKey: ['etude-default-adresse', 'sous_traitant', effIDSousTraitant],
    queryFn: () => apiFetch(`/etudes-coloris/lookups/default-adresse?type=sous_traitant&id=${effIDSousTraitant}`),
    enabled: effIDSousTraitant > 0,
    staleTime: 30 * 1000,
  })

  const tabs: { key: EtudeSidebarTab; label: string; icon: React.ElementType }[] = [
    { key: 'info', label: 'Info', icon: Info },
    { key: 'adresses', label: 'Adresses', icon: MapPin },
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
                  'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  activeTab === tab.key
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent/10',
                )}
              >
                <Icon className="h-3.5 w-3.5" />{tab.label}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-transparent">
          {activeTab === 'info' && (
            <EtudeInfoTab
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
              onNumCommandeChange={onNumCommandeChange}
              onDesigClientChange={onDesigClientChange}
              onCommentaireChange={onCommentaireChange}
              onDateRecepChange={onDateRecepChange}
              onIDClientChange={onIDClientChange}
              onIDRefFiniChange={onIDRefFiniChange}
              onIDRefFiniColoriChange={onIDRefFiniColoriChange}
              onIDSousTraitantChange={onIDSousTraitantChange}
              clients={clients ?? []}
              refsFini={refsFini ?? []}
              coloris={coloris ?? []}
              sousTraitants={sousTraitants ?? []}
            />
          )}
          {activeTab === 'adresses' && (
            <EtudeAdressesTab
              isEditing={isEditing}
              sousTraitantNom={detail.sous_traitant_nom}
              clientNom={detail.client_nom}
              sousTraitantAdresse={stAdresse ?? null}
              clientAdresse={clientAdresse ?? null}
            />
          )}
          {activeTab === 'historique' && (
            <EtudeHistoriqueTab etudeId={detail.IDetude_col} />
          )}
        </div>
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

// ── Sidebar tab: Info ──────────────────────────────────

function EtudeInfoTab({
  detail, isEditing,
  editNumCommande, editDesigClient, editCommentaire, editDateRecep,
  editIDClient, editIDRefFini, editIDRefFiniColori, editIDSousTraitant,
  onNumCommandeChange, onDesigClientChange, onCommentaireChange, onDateRecepChange,
  onIDClientChange, onIDRefFiniChange, onIDRefFiniColoriChange, onIDSousTraitantChange,
  clients, refsFini, coloris, sousTraitants,
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
  clients: ClientOption[]
  refsFini: RefFiniOption[]
  coloris: RefFiniColoriOption[]
  sousTraitants: SousTraitantOption[]
}) {
  const selectCls =
    'h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer text-right max-w-[220px] truncate'
  const selectDisabledCls =
    `${selectCls} disabled:bg-zinc-100 disabled:text-muted-foreground disabled:cursor-not-allowed`
  const inputCls =
    'h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right max-w-[180px]'

  return (
    <>
      {/* Metadata card */}
      <div
        className={cn(
          'p-3 rounded-lg border bg-card shadow-sm space-y-2',
          isEditing && editCardClass,
        )}
      >
        <KV
          label="Client"
          value={
            isEditing ? (
              <select
                value={editIDClient}
                onChange={(e) => onIDClientChange(Number(e.target.value))}
                className={selectCls}
              >
                <option value={0}>— sélectionner —</option>
                {clients.map((c) => (
                  <option key={c.IDclient} value={c.IDclient}>{c.nom}</option>
                ))}
              </select>
            ) : (detail.client_nom || '—')
          }
        />
        <KV
          label="Référence fini"
          value={
            isEditing ? (
              <select
                value={editIDRefFini}
                onChange={(e) => onIDRefFiniChange(Number(e.target.value))}
                className={selectCls}
              >
                <option value={0}>— sélectionner —</option>
                {refsFini.map((r) => (
                  <option key={r.IDref_fini} value={r.IDref_fini}>
                    {r.reference}{r.designation ? ` — ${r.designation}` : ''}
                  </option>
                ))}
              </select>
            ) : (detail.ref_fini_reference || '—')
          }
        />
        <KV
          label="Coloris"
          value={
            isEditing ? (
              <select
                value={editIDRefFiniColori}
                onChange={(e) => onIDRefFiniColoriChange(Number(e.target.value))}
                disabled={editIDRefFini === 0}
                className={selectDisabledCls}
              >
                <option value={0}>— à définir —</option>
                {coloris.map((c) => (
                  <option key={c.IDref_fini_colori} value={c.IDref_fini_colori}>{c.reference}</option>
                ))}
              </select>
            ) : (detail.ref_fini_colori_reference || '—')
          }
        />
        <KV
          label="Sous-traitant"
          value={
            isEditing ? (
              <select
                value={editIDSousTraitant}
                onChange={(e) => onIDSousTraitantChange(Number(e.target.value))}
                className={selectCls}
              >
                <option value={0}>— aucun —</option>
                {sousTraitants.map((s) => (
                  <option key={s.IDsous_traitant} value={s.IDsous_traitant}>{s.nom}</option>
                ))}
              </select>
            ) : (detail.sous_traitant_nom || '—')
          }
        />
        <KV
          label="N° commande"
          value={
            isEditing ? (
              <input
                type="text"
                value={editNumCommande}
                onChange={(e) => onNumCommandeChange(e.target.value)}
                className={inputCls}
              />
            ) : (detail.num_commande?.trim() || '—')
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
                className={inputCls}
              />
            ) : (detail.desig_client?.trim() || '—')
          }
        />
      </div>

      {/* Commentaire card */}
      <div
        className={cn(
          'p-3 rounded-lg border bg-card shadow-sm',
          isEditing && editCardClass,
        )}
      >
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />Commentaire
        </p>
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
          <p className="text-sm text-muted-foreground italic">Aucun commentaire</p>
        )}
      </div>
    </>
  )
}

// ── Sidebar tab: Adresses ──────────────────────────────

function EtudeAdressesTab({
  isEditing, sousTraitantNom, clientNom, sousTraitantAdresse, clientAdresse,
}: {
  isEditing: boolean
  sousTraitantNom: string | null
  clientNom: string | null
  sousTraitantAdresse: AdresseLite | null
  clientAdresse: AdresseLite | null
}) {
  return (
    <>
      <AdresseReadOnlyCard
        label="Sous-traitant"
        icon={Factory}
        ownerLabel={sousTraitantNom}
        adresse={sousTraitantAdresse}
        isEditing={isEditing}
      />
      <AdresseReadOnlyCard
        label="Client"
        icon={Building2}
        ownerLabel={clientNom}
        adresse={clientAdresse}
        isEditing={isEditing}
      />
    </>
  )
}

// ── Sidebar tab: Historique ───────────────────────────────

function EtudeHistoriqueTab({ etudeId }: { etudeId: number }) {
  const { data: events, isLoading, isError } = useQuery<EtudeHistoryEvent[]>({
    queryKey: ['etude-history', etudeId],
    queryFn: () => apiFetch(`/etudes-coloris/${etudeId}/history`),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-destructive">
        <AlertCircle className="h-6 w-6 mb-2" />
        <p className="text-xs">Erreur de chargement de l'historique</p>
      </div>
    )
  }
  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
        <History className="h-8 w-8 opacity-40 mb-2" />
        <p className="text-sm italic">Aucun événement</p>
        <p className="text-[11px] mt-1">
          L'envoi d'une étude ou d'une soumission apparaîtra ici.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {events.map((e) => (
        <HistoryEventCard key={e.id} event={e} />
      ))}
    </div>
  )
}

function HistoryEventCard({ event }: { event: EtudeHistoryEvent }) {
  // Reception-type synthetic event — just show the date, no recipient line.
  if (event.kind === 'reception_type') {
    const dateFr = formatEnvoiDate(event.date).split(' ')[0] || ''
    return (
      <div className="rounded-lg border border-border/60 bg-card shadow-sm p-2.5 flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 bg-teal-500/10">
          <Inbox className="h-3.5 w-3.5 text-teal-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-snug">
            {dateFr ? `Réception type le ${dateFr}` : 'Réception type'}
          </p>
        </div>
      </div>
    )
  }

  // Acceptance synthetic event — green icon, single line naming the
  // accepted soumission by its sample numbers (or id as fallback).
  if (event.kind === 'acceptance') {
    const dateFr = formatEnvoiDate(event.date).split(' ')[0] || ''
    const soumLabel = event.soumissionObservation?.trim() || `#${event.soumissionId}`
    return (
      <div className="rounded-lg border border-border/60 bg-card shadow-sm p-2.5 flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 bg-green-500/10">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-snug">
            {dateFr
              ? `Soumission ${soumLabel} acceptée le ${dateFr}`
              : `Soumission ${soumLabel} acceptée`}
          </p>
        </div>
      </div>
    )
  }

  const isEtude = event.kind === 'etude'
  const Icon = isEtude ? Palette : FileText
  const iconBg = isEtude ? 'bg-amber-400/10' : 'bg-blue-500/10'
  const iconColor = isEtude ? 'text-amber-600' : 'text-blue-600'
  const target =
    (event.societe && event.societe.trim())
    || event.adresse
    || 'destinataire inconnu'
  const label = isEtude
    ? `Étude envoyée à ${target}`
    : `Soumission ${event.soumissionObservation?.trim() || `#${event.soumissionId}`} envoyée à ${target}`

  return (
    <div className="rounded-lg border border-border/60 bg-card shadow-sm p-2.5 flex items-start gap-2.5">
      <div className={cn('h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0', iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug">{label}</p>
        <div className="flex items-center justify-between gap-2 mt-1">
          {event.adresse ? (
            <span className="text-[10px] text-muted-foreground truncate">{event.adresse}</span>
          ) : <span />}
          <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
            {formatEnvoiDate(event.date)}
          </span>
        </div>
      </div>
    </div>
  )
}

function AdresseReadOnlyCard({
  label, icon: Icon, ownerLabel, adresse, isEditing,
}: {
  label: string
  icon: React.ElementType
  ownerLabel: string | null
  adresse: AdresseLite | null
  isEditing: boolean
}) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border bg-card shadow-sm',
        isEditing && editCardClass,
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />{label}
        </p>
        {ownerLabel && (
          <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
            {ownerLabel}
          </span>
        )}
      </div>
      {adresse ? (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {adresse.nom && <p className="font-medium text-foreground">{adresse.nom}</p>}
          {adresse.adresse1 && <p>{adresse.adresse1}</p>}
          {adresse.adresse2 && <p>{adresse.adresse2}</p>}
          {adresse.adresse3 && <p>{adresse.adresse3}</p>}
          {(adresse.cp || adresse.ville) && (
            <p>{[adresse.cp, adresse.ville].filter(Boolean).join(' ')}</p>
          )}
          {adresse.pays && <p>{adresse.pays}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">Aucune adresse</p>
      )}
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

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-right truncate">{value}</span>
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
  const [IDsous_traitant, setIDsoustraitant] = useState(0)
  const [numCommande, setNumCommande] = useState('')
  const [desigClient, setDesigClient] = useState('')
  const [dateRecep, setDateRecep] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Reset on open. Date de réception defaults to today.
  useEffect(() => {
    if (open) {
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const d = String(now.getDate()).padStart(2, '0')
      setLibelle('')
      setIDclient(0)
      setIDRefFini(0)
      setIDsoustraitant(0)
      setNumCommande('')
      setDesigClient('')
      setDateRecep(`${y}-${m}-${d}`)
      setError(null)
    }
  }, [open])

  const { data: clients } = useQuery<ClientOption[]>({
    queryKey: ['etudes-coloris-clients'],
    queryFn: () => apiFetch('/etudes-coloris/lookups/clients'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })
  // Full catalog of ref_fini — unfiltered so the user can pick any reference.
  const { data: refsFini, isFetching: refsFiniLoading } = useQuery<RefFiniOption[]>({
    queryKey: ['etudes-coloris-refs-fini'],
    queryFn: () => apiFetch('/etudes-coloris/lookups/refs-fini'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })
  const { data: sousTraitants } = useQuery<SousTraitantOption[]>({
    queryKey: ['etudes-coloris-sous-traitants'],
    queryFn: () => apiFetch('/etudes-coloris/lookups/sous-traitants'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })
  // Open (non-settled) commandes for the selected client, for the N° commande
  // dropdown. Empty array while no client is picked.
  const { data: clientCommandes } = useQuery<ClientCommandeOption[]>({
    queryKey: ['etudes-coloris-client-commandes', IDclient],
    queryFn: () => apiFetch(`/etudes-coloris/lookups/client-commandes?client=${IDclient}`),
    enabled: open && IDclient > 0,
    staleTime: 60 * 1000,
  })

  const canSubmit = libelle.trim().length > 0 && IDclient > 0 && IDref_fini > 0

  const mut = useMutation({
    mutationFn: () =>
      apiFetch<EtudeDetail>('/etudes-coloris', {
        method: 'POST',
        body: JSON.stringify({
          IDclient,
          IDref_fini,
          IDref_fini_colori: 0,
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
        <div className="space-y-3 mt-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Libellé <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Ex : 0903 iced coffee 15-1040-TCX"
              className="w-full h-9 px-3 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Client <span className="text-destructive">*</span>
              </label>
              <SearchableCombobox
                options={clients ?? []}
                value={IDclient}
                onChange={(id) => {
                  setIDclient(id)
                  // Reset the N° commande selection — the previously-selected
                  // order belonged to the old client.
                  setNumCommande('')
                }}
                getId={(c) => c.IDclient}
                getPrimary={(c) => c.nom ?? ''}
                placeholder="Rechercher un client"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Référence fini <span className="text-destructive">*</span>
              </label>
              <SearchableCombobox
                options={refsFini ?? []}
                value={IDref_fini}
                onChange={setIDRefFini}
                getId={(r) => r.IDref_fini}
                getPrimary={(r) => r.reference ?? ''}
                getSecondary={(r) => r.designation}
                loading={refsFiniLoading}
                placeholder={refsFiniLoading ? 'Chargement…' : 'Rechercher une référence'}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
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
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">N° commande</label>
              <select
                value={numCommande}
                onChange={(e) => setNumCommande(e.target.value)}
                disabled={IDclient === 0}
                className="w-full h-9 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer disabled:bg-zinc-100 disabled:text-muted-foreground disabled:cursor-not-allowed"
                title={IDclient === 0 ? 'Sélectionnez d\'abord un client' : undefined}
              >
                <option value="">— aucun —</option>
                {clientCommandes?.map((c) => {
                  const val = String(c.numero)
                  const dateFr = c.date_commande ? formatHfsqlDate(c.date_commande) : ''
                  const label = dateFr ? `N°${c.numero} - ${dateFr}` : `N°${c.numero}`
                  return (
                    <option key={c.IDcommande_client} value={val}>{label}</option>
                  )
                })}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Date de réception
              </label>
              <input
                type="date"
                value={dateRecep}
                onChange={(e) => setDateRecep(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              />
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
                className="w-full h-9 px-3 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter className="mt-6">
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

// ── Generic searchable combobox ──────────────────────────
// A minimal inline combobox: text input + filtered dropdown. Used across
// the Nouvelle étude dialog for both Référence fini and Client. Callers
// provide how to extract the id and render each option (primary line +
// optional secondary line) so the component stays entity-agnostic.

interface SearchableComboboxProps<T> {
  options: T[]
  value: number
  onChange: (id: number) => void
  getId: (item: T) => number
  /** Primary line (e.g. reference, client name). */
  getPrimary: (item: T) => string
  /** Secondary line shown right of the primary (e.g. designation). */
  getSecondary?: (item: T) => string | null | undefined
  disabled?: boolean
  loading?: boolean
  placeholder: string
}

function SearchableCombobox<T>({
  options, value, onChange, getId, getPrimary, getSecondary, disabled, loading, placeholder,
}: SearchableComboboxProps<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Display label for the currently-selected item (shown when the dropdown
  // is closed and no free-text query is active).
  const selectedLabel = useMemo(() => {
    const sel = options.find((o) => getId(o) === value)
    if (!sel) return ''
    const primary = getPrimary(sel) || ''
    const secondary = getSecondary?.(sel) || ''
    return secondary ? `${primary} — ${secondary}` : primary
  }, [options, value, getId, getPrimary, getSecondary])

  // Reset visible text when the field is disabled or deselected.
  useEffect(() => {
    if (disabled) {
      setOpen(false)
      setQuery('')
    }
  }, [disabled])
  useEffect(() => {
    if (value === 0) setQuery('')
  }, [value])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const hay = `${getPrimary(o) ?? ''} ${getSecondary?.(o) ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [options, query, getPrimary, getSecondary])

  const displayValue = open ? query : selectedLabel

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onFocus={() => { if (!disabled) setOpen(true) }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          // Typing invalidates the current selection until user picks again.
          if (value !== 0) onChange(0)
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'w-full h-9 px-3 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring',
          disabled && 'bg-zinc-100 text-muted-foreground cursor-not-allowed',
        )}
      />
      {open && !disabled && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-md border bg-white shadow-lg scrollbar-transparent">
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground italic">
              {options.length === 0 ? placeholder : 'Aucun résultat'}
            </div>
          ) : (
            filtered.map((o) => {
              const id = getId(o)
              const active = id === value
              const primary = getPrimary(o) || '—'
              const secondary = getSecondary?.(o)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onChange(id)
                    setQuery('')
                    setOpen(false)
                    inputRef.current?.blur()
                  }}
                  className={cn(
                    'w-full flex items-start gap-2 px-3 py-2 text-left text-sm transition-colors',
                    active ? 'bg-accent/10 text-accent' : 'hover:bg-zinc-100',
                  )}
                >
                  <span className="font-medium">{primary}</span>
                  {secondary && (
                    <span className="text-xs text-muted-foreground truncate">
                      {secondary}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
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

