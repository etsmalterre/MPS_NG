// User context — holds the currently identified user (via cookie) and
// exposes login / logout. Wraps the whole app inside main.tsx so any
// component can call useUser() to read the current identity.
//
// On mount: calls GET /api/auth/me. If the cookie is present and valid, the
// user is attached. If 401 (no cookie or invalid), the user stays null and
// UserPickerGate renders the picker.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

export interface CurrentUser {
  IDutilisateur: number
  prenom: string | null
  nom: string | null
  pc?: string | null
  IDexpediteur?: number | null
  /** True when the session was originally established by an admin user
   *  (currently Vincent Malterre). Persists across user switches via a
   *  separate admin cookie on the server, so an admin can always switch
   *  back to themselves after impersonating someone else. */
  isAdmin?: boolean
}

interface UserContextValue {
  user: CurrentUser | null
  isLoading: boolean
  login: (id: number) => Promise<void>
  logout: () => Promise<void>
}

const UserContext = createContext<UserContextValue | undefined>(undefined)

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Initial boot: ask the API who we are. 401 means "no valid cookie" and
  // should silently drop us to the picker — not throw.
  useEffect(() => {
    let cancelled = false
    apiFetch<CurrentUser>('/auth/me')
      .then((u) => {
        if (!cancelled) setUser(u)
      })
      .catch((err: Error & { status?: number }) => {
        if (cancelled) return
        if (err.status === 401) {
          setUser(null)
        } else {
          // Network error, server down, etc. — treat the same as not-authed
          // so the picker appears; a retry will happen if the user re-picks.
          console.warn('auth/me failed:', err)
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (IDutilisateur: number) => {
    const u = await apiFetch<CurrentUser>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ IDutilisateur }),
    })
    setUser(u)
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } catch (err) {
      // Best-effort — even if the API call fails, clear the client state so
      // the UI drops back to the picker.
      console.warn('logout failed:', err)
    }
    setUser(null)
  }, [])

  return (
    <UserContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within a UserProvider')
  return ctx
}

/** Whether the current session is allowed to switch to a different user.
 *  Driven by the `isAdmin` flag on the current user, which the server sets
 *  to true when the session was originally established by an admin user
 *  (currently Vincent Malterre). The flag persists across user switches via
 *  a separate admin cookie, so an admin who impersonates another user can
 *  still see the "Changer d'utilisateur" button and switch back. */
export function canSwitchUser(user: CurrentUser | null): boolean {
  return user?.isAdmin === true
}
