// Render a fiche technique PDF for a ref_fini id against the dev database and
// write it to a local file for visual inspection.
// Run: pnpm --filter @mps/api exec tsx src/scripts/dump-fiche-technique-pdf.ts <IDref_fini> [outPath]
import dotenv from 'dotenv'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env.development') })

const { buildFicheTechniquePdfData, renderFicheTechniquePdfBuffer } = await import('../routes/references-fini.js')

const id = parseInt(process.argv[2] ?? '', 10)
if (isNaN(id)) {
  console.error('Usage: tsx dump-fiche-technique-pdf.ts <IDref_fini> [outPath]')
  process.exit(1)
}

const data = await buildFicheTechniquePdfData(id)
if (!data) {
  console.error(`ref_fini ${id} not found`)
  process.exit(1)
}
console.log(JSON.stringify(data, null, 2))

const buffer = await renderFicheTechniquePdfBuffer(data)
const out = process.argv[3] ?? path.join(os.tmpdir(), `fiche-technique-${id}.pdf`)
fs.writeFileSync(out, buffer)
console.log(`\nWrote ${buffer.length} bytes to ${out}`)
process.exit(0)
