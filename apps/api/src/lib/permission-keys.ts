// Catalog of permission keys gated by the per-user permissions feature.
// Adding a new gated action requires three edits:
//   1. Append a new entry to PERMISSION_KEYS below
//   2. Gate the corresponding API route via userHasPermission(...)
//   3. Hide the corresponding UI element via useHasPermission('...')
//
// Keys are flat snake_case strings — they're stored verbatim in the
// permissions JSON file and sent on the wire, so don't rename without a
// migration.

export const PERMISSION_KEYS = [
  {
    key: 'create_stock_fil',
    label: 'Créer un lot de fil',
    description: 'Autorise la création de nouvelles entrées dans Fournisseurs > Stock.',
    category: 'Fournisseurs',
  },
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]['key']

/** Set of all known keys for fast membership checks during validation. */
export const KNOWN_PERMISSION_KEYS: ReadonlySet<string> = new Set(
  PERMISSION_KEYS.map((p) => p.key),
)

export function isKnownPermissionKey(k: string): k is PermissionKey {
  return KNOWN_PERMISSION_KEYS.has(k)
}
