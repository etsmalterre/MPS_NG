// Format numbers with a plain ASCII space as thousand separator (fr-FR locale).
// French locale emits \u202f (narrow no-break space) or \u00a0 (non-breaking
// space) for groups; we normalize both to a regular space so UI spacing and
// copy-paste behave predictably.
export function fmtNum(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return ''
  return value
    .toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    .replace(/\u202f|\u00a0/g, ' ')
}
