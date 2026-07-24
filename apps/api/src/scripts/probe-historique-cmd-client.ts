// Probe: why doesn't the confirmation-de-commande send show in the
// commande-client Historique tab? Check what envoi_email actually holds
// for IDtype_doc=7 and replay the exact historique SELECT.
import { query } from '../lib/hfsql-auto.js'

async function main() {
  console.log('\n=== Last 15 envoi_email rows with IDtype_doc = 7 ===')
  try {
    const rows = (await query(
      `SELECT TOP 15 IDenvoi_email, DATE, adresse, IDreference, notes, IDtype_doc FROM envoi_email WHERE IDtype_doc = 7 ORDER BY IDenvoi_email DESC`,
    )) as any[]
    console.log(`  count=${rows.length}`)
    for (const r of rows) console.log('  ', JSON.stringify(r))
  } catch (e) { console.log('  ERR:', (e as Error).message) }

  console.log('\n=== Last 15 envoi_email rows overall (any type) ===')
  try {
    const rows = (await query(
      `SELECT TOP 15 IDenvoi_email, DATE, adresse, IDreference, notes, IDtype_doc FROM envoi_email ORDER BY IDenvoi_email DESC`,
    )) as any[]
    for (const r of rows) console.log('  ', JSON.stringify(r))
  } catch (e) { console.log('  ERR:', (e as Error).message) }

  const testId = Number(process.argv[2] ?? 0)
  if (testId > 0) {
    console.log(`\n=== Historique SELECT replay for commande ${testId} ===`)
    try {
      const rows = (await query(
        `SELECT adresse, DATE, notes FROM envoi_email WHERE IDreference = ${testId} AND IDtype_doc = 7`,
      )) as any[]
      console.log(`  count=${rows.length}`)
      for (const r of rows) console.log('  ', JSON.stringify(r))
    } catch (e) { console.log('  ERR:', (e as Error).message) }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
