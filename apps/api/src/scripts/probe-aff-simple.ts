import 'dotenv/config'
import { query, closeConnection } from '../lib/hfsql.js'

async function main() {
  try {
    // First, check ligne_commande_sous_traitant schema
    const lcst = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM ligne_commande_sous_traitant`)
    console.log('=== ligne_commande_sous_traitant columns ===')
    console.log(Object.keys(lcst[0]).join('\n'))

    // Check line 8520 details
    const line8520 = await query<Record<string, unknown>>(`SELECT * FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant = 8520`)
    console.log('\n=== Line 8520 all fields ===')
    if (line8520.length > 0) {
      for (const [k, v] of Object.entries(line8520[0])) {
        const display = v instanceof ArrayBuffer ? `<blob ${v.byteLength}b>` : v
        console.log(`${k.padEnd(35)} = ${display}`)
      }
    }
  } finally {
    await closeConnection()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
