// Probe for any history / audit / journal tables in HFSQL beyond
// envoi_email + debug_log. The user wants to plan a "Historique" tab on
// the sous-traitant detail screen.
import { query } from '../lib/hfsql-auto.js'

async function probeTable(name: string) {
  try {
    const rows = (await query(`SELECT TOP 1 * FROM ${name}`)) as any[]
    const cols = rows.length > 0 ? Object.keys(rows[0]) : []
    const total = (await query(`SELECT COUNT(*) AS n FROM ${name}`)) as any[]
    console.log(`  ✓ ${name}: ${total[0]?.n} rows; columns: ${cols.join(', ')}`)
  } catch (_e) {
    console.log(`  ✗ (no table named "${name}")`)
  }
}

async function main() {
  console.log('\n=== History / audit table probe ===')
  const candidates = [
    'envoi_email', 'envoi_mail', 'log', 'logs', 'log_action', 'log_actions',
    'debug_log', 'audit', 'audit_log', 'historique', 'history', 'journal',
    'journal_commande', 'evenement', 'evenement_commande', 'event_log',
    'action_log', 'historique_commande', 'commande_log', 'log_commande',
  ]
  for (const t of candidates) await probeTable(t)

  // For the existing envoi_email table — dump TYPE_DOC distribution to
  // confirm what's already being tracked.
  console.log('\n=== envoi_email IDtype_doc distribution ===')
  const dist = (await query(
    `SELECT IDtype_doc, COUNT(*) AS n FROM envoi_email GROUP BY IDtype_doc ORDER BY n DESC`,
  )) as any[]
  for (const r of dist) console.log('  ', JSON.stringify(r))

  // Look at envoi_email rows for a known sst commande to see the shape.
  console.log('\n=== envoi_email rows for commande_sous_traitant ID 8518 ===')
  const rows = (await query(
    `SELECT TOP 10 IDenvoi_email, DATE, adresse, IDreference, IDtype_doc, notes
     FROM envoi_email
     WHERE IDreference = 8518
     ORDER BY DATE DESC`,
  )) as any[]
  for (const r of rows) console.log('  ', JSON.stringify(r))

  // The commande_sous_traitant.journal column is a free-text RTF blob —
  // confirm it's still in play and what it typically looks like.
  console.log('\n=== commande_sous_traitant.journal samples (non-empty) ===')
  const journals = (await query(
    `SELECT TOP 3 IDcommande_sous_traitant, journal FROM commande_sous_traitant
     WHERE journal <> '' AND journal IS NOT NULL`,
  )) as any[]
  for (const r of journals) {
    const j = String(r.journal ?? '').slice(0, 200).replace(/\s+/g, ' ')
    console.log(`  ID ${r.IDcommande_sous_traitant}: ${j}…`)
  }

  // Look at type_doc lookup if it exists (gives labels for IDtype_doc).
  console.log('\n=== type_doc lookup (if exists) ===')
  await probeTable('type_doc')
  try {
    const tdRows = (await query(`SELECT * FROM type_doc ORDER BY IDtype_doc`)) as any[]
    for (const r of tdRows.slice(0, 30)) console.log('  ', JSON.stringify(r))
  } catch (_e) { /* swallow */ }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
