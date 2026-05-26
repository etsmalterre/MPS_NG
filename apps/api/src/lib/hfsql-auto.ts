import { platform } from 'os'

/**
 * Auto-selects the correct HFSQL driver:
 * - Windows: uses `odbc` npm package (unixODBC-compatible HFSQL ODBC driver)
 * - Linux: uses `hfsql_bridge` C child process (iODBC-compatible HFSQL ODBC driver)
 *
 * Both modules export the same interface: query(), fixEncoding(), closeConnection()
 */

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: (string | number | null)[]) => Promise<T[]>
type QueryRawFn = (sql: string) => Promise<Record<string, unknown>[]>
type FixEncodingFn = <T extends object>(rows: T[], table: string, idField: string, textFields: string[]) => Promise<T[]>
type CloseConnectionFn = () => Promise<void>

let _query: QueryFn
let _queryRaw: QueryRawFn
let _fixEncoding: FixEncodingFn
let _closeConnection: CloseConnectionFn

if (platform() === 'linux') {
  const mod = await import('./hfsql-bridge.js')
  _query = mod.query
  _queryRaw = mod.queryRaw
  _fixEncoding = mod.fixEncoding
  _closeConnection = mod.closeConnection
} else {
  const mod = await import('./hfsql.js')
  _query = mod.query
  _queryRaw = mod.queryRaw
  _fixEncoding = mod.fixEncoding
  _closeConnection = mod.closeConnection
}

export const query = _query
export const queryRaw = _queryRaw
export const fixEncoding = _fixEncoding
export const closeConnection = _closeConnection
