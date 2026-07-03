// Probe 4: full detail of every tricoteur line reserving yarn lots 1752/1646 —
// reverse-engineer legacy "Stock de fil disponible" (coton target 3322.29 of
// 5736.53; élasthanne target 307.65 of 568.75).
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  for (const lotId of [1752, 1646]) {
    console.log(`\n===== stock_fil lot ${lotId} =====`)
    const asso = await query<any>(
      `SELECT IDasso_fil_ligneCmdSST AS aid, IDligne_commande_sous_traitant AS lid, quantite
         FROM asso_fil_lignecmdsst WHERE IDstock_fil = ${lotId}`,
    )
    for (const a of asso) {
      const lid = Number(a.lid)
      const lcs = await query<any>(
        `SELECT lcs.IDcommande_sous_traitant AS cid, lcs.IDreference AS ref, lcs.IDColoris AS col,
                lcs.quantite AS q, lcs.sstatut AS st, lcs.type AS type_kind, cst.est_soldee AS sold
           FROM ligne_commande_sous_traitant lcs
           JOIN commande_sous_traitant cst ON cst.IDcommande_sous_traitant = lcs.IDcommande_sous_traitant
          WHERE lcs.IDligne_commande_sous_traitant = ${lid}`,
      )
      const l = lcs[0] ?? {}
      const prod = await query<any>(
        `SELECT COUNT(*) AS n, SUM(poids) AS kg FROM stock_ecru WHERE IDref_commande_source = ${lid}`,
      )
      console.log(
        `asso ${a.aid}: lcs=${lid} resa=${Number(a.quantite).toFixed(2)} | cst=${l.cid} ref_ecru=${l.ref} col=${l.col} q=${l.q} st=${l.st} soldee=${l.sold} | produced=${Number(prod[0]?.kg ?? 0).toFixed(2)} kg (${prod[0]?.n} rolls)`,
      )
    }
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
