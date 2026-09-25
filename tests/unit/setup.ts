// Stores read browser preferences at load time. Node 22+ exposes an
// experimental localStorage getter that warns on access, so the stub replaces
// the property without reading it; happy-dom files keep their own storage.
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
if (!descriptor || descriptor.get) {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
  })
}
