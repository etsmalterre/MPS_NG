import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BadgeEuro, Droplet, Sparkles, Layers, Plus, Pencil, Trash2, X, Search,
  Loader2, AlertCircle, Check, Copy, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { PopoverSelect } from '@/components/ui/popover-select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { fmtNum } from '@/lib/format'

// ── Types (mirror GET /sous-traitants/:id/tarifs-ennoblissement) ───────
interface TarifBand { id: number; quantite_mini: number; quantite_maxi: number; prix: number }
interface DyeSubject { IDteinture: number; designation: string; bands: TarifBand[] }
interface TrtSubject { IDtraitement: number; designation: string; ordre: number; bands: TarifBand[] }
interface ComboTrt { IDtraitement: number; designation: string }
interface ComboSubject {
  key: string; IDteinture: number; teinture_nom: string | null
  liste: string; traitements: ComboTrt[]; bands: TarifBand[]
}
interface TariffsPayload { teintures: DyeSubject[]; traitements: TrtSubject[]; combinaisons: ComboSubject[] }

// Discriminated selection of which subject's bands are shown on the right.
type Selected =
  | { kind: 'dye'; IDteinture: number }
  | { kind: 'treatment'; IDtraitement: number }
  | { kind: 'combination'; key: string }

// "And above" sentinel — legacy stores 999999 as the open upper bound.
const QTY_MAX = 999999

const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'

/** Parse a number from a user string accepting comma or dot. NaN → null. */
function parseNum(s: string): number | null {
  const v = parseFloat((s ?? '').toString().replace(',', '.').trim())
  return Number.isFinite(v) ? v : null
}

// ── Hooks ──────────────────────────────────────────────
function useTariffs(id: number, enabled: boolean) {
  return useQuery<TariffsPayload>({
    queryKey: ['sous-traitant-tariffs', id],
    queryFn: () => apiFetch(`/sous-traitants/${id}/tarifs-ennoblissement`),
    enabled: enabled && id > 0,
  })
}

// Minimal shape from /sous-traitants used by the copy-source picker.
interface SstLite { IDsous_traitant: number; nom: string; IDtype_sst: number | null }
function useEnnoblisseurs() {
  return useQuery<SstLite[]>({ queryKey: ['sous-traitants'], queryFn: () => apiFetch('/sous-traitants') })
}

