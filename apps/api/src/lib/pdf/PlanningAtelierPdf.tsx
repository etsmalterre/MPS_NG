// Atelier weekly planning PDF — landscape grid of bonnetiers × days with
// shift cells colored by équipe (Matin / Après-Midi / Nuit), a legend, and an
// optional free-text comment. Mirrors the legacy ETAT_Planning report inside
// the shared MalterreDocument frame.

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { MalterreDocument } from './MalterreDocument.js'
import { colors, sizes } from './theme.js'

// ── Data shape (built by routes/planning-atelier.ts) ─────

export interface PlanningAtelierPdfData {
  /** e.g. "Semaine 29" */
  semaineLabel: string
  /** e.g. "Planning du 12 juillet au 18 juillet 2026" */
  periodeLabel: string
  /** Long-form date for the header, e.g. "2 Juillet 2026" (print date) */
  printedDate: string
  /** 7 column labels, Dimanche → Samedi, e.g. "Dimanche 12" */
  dayLabels: string[]
  rows: Array<{
    nom: string
    /** 7 cells aligned with dayLabels; null = no shift that day */
    cells: Array<{ debut: string; fin: string } | null>
  }>
  /** Optional free-text comment entered at print time */
  comment: string
}

// ── Shift color language (mirrors the web grid pills) ────

const SHIFTS = [
  { label: 'Matin', bg: '#3b82f6' }, // blue-500
  { label: 'Après-Midi', bg: '#f59e0b' }, // amber-500
  { label: 'Nuit', bg: '#7c3aed' }, // violet-600
] as const

function shiftOf(debut: string): (typeof SHIFTS)[number] {
  const h = parseInt(debut.slice(0, 2), 10)
  if (h >= 4 && h < 12) return SHIFTS[0]
  if (h >= 12 && h < 20) return SHIFTS[1]
  return SHIFTS[2]
}

// ── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  periodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  periodeLabel: {
    fontSize: sizes.fontMd,
    fontWeight: 900,
    color: colors.text,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 1,
    marginTop: 1,
  },
  legendLabel: {
    fontSize: sizes.fontSm,
    color: colors.text,
    lineHeight: 1,
  },

  table: {
    borderWidth: 0.75,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderRadius: 4,
    overflow: 'hidden',
  },
  headRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgMuted,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.borderStrong,
    borderBottomStyle: 'solid',
  },
  headCellName: {
    flex: 1.4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: sizes.fontSm,
    fontWeight: 900,
    color: colors.primary,
  },
  headCellDay: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontSize: sizes.fontSm,
    fontWeight: 900,
    color: colors.primary,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
  },
  rowAlt: {
    backgroundColor: '#FAFAFA',
  },
  cellName: {
    flex: 1.4,
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontSize: sizes.fontBase,
    fontWeight: 700,
    color: colors.text,
  },
  cellDay: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftPill: {
    alignSelf: 'stretch',
    borderRadius: 3,
    paddingVertical: 4,
    alignItems: 'center',
  },
  shiftText: {
    fontSize: sizes.fontSm,
    fontWeight: 700,
    color: colors.white,
  },

  commentBlock: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  commentLabel: {
    fontSize: sizes.fontSm,
    fontWeight: 900,
    color: colors.text,
  },
  commentText: {
    flex: 1,
    fontSize: sizes.fontSm,
    color: '#DC2626', // red — matches the legacy report's comment styling
    lineHeight: 1.4,
  },
})

// ── Component ────────────────────────────────────────────

export function PlanningAtelierPdf({ data }: { data: PlanningAtelierPdfData }) {
  return (
    <MalterreDocument
      documentType="Planning Atelier"
      reference={data.semaineLabel}
      documentDate={data.printedDate}
      orientation="landscape"
      title={`Planning Atelier ${data.semaineLabel}`}
    >
      {/* Période + legend row */}
      <View style={styles.periodeRow}>
        <Text style={styles.periodeLabel}>{data.periodeLabel}</Text>
        <View style={styles.legend}>
          {SHIFTS.map((s) => (
            <View key={s.label} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: s.bg }]} />
              <Text style={styles.legendLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Grid */}
      <View style={styles.table}>
        <View style={styles.headRow}>
          <Text style={styles.headCellName}>Bonnetier</Text>
          {data.dayLabels.map((d) => (
            <Text key={d} style={styles.headCellDay}>
              {d}
            </Text>
          ))}
        </View>
        {data.rows.map((row, i) => (
          <View key={row.nom} style={i % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row} wrap={false}>
            <Text style={styles.cellName}>{row.nom}</Text>
            {row.cells.map((cell, j) => (
              <View key={j} style={styles.cellDay}>
                {cell ? (
                  <View style={[styles.shiftPill, { backgroundColor: shiftOf(cell.debut).bg }]}>
                    <Text style={styles.shiftText}>
                      {cell.debut} - {cell.fin}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Print-time comment (legacy renders it in red at the bottom) */}
      {data.comment.trim() !== '' ? (
        <View style={styles.commentBlock}>
          <Text style={styles.commentLabel}>Commentaire :</Text>
          <Text style={styles.commentText}>{data.comment.trim()}</Text>
        </View>
      ) : null}
    </MalterreDocument>
  )
}
