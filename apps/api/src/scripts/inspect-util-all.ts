import { query } from '../lib/hfsql-auto.js'

async function main() {
  const util = (await query('SELECT TOP 1 * FROM utilisateur')) as any[]
  if (util.length > 0) {
    console.log('All utilisateur columns:')
    console.log(Object.keys(util[0]))
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
