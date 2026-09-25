/// <reference types="vite/client" />

// Plain TypeScript tools (typescript-eslint) need this to type .vue imports
// from .ts files; vue-tsc resolves real components first. A missing .vue file
// still fails the Vite build and the tests.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
