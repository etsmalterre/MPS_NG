import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import {
  Users,
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
  Phone,
  Printer,
  AtSign,
  Receipt,
  Briefcase,
  CalendarClock,
  ChevronDown,
  Palette,
  BadgeEuro,
  Tag,
  History,
  Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PopoverSelect, SearchableCombobox } from '@/components/ui/popover-select'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { cn } from '@/lib/utils'
import { hfsqlDateToInput, inputDateToHfsql, formatHfsqlDate } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { apiFetch } from '@/lib/api'

// ── Types ──────────────────────────────────────────────

interface ClientListRow {
  IDclient: number
  nom: string | null
  tel: string | null
  client_interne: number
  archive: number
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

interface ClientDetail {
  IDclient: number
  nom: string | null
  tel: string | null
  fax: string | null
  num_tva: string | null
  compte: string | null
  commentaire: string | null
  journal_commercial: string | null
  pct_remise: number
  pct_ajeol: number
  IDtva: number
  IDmode_paiement: number
  IDecheance: number
  IDcode_comptable: number
  IDsecteur_activite: number
  IDactivite: number
  client_interne: number
  inclureRapportQualite: number
  dernier_contact: string | null
  date_creation: string | null
  adresses: Adresse[]
  contacts: Contact[]
}

interface LookupLabel { id: number; label: string }

// ── API hooks ──────────────────────────────────────────

function useClients() {
  return useQuery<ClientListRow[]>({ queryKey: ['clients'], queryFn: () => apiFetch('/clients') })
}
function useClientDetail(id: number | null) {
  return useQuery<ClientDetail>({ queryKey: ['client', id], queryFn: () => apiFetch(`/clients/${id}`), enabled: id !== null })
}

function useLookup(path: string, key: string, map: (r: any) => LookupLabel) {
  const { data } = useQuery<any[]>({ queryKey: ['client-lookup', key], queryFn: () => apiFetch(`/clients/lookups/${path}`), staleTime: 5 * 60_000 })
  return useMemo(() => (data ?? []).map(map), [data, map])
}

// ── Shared styling ─────────────────────────────────────

const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

// ── Edit draft ─────────────────────────────────────────

interface Draft {
  nom: string
  tel: string
  fax: string
  num_tva: string
  compte: string
  commentaire: string
  journal_commercial: string
  pct_remise: string
  pct_ajeol: string
  IDtva: number
  IDmode_paiement: number
  IDecheance: number
  IDcode_comptable: number
  IDsecteur_activite: number
  IDactivite: number
  client_interne: boolean
  inclureRapportQualite: boolean
  dernier_contact: string // YYYY-MM-DD for <input type=date>
}

function draftFromDetail(d: ClientDetail): Draft {
  return {
    nom: d.nom ?? '',
    tel: d.tel ?? '',
    fax: d.fax ?? '',
    num_tva: d.num_tva ?? '',
    compte: d.compte ?? '',
    commentaire: d.commentaire ?? '',
    journal_commercial: d.journal_commercial ?? '',
    pct_remise: d.pct_remise ? String(d.pct_remise) : '',
    pct_ajeol: d.pct_ajeol ? String(d.pct_ajeol) : '',
    IDtva: d.IDtva ?? 0,
    IDmode_paiement: d.IDmode_paiement ?? 0,
    IDecheance: d.IDecheance ?? 0,
    IDcode_comptable: d.IDcode_comptable ?? 0,
    IDsecteur_activite: d.IDsecteur_activite ?? 0,
    IDactivite: d.IDactivite ?? 0,
    client_interne: !!d.client_interne,
    inclureRapportQualite: !!d.inclureRapportQualite,
    dernier_contact: hfsqlDateToInput(d.dernier_contact),
  }
}

function draftToBody(d: Draft) {
  return {
    nom: d.nom.trim() || 'Client',
    tel: d.tel,
    fax: d.fax,
    num_tva: d.num_tva,
    compte: d.compte,
    commentaire: d.commentaire,
    journal_commercial: d.journal_commercial,
    pct_remise: Number(d.pct_remise.replace(',', '.')) || 0,
    pct_ajeol: Number(d.pct_ajeol.replace(',', '.')) || 0,
    IDtva: d.IDtva,
    IDmode_paiement: d.IDmode_paiement,
    IDecheance: d.IDecheance,
    IDcode_comptable: d.IDcode_comptable,
    IDsecteur_activite: d.IDsecteur_activite,
    IDactivite: d.IDactivite,
    client_interne: d.client_interne,
    inclureRapportQualite: d.inclureRapportQualite,
    dernier_contact: inputDateToHfsql(d.dernier_contact),
  }
}

// ── Main Page ──────────────────────────────────────────

type ArchiveFilter = 'encours' | 'archive' | 'tous'

export function ClientsGestion() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('encours')
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [subFormsDirty, setSubFormsDirty] = useState(false)
  const [autoEditForId, setAutoEditForId] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)

  const originalDraftRef = useRef<Draft | null>(null)

  const { data: clients, isLoading, isError, error } = useClients()
  const { data: detail, isLoading: detailLoading } = useClientDetail(selectedId)

  // Lookups (shared across edit + view-mode label resolution)
  const secteurs = useLookup('secteurs', 'secteurs', (r) => ({ id: r.IDsecteur_activite, label: r.nom }))
  const activites = useLookup('activites', 'activites', (r) => ({ id: r.IDactivite, label: r.nom }))
  const modesPaiement = useLookup('modes-paiement', 'modes-paiement', (r) => ({ id: r.IDmode_paiement, label: r.libelle }))
  const echeances = useLookup('echeances', 'echeances', (r) => ({ id: r.IDecheance, label: r.libelle }))
  const tvas = useLookup('tva', 'tva', (r) => ({ id: r.IDtva, label: r.libelle }))
  const codesComptables = useLookup('codes-comptables', 'codes-comptables', (r) => ({ id: r.IDcode_comptable, label: r.libelle }))

  const filtered = useMemo(() => {
    if (!clients) return []
    const q = searchQuery.trim().toLowerCase()
    return clients.filter((c) => {
      if (archiveFilter === 'encours' && c.archive) return false
      if (archiveFilter === 'archive' && !c.archive) return false
      if (q && !(c.nom ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [clients, searchQuery, archiveFilter])

  // Keep selection valid against the (search/filter-narrowed) list.
  useEffect(() => {
    if (isEditing || filtered.length === 0) return
    const stillVisible = selectedId !== null && filtered.some((c) => c.IDclient === selectedId)
    if (!stillVisible) setSelectedId(filtered[0].IDclient)
  }, [filtered, selectedId, isEditing])

  const startEdit = useCallback(() => {
    if (!detail) return
    const snap = draftFromDetail(detail)
    setDraft(snap)
    originalDraftRef.current = snap
    setIsEditing(true)
  }, [detail])

  const cancelEdit = useCallback(() => { setIsEditing(false); setDraft(null) }, [])

  const isDirty = useMemo(() => {
    if (!isEditing || !draft) return false
    if (subFormsDirty) return true
    return JSON.stringify(draft) !== JSON.stringify(originalDraftRef.current)
  }, [isEditing, draft, subFormsDirty])

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['clients'] })
    queryClient.invalidateQueries({ queryKey: ['client', selectedId] })
  }, [queryClient, selectedId])

  const saveMutation = useMutation({
    mutationFn: () => apiFetch(`/clients/${selectedId}`, { method: 'PUT', body: JSON.stringify(draftToBody(draft!)) }),
    onSuccess: () => { invalidateAll(); setIsEditing(false); setDraft(null) },
  })

  const createMutation = useMutation({
    mutationFn: () => apiFetch('/clients', { method: 'POST', body: JSON.stringify({ nom: 'Nouveau client' }) }),
    onSuccess: (data: { IDclient: number }) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setArchiveFilter('encours')
      setSelectedId(data.IDclient)
      setAutoEditForId(data.IDclient)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/clients/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      const cached = queryClient.getQueryData<ClientListRow[]>(['clients']) ?? []
      const remaining = cached.filter((c) => c.IDclient !== deletedId)
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setIsEditing(false)
      setDraft(null)
      setDeleteConfirm(false)
      setSelectedId(remaining.length > 0 ? remaining[0].IDclient : null)
    },
  })

  // Auto-enter edit mode once the freshly-created client's detail loads.
  useEffect(() => {
    if (autoEditForId !== null && detail?.IDclient === autoEditForId) {
      startEdit()
      setAutoEditForId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditForId, detail])

  const guard = useUnsavedGuard({
    isDirty,
    save: async () => { await saveMutation.mutateAsync() },
    onDiscard: () => { setIsEditing(false); setDraft(null) },
  })

  const handleSelect = useCallback((id: number) => {
    guard.guardAction(() => { setIsEditing(false); setDraft(null); setSelectedId(id) })
  }, [guard])

  const patch = useCallback((p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d)), [])

  return (
    <>
      <MasterDetailLayout
        list={<ClientList clients={filtered} total={clients?.length ?? 0} isLoading={isLoading} isError={isError} error={error as Error | null}
          selectedId={selectedId} onSelect={handleSelect} searchQuery={searchQuery} onSearchChange={setSearchQuery}
          archiveFilter={archiveFilter} onArchiveFilterChange={setArchiveFilter}
          onNew={() => createMutation.mutate()} isCreating={createMutation.isPending} isEditing={isEditing} />}
        detailHeader={<DetailHeader client={detail ?? null} isLoading={detailLoading && selectedId !== null}
          isEditing={isEditing} draft={draft} onPatch={patch}
          onStartEdit={startEdit} onCancelEdit={cancelEdit} onSave={() => saveMutation.mutate()} isSaving={saveMutation.isPending}
          onDelete={() => setDeleteConfirm(true)} onPrint={() => setPrintOpen(true)} onEmail={() => setEmailOpen(true)} />}
        detail={<DetailMain client={detail ?? null} isLoading={detailLoading && selectedId !== null}
          hasSelection={selectedId !== null} isEditing={isEditing} draft={draft} onPatch={patch}
          secteurs={secteurs} activites={activites} modesPaiement={modesPaiement} echeances={echeances} tvas={tvas} codesComptables={codesComptables} />}
        sidebar={selectedId !== null ? <DetailSidebar client={detail ?? null} isLoading={detailLoading}
          isEditing={isEditing} clientId={selectedId} onMutationSuccess={invalidateAll}
          onSubFormsDirtyChange={setSubFormsDirty} /> : null}
        sidebarTitle="Contacts & Adresses" hasSelection={selectedId !== null}
        onBack={() => guard.guardAction(() => { setIsEditing(false); setDraft(null); setSelectedId(null) })}
      />
      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />
      <ConfirmDialog
        open={deleteConfirm}
        title="Supprimer le client"
        description="Cette action supprimera le client. Elle est irréversible."
        isPending={deleteMutation.isPending}
        onCancel={() => setDeleteConfirm(false)}
        onConfirm={() => { if (selectedId !== null) deleteMutation.mutate(selectedId) }}
      />
      <PlaceholderDialog open={printOpen} onClose={() => setPrintOpen(false)} title="Imprimer" Icon={Printer} CenterIcon={Printer} />
      <PlaceholderDialog open={emailOpen} onClose={() => setEmailOpen(false)} title="Envoyer un email" Icon={AtSign} CenterIcon={Mail} />
    </>
  )
}

