import 'dotenv/config'
import { queryRaw, closeConnection } from '../lib/hfsql.js'

async function main() {
  try {
    const rows = await queryRaw(`SELECT TOP 1 * FROM stock_fil`)
    if (rows.length > 0) {
      console.log('stock_fil columns (raw keys):')
      for (const key of Object.keys(rows[0])) {
        console.log(`  "${key}"`)
      }
      
      console.log('\nSample row data:')
      const row = rows[0]
      for (const [k, v] of Object.entries(row)) {
        const display = v instanceof ArrayBuffer ? `<ArrayBuffer ${v.byteLength}b>` : v
        console.log(`  ${k} = ${display}`)
      }
    }
  } finally {
    await closeConnection()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
