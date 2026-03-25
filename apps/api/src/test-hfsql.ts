import odbc from 'odbc'

// HFSQL Client/Server connection via ODBC
// No analysis file needed — connect directly to the server
const CONNECTION_STRING =
  'DRIVER={HFSQL};' +
  'Server Name=localhost;' +
  'Server Port=4900;' +
  'Database=MPS;' +
  'UID=Admin;' +
  'PWD=;'

async function main() {
  console.log('Connection string:', CONNECTION_STRING)
  console.log('Connecting to HFSQL...')

  try {
    const connection = await odbc.connect({
      connectionString: CONNECTION_STRING,
      loginTimeout: 10,
    })
    console.log('Connected!')

    const result = await connection.query('SELECT * FROM entreprise')
    console.log(`Found ${result.length} rows in entreprise`)
    if (result.length > 0) {
      console.log('First row:', result[0])
    }

    await connection.close()
    console.log('Connection closed.')
  } catch (err: any) {
    console.error('Connection failed:', err.message)
    if (err.odbcErrors) {
      for (const e of err.odbcErrors) {
        console.error('  ODBC error:', e.state, e.message)
      }
    }
  }
}

main()
