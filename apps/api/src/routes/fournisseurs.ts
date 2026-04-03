import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import multer from 'multer'
import { query, queryRaw, fixEncoding } from '../lib/hfsql-auto.js'

const upload = multer({ storage: multer.memoryStorage() })

export const fournisseursRouter: RouterType = Router()

interface Fournisseur {
  IDfournisseur: number
  nom: string
  tel: string | null
  fax: string | null
  commentaire: string | null
  est_visible: number
  IDsociete: number | null
}

const TEXT_FIELDS = ['nom', 'tel', 'fax', 'commentaire']

const fournisseurBody = z.object({
  nom: z.string().min(1).max(100),
  tel: z.string().optional(),
  fax: z.string().optional(),
  commentaire: z.string().optional(),
})

/** Escape a string for use in SQL (single quotes doubled) */
function esc(value: string): string {
  return value.replace(/'/g, "''")
}

// GET /api/fournisseurs - List all
fournisseursRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await query<Fournisseur>('SELECT * FROM fournisseur ORDER BY nom')
    const fixed = await fixEncoding(rows, 'fournisseur', 'IDfournisseur', TEXT_FIELDS)
    res.json(fixed)
  } catch (err) {
    console.error('Error fetching fournisseurs:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/fournisseurs/type-doc - List document types
fournisseursRouter.get('/type-doc', async (_req: Request, res: Response) => {
  try {
    const rows = await query('SELECT IDtype_doc, nom FROM type_doc ORDER BY nom')
    const fixed = await fixEncoding(rows, 'type_doc', 'IDtype_doc', ['nom'])
    res.json(fixed)
  } catch (err) {
    console.error('Error fetching type_doc:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/fournisseurs/certificats/:certId/fichier - Serve certificate document
fournisseursRouter.get('/certificats/:certId/fichier', async (req: Request, res: Response) => {
  try {
    const certId = parseInt(req.params.certId, 10)
    if (isNaN(certId)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const rows = await queryRaw(
      `SELECT fichier FROM certificat WHERE IDcertificat = ${certId}`
    )
    if (rows.length === 0) { res.status(404).json({ error: 'Certificate not found' }); return }

    const fichier = rows[0].fichier
    if (fichier == null) { res.status(404).json({ error: 'No document attached' }); return }

    let buf: Buffer
    if (fichier instanceof ArrayBuffer) {
      buf = Buffer.from(fichier)
    } else if (Buffer.isBuffer(fichier)) {
      buf = fichier
    } else {
      res.status(404).json({ error: 'No document attached' }); return
    }

    // Check for empty/null-terminator-only blob
    if (buf.length === 0 || (buf.length === 1 && buf[0] === 0)) {
      res.status(404).json({ error: 'No document attached' }); return
    }

    // Detect MIME type from magic bytes
    let contentType = 'application/octet-stream'
    if (buf.length >= 4) {
      const head = buf.subarray(0, 4)
      if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) {
        contentType = 'application/pdf'
      } else if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) {
        contentType = 'image/png'
      } else if (head[0] === 0xFF && head[1] === 0xD8) {
        contentType = 'image/jpeg'
      }
    }

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', 'inline')
    // Override helmet restrictions to allow iframe embedding from dev server
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.end(buf)
  } catch (err) {
    console.error('Error serving certificat fichier:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/fournisseurs/certificats/:certId - Update certificate
fournisseursRouter.put('/certificats/:certId', upload.single('fichier'), async (req: Request, res: Response) => {
  try {
    const certId = parseInt(req.params.certId, 10)
    if (isNaN(certId)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const { nom, numero_ref, debut_validite, date_expiration, IDtype_doc, remove_fichier } = req.body

    // Build SET clauses for metadata
    const sets: string[] = []
    if (nom !== undefined) sets.push(`nom = '${esc(nom)}'`)
    if (numero_ref !== undefined) sets.push(`numero_ref = '${esc(numero_ref)}'`)
    if (debut_validite !== undefined) sets.push(`debut_validite = '${esc(debut_validite)}'`)
    if (date_expiration !== undefined) sets.push(`date_expiration = '${esc(date_expiration)}'`)
    if (IDtype_doc !== undefined) sets.push(`IDtype_doc = ${parseInt(IDtype_doc, 10) || 0}`)

    if (sets.length > 0) {
      await query(`UPDATE certificat SET ${sets.join(', ')} WHERE IDcertificat = ${certId}`)
    }

    // Handle fichier update — HFSQL ODBC doesn't support parameterized queries,
    // so we write the binary blob via a hex literal
    if (req.file) {
      const hexStr = req.file.buffer.toString('hex')
      await queryRaw(`UPDATE certificat SET fichier = x'${hexStr}' WHERE IDcertificat = ${certId}`)
    } else if (remove_fichier === '1') {
      await query(`UPDATE certificat SET fichier = NULL WHERE IDcertificat = ${certId}`)
    }

    // Return updated cert
    const rows = await query(
      `SELECT c.IDcertificat, c.nom, c.numero_ref, c.debut_validite, c.date_expiration, c.IDtype_doc, t.nom as type_doc FROM certificat c LEFT JOIN type_doc t ON c.IDtype_doc = t.IDtype_doc WHERE c.IDcertificat = ${certId}`
    )
    const fixed = await fixEncoding(rows, 'certificat', 'IDcertificat', ['nom', 'numero_ref', 'type_doc'])
    res.json(fixed[0] ?? {})
  } catch (err) {
    console.error('Error updating certificat:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/fournisseurs/certificats/:certId - Delete certificate
fournisseursRouter.delete('/certificats/:certId', async (req: Request, res: Response) => {
  try {
    const certId = parseInt(req.params.certId, 10)
    if (isNaN(certId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    await query(`DELETE FROM certificat WHERE IDcertificat = ${certId}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting certificat:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/fournisseurs/:fid/certificats - Create certificate
fournisseursRouter.post('/:fid/certificats', upload.single('fichier'), async (req: Request, res: Response) => {
  try {
    const fid = parseInt(req.params.fid, 10)
    if (isNaN(fid)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const { nom, numero_ref, debut_validite, date_expiration, IDtype_doc } = req.body
    await query(
      `INSERT INTO certificat (IDfournisseur, nom, numero_ref, debut_validite, date_expiration, IDtype_doc) VALUES (${fid}, '${esc(nom ?? '')}', '${esc(numero_ref ?? '')}', '${esc(debut_validite ?? '')}', '${esc(date_expiration ?? '')}', ${parseInt(IDtype_doc, 10) || 0})`
    )

    // If file uploaded, update the blob on the newly created cert via hex literal
    if (req.file) {
      const newRows = await query(`SELECT IDcertificat FROM certificat WHERE IDfournisseur = ${fid} ORDER BY IDcertificat DESC`)
      if (newRows.length > 0) {
        const newId = (newRows[0] as any).IDcertificat
        const hexStr = req.file.buffer.toString('hex')
        await queryRaw(`UPDATE certificat SET fichier = x'${hexStr}' WHERE IDcertificat = ${newId}`)
      }
    }

    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('Error creating certificat:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/fournisseurs/:id - Get by ID with related data
fournisseursRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }

    const rows = await query<Fournisseur>(
      `SELECT * FROM fournisseur WHERE IDfournisseur = ${id}`
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'Fournisseur not found' })
      return
    }

    const fixed = await fixEncoding(rows, 'fournisseur', 'IDfournisseur', TEXT_FIELDS)

    const [adresses, contacts, refsFil, certificats, commandes] = await Promise.all([
      query(`SELECT * FROM adresse WHERE IDfournisseur = ${id} ORDER BY est_defaut DESC, IDadresse`),
      query(`SELECT * FROM contact WHERE IDfournisseur = ${id} ORDER BY est_defaut DESC, IDcontact`),
      query(`SELECT cf.IDcolori_fil, cf.reference as colori_reference, cf.prix_kg as colori_prix_kg, rf.IDref_fil, rf.reference, rf.prix_kg, rf.titrage, rf.nb_fil, rf.nb_brin, rf.bio, rf.recyclé FROM colori_fil cf, ref_fil rf WHERE cf.IDfournisseur = ${id} AND cf.IDref_fil = rf.IDref_fil ORDER BY rf.reference, cf.reference`),
      query(`SELECT c.IDcertificat, c.nom, c.numero_ref, c.debut_validite, c.date_expiration, c.IDtype_doc, t.nom as type_doc FROM certificat c LEFT JOIN type_doc t ON c.IDtype_doc = t.IDtype_doc WHERE c.IDfournisseur = ${id} ORDER BY c.date_expiration DESC`),
      query(`SELECT IDcommande_fil, date_commande, etat, commentaire FROM commande_fil WHERE IDfournisseur = ${id} ORDER BY date_commande DESC`),
    ])

    // Fetch order lines for all commandes in one query
    const commandeIds = commandes.map((c: any) => c.IDcommande_fil).filter(Boolean)
    let lignesCommandes: any[] = []
    if (commandeIds.length > 0) {
      lignesCommandes = await query(
        `SELECT rfc.IDref_fil_commande, rfc.IDcommande_fil, rfc.quantite, rfc.unite, rfc.prix_unitaire, rfc.date_livraison, rfc.etat, rf.reference as ref_fil, cf.reference as colori_reference FROM ref_fil_commande rfc LEFT JOIN ref_fil rf ON rfc.IDref_fil = rf.IDref_fil LEFT JOIN colori_fil cf ON rfc.IDcolori_fil = cf.IDcolori_fil WHERE rfc.IDcommande_fil IN (${commandeIds.join(',')}) ORDER BY rfc.IDref_fil_commande`
      )
      lignesCommandes = await fixEncoding(lignesCommandes, 'ref_fil_commande', 'IDref_fil_commande', ['ref_fil', 'colori_reference'])
    }

    // Group lines by commande
    const lignesMap = new Map<number, any[]>()
    for (const l of lignesCommandes) {
      const arr = lignesMap.get(l.IDcommande_fil) || []
      arr.push(l)
      lignesMap.set(l.IDcommande_fil, arr)
    }
    const fixedCommandes = await fixEncoding(commandes, 'commande_fil', 'IDcommande_fil', ['commentaire'])
    const commandesWithLines = fixedCommandes.map((c: any) => ({
      ...c,
      lignes: lignesMap.get(c.IDcommande_fil) || [],
    }))

    const fixedAdresses = await fixEncoding(adresses, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays', 'commentaire'])
    const fixedContacts = await fixEncoding(contacts, 'contact', 'IDcontact', ['nom', 'prenom', 'tel', 'mail', 'commentaire'])
    const fixedRefsFil = await fixEncoding(refsFil, 'colori_fil', 'IDcolori_fil', ['colori_reference', 'reference'])
    const fixedCertificats = await fixEncoding(certificats, 'certificat', 'IDcertificat', ['nom', 'numero_ref', 'type_doc'])

    // Check which certs have a fichier attached (lightweight query, no blob data)
    const certIds = fixedCertificats.map((c: any) => c.IDcertificat).filter(Boolean)
    let fichierSet = new Set<number>()
    if (certIds.length > 0) {
      const fichierRows = await queryRaw(
        `SELECT IDcertificat, fichier FROM certificat WHERE IDcertificat IN (${certIds.join(',')})`
      )
      for (const r of fichierRows) {
        const f = r.fichier
        if (f != null && !(f instanceof ArrayBuffer && f.byteLength === 0) && f !== '\x00') {
          // Check ArrayBuffer is not just a null terminator
          if (f instanceof ArrayBuffer) {
            const bytes = new Uint8Array(f)
            if (bytes.length > 1 || (bytes.length === 1 && bytes[0] !== 0)) {
              fichierSet.add(Number(r.IDcertificat))
            }
          } else {
            fichierSet.add(Number(r.IDcertificat))
          }
        }
      }
    }
    const certsWithFichier = fixedCertificats.map((c: any) => ({
      ...c,
      has_fichier: fichierSet.has(c.IDcertificat),
    }))

    res.json({
      ...fixed[0],
      adresses: fixedAdresses,
      contacts: fixedContacts,
      refsFil: fixedRefsFil,
      certificats: certsWithFichier,
      commandes: commandesWithLines,
    })
  } catch (err) {
    console.error('Error fetching fournisseur:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/fournisseurs - Create
fournisseursRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = fournisseurBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }

    const { nom, tel, fax, commentaire } = parsed.data
    await query(
      `INSERT INTO fournisseur (nom, tel, fax, commentaire, est_visible) VALUES ('${esc(nom)}', '${esc(tel ?? '')}', '${esc(fax ?? '')}', '${esc(commentaire ?? '')}', 1)`
    )

    // HFSQL does not support RETURNING — fetch the inserted row
    const rows = await query<Fournisseur>(
      `SELECT * FROM fournisseur WHERE nom = '${esc(nom)}' ORDER BY IDfournisseur DESC`
    )

    res.status(201).json(rows[0] ?? { nom, tel: tel ?? null, fax: fax ?? null, commentaire: commentaire ?? null })
  } catch (err) {
    console.error('Error creating fournisseur:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/fournisseurs/:id - Update
fournisseursRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }

    const parsed = fournisseurBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }

    const { nom, tel, fax, commentaire } = parsed.data
    await query(
      `UPDATE fournisseur SET nom = '${esc(nom)}', tel = '${esc(tel ?? '')}', fax = '${esc(fax ?? '')}', commentaire = '${esc(commentaire ?? '')}' WHERE IDfournisseur = ${id}`
    )

    const rows = await query<Fournisseur>(
      `SELECT * FROM fournisseur WHERE IDfournisseur = ${id}`
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'Fournisseur not found' })
      return
    }

    res.json(rows[0])
  } catch (err) {
    console.error('Error updating fournisseur:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/fournisseurs/:id - Delete
fournisseursRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }

    const rows = await query<Fournisseur>(
      `SELECT * FROM fournisseur WHERE IDfournisseur = ${id}`
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'Fournisseur not found' })
      return
    }

    await query(`DELETE FROM fournisseur WHERE IDfournisseur = ${id}`)
    res.json({ message: 'Deleted', data: rows[0] })
  } catch (err) {
    console.error('Error deleting fournisseur:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Contacts CRUD ────────────────────────────────────────

fournisseursRouter.post('/:id/contacts', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const { nom, prenom, tel, mail, envoi_bl, envoi_facture, envoi_commande, envoi_soumission } = req.body
    await query(
      `INSERT INTO contact (IDfournisseur, nom, prenom, tel, mail, envoi_bl, envoi_facture, envoi_commande, envoi_soumission, est_defaut, est_visible) VALUES (${id}, '${esc(nom ?? '')}', '${esc(prenom ?? '')}', '${esc(tel ?? '')}', '${esc(mail ?? '')}', ${envoi_bl ? 1 : 0}, ${envoi_facture ? 1 : 0}, ${envoi_commande ? 1 : 0}, ${envoi_soumission ? 1 : 0}, 0, 1)`
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('Error creating contact:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

fournisseursRouter.put('/:id/contacts/:cid', async (req: Request, res: Response) => {
  try {
    const cid = parseInt(req.params.cid, 10)
    if (isNaN(cid)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const { nom, prenom, tel, mail, envoi_bl, envoi_facture, envoi_commande, envoi_soumission } = req.body
    await query(
      `UPDATE contact SET nom = '${esc(nom ?? '')}', prenom = '${esc(prenom ?? '')}', tel = '${esc(tel ?? '')}', mail = '${esc(mail ?? '')}', envoi_bl = ${envoi_bl ? 1 : 0}, envoi_facture = ${envoi_facture ? 1 : 0}, envoi_commande = ${envoi_commande ? 1 : 0}, envoi_soumission = ${envoi_soumission ? 1 : 0} WHERE IDcontact = ${cid}`
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating contact:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

fournisseursRouter.delete('/:id/contacts/:cid', async (req: Request, res: Response) => {
  try {
    const cid = parseInt(req.params.cid, 10)
    if (isNaN(cid)) { res.status(400).json({ error: 'Invalid ID' }); return }
    await query(`DELETE FROM contact WHERE IDcontact = ${cid}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting contact:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Adresses CRUD ────────────────────────────────────────

fournisseursRouter.post('/:id/adresses', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const { nom, adresse1, adresse2, adresse3, cp, ville, pays, commentaire, est_defaut_facturation, est_defaut_livraison } = req.body
    await query(
      `INSERT INTO adresse (IDfournisseur, nom, adresse1, adresse2, adresse3, cp, ville, pays, commentaire, est_defaut, est_defaut_facturation, est_defaut_livraison, est_visible) VALUES (${id}, '${esc(nom ?? '')}', '${esc(adresse1 ?? '')}', '${esc(adresse2 ?? '')}', '${esc(adresse3 ?? '')}', '${esc(cp ?? '')}', '${esc(ville ?? '')}', '${esc(pays ?? '')}', '${esc(commentaire ?? '')}', 0, ${est_defaut_facturation ? 1 : 0}, ${est_defaut_livraison ? 1 : 0}, 1)`
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('Error creating adresse:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

fournisseursRouter.put('/:id/adresses/:aid', async (req: Request, res: Response) => {
  try {
    const aid = parseInt(req.params.aid, 10)
    if (isNaN(aid)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const { nom, adresse1, adresse2, adresse3, cp, ville, pays, commentaire, est_defaut_facturation, est_defaut_livraison } = req.body
    await query(
      `UPDATE adresse SET nom = '${esc(nom ?? '')}', adresse1 = '${esc(adresse1 ?? '')}', adresse2 = '${esc(adresse2 ?? '')}', adresse3 = '${esc(adresse3 ?? '')}', cp = '${esc(cp ?? '')}', ville = '${esc(ville ?? '')}', pays = '${esc(pays ?? '')}', commentaire = '${esc(commentaire ?? '')}', est_defaut_facturation = ${est_defaut_facturation ? 1 : 0}, est_defaut_livraison = ${est_defaut_livraison ? 1 : 0} WHERE IDadresse = ${aid}`
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating adresse:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

fournisseursRouter.delete('/:id/adresses/:aid', async (req: Request, res: Response) => {
  try {
    const aid = parseInt(req.params.aid, 10)
    if (isNaN(aid)) { res.status(400).json({ error: 'Invalid ID' }); return }
    await query(`DELETE FROM adresse WHERE IDadresse = ${aid}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting adresse:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
