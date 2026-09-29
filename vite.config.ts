import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'

// Development talks to a real gateway (the emulator or a player) through the
// dev server, so the page stays same-origin. The gateway admits only its own
// Host and Origin, which the proxy rewrites to the target.
function gatewayProxy(gateway: string): Record<string, ProxyOptions> {
  const base: ProxyOptions = {
    target: gateway,
    changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReq', (request) => request.setHeader('origin', gateway))
      proxy.on('proxyReqWs', (request) => request.setHeader('origin', gateway))
    },
  }
  return {
    '/api': { ...base, ws: true },
    // The app's own origins.json, from Disc Player as the gateway serves it.
    '/origins.json': base,
  }
}

// The build is an app (combined-009): a folder copied into Apps/Disc Player on
// the card, served at / and at /apps/Disc%20Player/ with a strict CSP ('self'
// only): relative references, no inlined assets (data: URLs are blocked), no
// module-preload polyfill.
export default defineConfig(({ mode }) => {
  const gateway = loadEnv(mode, process.cwd(), 'DISC_').DISC_GATEWAY
  return {
    base: './',
    plugins: [vue(), tailwindcss()],
    build: {
      target: 'es2022',
      assetsInlineLimit: 0,
      modulePreload: { polyfill: false },
      sourcemap: false,
    },
    server: gateway ? { proxy: gatewayProxy(gateway) } : {},
  }
})
