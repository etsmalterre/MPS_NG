# E2E screenshot regression (Playwright)

Pixel-level regression protection for the desktop UI while the app is made
responsive. The entire `/api/` layer is mocked with fixture JSON
(`fixtures/*.json`, captured once from the live dev API and trimmed), so
screenshots are deterministic: no API process, no HFSQL, no live data drift.
`Date.now()` is frozen via `page.clock.setFixedTime` (row ages and default
dates would drift daily otherwise).

## Commands

```bash
pnpm --filter @mps/web test:e2e           # run against committed baselines
pnpm --filter @mps/web test:e2e:update    # re-bless baselines (only on purpose!)
```

The config auto-starts a vite dev server on port 3200 (`VITE_API_URL=/api` so
every call is same-origin and interceptable). Not wired into `turbo test`.

## Baseline policy — READ BEFORE RE-BLESSING

- Baselines live in `e2e/__screenshots__/<project>/` and are **committed**.
- The app uses the OS `system-ui` font stack, so baselines are only valid on
  the machine that generated them (Windows factory PC). On another machine,
  regenerate from a known-good state (`git stash` your changes → `test:e2e:update`
  → unstash → `test:e2e`); never trust cross-machine diffs.
- Workflow for risky UI work: baselines are captured from the UNTOUCHED screen
  first (own commit), then every subsequent edit must keep `test:e2e` green.
  Re-bless only when a visual change is intended, and review the diff images in
  `test-results/` before doing so.

## Adding a screen

1. Capture its API responses into `fixtures/` (see `mock-api.ts` for the shape).
2. Add routes for them in `support/mock-api.ts`.
3. Add a `<screen>.spec.ts` with the states worth freezing (default, drawer or
   dialog open, edit mode, filtered).
4. Unmocked endpoints fail loudly: the catch-all fulfills 500 and the
   `afterEach` asserts `mock.unmatched` is empty.
