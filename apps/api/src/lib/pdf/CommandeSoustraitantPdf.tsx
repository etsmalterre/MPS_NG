// PDF document for a "Bon de commande sous-traitant" (subcontractor order).
// Mirrors the shape of CommandeFournisseurPdf but adapted for sous-traitant
// orders:
//   - top-right card uses delai-livraison (no mode_paiement / echeance)
//   - per-line "Délai initial: …" subscript when the line has been
//     rescheduled (date_delai differs from date_livraison)
//   - "Adresse de Livraison" pinned just above the footer (same as
//     fournisseur)

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import {
  MalterreDocument,
  AddressCard,
  MessageSquareIcon,
  type AddressBlockData,
  type MetadataCardData,
} from './MalterreDocument.js'
import { colors, sizes, company } from './theme.js'

// Input shape

export interface CommandeSoustraitantPdfData {
  numero: string
  /** "14 avril 2026" - long-form French */
  dateCommande: string
  sousTraitantNom: string
  sousTraitantAdresse: {
    nom: string | null
    adresse1: string | null
    adresse2: string | null
    adresse3: string | null
    cp: string | null
    ville: string | null
    pays: string | null
  } | null
  adresseLivraison: {
    nom: string | null
    adresse1: string | null
    cp: string | null
    ville: string | null
    pays: string | null
  } | null
  /** Earliest delivery date across all open lines (long-form French) */
  delaiLivraison: string | null
  commentaire: string | null
  lignes: Array<{
    ref_label: string | null
    colori_reference: string | null
    /** Nominal quantity, in Ml (mètre linéaire). User-entered projection. */
    quantite: number | null
    /** Price per kg of finished fabric. User-entered projection. */
    prix: number | null
    /** Sum of attached écru rolls' weight, in kg. Drives the line € total
     *  (kg × prix) — bon de commande shows blank totals when no rolls are
     *  attached yet, since Ml × €/Kg is unitless garbage. */
    total_kg_ecru_lie: number
    /** Current agreed delivery (dd/mm/yyyy or null) */
    date_livraison: string | null
    /** Original delivery (dd/mm/yyyy) only when it differs from date_livraison */
    date_delai: string | null
  }>
}

// French number formatting
function fmtNum(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return ''
  return value
    .toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    .replace(/ | /g, ' ')
}

// Styles

const styles = StyleSheet.create({
  table: {
    marginBottom: 8,
    borderWidth: 0.75,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.bgMuted,
    borderBottomWidth: 2,
    borderBottomColor: colors.gold,
    borderBottomStyle: 'solid',
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  tableHeaderCell: {
    fontSize: sizes.fontSm,
    color: colors.text,
    fontWeight: 900,
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 0.75,
    borderBottomColor: '#EEEEEE',
    borderBottomStyle: 'solid',
    alignItems: 'flex-start',
  },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: 60, textAlign: 'center', paddingHorizontal: 4 },
  colPU: { width: 75, textAlign: 'right', paddingHorizontal: 4 },
  colTotal: { width: 90, textAlign: 'right' },

  cellBase: {
    fontSize: sizes.fontBase,
    color: colors.text,
  },
  refMain: {
    fontSize: sizes.fontBase,
    color: colors.text,
    fontWeight: 700,
  },
  descSub: {
    fontSize: sizes.fontXs,
    color: '#888888',
    marginTop: 2,
  },
  delaiInitial: {
    fontSize: sizes.fontXs,
    color: '#A87800',
    marginTop: 2,
    fontStyle: 'italic',
  },

  totalsWrapper: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 0,
  },
  totals: {
    width: '50%',
    borderWidth: 0.75,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderRadius: 6,
    overflow: 'hidden',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  totalLabel: { fontSize: sizes.fontBase, color: colors.text, fontWeight: 700 },
  totalValue: { fontSize: sizes.fontBase, color: colors.text, textAlign: 'right' },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 2,
    borderTopColor: colors.gold,
    borderTopStyle: 'solid',
    backgroundColor: colors.bgTotal,
  },
  grandLabel: { fontSize: sizes.fontLg, color: colors.primary, fontWeight: 900, letterSpacing: 0.4 },
  grandValue: { fontSize: sizes.fontLg, color: colors.primary, fontWeight: 900, textAlign: 'right' },

  bottomCardWrap: { flexShrink: 0, marginBottom: 10 },
  commentaireSpacer: { flexGrow: 1, minHeight: 24 },
  commentaireBox: {
    flexShrink: 0,
    padding: 14,
    backgroundColor: colors.bgCream,
    borderWidth: 0.75,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
    borderLeftStyle: 'solid',
    borderRadius: 6,
  },
  commentaireHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  commentaireTitle: {
    fontSize: sizes.fontXs,
    color: colors.primary,
    fontWeight: 900,
    letterSpacing: 0.5,
  },
  commentaireText: { fontSize: sizes.fontBase, color: colors.text, lineHeight: 1.45 },
})

function buildSousTraitantAddress(data: CommandeSoustraitantPdfData): AddressBlockData {
  const a = data.sousTraitantAdresse
  const lines: string[] = []
  if (a) {
    if (a.nom && a.nom !== data.sousTraitantNom) lines.push(a.nom)
    if (a.adresse1) lines.push(a.adresse1)
    if (a.adresse2) lines.push(a.adresse2)
    if (a.adresse3) lines.push(a.adresse3)
    const cityLine = [a.cp, a.ville].filter(Boolean).join(' ')
    if (cityLine) lines.push(cityLine)
    if (a.pays) lines.push(a.pays)
  }
  return {
    title: 'Sous-traitant',
    name: data.sousTraitantNom,
    lines,
    icon: 'factory',
  }
}