// ── "En developpement" placeholder dialog ──────────────

function PlaceholderDialog({ open, onClose, title, Icon, CenterIcon }: {
  open: boolean; onClose: () => void; title: string; Icon: React.ElementType; CenterIcon: React.ElementType
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

// ── Left Panel: List ───────────────────────────────────

const ARCHIVE_FILTERS: { key: ArchiveFilter; label: string }[] = [
  { key: 'encours', label: 'En cours' },
  { key: 'archive', label: 'Archivés' },
  { key: 'tous', label: 'Tous' },
]

function ClientList({ clients, total, isLoading, isError, error, selectedId, onSelect, searchQuery, onSearchChange, archiveFilter, onArchiveFilterChange, onNew, isCreating, isEditing }: {
  clients: ClientListRow[]; total: number; isLoading: boolean; isError: boolean; error: Error | null
  selectedId: number | null; onSelect: (id: number) => void; searchQuery: string; onSearchChange: (q: string) => void
  archiveFilter: ArchiveFilter; onArchiveFilterChange: (f: ArchiveFilter) => void
  onNew: () => void; isCreating: boolean; isEditing: boolean
}) {
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Rechercher..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off" className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex flex-wrap gap-1">
          {ARCHIVE_FILTERS.map((opt) => (
            <button key={opt.key} type="button" onClick={() => onArchiveFilterChange(opt.key)}
              className={cn('px-2 py-1 text-xs rounded-md transition-colors flex-grow basis-[calc(33.333%-0.25rem)]',
                archiveFilter === opt.key ? 'bg-accent text-accent-foreground shadow-sm font-medium' : 'text-muted-foreground hover:bg-accent/10')}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2 scrollbar-transparent">
        {isLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
        : isError ? <div className="flex flex-col items-center justify-center py-8 text-destructive"><AlertCircle className="h-6 w-6 mb-2" /><p className="text-sm">{error?.message || 'Erreur'}</p></div>
        : clients.length === 0 ? <div className="flex flex-col items-center justify-center py-8 text-muted-foreground"><Users className="h-12 w-12 mb-3 opacity-50" /><p className="text-sm">Aucun client</p></div>
        : clients.map((c) => (
          <div key={c.IDclient} onClick={() => onSelect(c.IDclient)}
            className={cn('p-3 border rounded-lg cursor-pointer transition-all',
              selectedId === c.IDclient ? 'border-accent bg-white ring-1 ring-accent' : 'border-border bg-white hover:border-accent/50')}>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <p className="font-medium text-sm truncate flex-1">{c.nom || '—'}</p>
              {!!c.client_interne && <Badge variant="secondary" className="text-[10px] py-0 flex-shrink-0">Interne</Badge>}
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>{clients.length} / {total} client{total !== 1 ? 's' : ''}</span>
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

function DetailHeader({ client, isLoading, isEditing, draft, onPatch, onStartEdit, onCancelEdit, onSave, isSaving, onDelete, onPrint, onEmail }: {
  client: ClientDetail | null; isLoading: boolean; isEditing: boolean; draft: Draft | null; onPatch: (p: Partial<Draft>) => void
  onStartEdit: () => void; onCancelEdit: () => void; onSave: () => void; isSaving: boolean
  onDelete: () => void; onPrint: () => void; onEmail: () => void
}) {
  if (!client && !isLoading) return null
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center', isEditing ? 'bg-accent/15' : 'icon-box-gold')}>
          <Users className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {isLoading ? <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          : isEditing ? (
            <div className="flex items-center gap-3">
              <input value={draft?.nom ?? ''} onChange={(e) => onPatch({ nom: e.target.value })} autoFocus
                className="flex-1 text-xl font-heading font-bold h-10 px-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              <Badge className="bg-accent text-accent-foreground flex-shrink-0 gap-1 shadow-sm"><Pencil className="h-3 w-3" />Mode edition</Badge>
            </div>
          ) : (
            <h1 className="text-2xl font-heading font-bold tracking-tight truncate">{client?.nom || '—'}</h1>
          )}
        </div>
        {!isLoading && client && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={onCancelEdit}><X className="h-3.5 w-3.5 mr-1.5" />Annuler</Button>
                <Button size="sm" onClick={onSave} disabled={isSaving}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />{isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="icon" className="h-9 w-9" title="Imprimer" onClick={onPrint}><Printer className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" className="h-9 w-9" title="Envoyer un email" onClick={onEmail}><AtSign className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" title="Supprimer" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
                <Button variant="gold" size="sm" onClick={onStartEdit}><Pencil className="h-3.5 w-3.5 mr-1.5" />Modifier</Button>
              </>
            )}
          </div>
        )}
      </div>
      <div className={cn('h-1 w-24 mt-3 rounded-full', isEditing ? 'bg-accent' : 'bg-gradient-to-r from-accent via-accent to-accent/30')} />
    </div>
  )
}

// ── Field primitives ───────────────────────────────────

function Field({ label, value, edit, onChange, type = 'text', placeholder }: {
  label: string; value: string; edit: boolean; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {edit ? (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          autoComplete="off" data-form-type="other" data-lpignore="true" className={inputClass} />
      ) : (
        <p className="text-sm min-h-[1.25rem]">{value?.trim() ? value : <span className="text-muted-foreground">—</span>}</p>
      )}
    </div>
  )
}

function SelectField({ label, value, edit, options, onChange, searchable }: {
  label: string; value: number; edit: boolean; options: LookupLabel[]; onChange: (id: number) => void; searchable?: boolean
}) {
  const current = options.find((o) => o.id === value)
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {edit ? (
        searchable ? (
          <SearchableCombobox
            options={options} value={value} onChange={onChange}
            getId={(o) => o.id} getPrimary={(o) => o.label}
            placeholder={`Rechercher ${label.toLowerCase()}`} size="sm"
          />
        ) : (
          <PopoverSelect options={options.map((o) => ({ id: o.id, primary: o.label }))} value={value} onChange={onChange} emptyLabel="— Aucun —" size="sm" />
        )
      ) : (
        <p className="text-sm min-h-[1.25rem]">{current ? current.label : <span className="text-muted-foreground">—</span>}</p>
      )}
    </div>
  )
}

function TogglePill({ label, checked, disabled, onChange }: {
  label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border/60 bg-white shadow-sm">
      <span className="text-xs font-medium">{label}</span>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          checked ? 'bg-accent shadow-inner' : 'bg-zinc-300 hover:bg-zinc-400/80')}>
        <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </div>
  )
}

function SectionCard({ icon, title, isEditing, children }: { icon: React.ReactNode; title: string; isEditing: boolean; children: React.ReactNode }) {
  return (
    <Card className={cn('card-premium', isEditing && editSectionClass)}>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        {icon}
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// ── Center: Detail Main (master-data form) ─────────────

function DetailMain({ client, isLoading, hasSelection, isEditing, draft, onPatch, secteurs, activites, modesPaiement, echeances, tvas, codesComptables }: {
  client: ClientDetail | null; isLoading: boolean; hasSelection: boolean; isEditing: boolean; draft: Draft | null; onPatch: (p: Partial<Draft>) => void
  secteurs: LookupLabel[]; activites: LookupLabel[]; modesPaiement: LookupLabel[]; echeances: LookupLabel[]; tvas: LookupLabel[]; codesComptables: LookupLabel[]
}) {
  if (!hasSelection) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="icon-box-gold h-16 w-16 mx-auto"><Users className="h-8 w-8" /></div>
        <p className="text-muted-foreground text-sm">Sélectionnez un client dans la liste</p>
      </div>
    </div>
  )
  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
  if (!client) return null

  const ed = isEditing && draft !== null
  // View-mode values come from `client`; edit-mode from `draft`.
  const v = {
    tel: ed ? draft!.tel : client.tel ?? '',
    fax: ed ? draft!.fax : client.fax ?? '',
    num_tva: ed ? draft!.num_tva : client.num_tva ?? '',
    compte: ed ? draft!.compte : client.compte ?? '',
    commentaire: ed ? draft!.commentaire : client.commentaire ?? '',
    journal: ed ? draft!.journal_commercial : client.journal_commercial ?? '',
    pct_remise: ed ? draft!.pct_remise : (client.pct_remise ? String(client.pct_remise) : ''),
    pct_ajeol: ed ? draft!.pct_ajeol : (client.pct_ajeol ? String(client.pct_ajeol) : ''),
    IDtva: ed ? draft!.IDtva : client.IDtva,
    IDmode_paiement: ed ? draft!.IDmode_paiement : client.IDmode_paiement,
    IDecheance: ed ? draft!.IDecheance : client.IDecheance,
    IDcode_comptable: ed ? draft!.IDcode_comptable : client.IDcode_comptable,
    IDsecteur_activite: ed ? draft!.IDsecteur_activite : client.IDsecteur_activite,
    IDactivite: ed ? draft!.IDactivite : client.IDactivite,
    client_interne: ed ? draft!.client_interne : !!client.client_interne,
    inclureRapportQualite: ed ? draft!.inclureRapportQualite : !!client.inclureRapportQualite,
    dernier_contact_input: ed ? draft!.dernier_contact : hfsqlDateToInput(client.dernier_contact),
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto space-y-4 pr-1">
      {/* Général */}
      <SectionCard icon={<Briefcase className="h-4 w-4 text-accent" />} title="Général" isEditing={ed}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Téléphone" value={v.tel} edit={ed} onChange={(x) => onPatch({ tel: x })} />
          <Field label="Fax" value={v.fax} edit={ed} onChange={(x) => onPatch({ fax: x })} />
          <Field label="Remise (%)" value={v.pct_remise} edit={ed} type="number" onChange={(x) => onPatch({ pct_remise: x })} />
          <Field label="% AJEOL" value={v.pct_ajeol} edit={ed} type="number" onChange={(x) => onPatch({ pct_ajeol: x })} />
          <SelectField label="Secteur" value={v.IDsecteur_activite} edit={ed} options={secteurs} onChange={(id) => onPatch({ IDsecteur_activite: id })} searchable />
          <SelectField label="Activité" value={v.IDactivite} edit={ed} options={activites} onChange={(id) => onPatch({ IDactivite: id })} searchable />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <TogglePill label="Client interne" checked={v.client_interne} disabled={!ed} onChange={(x) => onPatch({ client_interne: x })} />
          <TogglePill label="Inclure rapports contrôle (exp.)" checked={v.inclureRapportQualite} disabled={!ed} onChange={(x) => onPatch({ inclureRapportQualite: x })} />
        </div>
      </SectionCard>

      {/* Facturation */}
      <SectionCard icon={<Receipt className="h-4 w-4 text-accent" />} title="Facturation" isEditing={ed}>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Mode de paiement" value={v.IDmode_paiement} edit={ed} options={modesPaiement} onChange={(id) => onPatch({ IDmode_paiement: id })} />
          <SelectField label="Échéance" value={v.IDecheance} edit={ed} options={echeances} onChange={(id) => onPatch({ IDecheance: id })} />
          <SelectField label="TVA" value={v.IDtva} edit={ed} options={tvas} onChange={(id) => onPatch({ IDtva: id })} />
          <Field label="N° TVA" value={v.num_tva} edit={ed} onChange={(x) => onPatch({ num_tva: x })} />
          <SelectField label="Code comptable" value={v.IDcode_comptable} edit={ed} options={codesComptables} onChange={(id) => onPatch({ IDcode_comptable: id })} searchable />
          <Field label="Compte client" value={v.compte} edit={ed} onChange={(x) => onPatch({ compte: x })} />
        </div>
      </SectionCard>

      {/* Commercial */}
      <SectionCard icon={<CalendarClock className="h-4 w-4 text-accent" />} title="Commercial" isEditing={ed}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Dernier contact</label>
            {ed ? (
              <input type="date" value={v.dernier_contact_input} onChange={(e) => onPatch({ dernier_contact: e.target.value })}
                autoComplete="off" data-form-type="other" data-lpignore="true" className={inputClass} />
            ) : (
              <p className="text-sm min-h-[1.25rem]">{client.dernier_contact && /\d{8}/.test(client.dernier_contact) ? formatHfsqlDate(client.dernier_contact) : <span className="text-muted-foreground">—</span>}</p>
            )}
          </div>
        </div>
        <div className="space-y-1 mt-3">
          <label className="text-xs font-medium text-muted-foreground">Journal commercial</label>
          {ed ? (
            <textarea value={v.journal} onChange={(e) => onPatch({ journal_commercial: e.target.value })} rows={6}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
          ) : v.journal?.trim() ? (
            <p className="text-sm text-muted-foreground whitespace-pre-line">{v.journal}</p>
          ) : <p className="text-sm text-muted-foreground italic">Aucun journal</p>}
        </div>
      </SectionCard>

      {/* Commentaire */}
      <SectionCard icon={<FileText className="h-4 w-4 text-accent" />} title="Commentaire" isEditing={ed}>
        {ed ? (
          <textarea value={v.commentaire} onChange={(e) => onPatch({ commentaire: e.target.value })} rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
        ) : v.commentaire?.trim() ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{v.commentaire}</p>
        ) : <p className="text-sm text-muted-foreground italic">Aucun commentaire</p>}
      </SectionCard>

      {/* Commercial sub-views (read-only) */}
      <ReferencesSection clientId={client.IDclient} />
      <HistoriqueSection clientId={client.IDclient} />
      <MarchandiseSection clientId={client.IDclient} />
    </div>
  )
}

// ── Shared form components (contacts/adresses) ─────────

function LabeledInput({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus}
        autoComplete="off" data-form-type="other" data-lpignore="true" className={inputClass} />
    </div>
  )
}

function InlineForm({ title, children, onSave, onCancel, isSaving }: { title: string; children: React.ReactNode; onSave: () => void; onCancel: () => void; isSaving: boolean }) {
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

type SidebarTab = 'contacts' | 'adresses'

function DetailSidebar({ client, isLoading, isEditing, clientId, onMutationSuccess, onSubFormsDirtyChange }: {
  client: ClientDetail | null; isLoading: boolean; isEditing: boolean; clientId: number; onMutationSuccess: () => void
  onSubFormsDirtyChange: (dirty: boolean) => void
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('contacts')
  if (isLoading) return (
    <div className="w-96 flex-shrink-0 bg-muted/30 rounded-xl border p-4 space-y-4">
      <div className="flex gap-2"><div className="h-8 flex-1 bg-muted animate-pulse rounded-md" /><div className="h-8 flex-1 bg-muted animate-pulse rounded-md" /></div>
      {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
    </div>
  )
  if (!client) return null

  const tabs: { key: SidebarTab; label: string; icon: React.ElementType; count: number }[] = [
    { key: 'contacts', label: 'Contacts', icon: User, count: client.contacts.length },
    { key: 'adresses', label: 'Adresses', icon: MapPin, count: client.adresses.length },
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
              <Badge variant="secondary" className="text-[10px] py-0 ml-0.5">{tab.count}</Badge>
            </button>
          )
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
        {activeTab === 'contacts' && <ContactsTab contacts={client.contacts} isEditing={isEditing} clientId={clientId} onMutationSuccess={onMutationSuccess} onDirtyChange={onSubFormsDirtyChange} />}
        {activeTab === 'adresses' && <AdressesTab adresses={client.adresses} isEditing={isEditing} clientId={clientId} onMutationSuccess={onMutationSuccess} onDirtyChange={onSubFormsDirtyChange} />}
      </div>
    </div>
  )
}

// ── Sidebar Tab: Contacts ──────────────────────────────

const ENVOI_FLAGS = [
  { key: 'envoi_commande' as const, label: 'Commande' },
  { key: 'envoi_bl' as const, label: 'BL' },
  { key: 'envoi_facture' as const, label: 'Facture' },
  { key: 'envoi_soumission' as const, label: 'Soumission' },
]

function ContactsTab({ contacts, isEditing, clientId, onMutationSuccess, onDirtyChange }: {
  contacts: Contact[]; isEditing: boolean; clientId: number; onMutationSuccess: () => void; onDirtyChange: (dirty: boolean) => void
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ nom: '', prenom: '', tel: '', mail: '', envoi_bl: false, envoi_facture: false, envoi_commande: false, envoi_soumission: false })
  const [showForm, setShowForm] = useState(false)

  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => { onDirtyChangeRef.current = onDirtyChange })
  useEffect(() => { onDirtyChangeRef.current(showForm || editingId !== null) }, [showForm, editingId])
  useEffect(() => () => { onDirtyChangeRef.current(false) }, [])

  const createMut = useMutation({ mutationFn: () => apiFetch(`/clients/${clientId}/contacts`, { method: 'POST', body: JSON.stringify(form) }), onSuccess: () => { onMutationSuccess(); resetForm() } })
  const updateMut = useMutation({ mutationFn: (cid: number) => apiFetch(`/clients/${clientId}/contacts/${cid}`, { method: 'PUT', body: JSON.stringify(form) }), onSuccess: () => { onMutationSuccess(); setEditingId(null) } })
  const deleteMut = useMutation({ mutationFn: (cid: number) => apiFetch(`/clients/${clientId}/contacts/${cid}`, { method: 'DELETE' }), onSuccess: onMutationSuccess })

  const resetForm = () => { setForm({ nom: '', prenom: '', tel: '', mail: '', envoi_bl: false, envoi_facture: false, envoi_commande: false, envoi_soumission: false }); setShowForm(false) }
  const startEditContact = (c: Contact) => {
    setEditingId(c.IDcontact)
    setForm({ nom: c.nom ?? '', prenom: c.prenom ?? '', tel: c.tel ?? '', mail: c.mail ?? '', envoi_bl: !!c.envoi_bl, envoi_facture: !!c.envoi_facture, envoi_commande: !!c.envoi_commande, envoi_soumission: !!c.envoi_soumission })
  }

  const contactForm = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <LabeledInput label="Prénom" value={form.prenom} onChange={(v) => setForm({ ...form, prenom: v })} autoFocus />
        <LabeledInput label="Nom" value={form.nom} onChange={(v) => setForm({ ...form, nom: v })} />
      </div>
      <LabeledInput label="Téléphone" value={form.tel} onChange={(v) => setForm({ ...form, tel: v })} />
      <LabeledInput label="Email" value={form.mail} onChange={(v) => setForm({ ...form, mail: v })} />
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Envoi documents</label>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {ENVOI_FLAGS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} className="h-3.5 w-3.5 rounded border-input accent-accent" />
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
          <InlineForm key={c.IDcontact} title="Modifier le contact" onSave={() => updateMut.mutate(c.IDcontact)} onCancel={() => setEditingId(null)} isSaving={updateMut.isPending}>{contactForm}</InlineForm>
        ) : (
          <div key={c.IDcontact} className={cn('p-3 rounded-lg border bg-card shadow-sm group relative', isEditing && editSectionClass)}>
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
                    {ENVOI_FLAGS.map(({ key, label }) => !!c[key] && <Badge key={key} variant="outline" className="text-[10px] py-0 px-1.5">{label}</Badge>)}
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
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-foreground" onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1.5" />Ajouter un contact</Button>
      )}
      {isEditing && showForm && <InlineForm title="Nouveau contact" onSave={() => createMut.mutate()} onCancel={resetForm} isSaving={createMut.isPending}>{contactForm}</InlineForm>}
    </>
  )
}

