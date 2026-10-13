// Shell suite: `vitest run -c tests/shell/vitest.config.ts`.
// The empty PostCSS config stops Vite from loading the website's postcss.config.mjs.
import { defineConfig } from 'vitest/config'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  css: { postcss: {} },
  test: {
    include: ['tests/shell/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
})
