import { defineConfig, devices } from '@playwright/test'

// By default the browser tests run against the synthetic mock gateway serving
// the built dist/ (CI, no player). Set E2E_BASE_URL to a real gateway (the
// emulator's forwarded port or a player on the LAN) that already serves a
// published release of this build; E2E_SERIAL enables the mutation tests there.
const external = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: external ?? 'http://127.0.0.1:4870',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  ...(external
    ? {}
    : {
        webServer: {
          command: 'node tests/e2e/mock-gateway.mjs',
          url: 'http://127.0.0.1:4870/api/health',
          reuseExistingServer: false,
          env: { MOCK_GATEWAY_SERIAL: '00000000000000' },
        },
      }),
})
