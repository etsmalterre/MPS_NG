// Count proformas already marked converted (IDexpedition_divers > 0).
import { query } from '../lib/hfsql-auto.js'

async function main() {
  const rows = (await query(
    `SELECT IDfacture_prov, numero, IDclient, DATE, IDexpedition_divers FROM facture_prov WHERE IDsociete = 1`,
  )) as any[]
  const converted = rows.filter((r) => (Number(r.IDexpedition_divers) || 0) > 0)
  console.log(`total proformas: ${rows.length}, converted (marker set): ${converted.length}`)
  for (const r of converted) {
    console.log(`  prov=${r.IDfacture_prov} date=${r.DATE} client=${r.IDclient} -> facture ${r.IDexpedition_divers}`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
