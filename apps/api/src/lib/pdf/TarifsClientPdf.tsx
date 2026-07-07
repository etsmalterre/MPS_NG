// PDF document for the "Fiche Tarifs" sent to a client — the MPS_NG port of
// the legacy Choix_Matiere_Tarif → Fiche Tarif report. One section per client
// référence: a gray band (Ref + contexture + laize + poids + BIO chip) above a
// quantity-tranche price table with one price column per selected coloris.
// Prices are the PrixDeVenteV4 €/Ml values (calcTarifRefFini), filtered by the
// ref_client_colori.lst_tranche indices — matching the legacy PDF exactly.

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { MalterreDocument } from './MalterreDocument.js'
import { colors, sizes } from './theme.js'

// ── Input shape ──────────────────────────────────────────

export interface TarifsSectionData {
  /** Client-facing reference, e.g. "049A" (designation_client.designation) */
  ref: string
  /** Knit-structure label, e.g. "double face piqué" (contexture.nom) */
  contexture: string | null
  /** Width in cm (ref_fini.laizeHT_Moy) */
  laize: number | null
  /** Weight in g/m² (ref_fini.poids_Moy) */
  poids: number | null
  /** Organic cotton flag (ref_ecru.bio) */
  bio: boolean
  /** One label per selected coloris — the table's price columns */
  colorisLabels: string[]
  /** Tranche rows (union of the coloris' lst_tranche indices, ascending) */
  rows: Array<{
    /** "< 1", "1", "2", … "30" */
    rlx: string
    /** "< 44", "44", "89", … */
    ml: string
    /** €/Ml per coloris column — null renders an empty cell */
    prices: Array<number | null>
  }>
}

export interface TarifsClientPdfData {
  clientNom: string
  /** Long-form French date shown in the header, e.g. "7 Juillet 2026" */
  dateDocument: string
  /** Short French date the tarifs stay valid until, e.g. "07/07/2027" */
  validUntil: string
  sections: TarifsSectionData[]
}

// ── French number formatting ─────────────────────────────
function fmtNum(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return ''
  return value
    .toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    .replace(/ | /g, ' ')
}

// ── Styles ───────────────────────────────────────────────

const COL_QTY_WIDTH = 64
const COL_PRICE_WIDTH = 86

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },

  // Gray band: Ref + contexture on the left, Laize / Poids / BIO on the right.
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgMuted,
    borderWidth: 0.75,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  bandLabel: {
    fontSize: sizes.fontSm,
    color: colors.muted,
  },
  bandRef: {
    fontSize: sizes.fontMd,
    fontWeight: 900,
    color: colors.text,
    marginLeft: 3,
  },
  // NOTE: no fontStyle:'italic' anywhere in this doc — the bundled Lato has
  // no italic face and @react-pdf hard-fails on unresolvable font variants.
  bandContexture: {
    fontSize: sizes.fontBase,
    color: colors.muted,
    marginLeft: 10,
    flexShrink: 1,
  },
  bandSpacer: {
    flexGrow: 1,
  },
  bandMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 14,
  },
  bandMetricValue: {
    fontSize: sizes.fontBase,
    fontWeight: 900,
    color: colors.text,
    marginLeft: 3,
  },
  bioBadge: {
    marginLeft: 14,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    backgroundColor: '#DCFCE7',
    color: '#15803D',
    fontSize: 6.5,
    fontWeight: 900,
    letterSpacing: 0.5,
    borderRadius: 2,
  },

  // Tranche table — framed, sized to its columns (not full width).
  table: {
    alignSelf: 'flex-start',
    borderWidth: 0.75,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderRadius: 4,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgMuted,
    borderBottomWidth: 2,
    borderBottomColor: colors.gold,
    borderBottomStyle: 'solid',
  },
  // Tight explicit lineHeight on all table text — the content container's
  // inherited 1.45 inflates every row and drops the doc to one section per
  // page (legacy packs two).
  headerCell: {
    fontSize: sizes.fontSm,
    fontWeight: 900,
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 5,
    paddingHorizontal: 4,
    lineHeight: 1.25,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: '#EEEEEE',
    borderBottomStyle: 'solid',
  },
  rowLast: {
    flexDirection: 'row',
  },
  cell: {
    fontSize: sizes.fontBase,
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 3.5,
    paddingHorizontal: 4,
    lineHeight: 1.15,
  },
  colQty: {
    width: COL_QTY_WIDTH,
  },
  colQtyDivider: {
    borderRightWidth: 0.75,
    borderRightColor: '#EEEEEE',
    borderRightStyle: 'solid',
  },
  colPrice: {
    width: COL_PRICE_WIDTH,
  },

  validity: {
    fontSize: sizes.fontSm,
    color: colors.muted,
    marginTop: 5,
  },
  validityDate: {
    fontWeight: 700,
    color: colors.text,
  },

  // Bottom-left note, fixed on every physical page (mirrors the page number's
  // placement on the right at bottom:72, just above the footer band).
  htNote: {
    position: 'absolute',
    bottom: 72,
    left: 36,
    fontSize: sizes.fontSm,
    color: colors.muted,
  },
})

