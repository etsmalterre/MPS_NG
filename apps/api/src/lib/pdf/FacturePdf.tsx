// PDF document for a client invoice ("Facture") or credit note ("Avoir"),
// rendered inside the shared MalterreDocument frame. Mirrors CommandeClientPdf
// but for the facture/ligne_facture model: a header with the client billing
// address + payment terms (N° TVA, mode de paiement, échéance), a lines table
// (free-text désignation · qté+unité · prix u. · montant), and a totals block
// (HT, TVA, TTC). An Avoir uses the same layout — only the document title and
// reference change; amounts are shown positive (the "AVOIR" heading conveys the
// credit nature, matching legacy practice).

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import {
  MalterreDocument,
  AddressCard,
  CreditCardIcon,
  CalendarIcon,
  MessageSquareIcon,
  type AddressBlockData,
} from './MalterreDocument.js'
import { colors, sizes } from './theme.js'

interface AddrLite {
  nom: string | null
  adresse1: string | null
  adresse2: string | null
  adresse3: string | null
  cp: string | null
  ville: string | null
  pays: string | null
}

export interface FacturePdfData {
  numero: string
  /** 1 = Facture, 2 = Avoir. */
  type: number
  /** "25 mars 2026" — long-form French. */
  dateFacture: string
  clientNom: string
  /** Client VAT number (free text on the invoice). */
  numTva: string | null
  adresseFacturation: AddrLite | null
  modePaiement: string | null
  echeance: string | null
  /** TVA rate as a percentage (e.g. 20). */
  tvaRate: number
  lignes: Array<{
    designation: string
    quantite: number
    unite: string
    prix: number
    montant: number
  }>
}

function fmtNum(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return ''
  return value
    .toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    .replace(/ | /g, ' ')
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', gap: 14, marginBottom: 16, alignItems: 'stretch' },
  topRowSlot: { flex: 1, flexDirection: 'column' },
  comboCard: {
    flexGrow: 1,
    backgroundColor: colors.bgCream,
    borderWidth: 0.75,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
    borderLeftStyle: 'solid',
    borderRadius: 6,
    padding: 14,
  },
  comboMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  comboMetaIconBox: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  comboMetaLabel: { fontSize: sizes.fontBase, color: colors.muted, fontWeight: 700, flex: 1 },
  comboMetaValue: { fontSize: sizes.fontBase, color: colors.text, fontWeight: 700, textAlign: 'right' },

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
  tableHeaderCell: { fontSize: sizes.fontSm, color: colors.text, fontWeight: 900, letterSpacing: 0.5 },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 0.75,
    borderBottomColor: '#EEEEEE',
    borderBottomStyle: 'solid',
    alignItems: 'flex-start',
  },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: 80, textAlign: 'right', paddingHorizontal: 4 },
  colPU: { width: 75, textAlign: 'right', paddingHorizontal: 4 },
  colMontant: { width: 85, textAlign: 'right', paddingHorizontal: 4 },
  cellBase: { fontSize: 11, color: colors.text },
  descLine: { fontSize: 11, color: colors.text, lineHeight: 1.35 },
  descFirst: { fontSize: 11.5, color: colors.primary, fontWeight: 700, lineHeight: 1.35 },

  totalsWrapper: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 0 },
  totals: {
    width: '52%',
    borderWidth: 0.75,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderRadius: 6,
    overflow: 'hidden',
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 14 },
  totalLabel: { fontSize: 11, color: colors.text, fontWeight: 700 },
  totalValue: { fontSize: 11, color: colors.text, textAlign: 'right' },
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
})

function buildClientAddress(data: FacturePdfData): AddressBlockData {
  const a = data.adresseFacturation
  const lines: string[] = []
  if (a) {
    if (a.nom && a.nom !== data.clientNom) lines.push(a.nom)
    if (a.adresse1) lines.push(a.adresse1)
    if (a.adresse2) lines.push(a.adresse2)
    if (a.adresse3) lines.push(a.adresse3)
    const cityLine = [a.cp, a.ville].filter(Boolean).join(' ')
    if (cityLine) lines.push(cityLine)
    if (a.pays) lines.push(a.pays)
  }
  return { title: 'Client', name: data.clientNom, lines, icon: 'user' }
}

