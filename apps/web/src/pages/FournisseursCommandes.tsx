import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import {
  ShoppingCart,
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
  Leaf,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { BobineIcon } from '@/components/icons/BobineIcon'
import { cn } from '@/lib/utils'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'

// ── Types ──────────────────────────────────────────────

interface CommandeListRow {
  IDcommande_fil: number
  IDfournisseur: number
  date_commande: string | null
  etat: number | null
  commentaire: string | null
  fournisseur_nom: string
  total_kg: number
  total_eur: number
  nb_lignes: number
}

interface LigneCommande {
  IDref_fil_commande: number
  IDcommande_fil: number
  IDref_fil: number
  IDcolori_fil: number
  quantite: number | null
  unite: number | null
  prix_unitaire: number | null
  date_livraison: string | null
  etat: number | null
  ref_fil: string | null
  colori_reference: string | null
  ref_fil_bio: number | null
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
  IDcommande_fil: number
  IDfournisseur: number
  date_commande: string | null
  etat: number | null
  commentaire: string | null
  journal: string | null
  IDadresse_fournisseur: number | null
  IDadresse_livraison: number | null
  IDmode_paiement: number | null
  IDecheance: number | null
  fournisseur_nom: string
  mode_paiement_libelle: string | null
  echeance_libelle: string | null
  adresse_facturation: AdresseLite | null
  adresse_livraison: AdresseLite | null
  lignes: LigneCommande[]
}

interface ModePaiement {
  IDmode_paiement: number
  libelle: string
}

interface Echeance {
  IDecheance: number
  libelle: string
  nb_jours: number
}

interface FournisseurLite {
  IDfournisseur: number
  nom: string
}

interface RefFilLookup {
  IDcolori_fil: number
  colori_reference: string | null
  colori_prix_kg: number | null
  IDref_fil: number
  ref_fil_reference: string | null
  bio: number | null
  titrage: number | null
}

interface AdresseLookup extends AdresseLite {
  est_defaut: number
  est_defaut_facturation: number
  est_defaut_livraison: number
}

// ── API helpers ────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } })
  if (!res.ok) throw new Error('Erreur API')
  return res.json()
}

// ── Shared styling ─────────────────────────────────────

const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

// ── Status helpers ─────────────────────────────────────

function CommandeEtatBadge({ etat, className }: { etat: number | null; className?: string }) {
  if (etat === 1) return <Badge className={cn('badge-success text-[10px] py-0 gap-1', className)}><CheckCircle2 className="h-2.5 w-2.5" />Terminée</Badge>
  return <Badge className={cn('badge-warning text-[10px] py-0 gap-1', className)}><Clock className="h-2.5 w-2.5" />En cours</Badge>
}

