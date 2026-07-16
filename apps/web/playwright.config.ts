import { defineConfig } from '@playwright/test'

// Screenshot-regression harness. The whole /api/ layer is mocked with fixture
// JSON (see e2e/support/mock-api.ts) so pixels are stable — no API, no HFSQL.
// Baselines are machine-specific (system-ui font stack): see e2e/README.md.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixels: 25,
      threshold: 0.1,
    },
  },
  use: {
    baseURL: 'http://localhost:3200',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-1920', use: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 } },
    { name: 'desktop-1366', use: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 } },
  ],
  webServer: {
    // Port 3200: outside worktree web slots (3000-3006) and vite default 5174.
    // VITE_API_URL=/api makes apiFetch same-origin so page.route('**/api/**') sees everything.
    command: 'pnpm exec vite --port 3200 --strictPort',
    url: 'http://localhost:3200',
    reuseExistingServer: true,
    env: { VITE_API_URL: '/api' },
    timeout: 60_000,
  },
})
