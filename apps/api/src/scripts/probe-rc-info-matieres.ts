import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query } from '../lib/hfsql.js'

// Read-only probe for the Rapport de Contrôle + Info Matières builders.
// Walks the full chain for one formelle expedition (default 12162, the one
// matching the legacy sample PDFs) and logs the raw column keys of every
// table we plan to SELECT * from, so accented-key mangling and unknown
// columns (allongement tirelle? asso_fil_of.IDref_fil?) are settled before
// the builders are written.
// Usage: npx tsx src/scripts/probe-rc-info-matieres.ts [expId]

const EXP_ID = parseInt(process.argv[2] ?? '12162', 10)
const esc = (s: string) => String(s).replace(/'/g, "''")
const j = (r: unknown) => JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))
const ids = (rows: any[], key: string) => [...new Set(rows.map((r) => Number(r[key]) || 0).filter((n) => n > 0))]

function section(title: string) { console.log(`\n=== ${title} ===`) }
function logKeys(rows: any[]) { if (rows.length > 0) console.log('  keys:', Object.keys(rows[0]).join(', ')) }

async function main() {
  section(`expedition ${EXP_ID}`)
  const exp = await query<any>(
    `SELECT IDexpedition, IDsociete, IDcommande_client, IDadresse, IDtransporteur, DATE AS dexp, ` +
      `affiche_observations, est_facture, donation, IDcontact, inclureRapportQualite ` +
      `FROM expedition WHERE IDexpedition = ${EXP_ID} AND IDsociete = 1`,
  )
  if (exp.length === 0) { console.log('  NOT FOUND'); return }
  console.log(' ', j(exp[0]))
  const cmdId = Number(exp[0].IDcommande_client) || 0

  section('commande_client + client flag')
  const cmd = await query<any>(`SELECT IDcommande_client, numero, IDclient, ref_client FROM commande_client WHERE IDcommande_client = ${cmdId}`)
  console.log(' ', j(cmd[0]))
  const clientId = Number(cmd[0]?.IDclient) || 0
  const cli = await query<any>(`SELECT IDclient, nom, inclureRapportQualite FROM client WHERE IDclient = ${clientId}`)
  console.log(' ', j(cli[0]))

  section('lignes commande (TYPE aliased)')
  const lccs = await query<any>(
    `SELECT IDligne_commande_client, TYPE AS type_kind, IDreference, IDcolori, quantite, unite ` +
      `FROM ligne_commande_client WHERE IDcommande_client = ${cmdId} ORDER BY IDligne_commande_client`,
  )
  for (const l of lccs) console.log(' ', j(l))

  section('ligne_expedition')
  const les = await query<any>(`SELECT IDligne_expedition, IDligne_commande_client FROM ligne_expedition WHERE IDexpedition = ${EXP_ID}`)
  for (const l of les) console.log(' ', j(l))
  const leIds = ids(les, 'IDligne_expedition')
  if (leIds.length === 0) { console.log('  (no lines)'); return }

  section('stock_fini (shipped rolls)')
  const rolls = await query<any>(
    `SELECT IDstock_fini, numero, lot, poids, metrage, IDColoris, IDstock_ecru, IDref_fini, IDligne_expedition ` +
      `FROM stock_fini WHERE IDligne_expedition IN (${leIds.join(',')})`,
  )
  for (const r of rolls) console.log(' ', j(r))
  const refFiniIds = ids(rolls, 'IDref_fini')
  const lots = [...new Set(rolls.map((r) => String(r.lot ?? '').trim()).filter(Boolean))]
  const ecruIds = ids(rolls, 'IDstock_ecru')
  console.log('  distinct ref_fini:', refFiniIds.join(','), '· lots:', lots.join(','), '· stock_ecru:', ecruIds.join(','))

  if (refFiniIds.length > 0) {
    section('ref_fini tolerances (named ASCII columns)')
    const tol = await query<any>(
      `SELECT IDref_fini, reference, designation, laizeHT_Min, laizeHT_Moy, laizeHT_Max, ` +
        `laizeUtile_Min, laizeUtile_Moy, laizeUtile_Max, poids_Min, poids_Moy, poids_Max, ` +
        `allongementH_Min, allongementH_Moy, allongementH_Max, allongementL_Min, allongementL_Moy, allongementL_Max, ` +
        `stab_hauteur, stab_largeur, controle_sst_rendement, controle_sst_stab, controle_sst_allongement, avec_teinture ` +
        `FROM ref_fini WHERE IDref_fini IN (${refFiniIds.join(',')})`,
    )
    for (const r of tol) console.log(' ', j(r))
  }

  let suivi: any[] = []
  if (refFiniIds.length > 0 && lots.length > 0) {
    section('suivilot (SELECT * — check keys for accent mangling + allongement/tirelle columns)')
    suivi = await query<any>(
      `SELECT * FROM suivilot WHERE IDref_fini IN (${refFiniIds.join(',')}) AND lot IN (${lots.map((l) => `'${esc(l)}'`).join(',')})`,
    )
    logKeys(suivi)
    for (const r of suivi) console.log(' ', j(r).slice(0, 1200))
  }

  // ---------- Info Matières chain ----------
  const ennoCmdIds = ids(suivi, 'IDcommande_sous_traitant')
  const ennoSstIds = ids(suivi, 'IDsous_traitant')

  section('stock_ecru (SELECT * — check keys)')
  let ecrus: any[] = []
  if (ecruIds.length > 0) {
    ecrus = await query<any>(`SELECT * FROM stock_ecru WHERE IDstock_ecru IN (${ecruIds.join(',')})`)
    logKeys(ecrus)
    for (const r of ecrus) console.log(' ', j(r).slice(0, 1200))
  } else console.log('  (no stock_ecru links)')

  const affectIds = ids(ecrus, 'IDref_commande_affectation')
  const sourceIds = ids(ecrus, 'IDref_commande_source')
  const ofIds = ids(ecrus, 'IDordre_fabrication')
  console.log('  affectation lcsst ids:', affectIds.join(','), '· source lcsst ids:', sourceIds.join(','), '· OF ids:', ofIds.join(','))

  let tricoCmdIds: number[] = []
  const lcsstIds = [...new Set([...affectIds, ...sourceIds])]
  if (lcsstIds.length > 0) {
    section('ligne_commande_sous_traitant (affectation + source, TYPE aliased)')
    const lcssts = await query<any>(
      `SELECT IDligne_commande_sous_traitant, IDcommande_sous_traitant, TYPE AS type_kind, IDreference ` +
        `FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant IN (${lcsstIds.join(',')})`,
    )
    for (const r of lcssts) console.log(' ', j(r))
    tricoCmdIds = ids(lcssts, 'IDcommande_sous_traitant')
  }

  const allCmdSstIds = [...new Set([...ennoCmdIds, ...tricoCmdIds])]
  let cmdSsts: any[] = []
  if (allCmdSstIds.length > 0) {
    section('commande_sous_traitant (enno + trico)')
    cmdSsts = await query<any>(
      `SELECT IDcommande_sous_traitant, IDsous_traitant FROM commande_sous_traitant WHERE IDcommande_sous_traitant IN (${allCmdSstIds.join(',')})`,
    )
    for (const r of cmdSsts) console.log(' ', j(r))

    section('ged docs on those sst commandes (all type_docs, no blob)')
    const geds = await query<any>(
      `SELECT IDged, nom, IDcommande_sous_traitant, IDtype_doc, IDcommande_client, IDreference FROM ged WHERE IDcommande_sous_traitant IN (${allCmdSstIds.join(',')})`,
    )
    for (const r of geds) console.log(' ', j(r))
    if (geds.length === 0) console.log('  (none)')
  }

  const sstIds = [...new Set([...ennoSstIds, ...ids(cmdSsts, 'IDsous_traitant')])]
  if (sstIds.length > 0) {
    section('sous_traitant names + adresse pays')
    const ssts = await query<any>(`SELECT IDsous_traitant, nom FROM sous_traitant WHERE IDsous_traitant IN (${sstIds.join(',')})`)
    for (const r of ssts) console.log(' ', j(r))
    const adrs = await query<any>(`SELECT IDadresse, IDsous_traitant, nom, ville, pays FROM adresse WHERE IDsous_traitant IN (${sstIds.join(',')})`)
    for (const r of adrs) console.log(' ', j(r))
  }

  let assoRows: any[] = []
  if (ofIds.length > 0) {
    section('asso_fil_of (SELECT * — confirm IDref_fil column)')
    assoRows = await query<any>(`SELECT * FROM asso_fil_of WHERE IDordre_fabrication IN (${ofIds.join(',')})`)
    logKeys(assoRows)
    for (const r of assoRows) console.log(' ', j(r))
  } else console.log('\n(no OF → skipping fil chain)')

  const stockFilIds = ids(assoRows, 'IDstock_fil')
  let stockFils: any[] = []
  if (stockFilIds.length > 0) {
    // stock_fil: SELECT * silently returns 0 rows on Windows, and so does any
    // column list including certif_bio (!). Name ASCII columns, skip
    // certif_bio/certif_recyclé/terminé/controlé.
    section('stock_fil (named ASCII columns, certif_bio excluded)')
    stockFils = await query<any>(
      `SELECT IDstock_fil, IDref_fil, IDcolori_fil, IDfournisseur, lot, lot_frs, IDref_fil_commande FROM stock_fil WHERE IDstock_fil IN (${stockFilIds.join(',')})`,
    )
    for (const r of stockFils) console.log(' ', j(r))

    const filCmdLineIds = ids(stockFils, 'IDref_fil_commande')
    if (filCmdLineIds.length > 0) {
      section('ref_fil_commande → IDcommande_fil → ged type 6 (bl fournisseur)')
      const rfcmd = await query<any>(`SELECT IDref_fil_commande, IDcommande_fil, IDref_fil FROM ref_fil_commande WHERE IDref_fil_commande IN (${filCmdLineIds.join(',')})`)
      for (const r of rfcmd) console.log(' ', j(r))
      const cmdFilIds = ids(rfcmd, 'IDcommande_fil')
      if (cmdFilIds.length > 0) {
        const geds = await query<any>(`SELECT IDged, nom, IDtype_doc, IDreference FROM ged WHERE IDreference IN (${cmdFilIds.join(',')}) AND IDtype_doc = 6`)
        for (const r of geds) console.log(' ', j(r))
        if (geds.length === 0) console.log('  (no type-6 ged)')
      }
    }
  }

  const refFilIds = [...new Set([...ids(assoRows, 'IDref_fil'), ...ids(stockFils, 'IDref_fil')])]
  const frsIds = ids(stockFils, 'IDfournisseur')

  if (frsIds.length > 0) {
    section('fournisseur names + adresse pays')
    const frs = await query<any>(`SELECT IDfournisseur, nom FROM fournisseur WHERE IDfournisseur IN (${frsIds.join(',')})`)
    for (const r of frs) console.log(' ', j(r))
    const adrs = await query<any>(`SELECT IDadresse, IDfournisseur, nom, ville, pays FROM adresse WHERE IDfournisseur IN (${frsIds.join(',')})`)
    for (const r of adrs) console.log(' ', j(r))
  }

  if (refFilIds.length > 0) {
    section('ref_fil (SELECT * — check keys, read reference)')
    const refFils = await query<any>(`SELECT * FROM ref_fil WHERE IDref_fil IN (${refFilIds.join(',')})`)
    logKeys(refFils)
    for (const r of refFils) console.log(' ', j(r).slice(0, 1000))

    section('ref_fil_certif (SELECT * — check keys)')
    const rfc = await query<any>(`SELECT * FROM ref_fil_certif WHERE IDref_fil IN (${refFilIds.join(',')})`)
    logKeys(rfc)
    for (const r of rfc) console.log(' ', j(r))
    const certIds = ids(rfc, 'IDcertificat')
    if (certIds.length > 0) {
      section('certificat (no blob)')
      const certs = await query<any>(
        `SELECT IDcertificat, nom, numero_ref, debut_validite, date_expiration, IDfournisseur, IDsous_traitant, IDtype_doc FROM certificat WHERE IDcertificat IN (${certIds.join(',')})`,
      )
      for (const r of certs) console.log(' ', j(r))
    } else console.log('  (no ref_fil_certif rows)')

    section('origine_matiere (SELECT * — check keys)')
    const orig = await query<any>(`SELECT * FROM origine_matiere WHERE IDref_fil IN (${refFilIds.join(',')})`)
    logKeys(orig)
    for (const r of orig) console.log(' ', j(r))
    if (orig.length === 0) console.log('  (none)')
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
