import { query } from '../lib/hfsql-auto.js'

async function main() {
  console.log('\n=== client 137 ===')
  try {
    const r = await query(`SELECT TOP 1 * FROM client WHERE IDclient = 137`) as any[]
    if (r.length === 0) console.log('no row in `client`')
    else {
      console.log('keys:', Object.keys(r[0]))
      for (const k of Object.keys(r[0])) {
        if (/nom|raison|entreprise|abreviation/i.test(k)) console.log(`  ${k} = ${r[0][k]}`)
      }
    }
  } catch (e) { console.log('client table err:', (e as Error).message) }

  console.log('\n=== fournisseur 137 (sanity) ===')
  try {
    const r = await query(`SELECT TOP 1 IDfournisseur, nom FROM fournisseur WHERE IDfournisseur = 137`) as any[]
    console.log(r)
  } catch (e) { console.log('fournisseur err:', (e as Error).message) }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
