// Among recent factures: count distinct Avis (expeditions) + distinct
// N/Commande per facture vs number of "Frais de port"-like lines, to learn
// the legacy charging rule (per expedition / per commande / per facture).
import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  const rows = (await query(
    `SELECT TOP 3000 IDligne_facture, IDfacture, designation, prix
     FROM ligne_facture ORDER BY IDligne_facture DESC`,
  )) as any[]
  const fixed = await fixEncoding(rows, 'ligne_facture', 'IDligne_facture', ['designation'])
  const byFac = new Map<number, { avis: Set<string>; cmds: Set<string>; portLines: number; portTotal: number }>()
  for (const r of fixed as any[]) {
    const fac = Number(r.IDfacture)
    const acc = byFac.get(fac) ?? { avis: new Set<string>(), cmds: new Set<string>(), portLines: 0, portTotal: 0 }
    const d = String(r.designation ?? '')
    const avisM = d.match(/Avis\s*:\s*(\d+)/i)
    if (avisM) acc.avis.add(avisM[1])
    const cmdM = d.match(/N\/Commande\s*:\s*(\d+)/i)
    if (cmdM) acc.cmds.add(cmdM[1])
    if (/^\s*(frais de )?port\s*$/i.test(d)) { acc.portLines++; acc.portTotal += Number(r.prix) || 0 }
    byFac.set(fac, acc)
  }
  let multi = 0
  for (const [fac, a] of byFac) {
    if (a.portLines > 0 && (a.avis.size > 1 || a.cmds.size > 1)) {
      multi++
      console.log(`fac=${fac} avis=${a.avis.size} cmds=${a.cmds.size} portLines=${a.portLines} portTotal=${a.portTotal}`)
    }
  }
  console.log(`\n${multi} factures with port lines AND multiple avis/commandes (of ${byFac.size} factures scanned)`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
