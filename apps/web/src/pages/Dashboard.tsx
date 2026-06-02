import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Boxes,
  Truck,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Info,
  FileSpreadsheet,
  Download,
  LayoutDashboard,
} from 'lucide-react'
import * as RTooltip from '@radix-ui/react-tooltip'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SearchableCombobox } from '@/components/ui/popover-select'
import { BobineIcon } from '@/components/icons/BobineIcon'
import { apiFetch } from '@/lib/api'
import { fmtNum } from '@/lib/format'
import { formatHfsqlDate, inputDateToHfsql } from '@/lib/dates'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { cn } from '@/lib/utils'

export function Dashboard() {
  // Each widget is gated by a per-user permission (admins see all). Toggled in
  // Paramètres > Utilisateurs › Tableau de bord.
  const showFilEtat = useHasPermission('dashboard_fil_etat')
  const showLaGentle = useHasPermission('dashboard_la_gentle')
  const anyWidget = showFilEtat || showLaGentle

  return (
    <div className="animate-fade-in -m-4 lg:-m-6 flex-1 min-h-0 overflow-auto bg-muted/70 p-4 lg:p-6 scrollbar-transparent">
      {anyWidget ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {showFilEtat && <FilStockEtatWidget />}
          {showLaGentle && <LaGentleExportWidget />}
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <LayoutDashboard className="h-12 w-12 opacity-30" />
          <p className="text-sm">Aucun widget n'est activé pour votre compte.</p>
        </div>
      )}
    </div>
  )
}

// ── Stock La Gentle export widget ─────────────────────────────
// Pick a cutoff date → download an Excel of La Gentle Factory (client 8) yarn
// lots (terminé = 0) whose last movement is on or before that date. Backed by
// GET /api/stock/fil/la-gentle-stale; the .xlsx is built client-side (SheetJS
// lazy-loaded on click so it never bloats the main bundle).

interface LaGentleRow {
  client: string
  lot: string
  reference: string
  coloris: string
  stock: number
  emplacement: string
  commentaire: string
  dernier_mouvement: string // YYYYMMDD
}
interface LaGentleResponse {
  client_nom: string
  cutoff: string
  count: number
  rows: LaGentleRow[]
}

