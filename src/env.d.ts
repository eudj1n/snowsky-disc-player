/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" in the hosted build (the GitHub Pages prototype): the gateway is on the local network. */
  readonly VITE_HOSTED?: string
}

// Plain TypeScript tools (typescript-eslint) need this to type .vue imports
// from .ts files; vue-tsc resolves real components first. A missing .vue file
// still fails the Vite build and the tests.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
