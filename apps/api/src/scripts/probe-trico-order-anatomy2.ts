// Probe: yarn "En Commande" pending logic + fournisseur names for stock lots.
// Legacy modal shows: coton pending NAZAR 35000 (no délai) + Weber & Heusseur
// 10000 (13/04/2026); élasthanne Créora 400.
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  for (const [rf, cf] of [[5, 317], [8, 338]]) {
    console.log(`\n===== ref_fil_commande for fil ${rf}/${cf} =====`)
    const rows = await query<any>(
      `SELECT IDref_fil_commande AS id, IDcommande_fil AS cid, quantite, unite, date_livraison, etat, date_notif
         FROM ref_fil_commande WHERE IDref_fil = ${rf} AND IDcolori_fil = ${cf} ORDER BY IDref_fil_commande DESC LIMIT 12`,
    )
    for (const r of rows) {
      const c = await query<any>(
        `SELECT IDfournisseur, etat, date_commande FROM commande_fil WHERE IDcommande_fil = ${Number(r.cid)}`,
      )
      const f = c.length > 0 ? await query<any>(
        `SELECT nom FROM fournisseur WHERE IDfournisseur = ${Number(c[0].IDfournisseur)}`,
      ) : []
      // received lots pointing at this order line
      const recv = await query<any>(
        `SELECT COUNT(*) AS nb, SUM(stock_initial) AS kg FROM stock_fil WHERE IDref_fil_commande = ${Number(r.id)}`,
      )
      console.log(
        `line ${r.id}: q=${r.quantite} unite=${r.unite} dl=${r.date_livraison} etat=${r.etat} | cmd ${r.cid} etat=${c[0]?.etat} date=${c[0]?.date_commande} frs=${f[0]?.nom} | received: ${recv[0]?.nb} lots ${recv[0]?.kg ?? 0} kg`,
      )
    }
  }

  // fournisseur of stock lots 1752 / 1646
  for (const lotId of [1752, 1646]) {
    const l = await query<any>(
      `SELECT IDref_fil_commande, lot FROM stock_fil WHERE IDstock_fil = ${lotId}`,
    )
    const rfc = Number(l[0]?.IDref_fil_commande) || 0
    let frs = null
    if (rfc > 0) {
      const c = await query<any>(
        `SELECT cf.IDfournisseur FROM ref_fil_commande rfc
          JOIN commande_fil cf ON cf.IDcommande_fil = rfc.IDcommande_fil
         WHERE rfc.IDref_fil_commande = ${rfc}`,
      )
      if (c.length > 0) {
        const fr = await query<any>(`SELECT nom FROM fournisseur WHERE IDfournisseur = ${Number(c[0].IDfournisseur)}`)
        frs = fr[0]?.nom
      }
    }
    console.log(`\nlot ${lotId} (${l[0]?.lot}): IDref_fil_commande=${rfc} fournisseur=${frs}`)
  }

  // adresse 777 (TRM default address used by legacy modal creation)
  const a = await query<any>(`SELECT * FROM adresse WHERE IDadresse = 777`)
  console.log('\nadresse 777:', a[0])
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
