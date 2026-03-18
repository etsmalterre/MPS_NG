import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema/*',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5435', 10),
    database: process.env.DB_NAME || 'mps_dev',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'devpassword',
  },
})
