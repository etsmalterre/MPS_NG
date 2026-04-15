# HFSQL ODBC Reference

Deep-dive reference for the HFSQL ODBC connection used by the MPS_NG API. The *footguns* (rules you must follow) are summarised in `CLAUDE.md § HFSQL rules`; this file has the full explanation + platform-specific details.

## Connection

- **Driver**: `HFSQL` (installed from `C:\PC SOFT\WINDEV Suite 2026\Install\ODBC\WX310PACKODBC.exe`)
- **Connection string**: `DRIVER={HFSQL};Server Name=localhost;Server Port=4900;Database=MPS;UID=Admin;PWD=;`
- **npm package**: `odbc`
- **Helper**: `apps/api/src/lib/hfsql.ts` — singleton connection, `query()` wrapper, `queryRaw()` (preserves binary ArrayBuffers), `fixEncoding()`, `closeConnection()`, `getConnection()`

## Known issues

- Accented table names cause "fichier de données est déjà décrit" error — avoid accents in HFSQL table names.
- HFSQL backup folders with accented file names trigger the same error — delete backups before connecting.
- Empty memo fields return as `\x00` — cleaned automatically by `query()`.
- BigInt fields return with `n` suffix — converted to Number automatically by `query()`.
- **Encoding**: HFSQL ODBC driver corrupts accented characters (é→U+FFFD). Fix: use `fixEncoding()` which calls `CONVERT(field USING 'UTF-8')` per-row for affected fields. Returns ArrayBuffer decoded as UTF-8.
- **No parameterized queries**: `?` placeholders cause "SQLGetDescribeParam non supportée" error. Use string interpolation with `esc()` (single-quote doubling) for strings, `parseInt` for IDs. For binary blobs, use hex literals: `x'${buffer.toString('hex')}'`.
- **No `RETURNING *`**: HFSQL SQL doesn't support it. Use follow-up SELECT after INSERT/UPDATE.
- **Booleans as numbers**: HFSQL returns `0`/`1` not `true`/`false`. In React, always use `!!value &&` to avoid rendering `0` as text.
- **BinMemo `IS NOT NULL`**: Unreliable for checking if a document is attached — empty blobs pass the check. For file-serving endpoints, return 404 if the buffer is empty. For UI, use a HEAD pre-check before rendering iframes.

## Accented column names — PLATFORM-SPECIFIC SQL REQUIRED

The Linux iODBC bridge (`wd310hfo64.so`) completely **rejects any accented identifier token** in the SQL text — `sf.terminé`, `rf.recyclé`, `[terminé]`, `"terminé"`, UTF-8 bytes, Latin-1 bytes, `SELECT terminé AS x`, `UPDATE ... SET terminé = 0`, `WHERE terminé = 0` — all fail with tokenizer errors like `sf file not found in FROM statement` or `Unexpected word`. The HFSQL SQL parser on Linux simply cannot handle é/è/à/ç/etc. inside an identifier.

Meanwhile the **Windows ODBC driver** has the opposite problem: it silently returns zero rows when a JOIN uses `alias.*` expansion. So the two paths need different SQL:

- **Linux path**: `SELECT sf.*` — the bridge returns accented columns with their last char truncated (`terminé→termin`, `controlé→control`, `certif_recyclé→certif_recycl`, `recyclé→recycl`). Filter/update via non-accented fields only; any predicate or SET on an accented column must be done in JS or skipped.
- **Windows path**: list every column explicitly with `alias.terminé AS termine` style aliases — `alias.*` in a JOIN returns nothing.
- **Both paths**: post-process rows via a normaliser that maps both shapes to the same ASCII keys (`termine`/`controle`/`recycle`) so the HTTP response is platform-agnostic.
- **Source of truth**: `apps/api/src/routes/stock.ts` has the canonical pattern, branching on `process.platform === 'win32'` via an `IS_WINDOWS` constant. The route also fetches `ref_fil.recyclé` via a separate `SELECT * FROM ref_fil` call and joins it in JS, since neither platform can reference that column explicitly.
- **PATCH/UPDATE**: `UPDATE stock_fil SET terminé = …` works on Windows but not on Linux. `stock.ts`' PATCH silently skips those fields on Linux and returns a descriptive error if the user tries to set only those fields.

## Bridge (Linux only)

- **Binary blob support**: The C bridge (`hfsql_bridge`) outputs binary columns as base64 with `"b64:"` prefix. `hfsql-bridge.ts` has two decoders: `cleanRow()` decodes b64 to **UTF-8 strings** (used by `query()` for normal text/CONVERT results), while `cleanRowRaw()` decodes b64 to **raw Buffers** (used by `queryRaw()` for binary blob retrieval like PDFs). Without this split, JSON-serialized Buffers become `{type:"Buffer",data:[...]}` objects that crash React with error #31.
- **Recompile**: `gcc -o hfsql_bridge src/hfsql_bridge.c -I/usr/include/iodbc -liodbc -liodbcinst`
- **Auto-reconnect**: The bridge process holds a single ODBC connection that can die after long idle periods. `query()` and `queryRaw()` detect connection-lost errors (state `[01000]`, "Connection reset by peer", etc.), kill the bridge, and retry once — no manual restart needed.

## WinDev ↔ PostgreSQL (abandoned)

> PostgreSQL migration was attempted but abandoned due to column casing issues. Kept for historical reference.

- **Native PostgreSQL Connector**: column casing mismatch between native connector (quoted mixed-case) and manual SQL (unquoted)
- **Bulk migration scripts**: `data_migration/scripts/bulk_migrate.txt` — migrates all 204 HFSQL tables to PostgreSQL
- **Skipped tables** (cross-server HFSQL FK constraints): `lst_prev`, `lst_info_sal_annee`, `lst_lissage`, `lst_message`
