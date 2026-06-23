// Rapports — read-only reporting endpoints.
//
// `/commandes-sst` ports the legacy WinDev "Rapport commandes
// sous-traitants" screen: a flat, line-level tracking table of every
// sous-traitant order line, with computed status, quantities (ordered /
// affected / received), the deadline chain (initial / current / client),
// the resulting delay & margin (in days), the end client, and a comment.
//
// It is READ-ONLY and intentionally denormalised: it reuses the same
// domain primitives as `commandes-sous-traitant.ts` (status state machine,
// ref/coloris polymorphism, the stock_ecru/stock_fini ↔ line links, the
// ligne_commande_client → commande_client → client chain) but flattens
// everything to one row per `ligne_commande_sous_traitant`.
//
// HFSQL discipline (see CLAUDE.md): no parameterized queries; only a
// BOUNDED, constant number of set-based queries regardless of row count
// (per-line query fan-out would storm the shared Linux bridge); IN-lists
// are chunked to stay under the statement-length limit; accent repair is
// batched via fixEncoding; reserved-word column `type` is aliased.

import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { query, fixEncoding } from '../lib/hfsql-auto.js'
import { stripRtf } from '../lib/rtf-utils.js'
import { n, dateDigits, addWorkingDays, isLineDone, lineStatutRank } from '../lib/sst-shared.js'

export const rapportsRouter: RouterType = Router()

// Cap the number of commandes scanned when including soldées (the full
// history is several thousand lines). Open-only is naturally bounded.
const MAX_COMMANDES = 2000
// Chunk size for IN-list queries — keeps each SQL statement well under the
// HFSQL length limit even at MAX_COMMANDES.
const CHUNK = 400

/** Run `fn` over `ids` in CHUNK-sized batches and concatenate the rows.
 *  Returns [] for an empty id list (never emits a `WHERE col IN ()`). */
async function inChunks<T>(ids: number[], fn: (chunk: string) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    if (slice.length === 0) continue
    out.push(...(await fn(slice.join(','))))
  }
  return out
}

/** Days between today (midnight) and a YYYYMMDD date; positive = date is in
 *  the future, negative = past. Null when the input isn't a valid date. */