function buildLivraisonAddress(data: CommandeSoustraitantPdfData): AddressBlockData {
  const a = data.adresseLivraison
  const lines: string[] = []
  if (a) {
    if (a.adresse1) lines.push(a.adresse1)
    const cityLine = [a.cp, a.ville].filter(Boolean).join(' ')
    if (cityLine) lines.push(cityLine)
    if (a.pays) lines.push(a.pays)
  } else {
    lines.push(company.address1)
    lines.push(`${company.zip} ${company.city}`)
    lines.push(company.country)
  }
  return {
    title: 'Adresse de Livraison',
    name: a?.nom ?? company.legalName,
    lines,
    icon: 'truck',
  }
}

function buildDelaiInfo(data: CommandeSoustraitantPdfData): MetadataCardData {
  return {
    title: 'Conditions',
    items: [
      { icon: 'clock', label: 'Délai de livraison', value: data.delaiLivraison || '—' },
    ],
  }
}

export function CommandeSoustraitantPdf({ data }: { data: CommandeSoustraitantPdfData }) {
  const sousTraitantAddress = buildSousTraitantAddress(data)
  const livraisonAddress = buildLivraisonAddress(data)
  const delaiInfo = buildDelaiInfo(data)

  // Bon de commande totals: nominal Ml the ennoblisseur should produce,
  // and the actual € total computed from attached écru rolls' weight (if
  // any). The line-by-line "Total HT" column is omitted because Ml × €/Kg
  // is unitless garbage — the bill comes from the real shipped kg.
  const totalQte = data.lignes.reduce(
    (s, l) => s + (l.quantite != null ? Number(l.quantite) : 0),
    0,
  )
  const totalKgAffecte = data.lignes.reduce(
    (s, l) => s + (Number(l.total_kg_ecru_lie) || 0),
    0,
  )
  const totalEur = data.lignes.reduce(
    (s, l) => s + ((Number(l.total_kg_ecru_lie) || 0) * (Number(l.prix) || 0)),
    0,
  )

  return (
    <MalterreDocument
      documentType="Bon de commande sous-traitant"
      reference={`N°${data.numero}`}
      documentDate={data.dateCommande || ''}
      topLeftAddress={sousTraitantAddress}
      topRightInfo={delaiInfo}
      title={`Bon de commande sous-traitant ${data.numero}`}
    >
      <View style={styles.table}>
        <View style={styles.tableHeader} fixed>
          <Text style={[styles.tableHeaderCell, styles.colDesc]}>DÉSIGNATION (RÉFÉRENCE FINI / COLORIS)</Text>
          <Text style={[styles.tableHeaderCell, styles.colQty]}>QTÉ (Ml)</Text>
          <Text style={[styles.tableHeaderCell, styles.colPU]}>PRIX (€/Kg)</Text>
          <Text style={[styles.tableHeaderCell, styles.colTotal]}>POIDS AFFECTÉ</Text>
        </View>
        {data.lignes.map((l, i) => {
          const kg = Number(l.total_kg_ecru_lie) || 0
          return (
            <View key={i} style={styles.tableRow} wrap={false}>
              <View style={styles.colDesc}>
                <Text style={styles.refMain}>{l.ref_label || '—'}</Text>
                {l.colori_reference && <Text style={styles.descSub}>{l.colori_reference}</Text>}
                {l.date_delai && (
                  <Text style={styles.delaiInitial}>
                    Livraison: {l.date_livraison || '—'} (délai initial: {l.date_delai})
                  </Text>
                )}
                {!l.date_delai && l.date_livraison && (
                  <Text style={styles.descSub}>Livraison: {l.date_livraison}</Text>
                )}
              </View>
              <Text style={[styles.cellBase, styles.colQty]}>
                {l.quantite != null ? fmtNum(Number(l.quantite), 1) : '—'}
              </Text>
              <Text style={[styles.cellBase, styles.colPU]}>
                {l.prix != null ? `${fmtNum(Number(l.prix), 2)} €` : '—'}
              </Text>
              <Text style={[styles.cellBase, styles.colTotal]}>
                {kg > 0 ? `${fmtNum(kg, 1)} kg` : '—'}
              </Text>
            </View>
          )
        })}
      </View>

      <View style={styles.totalsWrapper} wrap={false}>
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Quantité prévue</Text>
            <Text style={styles.totalValue}>{fmtNum(totalQte, 1)} Ml</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Poids affecté</Text>
            <Text style={styles.totalValue}>
              {totalKgAffecte > 0 ? `${fmtNum(totalKgAffecte, 1)} kg` : '— (à expédier)'}
            </Text>
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>TOTAL HT</Text>
            <Text style={styles.grandValue}>
              {totalEur > 0 ? `${fmtNum(totalEur, 2)} €` : '—'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.commentaireSpacer} />

      <View style={styles.bottomCardWrap} wrap={false}>
        <AddressCard data={livraisonAddress} />
      </View>

      {data.commentaire && data.commentaire.trim() && (
        <View style={styles.commentaireBox} wrap={false}>
          <View style={styles.commentaireHeaderRow}>
            <MessageSquareIcon />
            <Text style={styles.commentaireTitle}>COMMENTAIRE</Text>
          </View>
          <Text style={styles.commentaireText}>{data.commentaire.trim()}</Text>
        </View>
      )}
    </MalterreDocument>
  )
}
