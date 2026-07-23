/// <reference types="vite/client" />

// App version injected at build time from the monorepo root package.json
// (see `define` in vite.config.ts / vitest.config.ts).
declare const __APP_VERSION__: string