function etatColors(etat: number | null) {
  if (etat === 1) {
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

// ── Main Page ──────────────────────────────────────────

export function FournisseursCommandes() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'en_cours' | 'terminee'>('en_cours')
  const [isEditing, setIsEditing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  // Edit-mode draft state for the header
  const [editDateCommande, setEditDateCommande] = useState('')
  const [editCommentaire, setEditCommentaire] = useState('')
  const [editJournal, setEditJournal] = useState('')
  const [editIDModePaiement, setEditIDModePaiement] = useState<number>(0)
  const [editIDEcheance, setEditIDEcheance] = useState<number>(0)
  const [editIDAdresseFacturation, setEditIDAdresseFacturation] = useState<number>(0)
  const [editIDAdresseLivraison, setEditIDAdresseLivraison] = useState<number>(0)

  // Snapshot of the draft at edit-start, used to compute `isDirty`.
  const originalDraftRef = useRef<{
    dateCommande: string
    commentaire: string
    journal: string
    IDmodePaiement: number
    IDecheance: number
    IDadresseFact: number
    IDadresseLiv: number
  } | null>(null)

  // Surfaced from LignesSection via callback — true if a line edit/new form is open.
  const [linesDirty, setLinesDirty] = useState(false)

  const { data: commandes, isLoading, isError, error } = useQuery<CommandeListRow[]>({
    queryKey: ['commandes-fil', statusFilter],
    queryFn: () => apiFetch(`/commandes-fil?etat=${statusFilter}`),
  })

  const { data: detail, isLoading: detailLoading } = useQuery<CommandeDetail>({
    queryKey: ['commande-fil', selectedId],
    queryFn: () => apiFetch(`/commandes-fil/${selectedId}`),
    enabled: selectedId !== null,
  })

  // Auto-select first on load
  useEffect(() => {
    if (commandes && commandes.length > 0 && selectedId === null) {
      setSelectedId(commandes[0].IDcommande_fil)
    }
  }, [commandes, selectedId])

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['commandes-fil'] })
    queryClient.invalidateQueries({ queryKey: ['commande-fil', selectedId] })
  }, [queryClient, selectedId])

  const startEdit = useCallback(() => {
    if (!detail) return
    const snapshot = {
      dateCommande: hfsqlDateToInput(detail.date_commande),
      commentaire: detail.commentaire?.trim() ?? '',
      journal: detail.journal?.trim() ?? '',
      IDmodePaiement: detail.IDmode_paiement ?? 0,
      IDecheance: detail.IDecheance ?? 0,
      IDadresseFact: detail.IDadresse_fournisseur ?? 0,
      IDadresseLiv: detail.IDadresse_livraison ?? 0,
    }
    setEditDateCommande(snapshot.dateCommande)
    setEditCommentaire(snapshot.commentaire)
    setEditJournal(snapshot.journal)
    setEditIDModePaiement(snapshot.IDmodePaiement)
    setEditIDEcheance(snapshot.IDecheance)
    setEditIDAdresseFacturation(snapshot.IDadresseFact)
    setEditIDAdresseLivraison(snapshot.IDadresseLiv)
    originalDraftRef.current = snapshot
    setIsEditing(true)
  }, [detail])

  const cancelEdit = useCallback(() => setIsEditing(false), [])

  // Dirty check: any header field differs from the edit-start snapshot,
  // OR any sub-form (new line, line edit) is open.
  const isDirty = useMemo(() => {
    if (!isEditing) return false
    const o = originalDraftRef.current
    if (!o) return false
    if (editDateCommande !== o.dateCommande) return true
    if (editCommentaire !== o.commentaire) return true
    if (editJournal !== o.journal) return true
    if (editIDModePaiement !== o.IDmodePaiement) return true
    if (editIDEcheance !== o.IDecheance) return true
    if (editIDAdresseFacturation !== o.IDadresseFact) return true
    if (editIDAdresseLivraison !== o.IDadresseLiv) return true
    if (linesDirty) return true
    return false
  }, [isEditing, editDateCommande, editCommentaire, editJournal, editIDModePaiement, editIDEcheance, editIDAdresseFacturation, editIDAdresseLivraison, linesDirty])

  const saveHeaderMut = useMutation({
    mutationFn: () => apiFetch(`/commandes-fil/${selectedId}`, {
      method: 'PUT',
      body: JSON.stringify({
        date_commande: inputDateToHfsql(editDateCommande),
        commentaire: editCommentaire,
        journal: editJournal,
        IDmode_paiement: editIDModePaiement || 0,
        IDecheance: editIDEcheance || 0,
        IDadresse_fournisseur: editIDAdresseFacturation || 0,
        IDadresse_livraison: editIDAdresseLivraison || 0,
      }),
    }),
    onSuccess: () => { invalidateAll(); setIsEditing(false) },
  })

  const deleteMut = useMutation({
    mutationFn: () => apiFetch(`/commandes-fil/${selectedId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commandes-fil'] })
      setSelectedId(null)
      setIsEditing(false)
    },
  })

  const guard = useUnsavedGuard({
    isDirty,
    save: async () => {
      await saveHeaderMut.mutateAsync()
    },
    onDiscard: () => {
      setIsEditing(false)
    },
  })

  const toggleEtatMut = useMutation({
    mutationFn: (newEtat: number) => apiFetch(`/commandes-fil/${selectedId}`, {
      method: 'PUT',
      body: JSON.stringify({ etat: newEtat }),
    }),
    onSuccess: invalidateAll,
  })

  const handleSelect = useCallback((id: number) => {
    guard.guardAction(() => {
      setIsEditing(false)
      setSelectedId(id)
    })
  }, [guard])

  const filtered = useMemo(() => {
    if (!commandes) return []
    if (!searchQuery.trim()) return commandes
    const q = searchQuery.toLowerCase()
    return commandes.filter((c) =>
      String(c.IDcommande_fil).includes(q)
      || (c.fournisseur_nom ?? '').toLowerCase().includes(q)
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
            onStatusFilterChange={setStatusFilter}
            onNew={() => setCreateOpen(true)}
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
            onDelete={() => {
              if (confirm('Supprimer cette commande et toutes ses lignes ?')) {
                // Reset edit state first so the guard doesn't block the list
                // re-render that happens after deletion completes.
                setIsEditing(false)
                deleteMut.mutate()
              }
            }}
            onToggleEtat={() => toggleEtatMut.mutate(detail?.etat === 1 ? 0 : 1)}
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
            editIDModePaiement={editIDModePaiement}
            onEditIDModePaiementChange={setEditIDModePaiement}
            editIDEcheance={editIDEcheance}
            onEditIDEcheanceChange={setEditIDEcheance}
            editIDAdresseFacturation={editIDAdresseFacturation}
            onEditIDAdresseFacturationChange={setEditIDAdresseFacturation}
            editIDAdresseLivraison={editIDAdresseLivraison}
            onEditIDAdresseLivraisonChange={setEditIDAdresseLivraison}
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
          queryClient.invalidateQueries({ queryKey: ['commandes-fil'] })
          setSelectedId(newId)
        }}
      />
    </>
  )
}

// ── Left Panel: List ───────────────────────────────────

function CommandeList({
  rows, isLoading, isError, error,
  selectedId, onSelect,
  searchQuery, onSearchChange,
  statusFilter, onStatusFilterChange,
  onNew,
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
}) {
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      {/* Search + filter header */}
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher (n°, fournisseur...)"
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

      {/* Scrollable list body */}
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
          const isSelected = selectedId === row.IDcommande_fil
          return (
            <div
              key={row.IDcommande_fil}
              onClick={() => onSelect(row.IDcommande_fil)}
              className={cn(
                'p-3 border rounded-lg cursor-pointer transition-all',
                isSelected
                  ? 'border-accent bg-white ring-1 ring-accent'
                  : 'border-border bg-white hover:border-accent/50'
              )}
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-sm">N° {row.IDcommande_fil}</span>
                <CommandeEtatBadge etat={row.etat} className="ml-auto" />
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">{row.fournisseur_nom || '—'}</p>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                {row.date_commande && <span>{formatHfsqlDate(row.date_commande)}</span>}
                {row.total_kg > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 rounded bg-zinc-200/80 tabular-nums">
                    {row.total_kg.toFixed(0)} kg
                  </span>
                )}
                {row.total_eur > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-accent/10 font-medium text-foreground tabular-nums">
                    {row.total_eur.toFixed(0)} €
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer with count + Nouveau button */}
      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>{rows.length} commande{rows.length !== 1 ? 's' : ''}</span>
        <Button size="sm" variant="ghost" onClick={onNew} className="text-accent hover:text-accent hover:bg-accent/10">
          <Plus className="h-3.5 w-3.5 mr-1" />Nouvelle
        </Button>
      </div>
    </div>
  )
}

// ── Center: Detail Header ──────────────────────────────

function DetailHeader({
  commande, isLoading, isEditing,
  onStartEdit, onCancelEdit, onSave, isSaving,
  onDelete, onToggleEtat,
}: {
  commande: CommandeDetail | null
  isLoading: boolean
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  isSaving: boolean
  onDelete: () => void
  onToggleEtat: () => void
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
                N° {commande?.IDcommande_fil}
                <span className="text-muted-foreground font-normal"> · {commande?.fournisseur_nom || '—'}</span>
              </h1>
              <div className="flex items-center gap-2 flex-shrink-0">
                {commande?.date_commande && (
                  <Badge variant="secondary" className="text-xs">{formatHfsqlDate(commande.date_commande)}</Badge>
                )}
                <CommandeEtatBadge etat={commande?.etat ?? null} />
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onToggleEtat}
                  title={commande.etat === 1 ? 'Marquer en cours' : 'Marquer terminée'}
                >
                  {commande.etat === 1 ? (
                    <><Clock className="h-3.5 w-3.5 mr-1.5" />Rouvrir</>
                  ) : (
                    <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Clôturer</>
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={onStartEdit}>
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
  commande, isLoading, hasSelection, isEditing, onMutationSuccess, onLinesDirtyChange,
}: {
  commande: CommandeDetail | null
  isLoading: boolean
  hasSelection: boolean
  isEditing: boolean
  onMutationSuccess: () => void
  onLinesDirtyChange: (dirty: boolean) => void
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

  const totalKg = commande.lignes.reduce((s, l) => s + (l.quantite != null ? Number(l.quantite) : 0), 0)
  const totalEur = commande.lignes.reduce((s, l) => s + (l.quantite != null && l.prix_unitaire != null ? Number(l.quantite) * Number(l.prix_unitaire) : 0), 0)

  return (
    <LignesSection
      commande={commande}
      isEditing={isEditing}
      totalKg={totalKg}
      totalEur={totalEur}
      onMutationSuccess={onMutationSuccess}
      onLinesDirtyChange={onLinesDirtyChange}
    />
  )
}

// ── Center: Lignes Section ─────────────────────────────

function LignesSection({
  commande, isEditing, totalKg, totalEur, onMutationSuccess, onLinesDirtyChange,
}: {
  commande: CommandeDetail
  isEditing: boolean
  totalKg: number
  totalEur: number
  onMutationSuccess: () => void
  onLinesDirtyChange: (dirty: boolean) => void
}) {
  const [editingLineId, setEditingLineId] = useState<number | null>(null)
  const [showLineForm, setShowLineForm] = useState(false)
  const [lineForm, setLineForm] = useState({
    IDref_fil: 0,
    IDcolori_fil: 0,
    quantite: '',
    prix_unitaire: '',
    date_livraison: '',
  })

  // Close line forms when editing is turned off globally
  useEffect(() => {
    if (!isEditing) {
      setEditingLineId(null)
      setShowLineForm(false)
    }
  }, [isEditing])

  // Surface sub-form dirty state to the page so the unsaved-changes guard
  // can catch navigation while a line form is open.
  useEffect(() => {
    onLinesDirtyChange(showLineForm || editingLineId !== null)
  }, [showLineForm, editingLineId, onLinesDirtyChange])

  const { data: refLookup } = useQuery<RefFilLookup[]>({
    queryKey: ['commande-fil-refs', commande.IDfournisseur],
    queryFn: () => apiFetch(`/commandes-fil/lookups/refs-fil?fournisseur=${commande.IDfournisseur}`),
    enabled: isEditing && !!commande.IDfournisseur,
  })

  // Group lookup refs by IDref_fil (one entry per ref, with an array of coloris)
  const refsGrouped = useMemo(() => {
    if (!refLookup) return []
    const map = new Map<number, { IDref_fil: number; reference: string; bio: boolean; coloris: { IDcolori_fil: number; reference: string }[] }>()
    for (const r of refLookup) {
      if (!map.has(r.IDref_fil)) {
        map.set(r.IDref_fil, {
          IDref_fil: r.IDref_fil,
          reference: r.ref_fil_reference ?? '—',
          bio: !!r.bio,
          coloris: [],
        })
      }
      map.get(r.IDref_fil)!.coloris.push({
        IDcolori_fil: r.IDcolori_fil,
        reference: r.colori_reference ?? '—',
      })
    }
    return Array.from(map.values())
  }, [refLookup])

  const createLineMut = useMutation({
    mutationFn: () => apiFetch(`/commandes-fil/${commande.IDcommande_fil}/lignes`, {
      method: 'POST',
      body: JSON.stringify({
        IDref_fil: lineForm.IDref_fil,
        IDcolori_fil: lineForm.IDcolori_fil,
        quantite: Number(lineForm.quantite) || 0,
        prix_unitaire: Number(lineForm.prix_unitaire) || 0,
        date_livraison: inputDateToHfsql(lineForm.date_livraison),
      }),
    }),
    onSuccess: () => { onMutationSuccess(); resetLineForm() },
  })

  const updateLineMut = useMutation({
    mutationFn: (lineId: number) => apiFetch(`/commandes-fil/lignes/${lineId}`, {
      method: 'PUT',
      body: JSON.stringify({
        IDref_fil: lineForm.IDref_fil,
        IDcolori_fil: lineForm.IDcolori_fil,
        quantite: Number(lineForm.quantite) || 0,
        prix_unitaire: Number(lineForm.prix_unitaire) || 0,
        date_livraison: inputDateToHfsql(lineForm.date_livraison),
      }),
    }),
    onSuccess: () => { onMutationSuccess(); setEditingLineId(null); resetLineForm() },
  })

  const deleteLineMut = useMutation({
    mutationFn: (lineId: number) => apiFetch(`/commandes-fil/lignes/${lineId}`, { method: 'DELETE' }),
    onSuccess: onMutationSuccess,
  })

  const toggleLineEtatMut = useMutation({
    mutationFn: ({ lineId, etat }: { lineId: number; etat: number }) =>
      apiFetch(`/commandes-fil/lignes/${lineId}`, {
        method: 'PUT',
        body: JSON.stringify({ etat }),
      }),
    onSuccess: onMutationSuccess,
  })

  const resetLineForm = () => {
    setLineForm({ IDref_fil: 0, IDcolori_fil: 0, quantite: '', prix_unitaire: '', date_livraison: '' })
    setShowLineForm(false)
  }

  const startEditLine = (l: LigneCommande) => {
    setShowLineForm(false)
    setEditingLineId(l.IDref_fil_commande)
    setLineForm({
      IDref_fil: l.IDref_fil,
      IDcolori_fil: l.IDcolori_fil,
      quantite: l.quantite != null ? String(l.quantite) : '',
      prix_unitaire: l.prix_unitaire != null ? String(l.prix_unitaire) : '',
      date_livraison: hfsqlDateToInput(l.date_livraison),
    })
  }

  const startAddLine = () => {
    setEditingLineId(null)
    setLineForm({ IDref_fil: 0, IDcolori_fil: 0, quantite: '', prix_unitaire: '', date_livraison: '' })
    setShowLineForm(true)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto space-y-2 pr-1 scrollbar-transparent">
        {commande.lignes.length === 0 && !showLineForm ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <BobineIcon className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm">Aucune ligne</p>
            {isEditing && (
              <Button variant="outline" size="sm" className="mt-3" onClick={startAddLine}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Ajouter une ligne
              </Button>
            )}
          </div>
        ) : (
          commande.lignes.map((l) => {
            if (isEditing && editingLineId === l.IDref_fil_commande) {
              return (
                <InlineForm
                  key={l.IDref_fil_commande}
                  title="Modifier la ligne"
                  onSave={() => updateLineMut.mutate(l.IDref_fil_commande)}
                  onCancel={() => { setEditingLineId(null); resetLineForm() }}
                  isSaving={updateLineMut.isPending}
                >
                  <LineFormFields form={lineForm} setForm={setLineForm} refsGrouped={refsGrouped} />
                </InlineForm>
              )
            }
            return (
              <LineCard
                key={l.IDref_fil_commande}
                line={l}
                isEditing={isEditing}
                onEdit={() => startEditLine(l)}
                onDelete={() => { if (confirm('Supprimer cette ligne ?')) deleteLineMut.mutate(l.IDref_fil_commande) }}
                onToggleEtat={() => toggleLineEtatMut.mutate({ lineId: l.IDref_fil_commande, etat: l.etat === 1 ? 0 : 1 })}
              />
            )
          })
        )}

        {isEditing && showLineForm && (
          <InlineForm
            title="Nouvelle ligne"
            onSave={() => createLineMut.mutate()}
            onCancel={resetLineForm}
            isSaving={createLineMut.isPending}
          >
            <LineFormFields form={lineForm} setForm={setLineForm} refsGrouped={refsGrouped} />
          </InlineForm>
        )}

        {isEditing && commande.lignes.length > 0 && !showLineForm && editingLineId === null && (
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

      {/* Totals footer pinned at bottom */}
      {commande.lignes.length > 0 && (
        <div className="flex-shrink-0 mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-sm font-medium">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            Total · {commande.lignes.length} ligne{commande.lignes.length > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-4 tabular-nums">
            <span>{totalKg.toFixed(1)} kg</span>
            <span className="text-accent text-base">{totalEur.toFixed(2)} €</span>
          </div>
        </div>
      )}
    </div>
  )
}

function LineCard({
  line, isEditing, onEdit, onDelete, onToggleEtat,
}: {
  line: LigneCommande
  isEditing: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleEtat: () => void
}) {
  const { border, iconBg, iconColor } = etatColors(line.etat)
  const lineTotal = (Number(line.quantite) || 0) * (Number(line.prix_unitaire) || 0)

  return (
    <div className={cn('group rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3', border)}>
      {/* Top row: icon + ref/coloris + badges/actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0', iconBg)}>
            <BobineIcon className={cn('h-3.5 w-3.5', iconColor)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {line.ref_fil || '—'}
              {line.colori_reference ? <span className="text-muted-foreground"> / {line.colori_reference}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!!line.ref_fil_bio && (
            <Badge className="bg-green-500/10 text-green-700 text-[10px] py-0 px-1.5 gap-0.5">
              <Leaf className="h-2.5 w-2.5" />Bio
            </Badge>
          )}
          <CommandeEtatBadge etat={line.etat} />
          {isEditing && (
            <div className="flex gap-0.5">
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                onClick={onToggleEtat}
                title={line.etat === 1 ? 'Marquer en cours' : 'Marquer livrée'}
              >
                {line.etat === 1 ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
      {/* Bottom row: quantite · prix · total · livraison */}
      <div className="flex items-center gap-3 mt-2 ml-9 text-[11px] text-muted-foreground tabular-nums">
        {line.quantite != null && <span>{Number(line.quantite).toFixed(1)} kg</span>}
        {line.prix_unitaire != null && Number(line.prix_unitaire) > 0 && (
          <span>× {Number(line.prix_unitaire).toFixed(2)} €/kg</span>
        )}
        {lineTotal > 0 && (
          <span className="font-medium text-foreground">→ {lineTotal.toFixed(2)} €</span>
        )}
        {line.date_livraison && (
          <span className="ml-auto">liv. {formatHfsqlDate(line.date_livraison)}</span>
        )}
      </div>
    </div>
  )
}

function LineFormFields({
  form, setForm, refsGrouped,
}: {
  form: { IDref_fil: number; IDcolori_fil: number; quantite: string; prix_unitaire: string; date_livraison: string }
  setForm: (f: typeof form) => void
  refsGrouped: { IDref_fil: number; reference: string; bio: boolean; coloris: { IDcolori_fil: number; reference: string }[] }[]
}) {
  const selectedRef = refsGrouped.find((r) => r.IDref_fil === form.IDref_fil)
  const coloris = selectedRef?.coloris ?? []

  return (
    <>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Référence</label>
        <select
          value={form.IDref_fil}
          onChange={(e) => setForm({ ...form, IDref_fil: parseInt(e.target.value, 10) || 0, IDcolori_fil: 0 })}
          className={cn(inputClass, 'cursor-pointer')}
        >
          <option value={0}>— Choisir —</option>
          {refsGrouped.map((r) => (
            <option key={r.IDref_fil} value={r.IDref_fil}>{r.reference}{r.bio ? ' (Bio)' : ''}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Coloris</label>
        <select
          value={form.IDcolori_fil}
          onChange={(e) => setForm({ ...form, IDcolori_fil: parseInt(e.target.value, 10) || 0 })}
          disabled={!form.IDref_fil}
          className="w-full h-8 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer disabled:bg-zinc-100 disabled:text-muted-foreground disabled:cursor-not-allowed"
        >
          <option value={0}>— Choisir —</option>
          {coloris.map((c) => (
            <option key={c.IDcolori_fil} value={c.IDcolori_fil}>{c.reference}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <LabeledInput label="Quantité (kg)" type="number" value={form.quantite} onChange={(v) => setForm({ ...form, quantite: v })} />
        <LabeledInput label="Prix (€/kg)" type="number" value={form.prix_unitaire} onChange={(v) => setForm({ ...form, prix_unitaire: v })} />
      </div>
      <LabeledInput label="Date livraison" type="date" value={form.date_livraison} onChange={(v) => setForm({ ...form, date_livraison: v })} />
    </>
  )
}

// ── Right Panel: Sidebar with Tabs ─────────────────────

type SidebarTab = 'info' | 'adresses' | 'journal'

function DetailSidebar({
  commande, isLoading, isEditing,
  editDateCommande, onEditDateCommandeChange,
  editCommentaire, onEditCommentaireChange,
  editJournal, onEditJournalChange,
  editIDModePaiement, onEditIDModePaiementChange,
  editIDEcheance, onEditIDEcheanceChange,
  editIDAdresseFacturation, onEditIDAdresseFacturationChange,
  editIDAdresseLivraison, onEditIDAdresseLivraisonChange,
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
  editIDModePaiement: number
  onEditIDModePaiementChange: (v: number) => void
  editIDEcheance: number
  onEditIDEcheanceChange: (v: number) => void
  editIDAdresseFacturation: number
  onEditIDAdresseFacturationChange: (v: number) => void
  editIDAdresseLivraison: number
  onEditIDAdresseLivraisonChange: (v: number) => void
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('info')

  const { data: modesPaiement } = useQuery<ModePaiement[]>({
    queryKey: ['lookup-modes-paiement'],
    queryFn: () => apiFetch('/commandes-fil/lookups/modes-paiement'),
    enabled: isEditing,
  })
  const { data: echeances } = useQuery<Echeance[]>({
    queryKey: ['lookup-echeances'],
    queryFn: () => apiFetch('/commandes-fil/lookups/echeances'),
    enabled: isEditing,
  })
  const { data: adresses } = useQuery<AdresseLookup[]>({
    queryKey: ['commande-fil-adresses', commande?.IDfournisseur],
    queryFn: () => apiFetch(`/commandes-fil/lookups/adresses?fournisseur=${commande?.IDfournisseur}`),
    enabled: isEditing && !!commande?.IDfournisseur,
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

  const tabs: { key: SidebarTab; label: string; icon: React.ElementType }[] = [
    { key: 'info', label: 'Info', icon: Info },
    { key: 'adresses', label: 'Adresses', icon: MapPin },
    { key: 'journal', label: 'Journal', icon: BookOpen },
  ]

  return (
    <div className="w-96 flex-shrink-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
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
            modesPaiement={modesPaiement ?? []}
            echeances={echeances ?? []}
            editDateCommande={editDateCommande}
            onEditDateCommandeChange={onEditDateCommandeChange}
            editCommentaire={editCommentaire}
            onEditCommentaireChange={onEditCommentaireChange}
            editIDModePaiement={editIDModePaiement}
            onEditIDModePaiementChange={onEditIDModePaiementChange}
            editIDEcheance={editIDEcheance}
            onEditIDEcheanceChange={onEditIDEcheanceChange}
          />
        )}
        {activeTab === 'adresses' && (
          <AdressesTab
            commande={commande}
            isEditing={isEditing}
            adresses={adresses ?? []}
            editIDAdresseFacturation={editIDAdresseFacturation}
            onEditIDAdresseFacturationChange={onEditIDAdresseFacturationChange}
            editIDAdresseLivraison={editIDAdresseLivraison}
            onEditIDAdresseLivraisonChange={onEditIDAdresseLivraisonChange}
          />
        )}
        {activeTab === 'journal' && (
          <JournalTab
            commande={commande}
            isEditing={isEditing}
            editJournal={editJournal}
            onEditJournalChange={onEditJournalChange}
          />
        )}
      </div>
    </div>
  )
}

// ── Sidebar Tab: Info ──────────────────────────────────

function InfoTab({
  commande, isEditing, modesPaiement, echeances,
  editDateCommande, onEditDateCommandeChange,
  editCommentaire, onEditCommentaireChange,
  editIDModePaiement, onEditIDModePaiementChange,
  editIDEcheance, onEditIDEcheanceChange,
}: {
  commande: CommandeDetail
  isEditing: boolean
  modesPaiement: ModePaiement[]
  echeances: Echeance[]
  editDateCommande: string
  onEditDateCommandeChange: (v: string) => void
  editCommentaire: string
  onEditCommentaireChange: (v: string) => void
  editIDModePaiement: number
  onEditIDModePaiementChange: (v: number) => void
  editIDEcheance: number
  onEditIDEcheanceChange: (v: number) => void
}) {
  return (
    <div className="space-y-3">
      {/* Metadata card */}
      <div className={cn('p-3 rounded-lg border bg-card shadow-sm space-y-2', isEditing && editSectionClass)}>
        <KV label="Fournisseur" value={commande.fournisseur_nom || '—'} />
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
        <KV
          label="Mode paiement"
          value={isEditing ? (
            <select
              value={editIDModePaiement}
              onChange={(e) => onEditIDModePaiementChange(parseInt(e.target.value, 10) || 0)}
              className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer text-right"
            >
              <option value={0}>—</option>
              {modesPaiement.map((m) => (
                <option key={m.IDmode_paiement} value={m.IDmode_paiement}>{m.libelle}</option>
              ))}
            </select>
          ) : (commande.mode_paiement_libelle || '—')}
        />
        <KV
          label="Échéance"
          value={isEditing ? (
            <select
              value={editIDEcheance}
              onChange={(e) => onEditIDEcheanceChange(parseInt(e.target.value, 10) || 0)}
              className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer text-right max-w-[200px]"
            >
              <option value={0}>—</option>
              {echeances.map((e) => (
                <option key={e.IDecheance} value={e.IDecheance}>{e.libelle}</option>
              ))}
            </select>
          ) : (commande.echeance_libelle || '—')}
        />
      </div>

      {/* Commentaire card */}
      <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />Commentaire
        </p>
        {isEditing ? (
          <textarea
            value={editCommentaire}
            onChange={(e) => onEditCommentaireChange(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
        ) : commande.commentaire?.trim() ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{commande.commentaire.trim()}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Aucun commentaire</p>
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
  editIDAdresseFacturation: number
  onEditIDAdresseFacturationChange: (v: number) => void
  editIDAdresseLivraison: number
  onEditIDAdresseLivraisonChange: (v: number) => void
}) {
  return (
    <div className="space-y-3">
      <AdresseCard
        label="Facturation"
        adresse={commande.adresse_facturation}
        isEditing={isEditing}
        options={adresses}
        selectedId={editIDAdresseFacturation}
        onSelect={onEditIDAdresseFacturationChange}
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
  // In edit mode, resolve the selected adresse from the lookup list so the preview
  // reflects the draft selection (not the saved one). Fall back to the saved adresse
  // if the lookup hasn't loaded yet.
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
            Choisir une adresse de {label.toLowerCase()}
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
                      {!!a.est_defaut_facturation && (
                        <Badge variant="outline" className="text-[10px] py-0">Facturation</Badge>
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

// ── Sidebar Tab: Journal ───────────────────────────────

function JournalTab({
  commande, isEditing, editJournal, onEditJournalChange,
}: {
  commande: CommandeDetail
  isEditing: boolean
  editJournal: string
  onEditJournalChange: (v: string) => void
}) {
  return (
    <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
      <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
        <BookOpen className="h-3.5 w-3.5" />Journal
      </p>
      {isEditing ? (
        <textarea
          value={editJournal}
          onChange={(e) => onEditJournalChange(e.target.value)}
          rows={16}
          placeholder="Entrées de journal..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y font-mono"
        />
      ) : commande.journal?.trim() ? (
        <p className="text-sm text-muted-foreground whitespace-pre-line font-mono">{commande.journal.trim()}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">Aucune entrée de journal</p>
      )}
    </div>
  )
}

// ── Create Dialog ──────────────────────────────────────

function CreateCommandeDialog({
  open, onClose, onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (newId: number) => void
}) {
  const [fournisseurId, setFournisseurId] = useState<number>(0)
  const [dateCommande, setDateCommande] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [modePaiementId, setModePaiementId] = useState<number>(0)
  const [echeanceId, setEcheanceId] = useState<number>(0)
  const [adresseFactId, setAdresseFactId] = useState<number>(0)
  const [adresseLivId, setAdresseLivId] = useState<number>(0)
  const [commentaire, setCommentaire] = useState('')

  const { data: fournisseurs } = useQuery<FournisseurLite[]>({
    queryKey: ['fournisseurs-lite'],
    queryFn: () => apiFetch('/fournisseurs'),
    enabled: open,
  })
  const { data: modesPaiement } = useQuery<ModePaiement[]>({
    queryKey: ['lookup-modes-paiement'],
    queryFn: () => apiFetch('/commandes-fil/lookups/modes-paiement'),
    enabled: open,
  })
  const { data: echeances } = useQuery<Echeance[]>({
    queryKey: ['lookup-echeances'],
    queryFn: () => apiFetch('/commandes-fil/lookups/echeances'),
    enabled: open,
  })
  const { data: adresses } = useQuery<AdresseLookup[]>({
    queryKey: ['create-commande-adresses', fournisseurId],
    queryFn: () => apiFetch(`/commandes-fil/lookups/adresses?fournisseur=${fournisseurId}`),
    enabled: open && fournisseurId > 0,
  })

  // Auto-select default addresses when supplier changes
  useEffect(() => {
    if (!adresses) return
    const defaultFact = adresses.find((a) => a.est_defaut_facturation) ?? adresses.find((a) => a.est_defaut) ?? adresses[0]
    const defaultLiv = adresses.find((a) => a.est_defaut_livraison) ?? adresses.find((a) => a.est_defaut) ?? adresses[0]
    setAdresseFactId(defaultFact?.IDadresse ?? 0)
    setAdresseLivId(defaultLiv?.IDadresse ?? 0)
  }, [adresses])

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setFournisseurId(0)
      setDateCommande(new Date().toISOString().slice(0, 10))
      setModePaiementId(0)
      setEcheanceId(0)
      setAdresseFactId(0)
      setAdresseLivId(0)
      setCommentaire('')
    }
  }, [open])

  const createMut = useMutation({
    mutationFn: () => apiFetch('/commandes-fil', {
      method: 'POST',
      body: JSON.stringify({
        IDfournisseur: fournisseurId,
        date_commande: inputDateToHfsql(dateCommande),
        IDmode_paiement: modePaiementId || 0,
        IDecheance: echeanceId || 0,
        IDadresse_fournisseur: adresseFactId || 0,
        IDadresse_livraison: adresseLivId || 0,
        commentaire,
      }),
    }),
    onSuccess: (data: { IDcommande_fil: number }) => onCreated(data.IDcommande_fil),
  })

  const canSave = fournisseurId > 0 && dateCommande.length > 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-accent" />
            Nouvelle commande
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Fournisseur</label>
            <select
              value={fournisseurId}
              onChange={(e) => setFournisseurId(parseInt(e.target.value, 10) || 0)}
              className={cn(inputClass, 'cursor-pointer h-9')}
              autoFocus
            >
              <option value={0}>— Choisir —</option>
              {fournisseurs?.map((f) => (
                <option key={f.IDfournisseur} value={f.IDfournisseur}>{f.nom}</option>
              ))}
            </select>
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
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mode paiement</label>
              <select
                value={modePaiementId}
                onChange={(e) => setModePaiementId(parseInt(e.target.value, 10) || 0)}
                className={cn(inputClass, 'cursor-pointer h-9')}
              >
                <option value={0}>—</option>
                {modesPaiement?.map((m) => (
                  <option key={m.IDmode_paiement} value={m.IDmode_paiement}>{m.libelle}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Échéance</label>
              <select
                value={echeanceId}
                onChange={(e) => setEcheanceId(parseInt(e.target.value, 10) || 0)}
                className={cn(inputClass, 'cursor-pointer h-9')}
              >
                <option value={0}>—</option>
                {echeances?.map((e) => (
                  <option key={e.IDecheance} value={e.IDecheance}>{e.libelle}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Commentaire</label>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
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
  label, value, onChange, type = 'text', autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoFocus?: boolean
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
        className={inputClass}
      />
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
