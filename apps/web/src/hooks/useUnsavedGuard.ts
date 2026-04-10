import { useState, useRef, useCallback, useEffect } from 'react'
import { useBlocker } from 'react-router-dom'
import type { UnsavedChangesAction } from '@/components/shared/UnsavedChangesDialog'

interface UseUnsavedGuardOptions {
  isDirty: boolean
  save: () => Promise<void>
  onDiscard?: () => void
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
export function useUnsavedGuard({ isDirty, save, onDiscard }: UseUnsavedGuardOptions) {
  const [showDialog, setShowDialog] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const pendingActionRef = useRef<(() => void) | null>(null)

  const blocker = useBlocker(isDirty)

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setShowDialog(true)
    }
  }, [blocker.state])

  const guardAction = useCallback((action: () => void) => {
    if (isDirty) {
      pendingActionRef.current = action
      setShowDialog(true)
    } else {
      action()
    }
  }, [isDirty])

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