function daysFromToday(yyyymmdd: string | null): number | null {
  if (!yyyymmdd || !/^\d{8}$/.test(yyyymmdd)) return null
  const target = new Date(Number(yyyymmdd.slice(0, 4)), Number(yyyymmdd.slice(4, 6)) - 1, Number(yyyymmdd.slice(6, 8)))
  target.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

interface RapportLineRow {
  IDligne_commande_sous_traitant: number
  IDcommande_sous_traitant: number
  sstatut: string | null
  sous_traitant_nom: string
  reference: string
  coloris: string
  type_kind: number
  unite_label: 'Ml' | 'Kg'
  qte_commandee: number
  qte_affectee: number
  qte_receptionnee: number
  date_commande: string | null
  delai_initial: string | null
  delai_actuel: string | null
  delai_client: string | null
  date_relance: string | null
  retard_jours: number | null
  marge_jours: number | null
  client_nom: string
  commentaire: string
  urgency: 'late' | 'soon' | null
  est_soldee: number
}

// GET /api/rapports/commandes-sst?soldees=0|1
//   soldees=0 (default) → only open commandes (est_soldee = 0)
//   soldees=1           → also include soldées (closed) commandes
rapportsRouter.get('/commandes-sst', async (req: Request, res: Response) => {
  try {
    const includeSoldees = String(req.query.soldees ?? '0') === '1'

    // ── 1) Commande headers (the scope). Most recent first; capped.
    const headerRows = await query<{
      IDcommande_sous_traitant: number
      IDsous_traitant: number
      date_commande: string | null
      est_soldee: number | null
      date_notif: string | null
      commentaire: string | null
    }>(
      `SELECT TOP ${MAX_COMMANDES}
              IDcommande_sous_traitant, IDsous_traitant, date_commande,
              est_soldee, date_notif, commentaire
       FROM commande_sous_traitant
       ${includeSoldees ? '' : 'WHERE est_soldee = 0'}
       ORDER BY IDcommande_sous_traitant DESC`,
    )
    if (headerRows.length === 0) { res.json([]); return }

    const cmdIds = headerRows.map((h) => n(h.IDcommande_sous_traitant)).filter((x) => x > 0)
    interface Hdr {
      IDsous_traitant: number
      date_commande: string
      est_soldee: number
      date_notif: string
      commentaire: string
    }
    const hdrById = new Map<number, Hdr>()
    for (const h of headerRows) {
      hdrById.set(n(h.IDcommande_sous_traitant), {
        IDsous_traitant: n(h.IDsous_traitant),
        date_commande: dateDigits(h.date_commande),
        est_soldee: n(h.est_soldee),
        date_notif: dateDigits(h.date_notif),
        // Header commentaire is RTF (legacy still reads it); strip for fallback.
        commentaire: stripRtf((h.commentaire ?? '').toString()).trim(),
      })
    }

    // ── 2) Sous-traitant names (accent-repaired).
    const stIds = Array.from(new Set(headerRows.map((h) => n(h.IDsous_traitant)).filter((x) => x > 0)))
    const stNomById = new Map<number, string>()
    {
      const rows = await inChunks(stIds, (chunk) =>
        query<{ IDsous_traitant: number; nom: string | null }>(
          `SELECT IDsous_traitant, nom FROM sous_traitant WHERE IDsous_traitant IN (${chunk})`,
        ),
      )
      for (const r of await fixEncoding(rows as any[], 'sous_traitant', 'IDsous_traitant', ['nom']))
        stNomById.set(n((r as any).IDsous_traitant), ((r as any).nom ?? '').toString().trim())
    }

    // ── 3) Lines (the report rows). `type` is reserved → alias to type_kind.
    const lineRows = await inChunks(cmdIds, (chunk) =>
      query<{
        IDligne_commande_sous_traitant: number
        IDcommande_sous_traitant: number
        type_kind: number | null
        IDreference: number | null
        IDColoris: number | null
        quantite: number | null
        date_livraison: string | null
        date_delai: string | null
        commentaire: string | null
        sstatut: string | null
      }>(
        `SELECT lcs.IDligne_commande_sous_traitant, lcs.IDcommande_sous_traitant,
                lcs.type AS type_kind, lcs.IDreference, lcs.IDColoris,
                lcs.quantite, lcs.date_livraison, lcs.date_delai,
                lcs.commentaire, lcs.sstatut
         FROM ligne_commande_sous_traitant lcs
         WHERE lcs.IDcommande_sous_traitant IN (${chunk})`,
      ),
    )
    if (lineRows.length === 0) { res.json([]); return }

    const fixedLines = (await fixEncoding(
      lineRows as any[],
      'ligne_commande_sous_traitant',
      'IDligne_commande_sous_traitant',
      ['commentaire', 'sstatut'],
    )) as any[]

    const lineIds = fixedLines.map((l) => n(l.IDligne_commande_sous_traitant)).filter((x) => x > 0)

    // ── 4) Ref + coloris label maps (polymorphic by line type).
    const refIds = Array.from(new Set(fixedLines.map((l) => n(l.IDreference)).filter((x) => x > 0)))
    const colorisIds = Array.from(new Set(fixedLines.map((l) => n(l.IDColoris)).filter((x) => x > 0)))

    const ecruMap = new Map<number, string>()
    const finiMap = new Map<number, string>()
    const filMap = new Map<number, string>()
    const finiAvecTeintureMap = new Map<number, number>()
    if (refIds.length > 0) {
      const [ecruRows, finiRows, filRows] = await Promise.all([
        inChunks(refIds, (c) =>
          query<{ IDref_ecru: number; reference: string | null }>(
            `SELECT IDref_ecru, reference FROM ref_ecru WHERE IDref_ecru IN (${c})`,
          ),
        ),
        inChunks(refIds, (c) =>
          query<{ IDref_fini: number; reference: string | null; avec_teinture: number | null }>(
            `SELECT IDref_fini, reference, avec_teinture FROM ref_fini WHERE IDref_fini IN (${c})`,
          ),
        ),
        inChunks(refIds, (c) =>
          query<{ IDref_fil: number; reference: string | null }>(
            `SELECT IDref_fil, reference FROM ref_fil WHERE IDref_fil IN (${c})`,
          ),
        ),
      ])
      for (const r of await fixEncoding(ecruRows as any[], 'ref_ecru', 'IDref_ecru', ['reference']))
        ecruMap.set(n((r as any).IDref_ecru), ((r as any).reference ?? '').toString())
      for (const r of await fixEncoding(finiRows as any[], 'ref_fini', 'IDref_fini', ['reference'])) {
        finiMap.set(n((r as any).IDref_fini), ((r as any).reference ?? '').toString())
        finiAvecTeintureMap.set(n((r as any).IDref_fini), n((r as any).avec_teinture))
      }
      for (const r of await fixEncoding(filRows as any[], 'ref_fil', 'IDref_fil', ['reference']))
        filMap.set(n((r as any).IDref_fil), ((r as any).reference ?? '').toString())
    }

    const colorisFiniMap = new Map<number, string>()
    const colorisEcruMap = new Map<number, string>()
    if (colorisIds.length > 0) {
      const [finiC, ecruC] = await Promise.all([
        inChunks(colorisIds, (c) =>
          query<{ IDref_fini_colori: number; reference: string | null }>(
            `SELECT IDref_fini_colori, reference FROM ref_fini_colori WHERE IDref_fini_colori IN (${c})`,
          ),
        ),
        inChunks(colorisIds, (c) =>
          query<{ IDcolori_ecru: number; reference: string | null }>(
            `SELECT IDcolori_ecru, reference FROM colori_ecru WHERE IDcolori_ecru IN (${c})`,
          ),
        ),
      ])
      for (const c of await fixEncoding(finiC as any[], 'ref_fini_colori', 'IDref_fini_colori', ['reference']))
        colorisFiniMap.set(n((c as any).IDref_fini_colori), ((c as any).reference ?? '').toString())
      for (const c of await fixEncoding(ecruC as any[], 'colori_ecru', 'IDcolori_ecru', ['reference']))
        colorisEcruMap.set(n((c as any).IDcolori_ecru), ((c as any).reference ?? '').toString())
    }

    // Per-type resolvers — mirror commandes-sous-traitant.ts: route by the
    // line's `type` (2=ennoblisseur/fini, 1=tricoteur/ecru, 0=legacy/ecru),
    // fall back to the other catalogs only if the primary lacks the id.
    function resolveRef(IDref: number, typeKind: number): string {
      if (IDref <= 0) return ''
      const order = typeKind === 2 ? [finiMap, ecruMap, filMap] : [ecruMap, finiMap, filMap]
      for (const m of order) if (m.has(IDref)) return m.get(IDref)!
      return ''
    }
    function resolveColoris(IDcoloris: number, typeKind: number, IDref: number): string {
      if (IDcoloris <= 0) return ''
      if (typeKind === 2) {
        const dyed = (finiAvecTeintureMap.get(IDref) ?? 1) !== 0
        return dyed
          ? (colorisFiniMap.get(IDcoloris) ?? colorisEcruMap.get(IDcoloris) ?? '')
          : (colorisEcruMap.get(IDcoloris) ?? colorisFiniMap.get(IDcoloris) ?? '')
      }
      return colorisEcruMap.get(IDcoloris) ?? colorisFiniMap.get(IDcoloris) ?? ''
    }

    // ── 5) Quantity aggregates + client-line links (one query each, chunked).
    interface Agg { affecteeMetrage: number; affecteePoids: number; recuFiniMetrage: number; recuEcruPoids: number }
    const newAgg = (): Agg => ({ affecteeMetrage: 0, affecteePoids: 0, recuFiniMetrage: 0, recuEcruPoids: 0 })
    const aggByLine = new Map<number, Agg>()
    const lccByLine = new Map<number, Set<number>>() // line → set of IDligne_commande_client

    // 5a) Écru affected to the line (ennoblisseur: the greige sent out).
    const ecruAffected = await inChunks(lineIds, (c) =>
      query<{ IDref_commande_affectation: number; poids: number | null; metrage: number | null; IDligne_commande_client: number | null }>(
        `SELECT IDref_commande_affectation, poids, metrage, IDligne_commande_client
         FROM stock_ecru WHERE IDref_commande_affectation IN (${c})`,
      ),
    )
    for (const r of ecruAffected) {
      const lid = n(r.IDref_commande_affectation)
      if (lid === 0) continue
      const a = aggByLine.get(lid) ?? newAgg()
      a.affecteeMetrage += n(r.metrage)
      a.affecteePoids += n(r.poids)
      aggByLine.set(lid, a)
      const lcc = n(r.IDligne_commande_client)
      if (lcc > 0) { const s = lccByLine.get(lid) ?? new Set(); s.add(lcc); lccByLine.set(lid, s) }
    }

    // 5b) Fini received back (ennoblisseur: dyed rolls returned).
    const finiReceived = await inChunks(lineIds, (c) =>
      query<{ IDref_commande_source: number; metrage: number | null; IDligne_commande_client: number | null }>(
        `SELECT IDref_commande_source, metrage, IDligne_commande_client
         FROM stock_fini WHERE IDref_commande_source IN (${c})`,
      ),
    )
    for (const r of finiReceived) {
      const lid = n(r.IDref_commande_source)
      if (lid === 0) continue
      const a = aggByLine.get(lid) ?? newAgg()
      a.recuFiniMetrage += n(r.metrage)
      aggByLine.set(lid, a)
      const lcc = n(r.IDligne_commande_client)
      if (lcc > 0) { const s = lccByLine.get(lid) ?? new Set(); s.add(lcc); lccByLine.set(lid, s) }
    }

    // 5c) Écru produced by the line (tricoteur: knitted greige delivered).
    const ecruProduced = await inChunks(lineIds, (c) =>
      query<{ IDref_commande_source: number; poids: number | null }>(
        `SELECT IDref_commande_source, poids FROM stock_ecru WHERE IDref_commande_source IN (${c})`,
      ),
    )
    for (const r of ecruProduced) {
      const lid = n(r.IDref_commande_source)
      if (lid === 0) continue
      const a = aggByLine.get(lid) ?? newAgg()
      a.recuEcruPoids += n(r.poids)
      aggByLine.set(lid, a)
    }

    // ── 6) Resolve the client chain for every linked client-order line:
    //   ligne_commande_client → (IDcommande_client, date_livraison)
    //   commande_client       → IDclient
    //   client                → nom
    const allLccIds = Array.from(new Set(Array.from(lccByLine.values()).flatMap((s) => Array.from(s))))
    const lccInfo = new Map<number, { ccId: number; delai: string }>()
    if (allLccIds.length > 0) {
      const rows = await inChunks(allLccIds, (c) =>
        query<{ IDligne_commande_client: number; IDcommande_client: number; date_livraison: string | null }>(
          `SELECT IDligne_commande_client, IDcommande_client, date_livraison
           FROM ligne_commande_client WHERE IDligne_commande_client IN (${c})`,
        ),
      )
      for (const r of rows)
        lccInfo.set(n(r.IDligne_commande_client), { ccId: n(r.IDcommande_client), delai: dateDigits(r.date_livraison) })
    }
    const ccToClient = new Map<number, number>()
    const ccIds = Array.from(new Set(Array.from(lccInfo.values()).map((v) => v.ccId).filter((x) => x > 0)))
    if (ccIds.length > 0) {
      const rows = await inChunks(ccIds, (c) =>
        query<{ IDcommande_client: number; IDclient: number }>(
          `SELECT IDcommande_client, IDclient FROM commande_client WHERE IDcommande_client IN (${c})`,
        ),
      )
      for (const r of rows) ccToClient.set(n(r.IDcommande_client), n(r.IDclient))
    }
    const clientNomById = new Map<number, string>()
    const clientIds = Array.from(new Set(Array.from(ccToClient.values()).filter((x) => x > 0)))
    if (clientIds.length > 0) {
      const rows = await inChunks(clientIds, (c) =>
        query<{ IDclient: number; nom: string | null }>(
          `SELECT IDclient, nom FROM client WHERE IDclient IN (${c})`,
        ),
      )
      for (const r of await fixEncoding(rows as any[], 'client', 'IDclient', ['nom']))
        clientNomById.set(n((r as any).IDclient), ((r as any).nom ?? '').toString().trim())
    }

    /** For a line, pick the client-order line with the earliest valid
     *  delivery date (matches legacy "earliest valid" disambiguation) and
     *  return its deadline + client name. */
    function clientFor(lineId: number): { delai: string | null; nom: string } {
      const set = lccByLine.get(lineId)
      if (!set || set.size === 0) return { delai: null, nom: '' }
      let bestDelai: string | null = null
      let bestNom = ''
      for (const lccId of set) {
        const info = lccInfo.get(lccId)
        if (!info) continue
        const nom = clientNomById.get(ccToClient.get(info.ccId) ?? 0) ?? ''
        if (nom && !bestNom) bestNom = nom
        if (info.delai && (bestDelai === null || info.delai < bestDelai)) {
          bestDelai = info.delai
          if (nom) bestNom = nom
        }
      }
      return { delai: bestDelai, nom: bestNom }
    }

    // ── 7) Assemble one row per line.
    const today0 = new Date(); today0.setHours(0, 0, 0, 0)
    const nextWorkingDay = addWorkingDays(today0, 1)

    const out: RapportLineRow[] = fixedLines.map((l) => {
      const lineId = n(l.IDligne_commande_sous_traitant)
      const cmdId = n(l.IDcommande_sous_traitant)
      const hdr = hdrById.get(cmdId)
      const typeKind = n(l.type_kind)
      const sstatut = (l.sstatut ?? '').toString().trim() || null
      const estSoldee = hdr?.est_soldee ?? 0
      const isEnnob = typeKind === 2
      const agg = aggByLine.get(lineId) ?? newAgg()
      const { delai: delaiClient, nom: clientNom } = clientFor(lineId)

      const delaiActuel = dateDigits(l.date_livraison) || null
      const delaiInitial = dateDigits(l.date_delai) || null
      const done = isLineDone(sstatut) || estSoldee === 1

      // Retard = positive overdue days vs the current deadline (blank when
      // no deadline or the line is done / on-time).
      let retard: number | null = null
      if (!done && delaiActuel) {
        const d = daysFromToday(delaiActuel)
        if (d !== null && d < 0) retard = -d
      }
      // Marge = client deadline − current deadline, in days (signed).
      let marge: number | null = null
      if (delaiClient && delaiActuel) {
        const dc = daysFromToday(delaiClient)
        const da = daysFromToday(delaiActuel)
        if (dc !== null && da !== null) marge = dc - da
      }

      // Urgency tint (MPS_NG language: red late / amber soon / none).
      let urgency: 'late' | 'soon' | null = null
      if (!done) {
        const rank = lineStatutRank(sstatut)
        const anchor = rank === 1 ? (hdr?.date_notif || '') : (delaiActuel ?? '')
        if (anchor && /^\d{8}$/.test(anchor)) {
          const target = new Date(Number(anchor.slice(0, 4)), Number(anchor.slice(4, 6)) - 1, Number(anchor.slice(6, 8)))
          target.setHours(0, 0, 0, 0)
          if (target.getTime() <= today0.getTime()) urgency = 'late'
          else if (rank === 1 ? target.getTime() <= nextWorkingDay.getTime() : (target.getTime() - today0.getTime()) / 86_400_000 <= 3) urgency = 'soon'
        }
      }

      const lineComment = stripRtf((l.commentaire ?? '').toString()).trim()
      const commentaire = lineComment || hdr?.commentaire || ''

      return {
        IDligne_commande_sous_traitant: lineId,
        IDcommande_sous_traitant: cmdId,
        sstatut,
        sous_traitant_nom: stNomById.get(hdr?.IDsous_traitant ?? 0) ?? '',
        reference: resolveRef(n(l.IDreference), typeKind),
        coloris: resolveColoris(n(l.IDColoris), typeKind, n(l.IDreference)),
        type_kind: typeKind,
        unite_label: isEnnob ? 'Ml' : 'Kg',
        qte_commandee: n(l.quantite),
        qte_affectee: isEnnob ? agg.affecteeMetrage : agg.affecteePoids,
        qte_receptionnee: isEnnob ? agg.recuFiniMetrage : agg.recuEcruPoids,
        date_commande: hdr?.date_commande || null,
        delai_initial: delaiInitial,
        delai_actuel: delaiActuel,
        delai_client: delaiClient,
        date_relance: hdr?.date_notif || null,
        retard_jours: retard,
        marge_jours: marge,
        client_nom: clientNom,
        commentaire,
        urgency,
        est_soldee: estSoldee,
      }
    })

    // Default order: most recent commande first, then line id.
    out.sort((a, b) =>
      b.IDcommande_sous_traitant - a.IDcommande_sous_traitant ||
      a.IDligne_commande_sous_traitant - b.IDligne_commande_sous_traitant,
    )

    res.json(out)
  } catch (err) {
    console.error('[rapports/commandes-sst]', err)
    res.status(500).json({ error: (err as Error).message })
  }
})
