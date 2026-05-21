// Verify the bridge now fires ONLY for IDsous_traitant=1 (Tricotage Malterre).
// Tests both branches: TRM commande creates a mirror, non-TRM tricoteur does NOT.
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

const API = 'http://localhost:3002/api'

async function http(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed: any
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
  return { status: res.status, body: parsed }
}

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

async function main() {
  // 1. External tricoteur (JERSEY DE LA BUCHE, IDsous_traitant=37) — must NOT mirror.
  console.log('--- External tricoteur (JERSEY DE LA BUCHE, IDsous_traitant=37) ---')
  const ext = await http('POST', '/commandes-sous-traitant', {
    IDsous_traitant: 37,
    date_commande: '20260520',
    IDadresse_sous_traitant: 0,
    IDadresse_livraison: 0,
  })
  assert(ext.status === 201, `POST returned ${ext.status}`)
  const extSstId = ext.body.IDcommande_sous_traitant
  console.log(`  new sst id: ${extSstId}, mirror_status: ${ext.body.mirror_status}`)
  assert(ext.body.mirror_status === undefined, 'no mirror_status (external tricoteur)')
  const extMirror = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM commande_client WHERE IDcommande_ETM = ${extSstId}`)
  assert(Number(extMirror[0].n) === 0, 'NO cc mirror for external tricoteur')
  // Cleanup the test row
  await http('DELETE', `/commandes-sous-traitant/${extSstId}`)

  // 2. Tricotage Malterre (IDsous_traitant=1) — MUST mirror.
  console.log('\n--- Sister knitter (Tricotage Malterre, IDsous_traitant=1) ---')
  const trm = await http('POST', '/commandes-sous-traitant', {
    IDsous_traitant: 1,
    date_commande: '20260520',
    IDadresse_sous_traitant: 777,
    IDadresse_livraison: 777,
  })
  assert(trm.status === 201, `POST returned ${trm.status}`)
  const trmSstId = trm.body.IDcommande_sous_traitant
  console.log(`  new sst id: ${trmSstId}, mirror_status: ${trm.body.mirror_status}`)
  assert(trm.body.mirror_status === 'created', 'mirror_status=created for TRM')
  const trmMirror = await query<{ IDcommande_client: number }>(`SELECT IDcommande_client FROM commande_client WHERE IDcommande_ETM = ${trmSstId}`)
  assert(trmMirror.length === 1, 'cc mirror created for TRM')
  // Cleanup
  const ccId = Number(trmMirror[0].IDcommande_client)
  await query(`DELETE FROM commande_client WHERE IDcommande_client = ${ccId}`)
  await http('DELETE', `/commandes-sous-traitant/${trmSstId}`)

  console.log('\n✅ Gate verified — bridge fires for TRM only')
}

main().catch((e) => { console.error(e); process.exit(1) })
