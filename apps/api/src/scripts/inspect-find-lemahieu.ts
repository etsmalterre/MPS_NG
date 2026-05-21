import { query } from '../lib/hfsql-auto.js'

async function main() {
  console.log('\n=== entreprise rows where nom LIKE %LEMAHIEU% ===')
  const r = await query(`SELECT IDentreprise, nom FROM entreprise WHERE nom LIKE '%LEMAHIEU%'`) as any[]
  console.log(r)

  console.log('\n=== client rows where nom LIKE %LEMAHIEU% ===')
  try {
    const c = await query(`SELECT TOP 5 * FROM client WHERE nom LIKE '%LEMAHIEU%'`) as any[]
    console.log(c)
  } catch (e) { console.log('client err:', (e as Error).message) }

  // Also: what are the columns on the `client` table?
  console.log('\n=== client table — TOP 1 columns ===')
  try {
    const c = await query(`SELECT TOP 1 * FROM client`) as any[]
    if (c.length > 0) console.log('keys:', Object.keys(c[0]))
  } catch (e) { console.log('client cols err:', (e as Error).message) }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
