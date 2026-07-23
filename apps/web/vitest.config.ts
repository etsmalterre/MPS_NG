import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

// Mirror vite.config.ts — components referencing __APP_VERSION__ must also
// resolve it under vitest (which does not read vite.config.ts).
const rootPkg = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8')
)

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Unit tests live under src/ only. Without this, vitest's default include
    // collects the Playwright specs in e2e/ (which crash at import — they must
    // run via `pnpm test:e2e`) and `pnpm test` always fails.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // No unit tests exist yet — an empty run must not fail the turbo pipeline.
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
