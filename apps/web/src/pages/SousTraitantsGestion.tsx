import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import {
  Building2,
  Search,
  Loader2,
  AlertCircle,
  MapPin,
  Mail,
  User,
  Star,
  Pencil,
  Plus,
  X,
  Save,
  Trash2,
  FileText,
  ShoppingCart,
  Send,
  Phone,
  Info,
  Tag,
  EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PopoverSelect } from '@/components/ui/popover-select'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'

// ── Types ──────────────────────────────────────────────

interface SousTraitant {
  IDsous_traitant: number
  nom: string
  tel: string | null
  fax: string | null
  commentaire: string | null
  est_visible: number
  IDtype_sst: number | null
  type_label: string | null
}

interface SousTraitantDetail extends SousTraitant {
  adresses: Adresse[]
  contacts: Contact[]
}

interface TypeSst {
  IDtype_sst: number
  type_label: string
}

interface Adresse {
  IDadresse: number
  nom: string | null
  adresse1: string | null
  adresse2: string | null
  adresse3: string | null
  cp: string | null
  ville: string | null
  pays: string | null
  commentaire: string | null
  est_defaut: boolean
  est_defaut_facturation: boolean
  est_defaut_livraison: boolean
}

interface Contact {
  IDcontact: number
  nom: string | null
  prenom: string | null
  tel: string | null
  mail: string | null
  commentaire: string | null
  est_defaut: boolean
  envoi_bl: boolean
  envoi_facture: boolean
  envoi_commande: boolean
  envoi_soumission: boolean
}

// ── API helpers ────────────────────────────────────────
// Shared apiFetch — see apps/web/src/lib/api.ts

function useSousTraitants() {
  return useQuery<SousTraitant[]>({ queryKey: ['sous-traitants'], queryFn: () => apiFetch('/sous-traitants') })
}

function useSousTraitantDetail(id: number | null) {
  return useQuery<SousTraitantDetail>({ queryKey: ['sous-traitant', id], queryFn: () => apiFetch(`/sous-traitants/${id}`), enabled: id !== null })
}

function useTypesSst() {
  return useQuery<TypeSst[]>({ queryKey: ['types-sst'], queryFn: () => apiFetch('/sous-traitants/type-sst') })
}

// ── Shared styling ─────────────────────────────────────

const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

// ── Main Page ──────────────────────────────────────────