// ── Sidebar Tab: Adresses ──────────────────────────────

function AdressesTab({ adresses, isEditing, clientId, onMutationSuccess, onDirtyChange }: {
  adresses: Adresse[]; isEditing: boolean; clientId: number; onMutationSuccess: () => void; onDirtyChange: (dirty: boolean) => void
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ nom: '', adresse1: '', adresse2: '', adresse3: '', cp: '', ville: '', pays: '', commentaire: '', est_defaut_facturation: false, est_defaut_livraison: false })
  const [showForm, setShowForm] = useState(false)

  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => { onDirtyChangeRef.current = onDirtyChange })
  useEffect(() => { onDirtyChangeRef.current(showForm || editingId !== null) }, [showForm, editingId])
  useEffect(() => () => { onDirtyChangeRef.current(false) }, [])

  const createMut = useMutation({ mutationFn: () => apiFetch(`/clients/${clientId}/adresses`, { method: 'POST', body: JSON.stringify(form) }), onSuccess: () => { onMutationSuccess(); resetForm() } })
  const updateMut = useMutation({ mutationFn: (aid: number) => apiFetch(`/clients/${clientId}/adresses/${aid}`, { method: 'PUT', body: JSON.stringify(form) }), onSuccess: () => { onMutationSuccess(); setEditingId(null) } })
  const deleteMut = useMutation({ mutationFn: (aid: number) => apiFetch(`/clients/${clientId}/adresses/${aid}`, { method: 'DELETE' }), onSuccess: onMutationSuccess })

  const resetForm = () => { setForm({ nom: '', adresse1: '', adresse2: '', adresse3: '', cp: '', ville: '', pays: '', commentaire: '', est_defaut_facturation: false, est_defaut_livraison: false }); setShowForm(false) }
  const startEditAddr = (a: Adresse) => {
    setEditingId(a.IDadresse)
    setForm({ nom: a.nom ?? '', adresse1: a.adresse1 ?? '', adresse2: a.adresse2 ?? '', adresse3: a.adresse3 ?? '', cp: a.cp ?? '', ville: a.ville ?? '', pays: a.pays ?? '', commentaire: a.commentaire ?? '', est_defaut_facturation: !!a.est_defaut_facturation, est_defaut_livraison: !!a.est_defaut_livraison })
  }

  const adresseForm = (
    <>
      <LabeledInput label="Libellé" value={form.nom} onChange={(v) => setForm({ ...form, nom: v })} autoFocus />
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
            <input type="checkbox" checked={form.est_defaut_facturation} onChange={(e) => setForm({ ...form, est_defaut_facturation: e.target.checked })} className="h-3.5 w-3.5 rounded border-input accent-accent" />Facturation
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={form.est_defaut_livraison} onChange={(e) => setForm({ ...form, est_defaut_livraison: e.target.checked })} className="h-3.5 w-3.5 rounded border-input accent-accent" />Livraison
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
          <InlineForm key={a.IDadresse} title="Modifier l'adresse" onSave={() => updateMut.mutate(a.IDadresse)} onCancel={() => setEditingId(null)} isSaving={updateMut.isPending}>{adresseForm}</InlineForm>
        ) : (
          <div key={a.IDadresse} className={cn('p-3 rounded-lg border bg-card shadow-sm group relative', isEditing && editSectionClass)}>
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
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-foreground" onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1.5" />Ajouter une adresse</Button>
      )}
      {isEditing && showForm && <InlineForm title="Nouvelle adresse" onSave={() => createMut.mutate()} onCancel={resetForm} isSaving={createMut.isPending}>{adresseForm}</InlineForm>}
    </>
  )
}

