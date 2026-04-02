import dotenv from 'dotenv'

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: `.env.${env}` })
dotenv.config({ path: '.env' }) // fallback / overrides
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { entreprisesRouter } from './routes/entreprises.js'
import { fournisseursRouter } from './routes/fournisseurs.js'
import { closeConnection } from './lib/hfsql-auto.js'

const app = express()
const PORT = process.env.PORT || 8080

app.use(helmet())
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'MPS API', version: '0.1.0' })
})

app.use('/api/entreprises', entreprisesRouter)
app.use('/api/fournisseurs', fournisseursRouter)

app.listen(PORT, () => {
  console.log(`MPS API running on port ${PORT} [${env}]`)
})

async function shutdown() {
  await closeConnection()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
