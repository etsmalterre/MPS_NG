import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Probe rendement directly. If the column does not exist HFSQL
  //    throws and we'll see the precise error string. If it exists we
  //    print a couple of sample values.
  console.log('\n=== ref_fini.rendement probe ===')
  try {
    const r = await query(`SELECT TOP 5 IDref_fini, reference, rendement FROM ref_fini WHERE rendement IS NOT NULL`) as any[]
    console.log('OK — column exists. Sample rows:', r)
  } catch (e) {
    console.log('ERR:', (e as Error).message)
  }

  // 2) Also list all columns from one row so we see the actual catalog.
  console.log('\n=== ref_fini first row (all columns) ===')
  try {
    const r = await query(`SELECT TOP 1 * FROM ref_fini`) as any[]
    if (r.length > 0) console.log('keys:', Object.keys(r[0]))
  } catch (e) {
    console.log('ERR:', (e as Error).message)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
