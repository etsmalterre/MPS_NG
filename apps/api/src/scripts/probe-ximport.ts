import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  // envoi_email rows for factures (type_doc 19): does IDreference align with
  // IDfacture (~5000s) or numero (~9000s)?
  const refs = await query<any>(`SELECT IDreference, COUNT(*) AS n FROM envoi_email WHERE IDtype_doc = 19 GROUP BY IDreference ORDER BY IDreference DESC`)
  console.log('type_doc 19 refs:', refs.length)
  console.log('top:', JSON.stringify(refs.slice(0, 12)))
  console.log('bottom:', JSON.stringify(refs.slice(-6)))

  const fRange = await query<any>(`SELECT MIN(IDfacture) AS lo, MAX(IDfacture) AS hi, MIN(numero) AS nlo, MAX(numero) AS nhi FROM facture WHERE IDsociete = 1`)
  console.log('facture ranges:', JSON.stringify(fRange))

  // How many recent definitive factures have a send logged?
  const recent = await query<any>(`SELECT TOP 30 IDfacture, numero FROM facture WHERE IDsociete = 1 ORDER BY IDfacture DESC`)
  const ids = recent.map((r: any) => Number(r.IDfacture))
  const nums = recent.map((r: any) => Number(r.numero))
  const byId = await query<any>(`SELECT DISTINCT IDreference FROM envoi_email WHERE IDtype_doc = 19 AND IDreference IN (${ids.join(',')})`)
  const byNum = await query<any>(`SELECT DISTINCT IDreference FROM envoi_email WHERE IDtype_doc = 19 AND IDreference IN (${nums.join(',')})`)
  console.log('recent 30: matched by IDfacture =', byId.length, '| matched by numero =', byNum.length)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
