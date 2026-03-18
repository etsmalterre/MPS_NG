import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Database connection configuration
// Using config object instead of URL to handle special characters in password
const client = postgres({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5435', 10),
  database: process.env.DB_NAME || 'mps_dev',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'devpassword',
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10
})

// Create drizzle instance
export const db = drizzle(client)

// Export raw client for direct queries if needed
export const sql = client