export function FacturePdf({ data }: { data: FacturePdfData }) {
  const isAvoir = Number(data.type) === 2
  const docWord = isAvoir ? 'Avoir' : 'Facture'
  const clientAddress = buildClientAddress(data)

  const totalHT = data.lignes.reduce((s, l) => s + (Number(l.montant) || 0), 0)
  const tvaRate = Number(data.tvaRate) || 0
  const tva = totalHT * (tvaRate / 100)
  const ttc = totalHT + tva

  return (
    <MalterreDocument
      documentType={docWord}
      reference={`${docWord.toUpperCase()} N°${data.numero}`}
      documentDate={data.dateFacture || ''}
      title={`${docWord} ${data.numero}`}
    >
      <View style={styles.topRow}>
        <View style={styles.topRowSlot}>
          <AddressCard data={clientAddress} stretch />
        </View>
        <View style={styles.topRowSlot}>
          <View style={styles.comboCard}>
            {data.numTva ? (
              <View style={styles.comboMetaRow}>
                <View style={styles.comboMetaIconBox}><MessageSquareIcon /></View>
                <Text style={styles.comboMetaLabel}>N° TVA</Text>
                <Text style={styles.comboMetaValue}>{data.numTva}</Text>
              </View>
            ) : null}
            {data.modePaiement ? (
              <View style={styles.comboMetaRow}>
                <View style={styles.comboMetaIconBox}><CreditCardIcon /></View>
                <Text style={styles.comboMetaLabel}>Mode de paiement</Text>
                <Text style={styles.comboMetaValue}>{data.modePaiement}</Text>
              </View>
            ) : null}
            {data.echeance ? (
              <View style={styles.comboMetaRow}>
                <View style={styles.comboMetaIconBox}><CalendarIcon /></View>
                <Text style={styles.comboMetaLabel}>Échéance</Text>
                <Text style={styles.comboMetaValue}>{data.echeance}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeader} fixed>
          <Text style={[styles.tableHeaderCell, styles.colDesc]}>DÉSIGNATION</Text>
          <Text style={[styles.tableHeaderCell, styles.colQty]}>QTÉ</Text>
          <Text style={[styles.tableHeaderCell, styles.colPU]}>PRIX U.</Text>
          <Text style={[styles.tableHeaderCell, styles.colMontant]}>MONTANT</Text>
        </View>
        {data.lignes.map((l, i) => {
          const descLines = String(l.designation || '').split(/\r?\n/).filter((s) => s.length > 0)
          return (
            <View key={i} style={styles.tableRow}>
              <View style={styles.colDesc}>
                {descLines.length === 0 ? (
                  <Text style={styles.descFirst}>—</Text>
                ) : descLines.map((dl, j) => (
                  <Text key={j} style={j === 0 ? styles.descFirst : styles.descLine}>{dl}</Text>
                ))}
              </View>
              <Text style={[styles.cellBase, styles.colQty]}>
                {fmtNum(l.quantite, 1)}{l.unite ? ` ${l.unite}` : ''}
              </Text>
              <Text style={[styles.cellBase, styles.colPU]}>{`${fmtNum(l.prix, 2)} €`}</Text>
              <Text style={[styles.cellBase, styles.colMontant]}>{`${fmtNum(l.montant, 2)} €`}</Text>
            </View>
          )
        })}
      </View>

      <View style={styles.totalsWrapper} wrap={false}>
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total HT</Text>
            <Text style={styles.totalValue}>{`${fmtNum(totalHT, 2)} €`}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{`TVA (${fmtNum(tvaRate, tvaRate % 1 === 0 ? 0 : 1)} %)`}</Text>
            <Text style={styles.totalValue}>{`${fmtNum(tva, 2)} €`}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>{isAvoir ? 'TOTAL AVOIR TTC' : 'TOTAL TTC'}</Text>
            <Text style={styles.grandValue}>{`${fmtNum(ttc, 2)} €`}</Text>
          </View>
        </View>
      </View>
    </MalterreDocument>
  )
}
