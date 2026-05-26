import dotenv from 'dotenv'
const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: `.env.${env}` })
dotenv.config({ path: '.env' })
import { query, fixEncoding, closeConnection } from '../lib/hfsql-auto.js'

const IDS = [8743, 8721, 8692, 8686, 8685, 12, 8767]

async function main() {
  const cnt = await query<any>(
    `SELECT COUNT(*) AS n FROM commande_sous_traitant WHERE journal LIKE '{\\rtf%'`,
  )
  console.log(`rows still RTF-wrapped: ${cnt[0]?.n}`)

  const cntPlain = await query<any>(
    `SELECT COUNT(*) AS n FROM commande_sous_traitant WHERE journal IS NOT NULL AND LEN(journal) > 0`,
  )
  console.log(`rows with non-empty journal: ${cntPlain[0]?.n}`)

  for (const id of IDS) {
    const rows = await query<any>(
      `SELECT IDcommande_sous_traitant, journal FROM commande_sous_traitant WHERE IDcommande_sous_traitant = ${id}`,
    )
    const fixed = await fixEncoding(rows as any[], 'commande_sous_traitant', 'IDcommande_sous_traitant', ['journal'])
    const j = (fixed[0] as any)?.journal
    // Write hex too so my console codepage isn't hiding bytes
    const hex = Buffer.from(String(j ?? ''), 'utf8').toString('hex')
    console.log(`id=${id}`)
    console.log(`  text: ${JSON.stringify(String(j ?? '').slice(0, 200))}`)
    console.log(`  hex:  ${hex.slice(0, 120)}…`)
  }
  await closeConnection()
}

main().catch(async (e) => { console.error(e); await closeConnection().catch(() => {}); process.exit(1) })
