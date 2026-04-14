// Auth routes — cookie-based user identification.
//
// Design: browsers can't read the client's hostname like the legacy WinDev app,
// so we use a fullscreen "Qui êtes-vous ?" picker on first visit and persist
// the chosen IDutilisateur in a signed, HttpOnly cookie. Subsequent visits are
// zero-click. Identification is best-effort (not a security control), same as
// the legacy model.
//
// Routes:
//   GET  /api/auth/users   — public list for the picker (id + display name)
//   GET  /api/auth/me      — current user (401 if no cookie or invalid)
//   POST /api/auth/login   — body { IDutilisateur } → sets the cookie
//   POST /api/auth/logout  — clears the cookie

import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import { query, fixEncoding } from '../lib/hfsql-auto.js'
import {
  signUserId,
  COOKIE_NAME,
  ADMIN_COOKIE_NAME,
  COOKIE_MAX_AGE_SECONDS,
  cookieOptions,
  isAdminUtilisateur,
} from '../lib/auth.js'

export const authRouter: RouterType = Router()

interface Utilisateur {
  IDutilisateur: number
  pc: string | null
  prenom: string | null
  nom: string | null
  IDexpediteur: number | null
}

const TEXT_FIELDS = ['pc', 'prenom', 'nom']

const loginBody = z.object({
  IDutilisateur: z.number().int().positive(),
})

// ── GET /api/auth/users — public picker list ──────────────
// Exposes only the display fields (not pc / IDexpediteur). Deduplicates by
// (prenom, nom) so that people with multiple PC rows in the legacy table
// (Vincent has pro+perso, Isa has home+bureau, Pierre has desk+portable,
// Laetitia has accueil+personal) only appear once in the picker. The
// canonical ID is the LOWEST IDutilisateur for each group — arbitrary but
// deterministic, and the cookie value is interchangeable within a person.
authRouter.get('/users', async (_req: Request, res: Response) => {
  try {
    const rows = await query<Utilisateur>(
      'SELECT IDutilisateur, pc, prenom, nom FROM utilisateur ORDER BY IDutilisateur'
    )
    const fixed = await fixEncoding(rows, 'utilisateur', 'IDutilisateur', TEXT_FIELDS)

    // Dedupe by (prenom, nom) — lowercase + trim for safety, even though
    // the legacy data uses consistent casing per person.
    const seen = new Map<string, {
      IDutilisateur: number
      prenom: string | null
      nom: string | null
      roleHint: string | null
    }>()
    for (const u of fixed as any[]) {
      const prenom = (u.prenom ?? '').toString()
      const nom = (u.nom ?? '').toString()
      const key = `${prenom.trim().toLowerCase()}|${nom.trim().toLowerCase()}`
      if (seen.has(key)) continue // keep the first (lowest-id) row per person
      seen.set(key, {
        IDutilisateur: Number(u.IDutilisateur),
        prenom: prenom || null,
        nom: nom || null,
        roleHint: typeof u.pc === 'string' ? u.pc.toLowerCase() : null,
      })
    }

    // Sort the deduped list alphabetically by nom, then prenom.
    const payload = Array.from(seen.values()).sort((a, b) => {
      const an = (a.nom ?? '').localeCompare(b.nom ?? '', 'fr')
      if (an !== 0) return an
      return (a.prenom ?? '').localeCompare(b.prenom ?? '', 'fr')
    })

    res.json(payload)
  } catch (err) {
    console.error('Error fetching utilisateur list:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── GET /api/auth/me — current identified user ────────────
// Returns the current user plus an `isAdmin` flag indicating whether the
// session was originally established by an admin (currently Vincent Malterre).
// `isAdmin === true` even when an admin has switched to impersonate a
// non-admin user, so the frontend can keep showing the "Changer d'utilisateur"
// affordance and let them switch back.
authRouter.get('/me', async (req: Request, res: Response) => {
  if (req.userId === undefined) {
    res.status(401).json({ error: 'not authenticated' })
    return
  }
  try {
    const rows = await query<Utilisateur>(
      `SELECT IDutilisateur, pc, prenom, nom, IDexpediteur FROM utilisateur WHERE IDutilisateur = ${req.userId}`
    )
    if (rows.length === 0) {
      // Cookie points at a deleted user — clear it and tell the client to
      // re-authenticate. Using the same cookie options ensures the browser
      // actually deletes it.
      res.clearCookie(COOKIE_NAME, cookieOptions())
      res.clearCookie(ADMIN_COOKIE_NAME, cookieOptions())
      res.status(401).json({ error: 'user no longer exists' })
      return
    }
    const fixed = await fixEncoding(rows, 'utilisateur', 'IDutilisateur', TEXT_FIELDS)
    res.json({ ...fixed[0], isAdmin: req.adminId !== undefined })
  } catch (err) {
    console.error('Error fetching /auth/me:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /api/auth/login — pick a user and set the cookie ──
// Admin cookie persistence: if the picked user is an admin (Vincent), establish
// the admin cookie. If the picked user is NOT admin but an admin cookie is
// already present (admin is impersonating), preserve it across the switch so
// the admin can return to themselves later.
authRouter.post('/login', async (req: Request, res: Response) => {
  const parsed = loginBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
    return
  }
  const { IDutilisateur } = parsed.data
  try {
    const rows = await query<Utilisateur>(
      `SELECT IDutilisateur, pc, prenom, nom, IDexpediteur FROM utilisateur WHERE IDutilisateur = ${IDutilisateur}`
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'user not found' })
      return
    }
    const fixed = await fixEncoding(rows, 'utilisateur', 'IDutilisateur', TEXT_FIELDS)
    const picked = fixed[0] as Utilisateur

    // Always set the user cookie to the picked user.
    res.cookie(COOKIE_NAME, signUserId(IDutilisateur), {
      ...cookieOptions(),
      maxAge: COOKIE_MAX_AGE_SECONDS * 1000,
    })

    // Determine the admin cookie. Priority:
    //   1. If an admin cookie is already present (in flight from middleware),
    //      preserve it — we're switching users while in admin mode.
    //   2. Otherwise, if the picked user is itself an admin, establish the
    //      admin cookie pointing at them.
    //   3. Otherwise, leave it cleared (no admin cookie).
    let adminId: number | null = null
    if (req.adminId !== undefined) {
      adminId = req.adminId
    } else if (isAdminUtilisateur(picked)) {
      adminId = IDutilisateur
    }
    if (adminId !== null) {
      res.cookie(ADMIN_COOKIE_NAME, signUserId(adminId), {
        ...cookieOptions(),
        maxAge: COOKIE_MAX_AGE_SECONDS * 1000,
      })
    }

    // Echo back isAdmin so the client doesn't need a second /me call.
    res.json({ ...picked, isAdmin: adminId !== null })
  } catch (err) {
    console.error('Error in /auth/login:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /api/auth/logout — clear only the user cookie ────
// Intentionally preserves the admin cookie — when an admin clicks "Changer
// d'utilisateur" it triggers logout, which drops them to the picker, and on
// the next pick the admin cookie reasserts admin mode. To fully clear the
// admin cookie, the user must clear browser data.
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, cookieOptions())
  res.json({ ok: true })
})