export function SousTraitantsGestion() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editNom, setEditNom] = useState('')
  const [editTel, setEditTel] = useState('')
  const [editFax, setEditFax] = useState('')
  const [editTypeSst, setEditTypeSst] = useState<number>(0)
  const [editVisible, setEditVisible] = useState(true)
  const [editCommentaire, setEditCommentaire] = useState('')

  // Snapshot of the header/coordonnées draft at edit-start for dirty computation.
  const originalDraftRef = useRef<{ nom: string; tel: string; fax: string; typeSst: number; visible: boolean; commentaire: string } | null>(null)
  // Dirty state surfaced from the Contacts / Adresses sub-forms.
  const [subFormsDirty, setSubFormsDirty] = useState(false)

  const { data: sousTraitants, isLoading, isError, error } = useSousTraitants()
  const { data: detail, isLoading: detailLoading } = useSousTraitantDetail(selectedId)

  useEffect(() => {
    if (sousTraitants && sousTraitants.length > 0 && selectedId === null) setSelectedId(sousTraitants[0].IDsous_traitant)
  }, [sousTraitants, selectedId])

  const startEdit = useCallback(() => {
    if (detail) {
      const snapshot = {
        nom: detail.nom,
        tel: detail.tel ?? '',
        fax: detail.fax ?? '',
        typeSst: detail.IDtype_sst ?? 0,
        visible: !!detail.est_visible,
        commentaire: detail.commentaire ?? '',
      }
      setEditNom(snapshot.nom)
      setEditTel(snapshot.tel)
      setEditFax(snapshot.fax)
      setEditTypeSst(snapshot.typeSst)
      setEditVisible(snapshot.visible)
      setEditCommentaire(snapshot.commentaire)
      originalDraftRef.current = snapshot
      setIsEditing(true)
    }
  }, [detail])

  const cancelEdit = useCallback(() => setIsEditing(false), [])

  const isDirty = useMemo(() => {
    if (!isEditing) return false
    const o = originalDraftRef.current
    if (!o) return false
    if (editNom !== o.nom) return true
    if (editTel !== o.tel) return true
    if (editFax !== o.fax) return true
    if (editTypeSst !== o.typeSst) return true
    if (editVisible !== o.visible) return true
    if (editCommentaire !== o.commentaire) return true
    if (subFormsDirty) return true
    return false
  }, [isEditing, editNom, editTel, editFax, editTypeSst, editVisible, editCommentaire, subFormsDirty])

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sous-traitants'] })
    queryClient.invalidateQueries({ queryKey: ['sous-traitant', selectedId] })
  }, [queryClient, selectedId])

  const saveMutation = useMutation({
    mutationFn: () => apiFetch(`/sous-traitants/${selectedId}`, {
      method: 'PUT',
      body: JSON.stringify({ nom: editNom, tel: editTel, fax: editFax, commentaire: editCommentaire, IDtype_sst: editTypeSst, est_visible: editVisible }),
    }),
    onSuccess: () => { invalidateAll(); setIsEditing(false) },
  })

  const createMutation = useMutation({
    mutationFn: () => apiFetch('/sous-traitants', { method: 'POST', body: JSON.stringify({ nom: 'Nouveau sous-traitant' }) }),
    onSuccess: (data: SousTraitant) => {
      queryClient.invalidateQueries({ queryKey: ['sous-traitants'] })
      setSelectedId(data.IDsous_traitant)
      setEditNom(data.nom); setEditTel(''); setEditFax(''); setEditTypeSst(0); setEditVisible(true); setEditCommentaire('')
      originalDraftRef.current = { nom: data.nom, tel: '', fax: '', typeSst: 0, visible: true, commentaire: '' }
      setIsEditing(true)
    },
  })

  const guard = useUnsavedGuard({
    isDirty,
    save: async () => { await saveMutation.mutateAsync() },
    onDiscard: () => setIsEditing(false),
  })

  const handleSelect = useCallback((id: number) => {
    guard.guardAction(() => {
      setIsEditing(false)
      setSelectedId(id)
    })
  }, [guard])

  const filtered = useMemo(() => {
    if (!sousTraitants) return []
    if (!searchQuery.trim()) return sousTraitants
    const q = searchQuery.toLowerCase()
    return sousTraitants.filter((s) =>
      s.nom.toLowerCase().includes(q)
      || (s.type_label ?? '').toLowerCase().includes(q)
      || (s.tel ?? '').toLowerCase().includes(q)
    )
  }, [sousTraitants, searchQuery])

  return (
    <>
      <MasterDetailLayout
        list={<SousTraitantList sousTraitants={filtered} isLoading={isLoading} isError={isError} error={error as Error | null}
          selectedId={selectedId} onSelect={handleSelect} searchQuery={searchQuery} onSearchChange={setSearchQuery}
          onNew={() => createMutation.mutate()} isCreating={createMutation.isPending} isEditing={isEditing} />}
        detailHeader={<DetailHeader sousTraitant={detail ?? null} isLoading={detailLoading && selectedId !== null}
          isEditing={isEditing} editNom={editNom} onEditNomChange={setEditNom}
          onStartEdit={startEdit} onCancelEdit={cancelEdit} onSave={() => saveMutation.mutate()} isSaving={saveMutation.isPending} />}
        detail={<DetailMain sousTraitant={detail ?? null} isLoading={detailLoading && selectedId !== null}
          hasSelection={selectedId !== null} isEditing={isEditing}
          editTel={editTel} onEditTelChange={setEditTel}
          editFax={editFax} onEditFaxChange={setEditFax}
          editTypeSst={editTypeSst} onEditTypeSstChange={setEditTypeSst}
          editVisible={editVisible} onEditVisibleChange={setEditVisible} />}
        sidebar={selectedId !== null ? <DetailSidebar sousTraitant={detail ?? null} isLoading={detailLoading}
          isEditing={isEditing} sousTraitantId={selectedId} onMutationSuccess={invalidateAll}
          editCommentaire={editCommentaire} onEditCommentaireChange={setEditCommentaire}
          onSubFormsDirtyChange={setSubFormsDirty} /> : null}
        sidebarTitle="Informations" hasSelection={selectedId !== null}
        onBack={() => guard.guardAction(() => { setIsEditing(false); setSelectedId(null) })}
      />
      <UnsavedChangesDialog
        open={guard.showDialog}
        onAction={guard.handleAction}
        isSaving={guard.isSaving}
      />
    </>
  )
}

