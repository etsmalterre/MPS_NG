// Pattern-match line.prix vs ref_ecru.prix for tricoteur lines.
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  // 1) Candidate tariff tables
  console.log('=== candidate tariff tables ===')
  for (const t of [
    'tarif_tricot','tarif_tricotage','tarif_fil','tarif_fil_tricotage',
    'tarif_tricoteur','tarif_tricot_sst','tranche_tarif_tricotage','tranche_tarif_tricot',
    'tranche_tarif_fil','cout_tricotage','cout_tricot','cout_fil','tarif_sst',
  ]) {
    try {
      const r = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM ${t}`)
      console.log(`  ✓ ${t}: cols=${r.length === 0 ? '(empty)' : Object.keys(r[0]).join(', ')}`)
      if (r.length > 0) console.log('    sample:', r[0])
    } catch {}
  }

  // 2) ref_ecru extended cols (production-related)
  console.log('\n=== ref_ecru 146 production cols ===')
  const e = await query<Record<string, unknown>>(
    `SELECT IDref_ecru, reference, prix, poids, nb_chutes, nb_aiguilles, vitesse_cible, rendement, poids_m2_tbm, Jauge, lfa_tour_1, lfa_tour_2, lfa_tour_3, lfa_tour_4
     FROM ref_ecru WHERE IDref_ecru = 146`,
  )
  console.log(e)

  // 3) sample tricoteur lines vs floor
  console.log('\n=== 30 recent tricoteur lines: line.prix vs ref_ecru.prix ===')
  const lines = await query<{
    line_id: number; cmd_id: number; sst: number; ref_id: number;
    line_prix: number | null; line_qte: number | null;
  }>(
    `SELECT TOP 40 lcs.IDligne_commande_sous_traitant AS line_id,
            lcs.IDcommande_sous_traitant AS cmd_id,
            cst.IDsous_traitant AS sst,
            lcs.IDreference AS ref_id,
            lcs.prix AS line_prix,
            lcs.quantite AS line_qte
     FROM ligne_commande_sous_traitant lcs
     JOIN commande_sous_traitant cst ON cst.IDcommande_sous_traitant = lcs.IDcommande_sous_traitant
     WHERE lcs.type = 1 AND lcs.prix > 0
     ORDER BY lcs.IDligne_commande_sous_traitant DESC`,
  )
  let eq=0, gt=0, lt=0
  const stCounts = new Map<number, number>()
  for (const l of lines) {
    const ref = await query<{ prix: number | null }>(`SELECT prix FROM ref_ecru WHERE IDref_ecru = ${l.ref_id}`)
    const refPrix = Number(ref[0]?.prix) || 0
    const linePrix = Number(l.line_prix) || 0
    const delta = linePrix - refPrix
    const cmp = Math.abs(delta) < 0.001 ? 'EQ' : delta > 0 ? 'GT' : 'LT'
    if (cmp === 'EQ') eq++; else if (cmp === 'GT') gt++; else lt++
    stCounts.set(Number(l.sst), (stCounts.get(Number(l.sst)) ?? 0) + 1)
    if (lines.indexOf(l) < 15) console.log(`  line ${l.line_id} sst=${l.sst} ref=${l.ref_id} line.prix=${linePrix.toFixed(2)} ref_ecru.prix=${refPrix.toFixed(2)} ${cmp}${cmp!=='EQ' ? ` Δ=${delta.toFixed(2)}` : ''}`)
  }
  console.log(`\n  summary: EQ=${eq} GT=${gt} LT=${lt} (out of ${lines.length})`)
  console.log('  sst distribution:', Object.fromEntries(stCounts))

  // 4) ligne_commande_client TRM-mirror prix vs ref_ecru.prix (sister side)
  console.log('\n=== 15 recent TRM ligne_commande_client TYPE=1 prix ===')
  const cc = await query<{ id: number; cc: number; etm: number; ref_id: number; prix: number | null }>(
    `SELECT TOP 20 IDligne_commande_client AS id, IDcommande_client AS cc,
            IDligne_commande_ETM AS etm, IDreference AS ref_id, prix
     FROM ligne_commande_client
     WHERE TYPE = 1 AND IDligne_commande_ETM > 0 AND prix > 0
     ORDER BY IDligne_commande_client DESC`,
  )
  for (const r of cc) {
    const ref = await query<{ prix: number | null }>(`SELECT prix FROM ref_ecru WHERE IDref_ecru = ${r.ref_id}`)
    const refPrix = Number(ref[0]?.prix) || 0
    const linePrix = Number(r.prix) || 0
    const delta = linePrix - refPrix
    console.log(`  cc_line ${r.id} (sst line ${r.etm}) ref=${r.ref_id} cc.prix=${linePrix.toFixed(2)} ref_ecru.prix=${refPrix.toFixed(2)} Δ=${delta.toFixed(2)}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