// ── Main section ───────────────────────────────────────
export function TariffsSection({ sousTraitantId, className }: { sousTraitantId: number; className?: string }) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useTariffs(sousTraitantId, true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Selected | null>(null)

  // Band add/edit form state. editingId === 'new' means the add-a-band form.
  const [bandForm, setBandForm] = useState<null | { mode: 'new' | number; mini: string; maxi: string; prix: string; aboveOnly: boolean }>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const [comboDialog, setComboDialog] = useState<null | { mode: 'new' | 'edit'; combo?: ComboSubject }>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [deleteBand, setDeleteBand] = useState<TarifBand | null>(null)
  const [deleteCombo, setDeleteCombo] = useState<ComboSubject | null>(null)

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sous-traitant-tariffs', sousTraitantId] })
  }, [queryClient, sousTraitantId])

  // Default selection → first dye once data arrives.
  useEffect(() => {
    if (!selected && data && data.teintures.length > 0) {
      setSelected({ kind: 'dye', IDteinture: data.teintures[0].IDteinture })
    }
  }, [data, selected])

  // Resolve the currently-selected subject + its bands + a human label.
  const current = useMemo(() => {
    if (!data || !selected) return null
    if (selected.kind === 'dye') {
      const s = data.teintures.find((t) => t.IDteinture === selected.IDteinture)
      return s ? { label: s.designation, icon: 'dye' as const, bands: s.bands, combo: null } : null
    }
    if (selected.kind === 'treatment') {
      const s = data.traitements.find((t) => t.IDtraitement === selected.IDtraitement)
      return s ? { label: s.designation, icon: 'treatment' as const, bands: s.bands, combo: null } : null
    }
    const s = data.combinaisons.find((c) => c.key === selected.key)
    if (!s) return null
    const label = [s.teinture_nom, s.traitements.map((t) => t.designation).join(' + ')].filter(Boolean).join(' · ')
    return { label, icon: 'combination' as const, bands: s.bands, combo: s }
  }, [data, selected])

  const totalBands = useMemo(() => {
    if (!data) return 0
    return data.teintures.reduce((n, t) => n + t.bands.length, 0)
      + data.traitements.reduce((n, t) => n + t.bands.length, 0)
      + data.combinaisons.reduce((n, c) => n + c.bands.length, 0)
  }, [data])

  // ── Mutations ───────────────────────────────────────
  const saveBandMut = useMutation({
    mutationFn: async (payload: { trancheId?: number; body: any }) => {
      if (payload.trancheId) {
        return apiFetch(`/sous-traitants/${sousTraitantId}/tarifs-ennoblissement/${payload.trancheId}`, { method: 'PUT', body: JSON.stringify(payload.body) })
      }
      return apiFetch(`/sous-traitants/${sousTraitantId}/tarifs-ennoblissement`, { method: 'POST', body: JSON.stringify(payload.body) })
    },
    onSuccess: () => { invalidate(); setBandForm(null); setFormError(null) },
    onError: (e: Error) => setFormError(e.message || 'Erreur'),
  })

  const deleteBandMut = useMutation({
    mutationFn: (trancheId: number) => apiFetch(`/sous-traitants/${sousTraitantId}/tarifs-ennoblissement/${trancheId}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); setDeleteBand(null) },
  })

  // Deleting a combination = delete all its bands (no dedicated endpoint needed).
  const deleteComboMut = useMutation({
    mutationFn: async (combo: ComboSubject) => {
      for (const b of combo.bands) {
        await apiFetch(`/sous-traitants/${sousTraitantId}/tarifs-ennoblissement/${b.id}`, { method: 'DELETE' })
      }
    },
    onSuccess: () => { invalidate(); setDeleteCombo(null); setSelected(null) },
  })

  // ── Band form helpers ───────────────────────────────
  const openAddBand = useCallback(() => {
    if (!current) return
    const finiteMax = current.bands.map((b) => b.quantite_maxi).filter((m) => m < QTY_MAX)
    const suggestedMin = finiteMax.length > 0 ? Math.max(...finiteMax) + 1 : 0
    setFormError(null)
    setBandForm({ mode: 'new', mini: String(suggestedMin), maxi: '', prix: '', aboveOnly: false })
  }, [current])

  const openEditBand = useCallback((b: TarifBand) => {
    setFormError(null)
    setBandForm({
      mode: b.id,
      mini: String(b.quantite_mini),
      maxi: b.quantite_maxi >= QTY_MAX ? '' : String(b.quantite_maxi),
      prix: String(b.prix).replace('.', ','),
      aboveOnly: b.quantite_maxi >= QTY_MAX,
    })
  }, [])

  const submitBand = useCallback(() => {
    if (!bandForm || !selected) return
    const mini = parseNum(bandForm.mini)
    const maxi = bandForm.aboveOnly ? QTY_MAX : parseNum(bandForm.maxi)
    const prix = parseNum(bandForm.prix)
    if (mini === null || mini < 0) { setFormError('Quantité minimum invalide'); return }
    if (maxi === null || maxi < mini) { setFormError('La quantité maximum doit être ≥ la quantité minimum'); return }
    if (prix === null || prix < 0) { setFormError('Prix invalide'); return }

    if (bandForm.mode !== 'new') {
      saveBandMut.mutate({ trancheId: bandForm.mode, body: { quantite_mini: mini, quantite_maxi: maxi, prix } })
      return
    }
    // New band — build the create body from the selected subject's discriminator.
    let body: any
    if (selected.kind === 'dye') body = { kind: 'dye', IDteinture: selected.IDteinture, quantite_mini: mini, quantite_maxi: maxi, prix }
    else if (selected.kind === 'treatment') body = { kind: 'treatment', IDtraitement: selected.IDtraitement, quantite_mini: mini, quantite_maxi: maxi, prix }
    else {
      const combo = current?.combo
      if (!combo) return
      body = { kind: 'combination', IDteinture: combo.IDteinture, liste: combo.traitements.map((t) => t.IDtraitement), quantite_mini: mini, quantite_maxi: maxi, prix }
    }
    saveBandMut.mutate({ body })
  }, [bandForm, selected, current, saveBandMut])

  return (
    <Card className={cn('card-premium flex flex-col min-h-0 overflow-hidden', className)}>
      <CardHeader className="flex-shrink-0 flex flex-row items-center gap-2 pb-2">
        <BadgeEuro className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Tarifs d'ennoblissement</CardTitle>
        <Badge variant="secondary" className="text-xs ml-auto">{totalBands} tranche{totalBands !== 1 ? 's' : ''}</Badge>
        <Button variant="ghost" size="sm" className="h-7 text-accent hover:text-accent hover:bg-accent/10" onClick={() => setCopyOpen(true)}>
          <Copy className="h-3.5 w-3.5 mr-1" />Copier
        </Button>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex flex-col gap-2 pb-3">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
        ) : isError ? (
          <div className="flex-1 flex flex-col items-center justify-center text-destructive"><AlertCircle className="h-6 w-6 mb-2" /><p className="text-sm">{(error as Error)?.message || 'Erreur'}</p></div>
        ) : !data ? null : (
          <div className="flex-1 min-h-0 flex gap-3">
            {/* Left — subjects */}
            <div className="w-56 flex-shrink-0 flex flex-col rounded-lg border border-border/60 bg-zinc-100/80 overflow-hidden">
              <div className="flex-shrink-0 p-2 border-b border-border/60 bg-zinc-200/50">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off"
                    placeholder="Rechercher…" className="h-8 w-full pl-8 pr-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto scrollbar-transparent p-2 space-y-3">
                <SubjectGroup icon={<Droplet className="h-3 w-3" />} label="Teintures">
                  {data.teintures
                    .filter((t) => t.designation.toLowerCase().includes(search.trim().toLowerCase()))
                    .map((t) => (
                      <SubjectRow key={`dye-${t.IDteinture}`} label={t.designation} count={t.bands.length}
                        active={selected?.kind === 'dye' && selected.IDteinture === t.IDteinture}
                        onClick={() => { setBandForm(null); setSelected({ kind: 'dye', IDteinture: t.IDteinture }) }} />
                    ))}
                </SubjectGroup>
                <SubjectGroup icon={<Sparkles className="h-3 w-3" />} label="Traitements">
                  {data.traitements
                    .filter((t) => t.designation.toLowerCase().includes(search.trim().toLowerCase()))
                    .map((t) => (
                      <SubjectRow key={`trt-${t.IDtraitement}`} label={t.designation} count={t.bands.length}
                        active={selected?.kind === 'treatment' && selected.IDtraitement === t.IDtraitement}
                        onClick={() => { setBandForm(null); setSelected({ kind: 'treatment', IDtraitement: t.IDtraitement }) }} />
                    ))}
                </SubjectGroup>
                <SubjectGroup
                  icon={<Layers className="h-3 w-3" />} label="Combinaisons"
                  action={<button type="button" onClick={() => setComboDialog({ mode: 'new' })}
                    className="text-accent hover:bg-accent/10 rounded p-0.5" title="Nouvelle combinaison"><Plus className="h-3.5 w-3.5" /></button>}>
                  {data.combinaisons.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic px-1 py-0.5">Aucune combinaison</p>
                  ) : data.combinaisons.map((c) => {
                    const label = [c.teinture_nom, c.traitements.map((t) => t.designation).join(' + ')].filter(Boolean).join(' · ')
                    if (!label.toLowerCase().includes(search.trim().toLowerCase())) return null
                    return (
                      <SubjectRow key={c.key} label={label} count={c.bands.length}
                        active={selected?.kind === 'combination' && selected.key === c.key}
                        onClick={() => { setBandForm(null); setSelected({ kind: 'combination', key: c.key }) }} />
                    )
                  })}
                </SubjectGroup>
              </div>
            </div>

            {/* Right — bands of the selected subject */}
            <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border/60 bg-white overflow-hidden">
              {!current ? (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Sélectionnez un élément</div>
              ) : (
                <>
                  <div className="flex-shrink-0 px-3 py-2 border-b border-border/60 bg-zinc-200/50 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" title={current.label}>{current.label || '—'}</p>
                      <p className="text-[10px] text-muted-foreground">Prix par tranche de quantité (€/Kg)</p>
                    </div>
                    {current.icon === 'combination' && current.combo && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Modifier la combinaison"
                          onClick={() => setComboDialog({ mode: 'edit', combo: current.combo! })}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Supprimer la combinaison"
                          onClick={() => setDeleteCombo(current.combo)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                  </div>

                  <div className="flex-1 min-h-0 overflow-auto scrollbar-transparent">
                    <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                      <colgroup><col style={{ width: '30%' }} /><col style={{ width: '30%' }} /><col style={{ width: '25%' }} /><col style={{ width: '15%' }} /></colgroup>
                      <thead className="bg-zinc-100/80 border-b border-border/60 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr><th className="px-2.5 py-1.5 text-left font-semibold">Qté min</th><th className="px-2.5 py-1.5 text-left font-semibold">Qté max</th><th className="px-2.5 py-1.5 text-right font-semibold">Prix €/Kg</th><th className="px-2.5 py-1.5"></th></tr>
                      </thead>
                      <tbody>
                        {[...current.bands].sort((a, b) => a.quantite_mini - b.quantite_mini).map((b) => (
                          bandForm && bandForm.mode === b.id ? (
                            <BandFormRow key={b.id} form={bandForm} setForm={setBandForm} onSubmit={submitBand}
                              onCancel={() => { setBandForm(null); setFormError(null) }} isSaving={saveBandMut.isPending} error={formError} />
                          ) : (
                            <tr key={b.id} className="group border-b border-border/40 hover:bg-accent/5">
                              <td className="px-2.5 py-1.5 tabular-nums">{fmtNum(b.quantite_mini)} kg</td>
                              <td className="px-2.5 py-1.5 tabular-nums">{b.quantite_maxi >= QTY_MAX ? <span className="text-muted-foreground">et au-delà</span> : `${fmtNum(b.quantite_maxi)} kg`}</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums font-medium">{fmtNum(b.prix, 2)}</td>
                              <td className="px-2.5 py-1.5">
                                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditBand(b)}><Pencil className="h-3 w-3" /></Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeleteBand(b)}><Trash2 className="h-3 w-3" /></Button>
                                </div>
                              </td>
                            </tr>
                          )
                        ))}
                        {bandForm && bandForm.mode === 'new' && (
                          <BandFormRow form={bandForm} setForm={setBandForm} onSubmit={submitBand}
                            onCancel={() => { setBandForm(null); setFormError(null) }} isSaving={saveBandMut.isPending} error={formError} />
                        )}
                        {current.bands.length === 0 && !bandForm && (
                          <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">Aucune tranche définie</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex-shrink-0 border-t border-border/60 bg-zinc-200/50 px-3 py-1.5">
                    {!bandForm && (
                      <Button variant="ghost" size="sm" className="h-7 text-accent hover:text-accent hover:bg-accent/10" onClick={openAddBand}>
                        <Plus className="h-3.5 w-3.5 mr-1" />Ajouter une tranche
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>

      {comboDialog && data && (
        <CombinationDialog
          open={!!comboDialog}
          mode={comboDialog.mode}
          combo={comboDialog.combo}
          teintures={data.teintures}
          traitements={data.traitements}
          sousTraitantId={sousTraitantId}
          onClose={() => setComboDialog(null)}
          onSaved={(sel) => { invalidate(); setComboDialog(null); if (sel) setSelected(sel) }}
        />
      )}

      {copyOpen && (
        <CopyTariffsDialog
          open={copyOpen}
          sousTraitantId={sousTraitantId}
          hasExisting={totalBands > 0}
          onClose={() => setCopyOpen(false)}
          onSaved={() => { invalidate(); setCopyOpen(false); setSelected(null) }}
        />
      )}

      <ConfirmDialog
        open={deleteBand !== null}
        title="Supprimer la tranche"
        description={deleteBand ? `La tranche ${fmtNum(deleteBand.quantite_mini)}–${deleteBand.quantite_maxi >= QTY_MAX ? '∞' : fmtNum(deleteBand.quantite_maxi)} kg (${fmtNum(deleteBand.prix, 2)} €/Kg) sera supprimée.` : undefined}
        isPending={deleteBandMut.isPending}
        onCancel={() => setDeleteBand(null)}
        onConfirm={() => { if (deleteBand) deleteBandMut.mutate(deleteBand.id) }}
      />

      <ConfirmDialog
        open={deleteCombo !== null}
        title="Supprimer la combinaison"
        description={deleteCombo ? `La combinaison et ses ${deleteCombo.bands.length} tranche(s) seront supprimées.` : undefined}
        isPending={deleteComboMut.isPending}
        onCancel={() => setDeleteCombo(null)}
        onConfirm={() => { if (deleteCombo) deleteComboMut.mutate(deleteCombo) }}
      />
    </Card>
  )
}

// ── Subject list primitives ────────────────────────────
function SubjectGroup({ icon, label, action, children }: { icon: React.ReactNode; label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-1 mb-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {icon}<span>{label}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function SubjectRow({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-left text-xs transition-colors',
        active ? 'bg-accent/10 text-accent font-medium' : 'hover:bg-accent/5')}>
      <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
      <span className={cn('flex-shrink-0 tabular-nums text-[10px] px-1.5 rounded-full',
        count > 0 ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground')}>{count}</span>
    </button>
  )
}

// ── Inline band add/edit form row ──────────────────────
function BandFormRow({ form, setForm, onSubmit, onCancel, isSaving, error }: {
  form: { mode: 'new' | number; mini: string; maxi: string; prix: string; aboveOnly: boolean }
  setForm: React.Dispatch<React.SetStateAction<any>>
  onSubmit: () => void; onCancel: () => void; isSaving: boolean; error: string | null
}) {
  const set = (patch: Partial<typeof form>) => setForm((f: any) => ({ ...f, ...patch }))
  return (
    <tr className="border-b border-accent/30 bg-accent/[0.04]">
      <td className="px-2 py-1.5">
        <input autoFocus value={form.mini} onChange={(e) => set({ mini: e.target.value })} inputMode="numeric"
          placeholder="0" className={cn(inputClass, 'h-7 text-right')} />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <input value={form.aboveOnly ? '' : form.maxi} onChange={(e) => set({ maxi: e.target.value })} inputMode="numeric"
            disabled={form.aboveOnly} placeholder={form.aboveOnly ? 'au-delà' : 'max'} className={cn(inputClass, 'h-7 text-right', form.aboveOnly && 'opacity-50')} />
          <button type="button" onClick={() => set({ aboveOnly: !form.aboveOnly })} title="Et au-delà"
            className={cn('flex-shrink-0 text-[10px] px-1.5 h-7 rounded-md border transition-colors',
              form.aboveOnly ? 'bg-accent text-accent-foreground border-accent' : 'border-input text-muted-foreground hover:bg-accent/10')}>∞</button>
        </div>
      </td>
      <td className="px-2 py-1.5">
        <input value={form.prix} onChange={(e) => set({ prix: e.target.value })} inputMode="decimal"
          placeholder="0,00" className={cn(inputClass, 'h-7 text-right')} />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center justify-end gap-0.5">
          {error && <span className="text-[10px] text-destructive mr-1 truncate" title={error}>!</span>}
          <Button variant="ghost" size="icon" className="h-6 w-6 text-accent hover:text-accent" onClick={onSubmit} disabled={isSaving} title="Enregistrer">
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel} disabled={isSaving} title="Annuler"><X className="h-3 w-3" /></Button>
        </div>
      </td>
    </tr>
  )
}

// ── New / edit combination dialog ──────────────────────
function CombinationDialog({ open, mode, combo, teintures, traitements, sousTraitantId, onClose, onSaved }: {
  open: boolean; mode: 'new' | 'edit'; combo?: ComboSubject
  teintures: DyeSubject[]; traitements: TrtSubject[]; sousTraitantId: number
  onClose: () => void; onSaved: (sel: Selected | null) => void
}) {
  const [dye, setDye] = useState<number>(combo?.IDteinture ?? 0)
  const [picked, setPicked] = useState<Set<number>>(new Set(combo?.traitements.map((t) => t.IDtraitement) ?? []))
  const [mini, setMini] = useState('0')
  const [maxi, setMaxi] = useState('')
  const [aboveOnly, setAboveOnly] = useState(true)
  const [prix, setPrix] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const dyeOptions = useMemo(() => [
    { id: 0, primary: 'Sans teinture' },
    ...teintures.map((t) => ({ id: t.IDteinture, primary: t.designation })),
  ], [teintures])

  const mut = useMutation({
    mutationFn: async () => {
      const liste = Array.from(picked)
      if (mode === 'edit' && combo) {
        return apiFetch(`/sous-traitants/${sousTraitantId}/tarifs-ennoblissement/combinaison/rescope`, {
          method: 'PUT',
          body: JSON.stringify({ old_IDteinture: combo.IDteinture, old_liste: combo.traitements.map((t) => t.IDtraitement), new_IDteinture: dye, new_liste: liste }),
        })
      }
      const pMin = parseNum(mini), pMax = aboveOnly ? QTY_MAX : parseNum(maxi), pPrix = parseNum(prix)
      return apiFetch(`/sous-traitants/${sousTraitantId}/tarifs-ennoblissement`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'combination', IDteinture: dye, liste, quantite_mini: pMin, quantite_maxi: pMax, prix: pPrix }),
      })
    },
    onSuccess: () => {
      const sorted = Array.from(picked).sort((a, b) => a - b).join(',')
      onSaved({ kind: 'combination', key: `${dye}|${sorted}` })
    },
    onError: (e: Error) => setErr(e.message || 'Erreur'),
  })

  const submit = () => {
    setErr(null)
    if (picked.size === 0) { setErr('Sélectionnez au moins un traitement'); return }
    if (mode === 'new') {
      const pMin = parseNum(mini), pMax = aboveOnly ? QTY_MAX : parseNum(maxi), pPrix = parseNum(prix)
      if (pMin === null || pMin < 0) { setErr('Quantité minimum invalide'); return }
      if (pMax === null || pMax < pMin) { setErr('Quantité maximum invalide'); return }
      if (pPrix === null || pPrix < 0) { setErr('Prix invalide'); return }
    }
    mut.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-accent" />{mode === 'edit' ? 'Modifier la combinaison' : 'Nouvelle combinaison'}</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Contexte teinture</label>
            <PopoverSelect options={dyeOptions} value={dye} onChange={setDye} hideEmpty />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Traitements ({picked.size})</label>
            <div className="max-h-48 overflow-auto rounded-md border border-input p-2 space-y-1 scrollbar-transparent">
              {traitements.map((t) => (
                <button key={t.IDtraitement} type="button"
                  onClick={() => setPicked((prev) => { const next = new Set(prev); next.has(t.IDtraitement) ? next.delete(t.IDtraitement) : next.add(t.IDtraitement); return next })}
                  className="w-full flex items-center gap-2 px-1.5 py-1 rounded text-left text-sm hover:bg-accent/5">
                  <Checkbox checked={picked.has(t.IDtraitement)} />
                  <span className="truncate">{t.designation}</span>
                </button>
              ))}
            </div>
          </div>
          {mode === 'new' && (
            <div className="rounded-md border border-accent/25 bg-accent/[0.03] p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-accent font-semibold">Première tranche</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Qté min</label><input value={mini} onChange={(e) => setMini(e.target.value)} inputMode="numeric" className={cn(inputClass, 'h-8 text-right')} /></div>
                <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Qté max</label>
                  <div className="flex items-center gap-1">
                    <input value={aboveOnly ? '' : maxi} onChange={(e) => setMaxi(e.target.value)} disabled={aboveOnly} inputMode="numeric" placeholder={aboveOnly ? 'au-delà' : ''} className={cn(inputClass, 'h-8 text-right', aboveOnly && 'opacity-50')} />
                    <button type="button" onClick={() => setAboveOnly((v) => !v)} className={cn('flex-shrink-0 text-[10px] px-1.5 h-8 rounded-md border', aboveOnly ? 'bg-accent text-accent-foreground border-accent' : 'border-input text-muted-foreground hover:bg-accent/10')}>∞</button>
                  </div>
                </div>
                <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Prix €/Kg</label><input value={prix} onChange={(e) => setPrix(e.target.value)} inputMode="decimal" placeholder="0,00" className={cn(inputClass, 'h-8 text-right')} /></div>
              </div>
            </div>
          )}
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Annuler</Button>
          <Button onClick={submit} disabled={mut.isPending}>{mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Copy-from-another-sst dialog ───────────────────────
function CopyTariffsDialog({ open, sousTraitantId, hasExisting, onClose, onSaved }: {
  open: boolean; sousTraitantId: number; hasExisting: boolean; onClose: () => void; onSaved: () => void
}) {
  const { data: ssts } = useEnnoblisseurs()
  const [sourceId, setSourceId] = useState<number>(0) // 0 = default catalog
  const [err, setErr] = useState<string | null>(null)

  const options = useMemo(() => {
    const ennobl = (ssts ?? [])
      .filter((s) => Number(s.IDtype_sst) === 2 && s.IDsous_traitant !== sousTraitantId)
      .map((s) => ({ id: s.IDsous_traitant, primary: s.nom }))
    return [{ id: 0, primary: 'Catalogue par défaut' }, ...ennobl]
  }, [ssts, sousTraitantId])

  const mut = useMutation({
    mutationFn: () => apiFetch(`/sous-traitants/${sousTraitantId}/tarifs-ennoblissement/copier`, {
      method: 'POST', body: JSON.stringify({ sourceId, overwrite: hasExisting }),
    }),
    onSuccess: onSaved,
    onError: (e: Error) => setErr(e.message || 'Erreur'),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Copy className="h-5 w-5 text-accent" />Copier des tarifs</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Source</label>
            <PopoverSelect options={options} value={sourceId} onChange={setSourceId} hideEmpty />
          </div>
          {hasExisting && (
            <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-2.5 text-[11px] text-amber-700">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>Ce sous-traitant possède déjà des tarifs. La copie les remplacera intégralement.</span>
            </div>
          )}
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Annuler</Button>
          <Button onClick={() => { setErr(null); mut.mutate() }} disabled={mut.isPending}>{mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Copier'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
