import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package,
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
  Shield,
  Leaf,
  Recycle,
  Info,
  Phone,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────

interface Fournisseur {
  IDfournisseur: number
  nom: string
  tel: string | null
  fax: string | null
  commentaire: string | null
  est_visible: number
  IDsociete: number | null
}

interface FournisseurDetail extends Fournisseur {
  adresses: Adresse[]
  contacts: Contact[]
  refsFil: RefFil[]
  certificats: Certificat[]
}

interface RefFil {
  IDcolori_fil: number
  colori_reference: string | null
  colori_prix_kg: number | null
  IDref_fil: number
  reference: string | null
  prix_kg: number | null
  titrage: number | null
  nb_fil: number | null
  nb_brin: number | null
  bio: number
  recyclé: number
}

interface Certificat {
  IDcertificat: number
  nom: string | null
  numero_ref: string | null
  debut_validite: string | null
  date_expiration: string | null
  type_doc: string | null
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } })
  if (!res.ok) throw new Error('Erreur API')
  return res.json()
}

function useFournisseurs() {
  return useQuery<Fournisseur[]>({ queryKey: ['fournisseurs'], queryFn: () => apiFetch('/fournisseurs') })
}

function useFournisseurDetail(id: number | null) {
  return useQuery<FournisseurDetail>({ queryKey: ['fournisseur', id], queryFn: () => apiFetch(`/fournisseurs/${id}`), enabled: id !== null })
}

// ── Shared styling ─────────────────────────────────────

const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring'
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

// ── Main Page ──────────────────────────────────────────

export function Fournisseurs() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editNom, setEditNom] = useState('')
  const [editCommentaire, setEditCommentaire] = useState('')

  const { data: fournisseurs, isLoading, isError, error } = useFournisseurs()
  const { data: detail, isLoading: detailLoading } = useFournisseurDetail(selectedId)

  useEffect(() => {
    if (fournisseurs && fournisseurs.length > 0 && selectedId === null) setSelectedId(fournisseurs[0].IDfournisseur)
  }, [fournisseurs, selectedId])

  const startEdit = useCallback(() => {
    if (detail) { setEditNom(detail.nom); setEditCommentaire(detail.commentaire ?? ''); setIsEditing(true) }
  }, [detail])

  const cancelEdit = useCallback(() => setIsEditing(false), [])

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['fournisseurs'] })
    queryClient.invalidateQueries({ queryKey: ['fournisseur', selectedId] })
  }, [queryClient, selectedId])

  const saveMutation = useMutation({
    mutationFn: () => apiFetch(`/fournisseurs/${selectedId}`, { method: 'PUT', body: JSON.stringify({ nom: editNom, commentaire: editCommentaire }) }),
    onSuccess: () => { invalidateAll(); setIsEditing(false) },
  })

  const createMutation = useMutation({
    mutationFn: () => apiFetch('/fournisseurs', { method: 'POST', body: JSON.stringify({ nom: 'Nouveau fournisseur' }) }),
    onSuccess: (data: Fournisseur) => {
      queryClient.invalidateQueries({ queryKey: ['fournisseurs'] })
      setSelectedId(data.IDfournisseur); setEditNom(data.nom); setEditCommentaire(''); setIsEditing(true)
    },
  })

  const handleSelect = useCallback((id: number) => { if (isEditing) setIsEditing(false); setSelectedId(id) }, [isEditing])

  const filtered = useMemo(() => {
    if (!fournisseurs) return []
    if (!searchQuery.trim()) return fournisseurs
    const q = searchQuery.toLowerCase()
    return fournisseurs.filter((f) => f.nom.toLowerCase().includes(q))
  }, [fournisseurs, searchQuery])

  return (
    <MasterDetailLayout
      list={<FournisseurList fournisseurs={filtered} isLoading={isLoading} isError={isError} error={error as Error | null}
        selectedId={selectedId} onSelect={handleSelect} searchQuery={searchQuery} onSearchChange={setSearchQuery}
        onNew={() => createMutation.mutate()} isCreating={createMutation.isPending} isEditing={isEditing} />}
      detailHeader={<DetailHeader fournisseur={detail ?? null} isLoading={detailLoading && selectedId !== null}
        isEditing={isEditing} editNom={editNom} onEditNomChange={setEditNom}
        onStartEdit={startEdit} onCancelEdit={cancelEdit} onSave={() => saveMutation.mutate()} isSaving={saveMutation.isPending} />}
      detail={<DetailMain fournisseur={detail ?? null} isLoading={detailLoading && selectedId !== null}
        hasSelection={selectedId !== null} />}
      sidebar={selectedId !== null ? <DetailSidebar fournisseur={detail ?? null} isLoading={detailLoading}
        isEditing={isEditing} fournisseurId={selectedId} onMutationSuccess={invalidateAll}
        editCommentaire={editCommentaire} onEditCommentaireChange={setEditCommentaire} /> : null}
      sidebarTitle="Informations" hasSelection={selectedId !== null}
      onBack={() => { setIsEditing(false); setSelectedId(null) }}
    />
  )
}

