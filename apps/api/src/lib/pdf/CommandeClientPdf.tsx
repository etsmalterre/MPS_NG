// PDF document for a client "Accusé de réception de commande" (order
// acknowledgement / bon de commande client). Renders inside the shared
// MalterreDocument frame. Single-flow (no page-2 stock section): a header with
// the client + billing/delivery addresses + payment terms, a lines table
// (ref/coloris · qté+unité · prix u. · montant · livraison), and a totals block
// (HT, remise, frais de port, TVA, TTC).

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import {
  MalterreDocument,
  AddressCard,
  CreditCardIcon,
  CalendarIcon,
  TruckIcon,
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

export interface CommandeClientPdfData {
  numero: string
  /** "25 mars 2026" — long-form French. */
  dateCommande: string
  clientNom: string
  refClient: string | null
  adresseFacturation: AddrLite | null
  adresseLivraison: AddrLite | null
  modePaiement: string | null
  echeance: string | null
  commentaire: string | null
  /** € discount applied to the HT subtotal. */
  remise: number
  /** € shipping cost added to the HT subtotal. */
  fraisPort: number
  /** TVA rate as a percentage (e.g. 20). */
  tvaRate: number
  lignes: Array<{
    ref_label: string | null
    colori_reference: string | null
    quantite: number
    unite_label: string
    prix: number
    montant: number
    /** dd/mm/yyyy or '' */
    date_livraison: string
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
  // Combo card (right slot): metadata rows + a divider + the livraison address.
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
  comboDivider: { height: 0.75, backgroundColor: colors.borderStrong, marginVertical: 10 },
  comboCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  comboCardTitle: { fontSize: sizes.fontXs, color: colors.primary, fontWeight: 900, letterSpacing: 0.5 },
  comboCardName: { fontSize: sizes.fontBase, fontWeight: 900, color: colors.text, marginBottom: 1 },
  comboCardLine: { fontSize: sizes.fontBase, color: colors.text, lineHeight: 1.4 },

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
  colQty: { width: 70, textAlign: 'right', paddingHorizontal: 4 },
  colPU: { width: 70, textAlign: 'right', paddingHorizontal: 4 },
  colMontant: { width: 80, textAlign: 'right', paddingHorizontal: 4 },
  colLiv: { width: 70, textAlign: 'right' },
  cellBase: { fontSize: 11, color: colors.text },
  refMainBig: { fontSize: 13, color: colors.primary, fontWeight: 900, letterSpacing: 0.2, lineHeight: 1.2 },
  coloriProminent: { fontSize: 10.5, color: colors.text, fontWeight: 700, marginTop: 3, lineHeight: 1.3 },

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

  commentaireBottom: { marginTop: 24 },
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
  commentaireHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  commentaireTitle: { fontSize: sizes.fontXs, color: colors.primary, fontWeight: 900, letterSpacing: 0.5 },
  commentaireText: { fontSize: sizes.fontBase, color: colors.text, lineHeight: 1.45 },
})

function buildClientAddress(data: CommandeClientPdfData): AddressBlockData {
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

function buildLivraisonLines(data: CommandeClientPdfData): { name: string; lines: string[] } {
  const a = data.adresseLivraison
  const lines: string[] = []
  let name = ''
  if (a) {
    name = a.nom ?? data.clientNom
    if (a.adresse1) lines.push(a.adresse1)
    if (a.adresse2) lines.push(a.adresse2)
    const cityLine = [a.cp, a.ville].filter(Boolean).join(' ')
    if (cityLine) lines.push(cityLine)
    if (a.pays) lines.push(a.pays)
  } else {
    name = data.clientNom
  }
  return { name, lines }
}

export function CommandeClientPdf({ data }: { data: CommandeClientPdfData }) {
  const clientAddress = buildClientAddress(data)
  const livraison = buildLivraisonLines(data)

  const totalHT = data.lignes.reduce((s, l) => s + (Number(l.montant) || 0), 0)
  const remise = Number(data.remise) || 0
  const fraisPort = Number(data.fraisPort) || 0
  const netHT = totalHT - remise + fraisPort
  const tvaRate = Number(data.tvaRate) || 0
  const tva = netHT * (tvaRate / 100)
  const ttc = netHT + tva

  return (
    <MalterreDocument
      documentType="Accusé de réception"
      reference={`COMMANDE N°${data.numero}`}
      documentDate={data.dateCommande || ''}
      title={`Accusé de réception commande ${data.numero}`}
    >
      {/* Top row: client (billing) on the left; a combo card on the right with
          payment terms + delivery address. */}
      <View style={styles.topRow}>
        <View style={styles.topRowSlot}>
          <AddressCard data={clientAddress} stretch />
        </View>
        <View style={styles.topRowSlot}>
          <View style={styles.comboCard}>
            {data.refClient ? (
              <View style={styles.comboMetaRow}>
                <View style={styles.comboMetaIconBox}><MessageSquareIcon /></View>
                <Text style={styles.comboMetaLabel}>Réf. client</Text>
                <Text style={styles.comboMetaValue}>{data.refClient}</Text>
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
            <View style={styles.comboDivider} />
            <View style={styles.comboCardHeader}>
              <TruckIcon />
              <Text style={styles.comboCardTitle}>ADRESSE DE LIVRAISON</Text>
            </View>
            {livraison.name ? <Text style={styles.comboCardName}>{livraison.name}</Text> : null}
            {livraison.lines.map((l, i) => (
              <Text key={i} style={styles.comboCardLine}>{l}</Text>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeader} fixed>
          <Text style={[styles.tableHeaderCell, styles.colDesc]}>DÉSIGNATION (RÉFÉRENCE / COLORIS)</Text>
          <Text style={[styles.tableHeaderCell, styles.colQty]}>QTÉ</Text>
          <Text style={[styles.tableHeaderCell, styles.colPU]}>PRIX U.</Text>
          <Text style={[styles.tableHeaderCell, styles.colMontant]}>MONTANT</Text>
          <Text style={[styles.tableHeaderCell, styles.colLiv]}>LIVRAISON</Text>
        </View>
        {data.lignes.map((l, i) => (
          <View key={i} style={styles.tableRow}>
            <View style={styles.colDesc}>
              <Text style={styles.refMainBig}>{l.ref_label || '—'}</Text>
              {l.colori_reference ? <Text style={styles.coloriProminent}>{l.colori_reference}</Text> : null}
            </View>
            <Text style={[styles.cellBase, styles.colQty]}>
              {fmtNum(l.quantite, 1)}{l.unite_label ? ` ${l.unite_label}` : ''}
            </Text>
            <Text style={[styles.cellBase, styles.colPU]}>{`${fmtNum(l.prix, 2)} €`}</Text>
            <Text style={[styles.cellBase, styles.colMontant]}>{`${fmtNum(l.montant, 2)} €`}</Text>
            <Text style={[styles.cellBase, styles.colLiv]}>{l.date_livraison || '—'}</Text>
          </View>
        ))}
      </View>

      <View style={styles.totalsWrapper} wrap={false}>
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total HT</Text>
            <Text style={styles.totalValue}>{`${fmtNum(totalHT, 2)} €`}</Text>
          </View>
          {remise > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Remise</Text>
              <Text style={styles.totalValue}>{`- ${fmtNum(remise, 2)} €`}</Text>
            </View>
          )}
          {fraisPort > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Frais de port</Text>
              <Text style={styles.totalValue}>{`${fmtNum(fraisPort, 2)} €`}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{`TVA (${fmtNum(tvaRate, tvaRate % 1 === 0 ? 0 : 1)} %)`}</Text>
            <Text style={styles.totalValue}>{`${fmtNum(tva, 2)} €`}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>TOTAL TTC</Text>
            <Text style={styles.grandValue}>{`${fmtNum(ttc, 2)} €`}</Text>
          </View>
        </View>
      </View>

      {data.commentaire && data.commentaire.trim() && (
        <View style={[styles.commentaireBox, styles.commentaireBottom]} wrap={false}>
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
