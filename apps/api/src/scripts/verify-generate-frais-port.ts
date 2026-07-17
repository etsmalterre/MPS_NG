// End-to-end verification of the frais de port line in POST /prov/generate,
// against the LOCAL dev DB. Temporarily sets frais_port on one candidate
// commande, runs the generator through the API, asserts the port line, then
// deletes the generated proformas (restores est_facture) and resets frais_port.
import crypto from 'node:crypto'
import { query } from '../lib/hfsql-auto.js'

const SECRET = process.env.AUTH_COOKIE_SECRET ?? '0374c694f2c73619437d02a53ac73efdc3b7f11c10e2eb8760e771e12681589c'
const API = 'http://localhost:8080/api'
const CMD_ID = 6868 // client 22 (SIMONE PERELE), un-invoiced expedition 11682
const PORT_VALUE = 12.5

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function sign(id: number): string {
  return `${id}.${b64url(crypto.createHmac('sha256', SECRET).update(String(id)).digest())}`
}
const COOKIE = `mps_uid=${sign(1)}; mps_uid_admin=${sign(1)}`

async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE, ...(opts.headers ?? {}) },
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

let failures = 0
function check(label: string, cond: boolean, extra = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + extra}`)
  if (!cond) failures++
}

async function main() {
  const before = (await query<any>(`SELECT frais_port FROM commande_client WHERE IDcommande_client = ${CMD_ID}`))[0]
  console.log(`cmd ${CMD_ID} frais_port before: ${before?.frais_port}`)
  await query(`UPDATE commande_client SET frais_port = ${PORT_VALUE} WHERE IDcommande_client = ${CMD_ID}`)

  let generatedIds: number[] = []
  try {
    const gen = await api('/factures/prov/generate', { method: 'POST' })
    check('generate ok', gen.status === 200, JSON.stringify(gen.json))
    generatedIds = (gen.json?.created ?? []).map((c: any) => c.id)
    console.log('generated:', JSON.stringify(gen.json?.created))

    // The proforma for client 237 (cmd 6899) must carry the port line.
    let sawPort = false
    let sawPortElsewhere = false
    for (const id of generatedIds) {
      const d = await api(`/factures/prov/${id}`)
      const portLines = (d.json?.lignes ?? []).filter((l: any) => l.designation === 'Frais de port')
      if (d.json?.IDclient === 22) {
        check('client-22 proforma has exactly 1 port line', portLines.length === 1, JSON.stringify(d.json?.lignes))
        if (portLines.length === 1) {
          const p = portLines[0]
          check('port line qty=1 prix=12.5 stock_kind=divers',
            p.quantite === 1 && p.prix === PORT_VALUE && p.stock_kind === 'divers', JSON.stringify(p))
          sawPort = true
        }
        const artLines = (d.json?.lignes ?? []).filter((l: any) => l.designation !== 'Frais de port')
        check('article lines resolve to fini/ecru', artLines.length > 0 && artLines.every((l: any) => l.stock_kind === 'fini' || l.stock_kind === 'ecru'),
          JSON.stringify(artLines.map((l: any) => l.stock_kind)))
      } else {
        if (portLines.length > 0) sawPortElsewhere = true
      }
    }
    check('port line found on the flagged commande', sawPort)
    check('no port line on frais_port=0 proformas', !sawPortElsewhere)
  } finally {
    // Rollback: delete generated proformas (resets est_facture) + frais_port.
    if (generatedIds.length > 0) {
      const del = await api('/factures/prov/delete-batch', { method: 'POST', body: JSON.stringify({ ids: generatedIds }) })
      console.log('cleanup delete-batch:', JSON.stringify(del.json))
    }
    await query(`UPDATE commande_client SET frais_port = ${Number(before?.frais_port) || 0} WHERE IDcommande_client = ${CMD_ID}`)
    const after = (await query<any>(`SELECT frais_port FROM commande_client WHERE IDcommande_client = ${CMD_ID}`))[0]
    const exps = await query<any>(`SELECT IDexpedition, est_facture FROM expedition WHERE IDexpedition IN (11679, 11682)`)
    console.log(`restored frais_port: ${after?.frais_port}; expeditions:`, JSON.stringify(exps))
  }
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