// The widget asks for the REPORT date (default today). The movement cutoff is
// derived as report_date − 6 months, mirroring the legacy DATEADD(month,-6,SYSDATE):
// the report lists La Gentle lots with no movement in the 6 months before the
// chosen date.
function todayInput(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// "2026-06-01" → "20251201" (report date minus 6 months, HFSQL YYYYMMDD).
function movementCutoffHfsql(reportInputDate: string): string {
  const [y, m, day] = reportInputDate.split('-').map(Number)
  const d = new Date(y, (m - 1), day)
  d.setMonth(d.getMonth() - 6)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

function LaGentleExportWidget() {
  const [date, setDate] = useState(todayInput)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'empty' | 'error'>('idle')
  const [lastCount, setLastCount] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleDownload() {
    const reportDate = inputDateToHfsql(date)
    if (!/^\d{8}$/.test(reportDate)) {
      setStatus('error'); setErrorMsg('Date invalide.'); return
    }
    // Legacy semantics: filter on movements ≥ 6 months old at the report date.
    const cutoff = movementCutoffHfsql(date)
    setStatus('loading'); setErrorMsg('')
    try {
      const data = await apiFetch<LaGentleResponse>(`/stock/fil/la-gentle-stale?cutoff=${cutoff}`)
      setLastCount(data.count)
      if (data.count === 0) { setStatus('empty'); return }

      const XLSX = await import('xlsx')
      const headers = ['Client', 'Lot', 'Référence', 'Coloris', 'Stock (kg)', 'Emplacement', 'Commentaire', 'Dernier mouvement']
      const aoa: (string | number)[][] = [
        headers,
        ...data.rows.map((r) => [
          r.client,
          r.lot,
          r.reference,
          r.coloris,
          r.stock,
          r.emplacement,
          r.commentaire,
          r.dernier_mouvement ? formatHfsqlDate(r.dernier_mouvement) : '',
        ]),
      ]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = [
        { wch: 18 }, { wch: 10 }, { wch: 24 }, { wch: 14 },
        { wch: 10 }, { wch: 14 }, { wch: 32 }, { wch: 16 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Stock La Gentle')
      XLSX.writeFile(wb, `Stock_La_Gentle_${reportDate}.xlsx`)
      setStatus('done')
    } catch (err) {
      console.error('La Gentle export failed:', err)
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Échec de la génération.')
    }
  }

  return (
    <Card className="card-premium overflow-hidden">
      {/* Gold header band */}
      <div className="flex items-center gap-3 border-b border-gold/20 bg-gold/25 px-5 py-4">
        <div className="icon-box-gold h-11 w-11 flex items-center justify-center">
          <FileSpreadsheet className="h-[22px] w-[22px]" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-heading font-bold tracking-tight">Stock La Gentle</h2>
          <p className="text-xs text-muted-foreground">
            Rouleaux sans mouvement depuis 6 mois — export Excel
          </p>
        </div>
      </div>

      <CardContent className="space-y-5 p-5">
        <p className="text-sm text-muted-foreground">
          Génère un fichier Excel des lots de fil de <span className="font-semibold text-foreground">La Gentle Factory</span> en
          stock dont le dernier mouvement remonte à plus de 6 mois avant la date du rapport.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date du rapport</label>
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setStatus('idle') }}
              className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleDownload}
              disabled={status === 'loading'}
              className="w-full"
            >
              {status === 'loading'
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <Download className="h-4 w-4 mr-1.5" />}
              Télécharger l'export Excel
            </Button>
          </div>
        </div>

        {/* Status line */}
        <div className="min-h-[20px] text-sm">
          {status === 'done' && (
            <p className="flex items-center gap-1.5 text-success">
              <CheckCircle2 className="h-4 w-4" />
              {lastCount} rouleau{lastCount > 1 ? 'x' : ''} exporté{lastCount > 1 ? 's' : ''}.
            </p>
          )}
          {status === 'empty' && (
            <p className="text-muted-foreground italic">Aucun rouleau ne correspond à cette date.</p>
          )}
          {status === 'error' && (
            <p className="flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {errorMsg || 'Une erreur est survenue.'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── État des stocks de fil widget ─────────────────────────────
// Pick a ref_fil + coloris → summary of en stock / commandé / besoin /
// disponible. Backed by GET /api/stock/fil/etat. Référence list comes from
// /references-fil; the coloris list from that ref's detail (variantes).

interface RefFilOption { IDref_fil: number; reference: string | null }
interface ColoriOption { IDcolori_fil: number; reference: string | null }
interface RefDetail { variantes: ColoriOption[] }
interface FilEtat {
  en_stock: number
  nb_lots: number
  en_stock_rows: { lot: string; fournisseur: string; kg: number }[]
  commande: number
  nb_commandes: number
  commande_rows: { commande: number; fournisseur: string; ordered: number; recu: number; kg: number }[]
  besoin: number
  nb_affectations: number
  besoin_rows: { lot: string; commande_sst: number; kg: number }[]
  disponible: number
}

function FilStockEtatWidget() {
  const [refFilId, setRefFilId] = useState(0)
  const [coloriId, setColoriId] = useState(0)

  const refsQuery = useQuery<RefFilOption[]>({
    queryKey: ['references-fil'],
    queryFn: () => apiFetch('/references-fil'),
    staleTime: 5 * 60_000,
  })
  const refDetailQuery = useQuery<RefDetail>({
    queryKey: ['references-fil', refFilId],
    queryFn: () => apiFetch(`/references-fil/${refFilId}`),
    enabled: refFilId > 0,
  })
  const etatQuery = useQuery<FilEtat>({
    queryKey: ['fil-etat', refFilId, coloriId],
    queryFn: () => apiFetch(`/stock/fil/etat?ref_fil=${refFilId}&colori_fil=${coloriId}`),
    enabled: refFilId > 0 && coloriId > 0,
  })

  const refs = refsQuery.data ?? []
  const variantes = refDetailQuery.data?.variantes ?? []
  const etat = etatQuery.data
  const ready = refFilId > 0 && coloriId > 0
  const refLabel = refs.find((r) => r.IDref_fil === refFilId)?.reference ?? ''
  const coloriLabel = variantes.find((v) => v.IDcolori_fil === coloriId)?.reference ?? ''
  // Footer totals for the "Commandé" tooltip breakdown (ordered / received).
  const cmdOrderedTotal = (etat?.commande_rows ?? []).reduce((s, r) => s + r.ordered, 0)
  const cmdRecuTotal = (etat?.commande_rows ?? []).reduce((s, r) => s + r.recu, 0)

  return (
    <RTooltip.Provider delayDuration={120} skipDelayDuration={400}>
    <Card className="card-premium overflow-hidden">
      {/* Gold header band */}
      <div className="flex items-center gap-3 border-b border-gold/20 bg-gold/25 px-5 py-4">
        <div className="icon-box-gold h-11 w-11 flex items-center justify-center">
          <BobineIcon className="h-[24px] w-[24px]" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-heading font-bold tracking-tight">État des stocks de fil</h2>
          <p className="text-xs text-muted-foreground">
            Stock, commandé, besoin et disponible par référence et coloris
          </p>
        </div>
      </div>

      <CardContent className="space-y-5 p-5">
        {/* Selectors */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Référence fil</label>
            <SearchableCombobox
              options={refs}
              value={refFilId}
              onChange={(id) => { setRefFilId(id); setColoriId(0) }}
              getId={(r) => r.IDref_fil}
              getPrimary={(r) => r.reference ?? `#${r.IDref_fil}`}
              loading={refsQuery.isLoading}
              placeholder="Rechercher une référence"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Coloris</label>
            <SearchableCombobox
              options={variantes}
              value={coloriId}
              onChange={setColoriId}
              getId={(v) => v.IDcolori_fil}
              getPrimary={(v) => v.reference ?? `#${v.IDcolori_fil}`}
              disabled={refFilId === 0}
              loading={refDetailQuery.isLoading}
              placeholder={refFilId === 0 ? "Choisissez d'abord une référence" : 'Choisir un coloris'}
            />
          </div>
        </div>

        {/* Result — reserve the data-state height so the card keeps a stable
            size whether or not a selection has been made. */}
        <div className="flex min-h-[236px] flex-col">
        {!ready ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 text-center">
            <BobineIcon className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Sélectionnez une référence et un coloris pour voir l'état du stock.
            </p>
          </div>
        ) : etatQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : etat ? (
          <div className="space-y-3">
            {(refLabel || coloriLabel) && (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{refLabel}</span>
                {coloriLabel && <span> · {coloriLabel}</span>}
              </p>
            )}

            {/* Three input quantities */}
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi
                label="En stock"
                value={etat.en_stock}
                sub={`${etat.nb_lots} lot${etat.nb_lots > 1 ? 's' : ''}`}
                icon={Boxes}
                wrap="border-teal/25 bg-teal/[0.06]"
                iconBox="icon-box-teal"
                info={{
                  title: 'En stock',
                  text: 'Stock physique restant pour ce fil, lot par lot.',
                  headers: ['Lot', 'Fournisseur', 'kg'],
                  rows: etat.en_stock_rows.map((r) => [r.lot, r.fournisseur, fmtNum(r.kg, 1)]),
                  totalKg: etat.en_stock,
                }}
              />
              <Kpi
                label="Commandé"
                value={etat.commande}
                sub={`${etat.nb_commandes} en cours`}
                icon={Truck}
                wrap="border-accent-blue/25 bg-accent-blue/[0.05]"
                iconBox="bg-accent-blue/10 text-accent-blue"
                info={{
                  title: 'Commandé',
                  text: 'Commandes fournisseur en cours, déduction faite des lots déjà réceptionnés (reste à recevoir).',
                  headers: ['N° cmd', 'Commandé', 'Reçu', 'Reste'],
                  numCols: 3,
                  rows: etat.commande_rows.map((r) => [`N°${r.commande}`, fmtNum(r.ordered, 1), fmtNum(r.recu, 1), fmtNum(r.kg, 1)]),
                  colTotals: [fmtNum(cmdOrderedTotal, 1), fmtNum(cmdRecuTotal, 1)],
                  totalKg: etat.commande,
                }}
              />
              <Kpi
                label="Besoin"
                value={etat.besoin}
                sub={`${etat.nb_affectations} affectation${etat.nb_affectations > 1 ? 's' : ''}`}
                icon={Scissors}
                wrap="border-terracotta/25 bg-terracotta/[0.06]"
                iconBox="icon-box-terracotta"
                info={{
                  title: 'Besoin',
                  text: 'Fil affecté aux commandes de tricotage en cours (non soldées).',
                  headers: ['Lot', 'N° STT', 'kg'],
                  rows: etat.besoin_rows.map((r) => [r.lot, `N°${r.commande_sst}`, fmtNum(r.kg, 1)]),
                  totalKg: etat.besoin,
                }}
              />
            </div>

            {/* Disponible — the result */}
            <div className="relative flex items-center gap-4 rounded-xl border border-gold/30 bg-gradient-to-br from-gold/15 via-gold/[0.06] to-transparent p-4">
              <div className="absolute right-2 top-2">
                <InfoTip
                  title="Disponible"
                  text="Disponible une fois le besoin de production couvert. Négatif = rupture."
                  headers={['Élément', 'kg']}
                  rows={[
                    ['En stock', `+${fmtNum(etat.en_stock, 1)}`],
                    ['Commandé', `+${fmtNum(etat.commande, 1)}`],
                    ['Besoin', `−${fmtNum(etat.besoin, 1)}`],
                  ]}
                  totalKg={etat.disponible}
                />
              </div>
              <div className={cn(
                'h-12 w-12 flex-shrink-0 rounded-xl flex items-center justify-center',
                etat.disponible >= 0 ? 'bg-success/12 text-success' : 'bg-destructive/12 text-destructive',
              )}>
                {etat.disponible >= 0
                  ? <CheckCircle2 className="h-6 w-6" />
                  : <AlertTriangle className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disponible</p>
                <p className="text-[11px] text-muted-foreground">En stock + commandé − besoin</p>
              </div>
              <div className="pr-6 text-right">
                <p className={cn(
                  'text-3xl font-bold tabular-nums',
                  etat.disponible < 0 ? 'text-destructive' : 'text-success',
                )}>
                  {fmtNum(etat.disponible, 0)}
                  <span className="ml-1 text-base font-normal text-muted-foreground">kg</span>
                </p>
                {etat.disponible < 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                    <AlertTriangle className="h-2.5 w-2.5" />Rupture
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : null}
        </div>
      </CardContent>
    </Card>
    </RTooltip.Provider>
  )
}

function Kpi({
  label, value, sub, icon: Icon, wrap, iconBox, info,
}: {
  label: string
  value: number
  sub?: string
  icon: React.ElementType
  wrap: string
  iconBox: string
  info?: TipData
}) {
  return (
    <div className={cn('relative rounded-xl border p-3', wrap)}>
      {info && <div className="absolute right-2 top-2"><InfoTip {...info} /></div>}
      <div className="flex items-center gap-2 pr-5">
        <div className={cn('h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center', iconBox)}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {fmtNum(value, 0)}
        <span className="ml-1 text-sm font-normal text-muted-foreground">kg</span>
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

interface TipData {
  title: string
  text: string
  headers: string[]
  /** Each row's cells; the trailing `numCols` cells are right-aligned numerics. */
  rows: string[][]
  /** Total for the LAST numeric column (rendered with a " kg" suffix). */
  totalKg: number
  /** How many trailing columns are right-aligned numerics. Defaults to 1. */
  numCols?: number
  /** Footer totals for the leading numeric columns (all but the last). Length = numCols-1. */
  colTotals?: string[]
}

// Hover info icon → portaled, collision-aware Radix tooltip showing a title, a
// short explanation, and a breakdown table of every lot/line that's counted.
function InfoTip({ title, text, headers, rows, totalKg, numCols = 1, colTotals = [] }: TipData) {
  // Index of the first right-aligned numeric column.
  const firstNumeric = headers.length - numCols
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>
        <button
          type="button"
          aria-label={`Détails du calcul — ${title}`}
          className="rounded-full text-muted-foreground/50 transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[340px] rounded-lg border border-border/70 bg-popover p-3 shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{text}</p>
          {rows.length > 0 ? (
            <div className="mt-2 max-h-[182px] overflow-y-auto rounded-md border border-border/60">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i} className={cn('px-2 py-1 font-medium', i >= firstNumeric ? 'text-right whitespace-nowrap' : 'text-left')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri} className="border-t border-border/40">
                      {r.map((c, ci) => (
                        <td
                          key={ci}
                          className={cn(
                            'px-2 py-1 align-top',
                            ci >= firstNumeric
                              ? 'whitespace-nowrap text-right font-medium tabular-nums text-foreground'
                              : 'text-left text-muted-foreground',
                          )}
                        >
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted">
                    <td className="px-2 py-1 font-semibold text-foreground" colSpan={Math.max(1, firstNumeric)}>Total</td>
                    {colTotals.map((t, i) => (
                      <td key={i} className="px-2 py-1 text-right font-semibold tabular-nums text-muted-foreground">{t}</td>
                    ))}
                    <td className="px-2 py-1 text-right font-bold tabular-nums text-foreground">{fmtNum(totalKg)} kg</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="mt-2 rounded-md border border-dashed border-border bg-muted/40 py-2 text-center text-[11px] italic text-muted-foreground">
              Aucun élément.
            </p>
          )}
          <RTooltip.Arrow className="fill-popover" width={11} height={6} />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}
