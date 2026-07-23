import { useEffect } from 'react'
import { useResponsiveLayout } from './useResponsiveLayout'

interface AutoSelectFirstOptions<T> {
  /** The list the selection must stay valid against (pass the filtered list when the screen filters). */
  rows: readonly T[] | undefined
  selectedId: number | null
  getId: (row: T) => number
  select: (id: number | null) => void
  /**
   * 'fill' — only fills a null selection with the first row; never clears or
   * moves an existing selection (screens without a search-narrowing reselect).
   * 'sync' — additionally clears the selection when the list is empty and
   * re-targets the first row when the selection left the visible rows
   * (the §5 mps_designer canonical effect).
   */
  behavior: 'fill' | 'sync'
  /** Pause entirely — edit in progress, list refetching, pending auto-edit… */
  suspended?: boolean
}

/**
 * Desktop/compact modes keep the historical behavior: the detail pane sits
 * next to the list, so something must always be selected.
 *
 * Stacked mode (phone) shows either the list OR the detail, so a null
 * selection IS the list view. Auto-selecting there would land the user on
 * the first row's detail and instantly undo the "Retour" button (which sets
 * the selection back to null). In stacked mode this hook never picks a row
 * on its own; when the selection disappears from the list it falls back to
 * null (return to the list) instead of jumping to another row's detail.
 */
export function useAutoSelectFirst<T>({
  rows,
  selectedId,
  getId,
  select,
  behavior,
  suspended = false,
}: AutoSelectFirstOptions<T>) {
  const { isStacked } = useResponsiveLayout()

  // No dep array on purpose: getId/select are inline closures whose identity
  // changes every render, and the body is idempotent (select() with the
  // current value is a no-op), so running after each render is both cheap
  // and always up to date.
  useEffect(() => {
    if (suspended || rows === undefined) return

    if (behavior === 'fill') {
      if (!isStacked && selectedId === null && rows.length > 0) {
        select(getId(rows[0]))
      }
      return
    }

    if (rows.length === 0) {
      // List settled empty (search with no hits, or the last row left the
      // current filter) — clear the stale selection so the placeholder shows.
      if (selectedId !== null) select(null)
      return
    }
    const stillVisible = selectedId !== null && rows.some((r) => getId(r) === selectedId)
    if (stillVisible) return
    select(isStacked ? null : getId(rows[0]))
  })
}
