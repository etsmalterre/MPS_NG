import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import { sql } from '@mps/db'

export const entreprisesRouter: RouterType = Router()

const entrepriseBody = z.object({
  nom: z.string().min(1).max(100),
  commentaire: z.string().optional(),
})

// GET /api/entreprises - List all
entreprisesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`SELECT * FROM entreprise ORDER BY identreprise`
    res.json(rows)
  } catch (err) {
    console.error('Error fetching entreprises:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/entreprises/:id - Get by ID
entreprisesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }

    const rows = await sql`SELECT * FROM entreprise WHERE identreprise = ${id}`
    if (rows.length === 0) {
      res.status(404).json({ error: 'Entreprise not found' })
      return
    }

    res.json(rows[0])
  } catch (err) {
    console.error('Error fetching entreprise:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/entreprises - Create
entreprisesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = entrepriseBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }

    const { nom, commentaire } = parsed.data
    const rows = await sql`
      INSERT INTO entreprise (nom, commentaire)
      VALUES (${nom}, ${commentaire ?? null})
      RETURNING *
    `

    res.status(201).json(rows[0])
  } catch (err) {
    console.error('Error creating entreprise:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/entreprises/:id - Update
entreprisesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }

    const parsed = entrepriseBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }

    const { nom, commentaire } = parsed.data
    const rows = await sql`
      UPDATE entreprise
      SET nom = ${nom}, commentaire = ${commentaire ?? null}
      WHERE identreprise = ${id}
      RETURNING *
    `

    if (rows.length === 0) {
      res.status(404).json({ error: 'Entreprise not found' })
      return
    }

    res.json(rows[0])
  } catch (err) {
    console.error('Error updating entreprise:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/entreprises/:id - Delete
entreprisesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }

    const rows = await sql`
      DELETE FROM entreprise WHERE identreprise = ${id} RETURNING *
    `

    if (rows.length === 0) {
      res.status(404).json({ error: 'Entreprise not found' })
      return
    }

    res.json({ message: 'Deleted', data: rows[0] })
  } catch (err) {
    console.error('Error deleting entreprise:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