// ── Left Panel: List ───────────────────────────────────

function SousTraitantList({ sousTraitants, isLoading, isError, error, selectedId, onSelect, searchQuery, onSearchChange, onNew, isCreating, isEditing }: {
  sousTraitants: SousTraitant[]; isLoading: boolean; isError: boolean; error: Error | null
  selectedId: number | null; onSelect: (id: number) => void; searchQuery: string; onSearchChange: (q: string) => void
  onNew: () => void; isCreating: boolean; isEditing: boolean
}) {
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Rechercher..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off" className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2 scrollbar-transparent">
        {isLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
        : isError ? <div className="flex flex-col items-center justify-center py-8 text-destructive"><AlertCircle className="h-6 w-6 mb-2" /><p className="text-sm">{error?.message || 'Erreur'}</p></div>
        : sousTraitants.length === 0 ? <div className="flex flex-col items-center justify-center py-8 text-muted-foreground"><Building2 className="h-12 w-12 mb-3 opacity-50" /><p className="text-sm">Aucun sous-traitant</p></div>
        : sousTraitants.map((s) => (
          <div key={s.IDsous_traitant} onClick={() => onSelect(s.IDsous_traitant)}
            className={cn('p-3 border rounded-lg cursor-pointer transition-all',
              selectedId === s.IDsous_traitant ? 'border-accent bg-white ring-1 ring-accent' : 'border-border bg-white hover:border-accent/50')}>
            <div className="flex items-center gap-2">
              <Building2 className={cn('h-4 w-4 flex-shrink-0', s.est_visible ? 'text-muted-foreground' : 'text-muted-foreground/40')} />
              <p className={cn('font-medium text-sm truncate', !s.est_visible && 'text-muted-foreground')}>{s.nom}</p>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 ml-6 flex-wrap">
              {s.type_label && <Badge variant="secondary" className="text-[10px] py-0 gap-1"><Tag className="h-2.5 w-2.5" />{s.type_label}</Badge>}
              {!s.est_visible && <Badge variant="outline" className="text-[10px] py-0 gap-1 text-muted-foreground"><EyeOff className="h-2.5 w-2.5" />Inactif</Badge>}
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>{sousTraitants.length} sous-traitant{sousTraitants.length !== 1 ? 's' : ''}</span>
        {!isEditing && (
          <Button size="sm" variant="ghost" onClick={onNew} disabled={isCreating} className="text-accent hover:text-accent hover:bg-accent/10">
            <Plus className="h-3.5 w-3.5 mr-1" />Nouveau
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Center: Detail Header ──────────────────────────────

function DetailHeader({ sousTraitant, isLoading, isEditing, editNom, onEditNomChange, onStartEdit, onCancelEdit, onSave, isSaving }: {
  sousTraitant: SousTraitantDetail | null; isLoading: boolean; isEditing: boolean
  editNom: string; onEditNomChange: (v: string) => void
  onStartEdit: () => void; onCancelEdit: () => void; onSave: () => void; isSaving: boolean
}) {
  if (!sousTraitant && !isLoading) return null
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center', isEditing ? 'bg-accent/15' : 'icon-box-gold')}>
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {isLoading ? <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          : isEditing ? (
            <div className="flex items-center gap-3">
              <input value={editNom} onChange={(e) => onEditNomChange(e.target.value)} autoFocus
                className="flex-1 text-xl font-heading font-bold h-10 px-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              <Badge className="bg-accent text-accent-foreground flex-shrink-0 gap-1 shadow-sm">
                <Pencil className="h-3 w-3" />Mode edition
              </Badge>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-heading font-bold tracking-tight truncate">{sousTraitant?.nom}</h1>
              {sousTraitant && (
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {sousTraitant.type_label && <Badge variant="secondary" className="text-xs gap-1"><Tag className="h-3 w-3" />{sousTraitant.type_label}</Badge>}
                  {!sousTraitant.est_visible && <Badge variant="outline" className="text-xs gap-1 text-muted-foreground"><EyeOff className="h-3 w-3" />Inactif</Badge>}
                </div>
              )}
            </>
          )}
        </div>
        {!isLoading && sousTraitant && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={onCancelEdit}><X className="h-3.5 w-3.5 mr-1.5" />Annuler</Button>
                <Button size="sm" onClick={onSave} disabled={isSaving}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />{isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </>
            ) : (
              <Button variant="gold" size="sm" onClick={onStartEdit}><Pencil className="h-3.5 w-3.5 mr-1.5" />Modifier</Button>
            )}
          </div>
        )}
      </div>
      <div className={cn('h-1 w-24 mt-3 rounded-full', isEditing ? 'bg-accent' : 'bg-gradient-to-r from-accent via-accent to-accent/30')} />
    </div>
  )
}

// ── Center: Detail Main (Coordonnées) ──────────────────

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-sm text-right">{value}</span>
    </div>
  )
}

function TogglePill({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
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

function DetailMain({ sousTraitant, isLoading, hasSelection, isEditing, editTel, onEditTelChange, editFax, onEditFaxChange, editTypeSst, onEditTypeSstChange, editVisible, onEditVisibleChange }: {
  sousTraitant: SousTraitantDetail | null; isLoading: boolean; hasSelection: boolean; isEditing: boolean
  editTel: string; onEditTelChange: (v: string) => void
  editFax: string; onEditFaxChange: (v: string) => void
  editTypeSst: number; onEditTypeSstChange: (v: number) => void
  editVisible: boolean; onEditVisibleChange: (v: boolean) => void
}) {
  const { data: types } = useTypesSst()

  if (!hasSelection) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="icon-box-gold h-16 w-16 mx-auto"><Building2 className="h-8 w-8" /></div>
        <p className="text-muted-foreground text-sm">Selectionnez un sous-traitant dans la liste</p>
      </div>
    </div>
  )
  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
  if (!sousTraitant) return null

  return (
    <div className="flex-1 min-h-0 overflow-auto space-y-4">
      <Card className={cn('card-premium', isEditing && editSectionClass)}>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Info className="h-4 w-4 text-accent" />
          <CardTitle className="text-sm font-semibold">Coordonnees</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Type de sous-traitant</label>
                <PopoverSelect
                  options={(types ?? []).map((t) => ({ id: t.IDtype_sst, primary: t.type_label }))}
                  value={editTypeSst}
                  onChange={onEditTypeSstChange}
                  emptyLabel="— Aucun —"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Telephone</label>
                  <input value={editTel} onChange={(e) => onEditTelChange(e.target.value)} autoComplete="off" className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Fax</label>
                  <input value={editFax} onChange={(e) => onEditFaxChange(e.target.value)} autoComplete="off" className={inputClass} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border/60 bg-white shadow-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <Building2 className="h-3.5 w-3.5 text-accent" />
                    <span>Sous-traitant actif</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {editVisible ? 'Visible dans les listes de selection' : 'Archive — masque des listes de selection'}
                  </p>
                </div>
                <TogglePill value={editVisible} onChange={onEditVisibleChange} />
              </div>
            </div>
          ) : (
            <div className="space-y-0">
              <KVRow label="Type" value={sousTraitant.type_label ? <Badge variant="secondary" className="text-xs gap-1"><Tag className="h-3 w-3" />{sousTraitant.type_label}</Badge> : <span className="text-muted-foreground italic">Non defini</span>} />
              <KVRow label="Telephone" value={sousTraitant.tel?.trim() ? sousTraitant.tel : <span className="text-muted-foreground italic">—</span>} />
              <KVRow label="Fax" value={sousTraitant.fax?.trim() ? sousTraitant.fax : <span className="text-muted-foreground italic">—</span>} />
              <KVRow label="Statut" value={sousTraitant.est_visible
                ? <Badge className="badge-success text-[10px] py-0">Actif</Badge>
                : <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground gap-1"><EyeOff className="h-2.5 w-2.5" />Inactif</Badge>} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Shared form components ─────────────────────────────

function LabeledInput({ label, value, onChange, type = 'text', autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoFocus?: boolean
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus}
        autoComplete="off" data-form-type="other" data-lpignore="true" className={inputClass} />
    </div>
  )
}

function InlineForm({ title, children, onSave, onCancel, isSaving }: {
  title: string; children: React.ReactNode; onSave: () => void; onCancel: () => void; isSaving: boolean
}) {
  return (
    <div className="rounded-lg border border-accent/25 bg-accent/[0.03] p-4 space-y-3">
      <p className="text-xs font-semibold text-accent uppercase tracking-wide">{title}</p>
      {children}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
        <Button size="sm" onClick={onSave} disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
      </div>
    </div>
  )
}

// ── Right Panel: Sidebar with Tabs ─────────────────────

type SidebarTab = 'info' | 'contacts' | 'adresses'

function DetailSidebar({ sousTraitant, isLoading, isEditing, sousTraitantId, onMutationSuccess, editCommentaire, onEditCommentaireChange, onSubFormsDirtyChange }: {
  sousTraitant: SousTraitantDetail | null; isLoading: boolean; isEditing: boolean; sousTraitantId: number; onMutationSuccess: () => void
  editCommentaire: string; onEditCommentaireChange: (v: string) => void
  onSubFormsDirtyChange: (dirty: boolean) => void
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('info')
  if (isLoading) return (
    <div className="w-96 flex-shrink-0 bg-muted/30 rounded-xl border p-4 space-y-4">
      <div className="flex gap-2"><div className="h-8 flex-1 bg-muted animate-pulse rounded-md" /><div className="h-8 flex-1 bg-muted animate-pulse rounded-md" /><div className="h-8 flex-1 bg-muted animate-pulse rounded-md" /></div>
      {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
    </div>
  )
  if (!sousTraitant) return null

  const tabs: { key: SidebarTab; label: string; icon: React.ElementType }[] = [
    { key: 'info', label: 'Info', icon: Info },
    { key: 'contacts', label: 'Contacts', icon: User },
    { key: 'adresses', label: 'Adresses', icon: MapPin },
  ]

  return (
    <div className="w-96 flex-shrink-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
      <div className="flex border-b p-1 gap-1 rounded-t-xl bg-zinc-200/50">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn('flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                activeTab === tab.key ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10')}>
              <Icon className="h-3.5 w-3.5" />{tab.label}
            </button>
          )
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeTab === 'info' && <InfoTab sousTraitant={sousTraitant} isEditing={isEditing} editCommentaire={editCommentaire} onEditCommentaireChange={onEditCommentaireChange} />}
        {activeTab === 'contacts' && <ContactsTab contacts={sousTraitant.contacts} isEditing={isEditing} sousTraitantId={sousTraitantId} onMutationSuccess={onMutationSuccess} onDirtyChange={onSubFormsDirtyChange} />}
        {activeTab === 'adresses' && <AdressesTab adresses={sousTraitant.adresses} isEditing={isEditing} sousTraitantId={sousTraitantId} onMutationSuccess={onMutationSuccess} onDirtyChange={onSubFormsDirtyChange} />}
      </div>
    </div>
  )
}

// ── Sidebar Tab: Info ─────────────────────────────────

function InfoTab({ sousTraitant, isEditing, editCommentaire, onEditCommentaireChange }: {
  sousTraitant: SousTraitantDetail; isEditing: boolean; editCommentaire: string; onEditCommentaireChange: (v: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Commentaire</p>
        {isEditing ? (
          <textarea value={editCommentaire} onChange={(e) => onEditCommentaireChange(e.target.value)} rows={5}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
        ) : sousTraitant.commentaire?.trim() ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{sousTraitant.commentaire}</p>
        ) : <p className="text-sm text-muted-foreground italic">Aucun commentaire</p>}
      </div>
    </div>
  )
}

// ── Sidebar Tab: Contacts ──────────────────────────────

const ENVOI_FLAGS = [
  { key: 'envoi_commande' as const, label: 'Commande', icon: ShoppingCart },
  { key: 'envoi_bl' as const, label: 'BL', icon: FileText },
  { key: 'envoi_facture' as const, label: 'Facture', icon: FileText },
  { key: 'envoi_soumission' as const, label: 'Soumission', icon: Send },
]

function ContactsTab({ contacts, isEditing, sousTraitantId, onMutationSuccess, onDirtyChange }: {
  contacts: Contact[]; isEditing: boolean; sousTraitantId: number; onMutationSuccess: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ nom: '', prenom: '', tel: '', mail: '', envoi_bl: false, envoi_facture: false, envoi_commande: false, envoi_soumission: false })
  const [showForm, setShowForm] = useState(false)

  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => { onDirtyChangeRef.current = onDirtyChange })
  useEffect(() => {
    onDirtyChangeRef.current(showForm || editingId !== null)
  }, [showForm, editingId])
  useEffect(() => () => { onDirtyChangeRef.current(false) }, [])

  const createMut = useMutation({
    mutationFn: () => apiFetch(`/sous-traitants/${sousTraitantId}/contacts`, { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => { onMutationSuccess(); resetForm() },
  })
  const updateMut = useMutation({
    mutationFn: (cid: number) => apiFetch(`/sous-traitants/${sousTraitantId}/contacts/${cid}`, { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => { onMutationSuccess(); setEditingId(null) },
  })
  const deleteMut = useMutation({
    mutationFn: (cid: number) => apiFetch(`/sous-traitants/${sousTraitantId}/contacts/${cid}`, { method: 'DELETE' }),
    onSuccess: onMutationSuccess,
  })

  const resetForm = () => { setForm({ nom: '', prenom: '', tel: '', mail: '', envoi_bl: false, envoi_facture: false, envoi_commande: false, envoi_soumission: false }); setShowForm(false) }

  const startEditContact = (c: Contact) => {
    setEditingId(c.IDcontact)
    setForm({ nom: c.nom ?? '', prenom: c.prenom ?? '', tel: c.tel ?? '', mail: c.mail ?? '', envoi_bl: !!c.envoi_bl, envoi_facture: !!c.envoi_facture, envoi_commande: !!c.envoi_commande, envoi_soumission: !!c.envoi_soumission })
  }

  const contactForm = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <LabeledInput label="Prenom" value={form.prenom} onChange={(v) => setForm({ ...form, prenom: v })} autoFocus />
        <LabeledInput label="Nom" value={form.nom} onChange={(v) => setForm({ ...form, nom: v })} />
      </div>
      <LabeledInput label="Telephone" value={form.tel} onChange={(v) => setForm({ ...form, tel: v })} />
      <LabeledInput label="Email" value={form.mail} onChange={(v) => setForm({ ...form, mail: v })} />
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Envoi documents</label>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {ENVOI_FLAGS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-input accent-accent" />
              {label}
            </label>
          ))}
        </div>
      </div>
    </>
  )

  if (contacts.length === 0 && !isEditing) return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground"><User className="h-10 w-10 mb-2 opacity-40" /><p className="text-sm">Aucun contact</p></div>
  )

  return (
    <>
      {contacts.map((c) =>
        isEditing && editingId === c.IDcontact ? (
          <InlineForm key={c.IDcontact} title="Modifier le contact" onSave={() => updateMut.mutate(c.IDcontact)} onCancel={() => setEditingId(null)} isSaving={updateMut.isPending}>
            {contactForm}
          </InlineForm>
        ) : (
          <div key={c.IDcontact} className="p-3 rounded-lg border bg-card shadow-sm group relative">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm flex items-center gap-2">
                  {[c.prenom, c.nom].filter(Boolean).join(' ') || 'Contact'}
                  {!!c.est_defaut && <Badge variant="secondary" className="text-[10px] py-0"><Star className="h-2.5 w-2.5 mr-0.5" />Principal</Badge>}
                </div>
                {c.tel && <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1"><Phone className="h-3 w-3" />{c.tel}</div>}
                {c.mail && <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Mail className="h-3 w-3" /><span className="truncate">{c.mail}</span></div>}
                {ENVOI_FLAGS.some(({ key }) => !!c[key]) && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {ENVOI_FLAGS.map(({ key, label }) => !!c[key] && (
                      <Badge key={key} variant="outline" className="text-[10px] py-0 px-1.5">{label}</Badge>
                    ))}
                  </div>
                )}
              </div>
              {isEditing && (
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditContact(c)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteMut.mutate(c.IDcontact)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              )}
            </div>
          </div>
        )
      )}
      {isEditing && !showForm && editingId === null && (
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-foreground" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1.5" />Ajouter un contact
        </Button>
      )}
      {isEditing && showForm && (
        <InlineForm title="Nouveau contact" onSave={() => createMut.mutate()} onCancel={resetForm} isSaving={createMut.isPending}>
          {contactForm}
        </InlineForm>
      )}
    </>
  )
}

// ── Sidebar Tab: Adresses ──────────────────────────────

function AdressesTab({ adresses, isEditing, sousTraitantId, onMutationSuccess, onDirtyChange }: {
  adresses: Adresse[]; isEditing: boolean; sousTraitantId: number; onMutationSuccess: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ nom: '', adresse1: '', adresse2: '', adresse3: '', cp: '', ville: '', pays: '', commentaire: '', est_defaut_facturation: false, est_defaut_livraison: false })
  const [showForm, setShowForm] = useState(false)

  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => { onDirtyChangeRef.current = onDirtyChange })
  useEffect(() => {
    onDirtyChangeRef.current(showForm || editingId !== null)
  }, [showForm, editingId])
  useEffect(() => () => { onDirtyChangeRef.current(false) }, [])

  const createMut = useMutation({
    mutationFn: () => apiFetch(`/sous-traitants/${sousTraitantId}/adresses`, { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => { onMutationSuccess(); resetForm() },
  })
  const updateMut = useMutation({
    mutationFn: (aid: number) => apiFetch(`/sous-traitants/${sousTraitantId}/adresses/${aid}`, { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => { onMutationSuccess(); setEditingId(null) },
  })
  const deleteMut = useMutation({
    mutationFn: (aid: number) => apiFetch(`/sous-traitants/${sousTraitantId}/adresses/${aid}`, { method: 'DELETE' }),
    onSuccess: onMutationSuccess,
  })

  const resetForm = () => { setForm({ nom: '', adresse1: '', adresse2: '', adresse3: '', cp: '', ville: '', pays: '', commentaire: '', est_defaut_facturation: false, est_defaut_livraison: false }); setShowForm(false) }

  const startEditAddr = (a: Adresse) => {
    setEditingId(a.IDadresse)
    setForm({ nom: a.nom ?? '', adresse1: a.adresse1 ?? '', adresse2: a.adresse2 ?? '', adresse3: a.adresse3 ?? '', cp: a.cp ?? '', ville: a.ville ?? '', pays: a.pays ?? '', commentaire: a.commentaire ?? '', est_defaut_facturation: !!a.est_defaut_facturation, est_defaut_livraison: !!a.est_defaut_livraison })
  }

  const adresseForm = (
    <>
      <LabeledInput label="Libelle" value={form.nom} onChange={(v) => setForm({ ...form, nom: v })} autoFocus />
      <LabeledInput label="Adresse 1" value={form.adresse1} onChange={(v) => setForm({ ...form, adresse1: v })} />
      <LabeledInput label="Adresse 2" value={form.adresse2} onChange={(v) => setForm({ ...form, adresse2: v })} />
      <LabeledInput label="Adresse 3" value={form.adresse3} onChange={(v) => setForm({ ...form, adresse3: v })} />
      <div className="grid grid-cols-3 gap-2">
        <LabeledInput label="CP" value={form.cp} onChange={(v) => setForm({ ...form, cp: v })} />
        <div className="col-span-2"><LabeledInput label="Ville" value={form.ville} onChange={(v) => setForm({ ...form, ville: v })} /></div>
      </div>
      <LabeledInput label="Pays" value={form.pays} onChange={(v) => setForm({ ...form, pays: v })} />
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Type d'adresse</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={form.est_defaut_facturation} onChange={(e) => setForm({ ...form, est_defaut_facturation: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-input accent-accent" />
            Facturation
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={form.est_defaut_livraison} onChange={(e) => setForm({ ...form, est_defaut_livraison: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-input accent-accent" />
            Livraison
          </label>
        </div>
      </div>
    </>
  )

  if (adresses.length === 0 && !isEditing) return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground"><MapPin className="h-10 w-10 mb-2 opacity-40" /><p className="text-sm">Aucune adresse</p></div>
  )

  return (
    <>
      {adresses.map((a) =>
        isEditing && editingId === a.IDadresse ? (
          <InlineForm key={a.IDadresse} title="Modifier l'adresse" onSave={() => updateMut.mutate(a.IDadresse)} onCancel={() => setEditingId(null)} isSaving={updateMut.isPending}>
            {adresseForm}
          </InlineForm>
        ) : (
          <div key={a.IDadresse} className="p-3 rounded-lg border bg-card shadow-sm group relative">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm flex items-center gap-2">
                  {a.nom || 'Adresse'}
                  {!!a.est_defaut && <Badge variant="secondary" className="text-[10px] py-0"><Star className="h-2.5 w-2.5 mr-0.5" />Principale</Badge>}
                </div>
                {(!!a.est_defaut_facturation || !!a.est_defaut_livraison) && (
                  <div className="flex gap-1 mt-0.5">
                    {!!a.est_defaut_facturation && <Badge variant="outline" className="text-[10px] py-0 px-1.5">Facturation</Badge>}
                    {!!a.est_defaut_livraison && <Badge variant="outline" className="text-[10px] py-0 px-1.5">Livraison</Badge>}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {a.adresse1 && <p>{a.adresse1}</p>}
                  {a.adresse2 && <p>{a.adresse2}</p>}
                  {a.adresse3 && <p>{a.adresse3}</p>}
                  {(a.cp || a.ville) && <p>{[a.cp, a.ville].filter(Boolean).join(' ')}</p>}
                  {a.pays && <p>{a.pays}</p>}
                </div>
              </div>
              {isEditing && (
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditAddr(a)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteMut.mutate(a.IDadresse)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              )}
            </div>
          </div>
        )
      )}
      {isEditing && !showForm && editingId === null && (
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-foreground" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1.5" />Ajouter une adresse
        </Button>
      )}
      {isEditing && showForm && (
        <InlineForm title="Nouvelle adresse" onSave={() => createMut.mutate()} onCancel={resetForm} isSaving={createMut.isPending}>
          {adresseForm}
        </InlineForm>
      )}
    </>
  )
}
