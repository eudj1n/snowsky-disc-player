/** Browser-local preferences. Storage can be unavailable (private windows,
 * blocked site data); every access tolerates that and the app still works. */
export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePreference(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Preference not persisted; the in-memory value still applies.
  }
}

/** Per-tab state that survives a reload of the same tab only (sessionStorage). */
export function readTabState(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeTabState(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    // Not kept: a reload then waits for an explicit Connect.
  }
}
