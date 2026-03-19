import postgres from 'postgres'

// Database connection configuration
const sql = postgres({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5435', 10),
  database: process.env.DB_NAME || 'mps_dev',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'devpassword',
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10
})

export { sql }
