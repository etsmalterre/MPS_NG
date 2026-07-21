import odbc from 'odbc'

const CONNECTION_STRING =
  process.env.HFSQL_CONNECTION_STRING ||
  'DRIVER={HFSQL};Server Name=localhost;Server Port=4900;Database=MPS;UID=Admin;PWD=;'

let connectionPromise: Promise<odbc.Connection> | null = null

/**
 * Hard ceiling on a single connect attempt. The driver's own `loginTimeout` is
 * only a hint and has been observed not to fire: `odbc.connect()` then hangs
 * forever, and because the pending promise is cached every later query awaits
 * it too — the process serves /api/health fine while every DB route hangs with
 * no error logged, until it's killed by hand. Racing the connect against this
 * timeout and clearing the cache lets the next request retry instead, matching
 * the self-healing respawn the Linux bridge already does.
 */
const CONNECT_TIMEOUT_MS = Number(process.env.HFSQL_CONNECT_TIMEOUT_MS) || 15000

export function getConnection(): Promise<odbc.Connection> {
  if (!connectionPromise) {
    const attempt = odbc.connect({
      connectionString: CONNECTION_STRING,
      loginTimeout: 10,
    })
    let timer: NodeJS.Timeout
    connectionPromise = Promise.race([
      attempt,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`HFSQL connect timed out after ${CONNECT_TIMEOUT_MS}ms`)),
          CONNECT_TIMEOUT_MS
        )
      }),
    ]).finally(() => clearTimeout(timer)) as Promise<odbc.Connection>

    connectionPromise.catch((err) => {
      console.error('[hfsql] connect failed, will retry on next query:', err?.message ?? err)
      connectionPromise = null
      // If the hung connect ever does resolve, close the orphan so the driver
      // doesn't leak a session we no longer reference.
      attempt.then((conn) => conn.close().catch(() => {})).catch(() => {})
    })
  }
  return connectionPromise
}

/** Decode ArrayBuffer from CONVERT() to UTF-8 string */
function decodeValue(value: unknown): unknown {
  if (value instanceof ArrayBuffer) {
    const str = Buffer.from(value).toString('utf8')
    return str === '' ? null : str
  }
  return value
}

/** Clean HFSQL quirks: ArrayBuffer → string, \x00 memo → null, BigInt → number, U+FFFD → kept for now */
function cleanRow<T>(row: Record<string, unknown>): T {
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const decoded = decodeValue(value)
    if (typeof decoded === 'string' && (decoded === '\x00' || decoded.charCodeAt(0) === 0)) {
      cleaned[key] = null
    } else if (typeof decoded === 'bigint') {
      cleaned[key] = Number(decoded)
    } else {
      cleaned[key] = decoded
    }
  }
  return cleaned as T
}

/** Run a SQL query against HFSQL via ODBC */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: (string | number | null)[]
): Promise<T[]> {
  const conn = await getConnection()
  const rows = params ? await conn.query(sql, params) : await conn.query(sql)
  return (rows as Record<string, unknown>[]).map((row) => cleanRow<T>(row))
}

/**
 * Windows counterpart of the Linux bridge's queryB64Text. The base64-text trick
 * is a Linux-only workaround (the iODBC driver can't CONVERT accented-named
 * columns); on Windows the odbc driver path handles encoding via fixEncoding, so
 * this is a plain passthrough. The prospects route only calls queryB64Text on
 * Linux — this export exists so hfsql-auto can wire it uniformly.
 */
export async function queryB64Text<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  return query<T>(sql)
}

/**
 * Fix encoding for text/memo fields that contain U+FFFD replacement characters.
 * HFSQL ODBC driver corrupts accented chars; CONVERT(field USING 'UTF-8') fixes them.
 * This does per-row CONVERT queries only for rows that actually have broken encoding.
 */
export async function fixEncoding<T extends object>(
  rows: T[],
  table: string,
  idField: string,
  textFields: string[]
): Promise<T[]> {
  const conn = await getConnection()
  const result: T[] = []

  for (const row of rows) {
    const r = row as Record<string, unknown>
    const needsFix = textFields.some((f) => {
      const val = r[f]
      return typeof val === 'string' && val.includes('\ufffd')
    })

    if (!needsFix) {
      result.push(row)
      continue
    }

    const idNum = Number(r[idField])
    const fixed = { ...row } as T
    // Guard: a non-finite id would emit `WHERE col = NaN`, which HFSQL rejects as
    // an unknown identifier. On the Linux bridge that is classed as "connection
    // lost" and triggers a respawn storm against the shared HFSQL server. Skip the
    // CONVERT and keep the original (a leftover U+FFFD glyph is purely cosmetic).
    if (!Number.isInteger(idNum)) {
      result.push(fixed)
      continue
    }
    const fixedRec = fixed as Record<string, unknown>
    for (const field of textFields) {
      const orig = r[field]
      if (typeof orig === 'string' && orig.includes('\ufffd')) {
        try {
          const qRes = await conn.query<Record<string, unknown>>(
            `SELECT CONVERT(${field} USING 'UTF-8') as v FROM ${table} WHERE ${idField} = ${idNum}`
          )
          if (qRes.length > 0 && qRes[0].v != null) {
            const val = qRes[0].v
            fixedRec[field] =
              val instanceof ArrayBuffer ? Buffer.from(val).toString('utf8') : val
          }
        } catch {
          // keep original value if CONVERT fails
        }
      }
    }
    result.push(fixed)
  }

  return result
}

/** Run a SQL query and return raw rows without cleanRow (preserves ArrayBuffer for binary blobs) */
export async function queryRaw(sql: string): Promise<Record<string, unknown>[]> {
  const conn = await getConnection()
  const rows = await conn.query(sql)
  return rows as Record<string, unknown>[]
}

export async function closeConnection(): Promise<void> {
  if (connectionPromise) {
    try {
      const conn = await connectionPromise
      await conn.close()
    } catch {
      // ignore close errors
    }
    connectionPromise = null
  }
}
