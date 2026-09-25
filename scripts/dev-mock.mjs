#!/usr/bin/env node
// Visual development without a player: starts the synthetic mock gateway and
// the Vite dev server proxied to it. Ctrl+C stops both.
import { spawn } from 'node:child_process'

const port = process.env.MOCK_GATEWAY_PORT ?? '4870'
const children = [
  spawn(process.execPath, ['tests/e2e/mock-gateway.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, MOCK_GATEWAY_PORT: port },
  }),
  spawn('npx', ['vite', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, DISC_GATEWAY: `http://127.0.0.1:${port}` },
  }),
]
const stop = () => children.forEach((child) => child.kill('SIGTERM'))
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const child of children)
  child.on('exit', (code) => {
    stop()
    process.exitCode = code ?? 0
  })
