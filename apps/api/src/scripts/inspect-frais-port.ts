// One-shot probe: where does "frais de port" live in the legacy schema?
// Dumps column keys of the candidate tables + sample values.
import { query } from '../lib/hfsql-auto.js'

async function dumpKeys(label: string, sql: string) {
  try {
    const r = (await query(sql)) as any[]
    if (r.length === 0) { console.log(`\n=== ${label}: no rows ===`); return }
    console.log(`\n=== ${label} ===`)
    console.log('keys:', Object.keys(r[0]).join(', '))
    for (const k of Object.keys(r[0])) {
      if (/port|frais|transport/i.test(k)) console.log(`  MATCH ${k} = ${JSON.stringify(r[0][k])}`)
    }
  } catch (e) {
    console.log(`\n=== ${label}: ERR ${(e as Error).message} ===`)
  }
}

async function main() {
  await dumpKeys('expedition', `SELECT TOP 1 * FROM expedition ORDER BY IDexpedition DESC`)
  await dumpKeys('commande_client', `SELECT TOP 1 * FROM commande_client ORDER BY IDcommande_client DESC`)
  await dumpKeys('facture_prov', `SELECT TOP 1 * FROM facture_prov ORDER BY IDfacture_prov DESC`)
  await dumpKeys('facture', `SELECT TOP 1 * FROM facture ORDER BY IDfacture DESC`)
  await dumpKeys('transporteur', `SELECT TOP 1 * FROM transporteur`)
  await dumpKeys('ligne_expedition', `SELECT TOP 1 * FROM ligne_expedition ORDER BY IDligne_expedition DESC`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
