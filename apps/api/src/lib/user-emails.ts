// JSON-file-backed per-user email address store with module-load cache.
//
// ⚠️ TODO migration (after the data migration phase is complete):
// Replace this JSON file backend with a real database column on utilisateur
// (or a dedicated mapping table). The public API of this module is
// storage-agnostic so the swap should only touch the internals of this file.
//
// Mirrors lib/permissions.ts structure.

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.resolve(__dirname, '../../data')
const FILE_PATH = path.join(DATA_DIR, 'user-emails.json')

interface UserEmailsFile {
  version: 1
  /** keyed by IDutilisateur as a string (JSON object keys must be strings) */
  users: Record<string, string>
}

const EMPTY: UserEmailsFile = { version: 1, users: {} }

let cache: UserEmailsFile | null = null

/** Load the user-emails file from disk, creating an empty one if missing.
 *  Result is cached in memory; subsequent reads are O(1). */
async function loadUserEmails(): Promise<UserEmailsFile> {
  if (cache !== null) return cache
  try {
    const raw = await fs.readFile(FILE_PATH, 'utf8')
    const parsed = JSON.parse(raw) as UserEmailsFile
    if (typeof parsed !== 'object' || parsed === null || parsed.version !== 1 || typeof parsed.users !== 'object') {
      throw new Error('user-emails.json: invalid shape')
    }
    cache = parsed
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') {
      cache = { version: 1, users: {} }
    } else {
      console.error('Failed to load user-emails.json:', err)
      cache = { ...EMPTY }
    }
  }
  return cache
}

/** Persist the user-emails file to disk, atomically (write to .tmp, rename). */
async function saveUserEmails(file: UserEmailsFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  const tmp = `${FILE_PATH}.tmp`
  await fs.writeFile(tmp, JSON.stringify(file, null, 2), 'utf8')
  await fs.rename(tmp, FILE_PATH)
  cache = file
}

/** Returns the email address stored for a user, or null if none. */
export async function getUserEmail(userId: number): Promise<string | null> {
  const file = await loadUserEmails()
  const value = file.users[String(userId)]
  return value && value.trim() ? value.trim() : null
}

/** Overwrite a user's email address. Pass empty string to clear. */
export async function setUserEmail(userId: number, email: string): Promise<void> {
  const trimmed = email.trim()
  const file = await loadUserEmails()
  const nextUsers = { ...file.users }
  if (trimmed) {
    nextUsers[String(userId)] = trimmed
  } else {
    delete nextUsers[String(userId)]
  }
  await saveUserEmails({ ...file, users: nextUsers })
}

/** Read all stored email mappings (used by the admin /users endpoint). */
export async function getAllUserEmails(): Promise<Record<number, string>> {
  const file = await loadUserEmails()
  const out: Record<number, string> = {}
  for (const [k, v] of Object.entries(file.users)) {
    const id = Number(k)
    if (Number.isFinite(id) && v && v.trim()) out[id] = v.trim()
  }
  return out
}
