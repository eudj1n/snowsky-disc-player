import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// The README's screenshots (`npm run screenshots`, after `npm run build`): the mock gateway on its own port,
// with the reference demo's fictional covers drawn into work/screenshots/covers by the spec itself.
const PORT = 4893
export const COVERS = resolve('work/screenshots/covers')

export default defineConfig({
  testDir: '.',
  // Apart from the browser tests' test-results, which each run empties.
  outputDir: '../../work/screenshots/results',
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  use: { baseURL: `http://127.0.0.1:${String(PORT)}` },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
    },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node tests/e2e/mock-gateway.mjs',
    cwd: '../..',
    url: `http://127.0.0.1:${String(PORT)}/api/health`,
    reuseExistingServer: false,
    env: {
      MOCK_GATEWAY_PORT: String(PORT),
      MOCK_GATEWAY_SERIAL: '00000000000000',
      MOCK_GATEWAY_DEMO_COVERS: COVERS,
    },
  },
})
