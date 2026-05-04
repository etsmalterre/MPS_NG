import { useState, useRef, useCallback, useEffect } from 'react'
import { useBlocker } from 'react-router-dom'
import type { UnsavedChangesAction } from '@/components/shared/UnsavedChangesDialog'

interface UseUnsavedGuardOptions {
  isDirty: boolean
  save: () => Promise<void>
  onDiscard?: () => void
  /**
   * Optional hard-block flag. When `true`, the guard refuses any exit AND
   * does NOT open the unsaved-changes dialog — instead it calls
   * `onExitBlocked` so the caller can surface its own UI (e.g. an alert).
   * Use this for hard validation that must be fixed before leaving the
   * current row, regardless of what's in the dirty draft.
   */
  shouldBlockExit?: boolean
  onExitBlocked?: () => void
}

/**
 * Shared unsaved-changes guard for edit-mode screens.
 *
 * - Watches `isDirty` via `useBlocker` to intercept any route-level navigation
 *   (sidebar clicks, submenu tabs, programmatic navigate()).
 * - Exposes `guardAction(fn)` for in-page actions (selecting another row in the
 *   left list, clicking the back button) — call this instead of the raw action.
 * - Returns `showDialog`, `isSaving`, and `handleAction` for wiring into
 *   <UnsavedChangesDialog>.
 *
 * On "save" the hook awaits the provided `save()` callback before proceeding
 * with the deferred navigation. On failure the dialog stays open so the user
 * can retry or abandon.
 */
export function useUnsavedGuard({
  isDirty,
  save,
  onDiscard,
  shouldBlockExit,
  onExitBlocked,
}: UseUnsavedGuardOptions) {
  const [showDialog, setShowDialog] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const pendingActionRef = useRef<(() => void) | null>(null)

  // Block route navigation whenever the form is dirty OR the caller asks for a
  // hard block. The effect below decides which UI to surface.
  const blocker = useBlocker(isDirty || !!shouldBlockExit)

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (shouldBlockExit) {
      onExitBlocked?.()
      blocker.reset?.()
      return
    }
    setShowDialog(true)
  }, [blocker.state, shouldBlockExit, onExitBlocked])

  const guardAction = useCallback((action: () => void) => {
    if (shouldBlockExit) {
      onExitBlocked?.()
      return
    }
    if (isDirty) {
      pendingActionRef.current = action
      setShowDialog(true)
    } else {
      action()
    }
  }, [isDirty, shouldBlockExit, onExitBlocked])

  const handleAction = useCallback(async (action: UnsavedChangesAction) => {
    const isBlocked = blocker.state === 'blocked'

    if (action === 'cancel') {
      setShowDialog(false)
      pendingActionRef.current = null
      if (isBlocked) blocker.reset?.()
      return
    }

    if (action === 'discard') {
      setShowDialog(false)
      onDiscard?.()
      if (isBlocked) {
        blocker.proceed?.()
      } else if (pendingActionRef.current) {
        const fn = pendingActionRef.current
        pendingActionRef.current = null
        fn()
      }
      return
    }

    if (action === 'save') {
      setIsSaving(true)
      try {
        await save()
        setShowDialog(false)
        if (isBlocked) {
          blocker.proceed?.()
        } else if (pendingActionRef.current) {
          const fn = pendingActionRef.current
          pendingActionRef.current = null
          fn()
        }
      } catch (err) {
        console.error('Unsaved guard: save failed, keeping dialog open', err)
      } finally {
        setIsSaving(false)
      }
    }
  }, [blocker, save, onDiscard])

  return { showDialog, isSaving, handleAction, guardAction }
}