// ── Commercial sub-views (read-only collapsible sections) ──

const UNITE_LABEL: Record<number, string> = { 1: 'Kg', 3: 'Ml', 4: 'U', 5: 'm²' }

function CollapsibleShell({ icon, title, badge, open, onToggle, children }: {
  icon: React.ReactNode; title: string; badge?: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <Card className="card-premium">
      <CardHeader className="flex flex-row items-center gap-2 p-4 space-y-0 cursor-pointer select-none" onClick={onToggle}>
        {icon}
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <div className="ml-auto flex items-center gap-2">
          {badge}
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </div>
      </CardHeader>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  )
}

function SectionSpinner() { return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div> }
function SectionEmpty({ text }: { text: string }) { return <p className="text-sm text-muted-foreground italic py-2">{text}</p> }

const thHead = 'bg-zinc-100/80 border-b text-[10px] uppercase tracking-wide text-muted-foreground'

// ── Références catalogue ───────────────────────────────

interface RefColoris { IDref_client_colori: number; label: string; coloris_id: number; lst_tranche: string; contrat: number }
interface ClientReference { IDdesignation_client: number; client_ref: string; IDref_fini: number; IDref_ecru: number; ref_interne: string; avec_teinture: number; soumettre: number; unite: number; coloris: RefColoris[] }

