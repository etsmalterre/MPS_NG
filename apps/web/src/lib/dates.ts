/**
 * Helpers for HFSQL date strings.
 *
 * HFSQL stores dates as 8-character strings in YYYYMMDD format.
 * HTML date inputs use YYYY-MM-DD.
 */

/** Format an HFSQL date for display in the French locale. Accepts both 8-char and ISO strings. */
export function formatHfsqlDate(raw: string): string {
  if (raw.length === 8) {
    return new Date(`${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`).toLocaleDateString('fr-FR')
  }
  return new Date(raw).toLocaleDateString('fr-FR')
}

/** Convert HFSQL "YYYYMMDD" → HTML input "YYYY-MM-DD". Returns "" for null/empty. */
export function hfsqlDateToInput(raw: string | null | undefined): string {
  if (!raw) return ''
  if (raw.length === 8) return `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`
  return raw
}

/** Convert HTML input "YYYY-MM-DD" → HFSQL "YYYYMMDD". */
export function inputDateToHfsql(d: string): string {
  return d.replace(/-/g, '')
}
