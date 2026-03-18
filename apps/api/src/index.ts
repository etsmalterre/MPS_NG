import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { entreprisesRouter } from './routes/entreprises.js'

const app = express()
const PORT = process.env.PORT || 8080

app.use(helmet())
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'MPS API', version: '0.1.0' })
})

app.use('/api/entreprises', entreprisesRouter)

app.listen(PORT, () => {
  console.log(`MPS API running on port ${PORT}`)
})