// ── Component ────────────────────────────────────────────

export function TarifsClientPdf({ data }: { data: TarifsClientPdfData }) {
  return (
    <MalterreDocument
      documentType="Tarifs"
      reference={data.clientNom}
      documentDate={data.dateDocument}
      title={`Fiche Tarifs ${data.clientNom}`}
    >
      {data.sections.map((s, si) => (
        <View key={si} style={styles.section} wrap={false}>
          {/* Ref band */}
          <View style={styles.band}>
            <Text style={styles.bandLabel}>Ref :</Text>
            <Text style={styles.bandRef}>{s.ref}</Text>
            {s.contexture ? <Text style={styles.bandContexture}>{s.contexture}</Text> : null}
            <View style={styles.bandSpacer} />
            {s.laize != null && s.laize > 0 ? (
              <View style={styles.bandMetric}>
                <Text style={styles.bandLabel}>Laize :</Text>
                <Text style={styles.bandMetricValue}>{fmtNum(s.laize)} cm</Text>
              </View>
            ) : null}
            {s.poids != null && s.poids > 0 ? (
              <View style={styles.bandMetric}>
                <Text style={styles.bandLabel}>Poids :</Text>
                <Text style={styles.bandMetricValue}>{fmtNum(s.poids)} g/m²</Text>
              </View>
            ) : null}
            {s.bio ? <Text style={styles.bioBadge}>BIO</Text> : null}
          </View>

          {/* Tranche table */}
          <View style={styles.table}>
            <View style={styles.headerRow}>
              <Text style={[styles.headerCell, styles.colQty]}>Qté (Rlx)</Text>
              <Text style={[styles.headerCell, styles.colQty, styles.colQtyDivider]}>Qté (Ml)</Text>
              {s.colorisLabels.map((label, ci) => (
                <Text key={ci} style={[styles.headerCell, styles.colPrice]}>{label}</Text>
              ))}
            </View>
            {s.rows.map((r, ri) => (
              <View key={ri} style={ri === s.rows.length - 1 ? styles.rowLast : styles.row}>
                <Text style={[styles.cell, styles.colQty]}>{r.rlx}</Text>
                <Text style={[styles.cell, styles.colQty, styles.colQtyDivider]}>{r.ml}</Text>
                {r.prices.map((p, ci) => (
                  <Text key={ci} style={[styles.cell, styles.colPrice]}>
                    {p != null ? `${fmtNum(p, 2)} €` : ''}
                  </Text>
                ))}
              </View>
            ))}
          </View>

          <Text style={styles.validity}>
            Tarifs valides jusqu'au : <Text style={styles.validityDate}>{data.validUntil}</Text>
          </Text>
        </View>
      ))}

      {/* HT note — fixed bottom-left of every physical page */}
      <Text style={styles.htNote} fixed>
        Tarifs Hors Taxes par mètre linéaire
      </Text>
    </MalterreDocument>
  )
}
