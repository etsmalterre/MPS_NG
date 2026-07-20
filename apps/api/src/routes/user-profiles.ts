// User-profiles routes — admin-managed per-user photo + HTML email signature.
// JSON-file backed via lib/user-profiles.ts (photos on disk under
// data/user-photos/). The signature is appended to outgoing emails by
// lib/gmail.ts; the photo feeds the header avatar + "Mon profil" modal.
//
// Endpoints:
//   GET    /api/user-profiles/me               — current user's profile
//   GET    /api/user-profiles/users            — admin only, every user + profile
//   GET    /api/user-profiles/users/:id/photo  — self or admin, raw image bytes
//   PUT    /api/user-profiles/users/:id/signature — admin only, set/clear signature
//   PUT    /api/user-profiles/users/:id/photo  — admin only, multipart upload
//   DELETE /api/user-profiles/users/:id/photo  — admin only

import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import multer from 'multer'
import { query, fixEncoding } from '../lib/hfsql-auto.js'
import { requireAdmin, isEffectiveAdmin } from '../lib/auth.js'
import {
  getUserProfile,
  setUserSignature,
  setUserPhoto,
  clearUserPhoto,
  getUserPhotoPath,
  getAllUserProfiles,
  type PhotoExt,
} from '../lib/user-profiles.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

export const userProfilesRouter: RouterType = Router()

interface Utilisateur {
  IDutilisateur: number
  pc: string | null
  prenom: string | null
  nom: string | null
}

const TEXT_FIELDS = ['pc', 'prenom', 'nom']

const MIME_TO_EXT: Record<string, PhotoExt> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const EXT_TO_MIME: Record<PhotoExt, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

// Pasted Outlook/Gmail signatures with data-URI images can get big — allow up
// to 200 KB of HTML.
const putSignatureBody = z.object({
  signatureHtml: z.string().max(200_000),
})

function profilePayload(p: { signatureHtml: string | null; photo: { updatedAt: number } | null }) {
  return {
    signatureHtml: p.signatureHtml,
    hasPhoto: p.photo !== null,
    photoVersion: p.photo?.updatedAt ?? null,
  }
}

// ── GET /api/user-profiles/me ──────────────────────────
userProfilesRouter.get('/me', async (req: Request, res: Response) => {
  if (req.userId === undefined) {
    res.status(401).json({ error: 'not authenticated' })
    return
  }
  const profile = await getUserProfile(req.userId)
  res.json({ IDutilisateur: req.userId, ...profilePayload(profile) })
})

// ── GET /api/user-profiles/users ───────────────────────
// Admin only. Returns every deduped user with their current profile.
userProfilesRouter.get('/users', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return
  try {
    const rows = await query<Utilisateur>(
      'SELECT IDutilisateur, pc, prenom, nom FROM utilisateur ORDER BY IDutilisateur'
    )
    const fixed = await fixEncoding(rows, 'utilisateur', 'IDutilisateur', TEXT_FIELDS)

    // Same dedupe rule as /auth/users — lowest IDutilisateur per (prenom, nom).
    const seen = new Map<string, {
      IDutilisateur: number
      prenom: string | null
      nom: string | null
    }>()
    for (const u of fixed as any[]) {
      const prenom = (u.prenom ?? '').toString()
      const nom = (u.nom ?? '').toString()
      const key = `${prenom.trim().toLowerCase()}|${nom.trim().toLowerCase()}`
      if (seen.has(key)) continue
      seen.set(key, {
        IDutilisateur: Number(u.IDutilisateur),
        prenom: prenom || null,
        nom: nom || null,
      })
    }

    const allProfiles = await getAllUserProfiles()
    const payload = Array.from(seen.values())
      .map((u) => ({
        ...u,
        ...profilePayload(allProfiles[u.IDutilisateur] ?? { signatureHtml: null, photo: null }),
      }))
      .sort((a, b) => {
        const an = (a.nom ?? '').localeCompare(b.nom ?? '', 'fr')
        if (an !== 0) return an
        return (a.prenom ?? '').localeCompare(b.prenom ?? '', 'fr')
      })

    res.json(payload)
  } catch (err) {
    console.error('Error fetching user-profiles list:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── GET /api/user-profiles/users/:id/photo ─────────────
// Self or admin. Streams the stored image; 404 when none. Strip helmet's
// restrictive headers so the cross-origin <img> works (mirror the
// etudes-coloris photo proxy).
userProfilesRouter.get('/users/:id/photo', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: 'invalid id' })
    return
  }
  if (req.userId === undefined) {
    res.status(401).json({ error: 'not authenticated' })
    return
  }
  if (req.userId !== id && !isEffectiveAdmin(req)) {
    res.status(403).json({ error: 'forbidden' })
    return
  }
  try {
    const photo = await getUserPhotoPath(id)
    if (!photo) {
      res.status(404).json({ error: 'No photo' })
      return
    }
    res.setHeader('Content-Type', EXT_TO_MIME[photo.ext])
    res.setHeader('Content-Disposition', 'inline')
    // Immutable is safe: the URL carries ?v=<photoVersion> which changes on
    // every upload.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.sendFile(photo.path, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'No photo' })
    })
  } catch (err) {
    console.error('Error serving user photo:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── PUT /api/user-profiles/users/:id/signature ─────────
userProfilesRouter.put('/users/:id/signature', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return
  const id = parseInt(req.params.id, 10)
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: 'invalid id' })
    return
  }
  const parsed = putSignatureBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid body', details: parsed.error.issues })
    return
  }
  try {
    await setUserSignature(id, parsed.data.signatureHtml)
    const profile = await getUserProfile(id)
    res.json({ IDutilisateur: id, ...profilePayload(profile) })
  } catch (err) {
    console.error('Error updating user signature:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── PUT /api/user-profiles/users/:id/photo ─────────────
userProfilesRouter.put(
  '/users/:id/photo',
  (req: Request, res: Response, next) => {
    if (!requireAdmin(req, res)) return
    next()
  },
  upload.single('photo'),
  async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ error: 'invalid id' })
      return
    }
    const file = req.file
    if (!file || file.buffer.length === 0) {
      res.status(400).json({ error: 'missing photo file' })
      return
    }
    const ext = MIME_TO_EXT[file.mimetype]
    if (!ext) {
      res.status(400).json({ error: 'unsupported image type' })
      return
    }
    try {
      const { updatedAt } = await setUserPhoto(id, file.buffer, ext)
      res.json({ IDutilisateur: id, hasPhoto: true, photoVersion: updatedAt })
    } catch (err) {
      console.error('Error uploading user photo:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  },
)

// ── DELETE /api/user-profiles/users/:id/photo ──────────
userProfilesRouter.delete('/users/:id/photo', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return
  const id = parseInt(req.params.id, 10)
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: 'invalid id' })
    return
  }
  try {
    await clearUserPhoto(id)
    res.status(204).end()
  } catch (err) {
    console.error('Error deleting user photo:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
