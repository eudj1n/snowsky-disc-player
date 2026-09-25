import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite'
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
    '/releases': base,
    // The active release id, read from the gateway's index document.
    '/__disc_active': { ...base, rewrite: () => '/' },
  }
}

// The gateway serves the active index.html at / and every other file only
// below /releases/<id>/. The service publisher rewrites root-absolute
// href/src in index.html to that release path, so the document must use
// root-absolute references while scripts and styles stay relative.
function rootAbsoluteIndex(): Plugin {
  return {
    name: 'disc-root-absolute-index',
    apply: 'build',
    transformIndexHtml: { order: 'post', handler: (html) => html.replace(/\b(href|src)="\.\//g, '$1="/') },
  }
}

// The build is published as one immutable release under /releases/<id>/ on
// the SD card and served with a strict CSP ('self' only): relative base, no
// inlined assets (data: URLs are blocked), no module-preload polyfill.
export default defineConfig(({ mode }) => {
  const gateway = loadEnv(mode, process.cwd(), 'DISC_').DISC_GATEWAY
  return {
    base: './',
    plugins: [vue(), tailwindcss(), rootAbsoluteIndex()],
    build: {
      target: 'es2022',
      assetsInlineLimit: 0,
      modulePreload: { polyfill: false },
      sourcemap: false,
    },
    server: gateway ? { proxy: gatewayProxy(gateway) } : {},
  }
})
