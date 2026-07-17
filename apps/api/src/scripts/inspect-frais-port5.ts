// Does the same commande get a "Frais de port" line on EVERY facture it
// appears on (partial shipments invoiced separately), or only the first?
import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  const rows = (await query(
    `SELECT TOP 6000 IDligne_facture, IDfacture, designation, prix
     FROM ligne_facture ORDER BY IDligne_facture DESC`,
  )) as any[]
  const fixed = await fixEncoding(rows, 'ligne_facture', 'IDligne_facture', ['designation'])
  const facCmds = new Map<number, Set<string>>()
  const facHasPort = new Map<number, number>()
  for (const r of fixed as any[]) {
    const fac = Number(r.IDfacture)
    const d = String(r.designation ?? '')
    const cmdM = d.match(/N\/Commande\s*:\s*(\d+)/i)
    if (cmdM) {
      const s = facCmds.get(fac) ?? new Set<string>()
      s.add(cmdM[1])
      facCmds.set(fac, s)
    }
    if (/^\s*(frais de )?port\s*$/i.test(d)) facHasPort.set(fac, (facHasPort.get(fac) ?? 0) + 1)
  }
  // commande → list of factures it appears on
  const cmdFacs = new Map<string, number[]>()
  for (const [fac, cmds] of facCmds) {
    for (const c of cmds) {
      const arr = cmdFacs.get(c) ?? []
      arr.push(fac)
      cmdFacs.set(c, arr)
    }
  }
  for (const [cmd, facs] of cmdFacs) {
    if (facs.length > 1) {
      const marks = facs.sort((a, b) => a - b).map((f) => `${f}${facHasPort.has(f) ? `(port×${facHasPort.get(f)})` : '(no port)'}`)
      console.log(`cmd ${cmd}: ${marks.join(', ')}`)
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