function ReferencesSection({ clientId }: { clientId: number }) {
  const [open, setOpen] = useState(false)
  const [tarif, setTarif] = useState<{ IDref_fini: number; colorisId: number; label: string } | null>(null)
  const { data, isLoading } = useQuery<ClientReference[]>({ queryKey: ['client-references', clientId], queryFn: () => apiFetch(`/clients/${clientId}/references`), enabled: open })
  return (
    <CollapsibleShell icon={<Tag className="h-4 w-4 text-accent" />} title="Références" open={open} onToggle={() => setOpen(!open)}
      badge={data ? <Badge variant="secondary" className="text-xs">{data.length}</Badge> : null}>
      {isLoading ? <SectionSpinner /> : !data || data.length === 0 ? <SectionEmpty text="Aucune référence client" /> : (
        <div className="space-y-2">
          {data.map((r) => (
            <div key={r.IDdesignation_client} className="rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3 border-l-amber-400/60">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 bg-amber-400/10"><Tag className="h-3.5 w-3.5 text-amber-600" /></div>
                <p className="text-sm font-medium truncate">{r.client_ref || '—'}</p>
                {r.ref_interne && <Badge variant="outline" className="text-[10px] py-0 flex-shrink-0">{r.ref_interne}</Badge>}
                {!!r.soumettre && <Badge variant="secondary" className="text-[10px] py-0 ml-auto flex-shrink-0">Soumis</Badge>}
              </div>
              {r.coloris.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 ml-9">
                  {r.coloris.map((c) => {
                    const priceable = r.IDref_fini > 0 && c.coloris_id > 0
                    return (
                      <button key={c.IDref_client_colori} type="button" disabled={!priceable}
                        onClick={() => priceable && setTarif({ IDref_fini: r.IDref_fini, colorisId: c.coloris_id, label: `${r.client_ref} · ${c.label}` })}
                        title={priceable ? 'Voir le tarif' : undefined}
                        className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                          priceable ? 'border-accent/30 bg-accent/5 hover:bg-accent/15 text-foreground cursor-pointer' : 'border-border bg-muted text-muted-foreground cursor-default')}>
                        <Palette className="h-2.5 w-2.5" />{c.label || '—'}
                        {priceable && <BadgeEuro className="h-2.5 w-2.5 opacity-60" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <TarifDialog open={tarif !== null} onClose={() => setTarif(null)} IDref_fini={tarif?.IDref_fini ?? 0} colorisId={tarif?.colorisId ?? 0} label={tarif?.label ?? ''} />
    </CollapsibleShell>
  )
}

// ── Tarif dialog (PrixDeVente breakdown — reuses /references-fini/:id/tarif) ──

interface TarifDetailLine { label: string; valueKg: number }
interface TarifTranche {
  rolls: number; isMetrage: boolean; qte_ml: number; poids_ref: number
  moFil: number; detailFil: TarifDetailLine[]
  moTricotage: number; detailTricotage: TarifDetailLine | null
  moTraitements: number; detailTraitement: TarifDetailLine[]
  moTeinte: number; detailTeinture: TarifDetailLine | null
  moRevient: number; rCoeff: number; tauxFraisDePort: number
  moPortAuKg: number; moPortAuMl: number; moPrixDeVenteAuKg: number; moPrixDeVenteAuMl: number
}
interface TarifResult { IDref_fini: number; IDcoloris: number; avec_teinture: number; rendement: number; tranches: TarifTranche[] }

function CostSection({ title, total, children }: { title: string; total?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">{title}</p>
        {total && <p className="text-xs font-semibold tabular-nums">{total}</p>}
      </div>
      {children && <div className="mt-1 space-y-0.5 pl-2 border-l border-border/50">{children}</div>}
    </div>
  )
}
function CostLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
      <span className="min-w-0">{label}</span>
      <span className="tabular-nums flex-shrink-0">{value}</span>
    </div>
  )
}

function TarifDialog({ open, onClose, IDref_fini, colorisId, label }: { open: boolean; onClose: () => void; IDref_fini: number; colorisId: number; label: string }) {
  const [selectedTranche, setSelectedTranche] = useState(0)
  useEffect(() => { if (open) setSelectedTranche(0) }, [open, colorisId])
  const { data, isLoading, isError } = useQuery<TarifResult>({
    queryKey: ['client-tarif', IDref_fini, colorisId],
    queryFn: () => apiFetch(`/references-fini/${IDref_fini}/tarif?coloris=${colorisId}`),
    enabled: open && IDref_fini > 0 && colorisId > 0,
  })
  const tranches = data?.tranches ?? []
  const current = tranches[Math.min(selectedTranche, Math.max(tranches.length - 1, 0))] ?? null
  const eurKg = (v: number) => `${fmtNum(v, 2)} €/Kg`
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BadgeEuro className="h-5 w-5 text-accent" /><span className="truncate">Tarif — {label}</span></DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3 max-h-[70vh] overflow-y-auto pr-1 scrollbar-transparent">
          {isLoading ? <SectionSpinner /> : isError ? <p className="text-sm text-destructive">Erreur lors du calcul du tarif.</p> : tranches.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Tarif indisponible pour cette référence / ce coloris.</p>
          ) : (
            <>
              <div className="rounded-lg border border-border/60 overflow-hidden bg-card shadow-sm">
                <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
                  <colgroup><col style={{ width: '26%' }} /><col style={{ width: '34%' }} /><col style={{ width: '40%' }} /></colgroup>
                  <thead className={thHead}><tr>
                    <th className="px-2 py-1.5 text-left font-semibold">Qté (Rlx)</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Qté (Ml)</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Prix / Ml</th>
                  </tr></thead>
                  <tbody>
                    {tranches.map((t, i) => (
                      <tr key={i} onClick={() => setSelectedTranche(i)}
                        className={cn('border-b border-border/40 last:border-b-0 cursor-pointer transition-colors', selectedTranche === i ? 'bg-accent/10' : 'hover:bg-accent/5')}>
                        <td className="px-2 py-1.5 tabular-nums">{t.isMetrage ? '< 1' : t.rolls}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{t.isMetrage ? '< ' : ''}{fmtNum(t.qte_ml)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtNum(t.moPrixDeVenteAuMl, 2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {current && (
                <div className="p-3 rounded-lg border bg-card shadow-sm space-y-2.5">
                  <CostSection title="Fil" total={eurKg(current.moFil)}>{current.detailFil.map((l, i) => <CostLine key={i} label={l.label} value={eurKg(l.valueKg)} />)}</CostSection>
                  <CostSection title="Tricotage" total={eurKg(current.moTricotage)}>{current.detailTricotage && <CostLine label={current.detailTricotage.label} value={eurKg(current.detailTricotage.valueKg)} />}</CostSection>
                  <CostSection title="Traitement" total={eurKg(current.moTraitements)}>
                    {current.detailTraitement.length > 0 ? current.detailTraitement.map((l, i) => <CostLine key={i} label={l.label} value={eurKg(l.valueKg)} />) : <p className="text-[11px] text-muted-foreground italic">Aucun traitement</p>}
                  </CostSection>
                  {(data?.avec_teinture ?? 0) !== 0 && (
                    <CostSection title="Teinture" total={eurKg(current.moTeinte)}>{current.detailTeinture && <CostLine label={current.detailTeinture.label} value={eurKg(current.detailTeinture.valueKg)} />}</CostSection>
                  )}
                  <CostSection title="Prix de vente">
                    <CostLine label="Prix de revient au Kg" value={eurKg(current.moRevient)} />
                    <CostLine label="Coefficient" value={String(Math.round(current.rCoeff * 100))} />
                    <CostLine label={`Prix de vente au Kg · port ${Math.round(current.tauxFraisDePort * 100)}% inclus`} value={`${fmtNum(current.moPrixDeVenteAuKg, 2)} €/Kg`} />
                    <CostLine label={`Prix de vente au Ml · port ${Math.round(current.tauxFraisDePort * 100)}% inclus`} value={`${fmtNum(current.moPrixDeVenteAuMl, 2)} €/Ml`} />
                  </CostSection>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Historique des commandes ───────────────────────────

interface HistLigne { IDligne: number; IDcommande_client: number; numero: number; date_commande: string | null; type_kind: number; ref: string; coloris: string; quantite: number; unite: number; prix: number }

function HistoriqueSection({ clientId }: { clientId: number }) {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery<{ lignes: HistLigne[]; capped: boolean }>({ queryKey: ['client-historique', clientId], queryFn: () => apiFetch(`/clients/${clientId}/historique`), enabled: open })
  const lignes = data?.lignes ?? []
  return (
    <CollapsibleShell icon={<History className="h-4 w-4 text-accent" />} title="Historique des commandes" open={open} onToggle={() => setOpen(!open)}
      badge={data ? <Badge variant="secondary" className="text-xs">{lignes.length}</Badge> : null}>
      {isLoading ? <SectionSpinner /> : lignes.length === 0 ? <SectionEmpty text="Aucune commande" /> : (
        <>
          <div className="rounded-lg border border-border/60 overflow-x-auto bg-card shadow-sm scrollbar-transparent">
            <table className="w-full text-xs">
              <thead className={thHead}><tr>
                <th className="px-2 py-1.5 text-left font-semibold">Date</th>
                <th className="px-2 py-1.5 text-left font-semibold">N°</th>
                <th className="px-2 py-1.5 text-left font-semibold">Référence</th>
                <th className="px-2 py-1.5 text-left font-semibold">Coloris</th>
                <th className="px-2 py-1.5 text-right font-semibold">Qté</th>
                <th className="px-2 py-1.5 text-right font-semibold">Prix</th>
              </tr></thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.IDligne} className="border-b border-border/40 last:border-b-0 hover:bg-accent/5">
                    <td className="px-2 py-1.5 whitespace-nowrap">{l.date_commande && /\d{8}/.test(l.date_commande) ? formatHfsqlDate(l.date_commande) : '—'}</td>
                    <td className="px-2 py-1.5 tabular-nums">{l.numero || '—'}</td>
                    <td className="px-2 py-1.5 truncate max-w-[160px]" title={l.ref}>{l.ref || '—'}</td>
                    <td className="px-2 py-1.5 truncate max-w-[160px]" title={l.coloris}>{l.coloris || '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtNum(l.quantite)} {UNITE_LABEL[l.unite] ?? ''}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{l.prix ? `${fmtNum(l.prix, 2)} €` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.capped && <p className="text-[11px] text-muted-foreground italic mt-2">120 commandes les plus récentes affichées.</p>}
        </>
      )}
    </CollapsibleShell>
  )
}

// ── Marchandise expédiée ───────────────────────────────

interface MarchLigne { IDexpedition: number; date: string | null; piece: string; lot: string; ref: string; coloris: string; poids: number; metrage: number; second_choix: number }

function MarchandiseSection({ clientId }: { clientId: number }) {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery<{ lignes: MarchLigne[]; capped: boolean }>({ queryKey: ['client-marchandise', clientId], queryFn: () => apiFetch(`/clients/${clientId}/marchandise`), enabled: open })
  const lignes = data?.lignes ?? []
  return (
    <CollapsibleShell icon={<Truck className="h-4 w-4 text-accent" />} title="Marchandise expédiée" open={open} onToggle={() => setOpen(!open)}
      badge={data ? <Badge variant="secondary" className="text-xs">{lignes.length}</Badge> : null}>
      {isLoading ? <SectionSpinner /> : lignes.length === 0 ? <SectionEmpty text="Aucune expédition" /> : (
        <>
          <div className="rounded-lg border border-border/60 overflow-x-auto bg-card shadow-sm scrollbar-transparent">
            <table className="w-full text-xs">
              <thead className={thHead}><tr>
                <th className="px-2 py-1.5 text-left font-semibold">Expédié le</th>
                <th className="px-2 py-1.5 text-left font-semibold">Expé N°</th>
                <th className="px-2 py-1.5 text-left font-semibold">Référence</th>
                <th className="px-2 py-1.5 text-left font-semibold">Coloris</th>
                <th className="px-2 py-1.5 text-left font-semibold">Pièce</th>
                <th className="px-2 py-1.5 text-right font-semibold">Poids</th>
                <th className="px-2 py-1.5 text-right font-semibold">Métrage</th>
              </tr></thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={`${l.IDexpedition}-${l.piece}-${i}`} className="border-b border-border/40 last:border-b-0 hover:bg-accent/5">
                    <td className="px-2 py-1.5 whitespace-nowrap">{l.date && /\d{8}/.test(l.date) ? formatHfsqlDate(l.date) : '—'}</td>
                    <td className="px-2 py-1.5 tabular-nums">{l.IDexpedition}</td>
                    <td className="px-2 py-1.5 truncate max-w-[150px]" title={l.ref}>{l.ref || '—'}</td>
                    <td className="px-2 py-1.5 truncate max-w-[150px]" title={l.coloris}>{l.coloris || '—'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{l.piece || '—'}{!!l.second_choix && <Badge variant="outline" className="ml-1 text-[9px] py-0 px-1">2nd</Badge>}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtNum(l.poids, 2)} kg</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtNum(l.metrage, 1)} m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.capped && <p className="text-[11px] text-muted-foreground italic mt-2">400 pièces les plus récentes affichées.</p>}
        </>
      )}
    </CollapsibleShell>
  )
}
