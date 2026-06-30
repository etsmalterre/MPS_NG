// READ-ONLY audit: find stock_fini rolls stuck in "En Contrôle" (IDetat_stock_fini = 1)
// although their suivilot lot has already been validated (IDetatLot = 3).
//
// These are the rolls affected by the pre-fix bug where validating a lot in
// Qualité › Suivi Lots did NOT cascade onto the lot's rolls. We list them so
// the user can review before we promote them to "Validé" (3).
//
// Linkage: suivilot(IDligne_commande_sous_traitant, lot) ↔ stock_fini where
// IDref_commande_source = ligne AND lot = lot (same key the détail/pièces query
// and the verdict cascade use). Flat queries + JS join (no alias.* JOINs — the
// Windows ODBC accent footgun). Nothing is written.
import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  const conn = process.env.HFSQL_CONNECTION_STRING ?? '(default localhost)'
  console.log(`\nDB: ${conn.replace(/PWD=[^;]*/i, 'PWD=***')}\n`)

  // 1) All validated lots → set of "ligne|lot" pairs + per-pair context.
  const lots = await query<{
    IDsuivilot: number
    IDligne_commande_sous_traitant: number | null
    IDcommande_sous_traitant: number | null
    IDsous_traitant: number | null
    lot: string | null
  }>(
    `SELECT IDsuivilot, IDligne_commande_sous_traitant, IDcommande_sous_traitant, IDsous_traitant, lot
     FROM suivilot WHERE IDetatLot = 3`,
  )
  const ctxByPair = new Map<string, { suiviId: number; cmdId: number; sstId: number; lot: string; ligneId: number }>()
  for (const l of lots) {
    const ligneId = Number(l.IDligne_commande_sous_traitant) || 0
    const lot = (l.lot ?? '').toString().trim()
    if (ligneId > 0 && lot) {
      ctxByPair.set(`${ligneId}|${lot}`, {
        suiviId: Number(l.IDsuivilot) || 0,
        cmdId: Number(l.IDcommande_sous_traitant) || 0,
        sstId: Number(l.IDsous_traitant) || 0,
        lot,
        ligneId,
      })
    }
  }
  console.log(`Validated lots (IDetatLot=3): ${lots.length}  (usable ligne|lot pairs: ${ctxByPair.size})`)

  // 2) All rolls currently in "En Contrôle" (1). Intersect with validated pairs.
  const enControle = await query<{
    IDstock_fini: number
    numero: string | null
    lot: string | null
    IDref_commande_source: number | null
  }>(
    `SELECT IDstock_fini, numero, lot, IDref_commande_source
     FROM stock_fini WHERE IDetat_stock_fini = 1`,
  )
  console.log(`Rolls currently En Contrôle (IDetat_stock_fini=1): ${enControle.length}`)

  type Affected = {
    IDstock_fini: number; numero: string; lot: string; ligneId: number
    suiviId: number; cmdId: number; sstId: number
  }
  const affected: Affected[] = []
  for (const r of enControle) {
    const ligneId = Number(r.IDref_commande_source) || 0
    const lot = (r.lot ?? '').toString().trim()
    const ctx = ctxByPair.get(`${ligneId}|${lot}`)
    if (ctx) {
      affected.push({
        IDstock_fini: Number(r.IDstock_fini) || 0,
        numero: (r.numero ?? '').toString().trim(),
        lot,
        ligneId,
        suiviId: ctx.suiviId,
        cmdId: ctx.cmdId,
        sstId: ctx.sstId,
      })
    }
  }

  console.log(`\n=== AFFECTED ROLLS (En Contrôle under a Validé lot → should be Validé) : ${affected.length} ===\n`)
  if (affected.length === 0) { console.log('  none.'); return }

  // Enrich: sst names + commande est_soldee, for a readable report.
  const sstIds = Array.from(new Set(affected.map((a) => a.sstId).filter((x) => x > 0)))
  const sstName = new Map<number, string>()
  if (sstIds.length > 0) {
    const rows = await query<{ IDsous_traitant: number; nom: string | null }>(
      `SELECT IDsous_traitant, nom FROM sous_traitant WHERE IDsous_traitant IN (${sstIds.join(',')})`,
    )
    for (const r of await fixEncoding(rows, 'sous_traitant', 'IDsous_traitant', ['nom']))
      sstName.set(Number(r.IDsous_traitant), (r.nom ?? '').toString().trim())
  }
  const cmdIds = Array.from(new Set(affected.map((a) => a.cmdId).filter((x) => x > 0)))
  const cmdSoldee = new Map<number, number>()
  if (cmdIds.length > 0) {
    const rows = await query<{ IDcommande_sous_traitant: number; est_soldee: number | null }>(
      `SELECT IDcommande_sous_traitant, est_soldee FROM commande_sous_traitant WHERE IDcommande_sous_traitant IN (${cmdIds.join(',')})`,
    )
    for (const r of rows) cmdSoldee.set(Number(r.IDcommande_sous_traitant), Number(r.est_soldee) || 0)
  }

  // Group by lot for readability.
  affected.sort((a, b) =>
    a.cmdId - b.cmdId || a.lot.localeCompare(b.lot) || a.numero.localeCompare(b.numero) || a.IDstock_fini - b.IDstock_fini)

  let curKey = ''
  for (const a of affected) {
    const key = `${a.cmdId}|${a.lot}`
    if (key !== curKey) {
      curKey = key
      const soldee = cmdSoldee.get(a.cmdId) === 1 ? 'soldée' : 'en cours'
      console.log(
        `\n  Cmd SST ${a.cmdId} (${soldee}) · lot ${a.lot} · ${sstName.get(a.sstId) ?? `sst#${a.sstId}`} · suivilot ${a.suiviId} · ligne ${a.ligneId}`,
      )
    }
    console.log(`      roll ${a.numero || '(no n°)'}  →  IDstock_fini=${a.IDstock_fini}   [1 En Contrôle → 3 Validé]`)
  }

  console.log(`\n--- Proposed change: UPDATE ${affected.length} roll(s)  SET IDetat_stock_fini = 3 ---`)
  console.log('IDs:', affected.map((a) => a.IDstock_fini).join(','))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
