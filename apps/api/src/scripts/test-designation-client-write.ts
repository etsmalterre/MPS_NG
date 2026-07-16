// Throwaway write-cycle test for the ref-settings feature (local dev DB):
//   positional INSERT into designation_client + ref_client_colori with explicit
//   max+1 PK, read-back, then DELETE. Uses IDclient=999999 so nothing real shows it.
import { query } from '../lib/hfsql-auto.js'

const TEST_CLIENT = 999999

async function main() {
  // 1. designation_client positional insert
  const maxD = (await query(`SELECT MAX(IDdesignation_client) AS m FROM designation_client`)) as any[]
  const newDid = Number(maxD[0]?.m ?? 0) + 1
  console.log('next IDdesignation_client:', newDid)
  const now = '2026-07-16 11:00:00'
  // physical order: IDclient, IDdesignation_client, designation, IDref_fini, IDref_ecru,
  //                 archivé, date_modification, associee, caché, soumettre, unite, fil_non_facturé
  await query(
    `INSERT INTO designation_client VALUES (${TEST_CLIENT}, ${newDid}, 'TEST_REF_DELETE_ME', 1388, 0, 0, '${now}', '', 0, 1, 3, '10,15')`,
  )
  const back = (await query(`SELECT * FROM designation_client WHERE IDdesignation_client = ${newDid}`)) as any[]
  console.log('read-back:', JSON.stringify(back[0]))

  // 2. ASCII-only UPDATE (designation, soumettre, unite, date_modification)
  await query(`UPDATE designation_client SET designation = 'TEST_REF_UPD', soumettre = 0, unite = 1, date_modification = '2026-07-16 11:05:00' WHERE IDdesignation_client = ${newDid}`)
  const back2 = (await query(`SELECT * FROM designation_client WHERE IDdesignation_client = ${newDid}`)) as any[]
  console.log('after update:', JSON.stringify(back2[0]))

  // 3. ref_client_colori positional insert
  const maxR = (await query(`SELECT MAX(IDref_client_colori) AS m FROM ref_client_colori`)) as any[]
  const newRcc = Number(maxR[0]?.m ?? 0) + 1
  console.log('next IDref_client_colori:', newRcc)
  // physical order: IDref_client_colori, IDdesignation_client, IDref_fini_colori, IDcolori_ecru,
  //                 lst_tranche, contrat, IDphoto_produit, archivé, prevision
  await query(
    `INSERT INTO ref_client_colori VALUES (${newRcc}, ${newDid}, 2873, 0, '0,1,2,3,4,5,6,7,8', 0, 0, 0, 0)`,
  )
  const rccBack = (await query(`SELECT * FROM ref_client_colori WHERE IDref_client_colori = ${newRcc}`)) as any[]
  console.log('rcc read-back:', JSON.stringify(rccBack[0]))

  // 4. cleanup
  await query(`DELETE FROM ref_client_colori WHERE IDref_client_colori = ${newRcc}`)
  await query(`DELETE FROM designation_client WHERE IDdesignation_client = ${newDid}`)
  const gone = (await query(`SELECT * FROM designation_client WHERE IDdesignation_client = ${newDid}`)) as any[]
  console.log('cleanup ok:', gone.length === 0)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