// ── Left Panel: List ───────────────────────────────────

function FournisseurList({ fournisseurs, isLoading, isError, error, selectedId, onSelect, searchQuery, onSearchChange, onNew, isCreating, isEditing }: {
  fournisseurs: Fournisseur[]; isLoading: boolean; isError: boolean; error: Error | null
  selectedId: number | null; onSelect: (id: number) => void; searchQuery: string; onSearchChange: (q: string) => void
  onNew: () => void; isCreating: boolean; isEditing: boolean
}) {
  return (
    <div className="flex flex-col h-full bg-card rounded-lg border shadow-sm">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Rechercher..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off" className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {isLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
        : isError ? <div className="flex flex-col items-center justify-center py-8 text-destructive"><AlertCircle className="h-6 w-6 mb-2" /><p className="text-sm">{error?.message || 'Erreur'}</p></div>
        : fournisseurs.length === 0 ? <div className="flex flex-col items-center justify-center py-8 text-muted-foreground"><Package className="h-12 w-12 mb-3 opacity-50" /><p className="text-sm">Aucun fournisseur</p></div>
        : fournisseurs.map((f) => (
          <div key={f.IDfournisseur} onClick={() => onSelect(f.IDfournisseur)}
            className={cn('p-3 border rounded-lg cursor-pointer transition-all',
              selectedId === f.IDfournisseur ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border hover:border-accent/50 hover:bg-muted/30')}>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <p className="font-medium text-sm truncate">{f.nom}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between">
        <span>{fournisseurs.length} fournisseur{fournisseurs.length !== 1 ? 's' : ''}</span>
        {isEditing && (
          <Button size="sm" variant="ghost" onClick={onNew} disabled={isCreating} className="text-accent hover:text-accent hover:bg-accent/10">
            <Plus className="h-3.5 w-3.5 mr-1" />Nouveau
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Center: Detail Header ──────────────────────────────

function DetailHeader({ fournisseur, isLoading, isEditing, editNom, onEditNomChange, onStartEdit, onCancelEdit, onSave, isSaving }: {
  fournisseur: FournisseurDetail | null; isLoading: boolean; isEditing: boolean
  editNom: string; onEditNomChange: (v: string) => void
  onStartEdit: () => void; onCancelEdit: () => void; onSave: () => void; isSaving: boolean
}) {
  if (!fournisseur && !isLoading) return null
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center', isEditing ? 'bg-accent/15' : 'icon-box-gold')}>
          <Package className="h-5 w-5" />
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
            <h1 className="text-2xl font-heading font-bold tracking-tight truncate">{fournisseur?.nom}</h1>
          )}
        </div>
        {!isLoading && fournisseur && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={onCancelEdit}><X className="h-3.5 w-3.5 mr-1.5" />Annuler</Button>
                <Button size="sm" onClick={onSave} disabled={isSaving}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />{isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={onStartEdit}><Pencil className="h-3.5 w-3.5 mr-1.5" />Modifier</Button>
            )}
          </div>
        )}
      </div>
      <div className={cn('h-1 w-24 mt-3 rounded-full', isEditing ? 'bg-accent' : 'bg-gradient-to-r from-accent via-accent to-accent/30')} />
    </div>
  )
}

// ── Center: Detail Main ────────────────────────────────

function formatHfsqlDate(raw: string): string {
  if (raw.length === 8) return new Date(`${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`).toLocaleDateString('fr-FR')
  return new Date(raw).toLocaleDateString('fr-FR')
}

function isCertExpired(dateExp: string | null): boolean {
  if (!dateExp) return false
  const d = dateExp.length === 8 ? `${dateExp.substring(0, 4)}-${dateExp.substring(4, 6)}-${dateExp.substring(6, 8)}` : dateExp
  return new Date(d) < new Date()
}

function DetailMain({ fournisseur, isLoading, hasSelection }: {
  fournisseur: FournisseurDetail | null; isLoading: boolean; hasSelection: boolean
}) {
  if (!hasSelection) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="icon-box-gold h-16 w-16 mx-auto"><Package className="h-8 w-8" /></div>
        <p className="text-muted-foreground text-sm">Selectionnez un fournisseur dans la liste</p>
      </div>
    </div>
  )
  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
  if (!fournisseur) return null

  const [certifsOpen, setCertifsOpen] = useState(true)
  const [refsOpen, setRefsOpen] = useState(true)

  // Group yarn refs by base reference
  const refsGrouped = useMemo(() => {
    const map = new Map<number, { reference: string; titrage: number | null; nb_fil: number | null; nb_brin: number | null; bio: boolean; recycle: boolean; coloris: { colori_reference: string; colori_prix_kg: number | null }[] }>()
    for (const r of fournisseur.refsFil) {
      if (!map.has(r.IDref_fil)) {
        map.set(r.IDref_fil, {
          reference: r.reference ?? '—',
          titrage: r.titrage,
          nb_fil: r.nb_fil,
          nb_brin: r.nb_brin,
          bio: !!r.bio,
          recycle: !!r['recyclé'],
          coloris: [],
        })
      }
      map.get(r.IDref_fil)!.coloris.push({ colori_reference: r.colori_reference ?? '—', colori_prix_kg: r.colori_prix_kg })
    }
    return Array.from(map.values())
  }, [fournisseur.refsFil])

  return (
    <div className="flex-1 min-h-0 overflow-auto space-y-4">
      {/* Certificats */}
      <Card className="card-premium">
        <CardHeader className="flex flex-row items-center gap-2 pb-2 cursor-pointer select-none" onClick={() => setCertifsOpen(!certifsOpen)}>
          <Shield className="h-4 w-4 text-accent" />
          <CardTitle className="text-sm font-semibold">Certificats</CardTitle>
          <Badge variant="secondary" className="text-xs ml-auto">{fournisseur.certificats.length}</Badge>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', certifsOpen && 'rotate-180')} />
        </CardHeader>
        {certifsOpen && <CardContent className="space-y-2">
          {fournisseur.certificats.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucun certificat</p>
          ) : fournisseur.certificats.map((c) => {
            const expired = isCertExpired(c.date_expiration)
            return (
              <div key={c.IDcertificat} className="rounded-lg p-3 border border-border/60 bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{c.nom || '—'}</span>
                  </div>
                  {expired ? (
                    <Badge variant="destructive" className="text-[10px] py-0">Expire</Badge>
                  ) : (
                    <Badge className="badge-success text-[10px] py-0">Valide</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {c.numero_ref && <p>Ref: {c.numero_ref}</p>}
                  {c.type_doc && <p>Type: {c.type_doc}</p>}
                  <div className="flex gap-3">
                    {c.debut_validite && <span>Du {formatHfsqlDate(c.debut_validite)}</span>}
                    {c.date_expiration && <span>au {formatHfsqlDate(c.date_expiration)}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>}
      </Card>

      {/* References de fil */}
      <Card className="card-premium">
        <CardHeader className="flex flex-row items-center gap-2 pb-2 cursor-pointer select-none" onClick={() => setRefsOpen(!refsOpen)}>
          <Package className="h-4 w-4 text-accent" />
          <CardTitle className="text-sm font-semibold">References de fil</CardTitle>
          <Badge variant="secondary" className="text-xs ml-auto">{refsGrouped.length}</Badge>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', refsOpen && 'rotate-180')} />
        </CardHeader>
        {refsOpen && <CardContent className="space-y-2">
          {refsGrouped.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucune reference</p>
          ) : refsGrouped.map((ref, i) => (
            <div key={i} className="rounded-lg p-3 border border-border/60 bg-muted/50">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{ref.reference}</span>
                <div className="flex gap-1">
                  {ref.bio && <Badge className="bg-green-500/10 text-green-700 text-[10px] py-0 gap-0.5"><Leaf className="h-2.5 w-2.5" />Bio</Badge>}
                  {ref.recycle && <Badge className="bg-blue-500/10 text-blue-700 text-[10px] py-0 gap-0.5"><Recycle className="h-2.5 w-2.5" />Recycle</Badge>}
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                {ref.titrage != null && <span>Titrage: {ref.titrage}</span>}
                {ref.nb_fil != null && ref.nb_fil > 0 && <span>{ref.nb_fil} fil{ref.nb_fil > 1 ? 's' : ''}</span>}
                {ref.nb_brin != null && ref.nb_brin > 0 && <span>{ref.nb_brin} brin{ref.nb_brin > 1 ? 's' : ''}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {ref.coloris.map((col, j) => (
                  <Badge key={j} variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                    {col.colori_reference}{col.colori_prix_kg != null && col.colori_prix_kg > 0 ? ` (${Number(col.colori_prix_kg).toFixed(2)} €/kg)` : ''}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>}
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

function DetailSidebar({ fournisseur, isLoading, isEditing, fournisseurId, onMutationSuccess, editCommentaire, onEditCommentaireChange }: {
  fournisseur: FournisseurDetail | null; isLoading: boolean; isEditing: boolean; fournisseurId: number; onMutationSuccess: () => void
  editCommentaire: string; onEditCommentaireChange: (v: string) => void
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('info')
  if (isLoading) return (
    <div className="w-96 flex-shrink-0 bg-muted/30 rounded-xl border p-4 space-y-4">
      <div className="flex gap-2"><div className="h-8 flex-1 bg-muted animate-pulse rounded-md" /><div className="h-8 flex-1 bg-muted animate-pulse rounded-md" /><div className="h-8 flex-1 bg-muted animate-pulse rounded-md" /></div>
      {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
    </div>
  )
  if (!fournisseur) return null

  const tabs: { key: SidebarTab; label: string; icon: React.ElementType }[] = [
    { key: 'info', label: 'Info', icon: Info },
    { key: 'contacts', label: 'Contacts', icon: User },
    { key: 'adresses', label: 'Adresses', icon: MapPin },
  ]

  return (
    <div className="w-96 flex-shrink-0 bg-muted/30 rounded-xl border flex flex-col overflow-hidden">
      <div className="flex border-b p-1 gap-1">
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
        {activeTab === 'info' && <InfoTab fournisseur={fournisseur} isEditing={isEditing} editCommentaire={editCommentaire} onEditCommentaireChange={onEditCommentaireChange} />}
        {activeTab === 'contacts' && <ContactsTab contacts={fournisseur.contacts} isEditing={isEditing} fournisseurId={fournisseurId} onMutationSuccess={onMutationSuccess} />}
        {activeTab === 'adresses' && <AdressesTab adresses={fournisseur.adresses} isEditing={isEditing} fournisseurId={fournisseurId} onMutationSuccess={onMutationSuccess} />}
      </div>
    </div>
  )
}

// ── Sidebar Tab: Info ─────────────────────────────────

function InfoTab({ fournisseur, isEditing, editCommentaire, onEditCommentaireChange }: {
  fournisseur: FournisseurDetail; isEditing: boolean; editCommentaire: string; onEditCommentaireChange: (v: string) => void
}) {
  return (
    <div className="space-y-3">
      {/* Commentaire */}
      <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Commentaire</p>
        {isEditing ? (
          <textarea value={editCommentaire} onChange={(e) => onEditCommentaireChange(e.target.value)} rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
        ) : fournisseur.commentaire ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{fournisseur.commentaire}</p>
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

function ContactsTab({ contacts, isEditing, fournisseurId, onMutationSuccess }: {
  contacts: Contact[]; isEditing: boolean; fournisseurId: number; onMutationSuccess: () => void
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ nom: '', prenom: '', tel: '', mail: '', envoi_bl: false, envoi_facture: false, envoi_commande: false, envoi_soumission: false })
  const [showForm, setShowForm] = useState(false)

  const createMut = useMutation({
    mutationFn: () => apiFetch(`/fournisseurs/${fournisseurId}/contacts`, { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => { onMutationSuccess(); resetForm() },
  })
  const updateMut = useMutation({
    mutationFn: (cid: number) => apiFetch(`/fournisseurs/${fournisseurId}/contacts/${cid}`, { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => { onMutationSuccess(); setEditingId(null) },
  })
  const deleteMut = useMutation({
    mutationFn: (cid: number) => apiFetch(`/fournisseurs/${fournisseurId}/contacts/${cid}`, { method: 'DELETE' }),
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
                {/* Envoi flags */}
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

function AdressesTab({ adresses, isEditing, fournisseurId, onMutationSuccess }: {
  adresses: Adresse[]; isEditing: boolean; fournisseurId: number; onMutationSuccess: () => void
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ nom: '', adresse1: '', adresse2: '', adresse3: '', cp: '', ville: '', pays: '', commentaire: '', est_defaut_facturation: false, est_defaut_livraison: false })
  const [showForm, setShowForm] = useState(false)

  const createMut = useMutation({
    mutationFn: () => apiFetch(`/fournisseurs/${fournisseurId}/adresses`, { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => { onMutationSuccess(); resetForm() },
  })
  const updateMut = useMutation({
    mutationFn: (aid: number) => apiFetch(`/fournisseurs/${fournisseurId}/adresses/${aid}`, { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => { onMutationSuccess(); setEditingId(null) },
  })
  const deleteMut = useMutation({
    mutationFn: (aid: number) => apiFetch(`/fournisseurs/${fournisseurId}/adresses/${aid}`, { method: 'DELETE' }),
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
                {/* Address type badges */}
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
