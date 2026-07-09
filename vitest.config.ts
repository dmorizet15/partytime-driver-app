import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Test runner for the RFID module (src/modules/rfid). The driver app itself
// has no unit-test suite; keep this config scoped to the module so `npm test`
// stays fast and never picks up app files by accident.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    include: ['src/modules/rfid/**/*.test.{ts,tsx}'],
    environment: 'node',
    // The offline suites use fake-indexeddb explicitly per-test; no global setup.
  },
})
