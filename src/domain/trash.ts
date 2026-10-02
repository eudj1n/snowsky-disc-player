/**
 * The service's trash (combined-008): files and folders of the card moved
 * into `.disc/trash` instead of being deleted, and what macOS left on the
 * card. Parsed from the service's replies; nothing here reaches the card.
 */

export interface TrashEntry {
  id: number
  /** Where it was (the card root for macOS leftovers). */
  path: string
  kind: 'file' | 'folder' | 'leftovers'
  bytes: number
  files: number
  /** Device clock when it was moved (seconds). */
  trashed: number
  /** False while a move was interrupted: restore and purge still work. */
  complete: boolean
}

export interface TrashListing {
  entries: TrashEntry[]
  count: number
  bytes: number
  truncated: boolean
}

/**
 * Whether a card path is in the trash: moved there itself, or inside a folder moved there (macOS leftovers aside).
 * The library keeps such tracks until the next scan; they are no duplicates of anything (owner, 2026-10-02).
 */
export function inTrash(path: string, entries: readonly TrashEntry[]): boolean {
  return entries.some(
    (entry) => entry.kind !== 'leftovers' && (path === entry.path || path.startsWith(`${entry.path}/`)),
  )
}

const whole = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

export function parseTrash(value: unknown): TrashListing | null {
  const v = value as Record<string, unknown> | null
  if (!v || !Array.isArray(v.entries)) return null
  const entries = (v.entries as Record<string, unknown>[]).flatMap((e): TrashEntry[] => {
    const kind = e.kind === 'folder' || e.kind === 'leftovers' ? e.kind : 'file'
    if (typeof e.id !== 'number' || typeof e.path !== 'string') return []
    return [
      {
        id: e.id,
        path: e.path,
        kind,
        bytes: whole(e.bytes),
        files: whole(e.files),
        trashed: whole(e.trashed),
        complete: e.complete !== false,
      },
    ]
  })
  return { entries, count: whole(v.count), bytes: whole(v.bytes), truncated: v.truncated === true }
}

export interface Leftovers {
  files: number
  bytes: number
  items: { path: string; kind: 'file' | 'folder'; files: number; bytes: number }[]
  truncated: boolean
}

export function parseLeftovers(value: unknown): Leftovers | null {
  const v = value as Record<string, unknown> | null
  if (!v || !Array.isArray(v.items)) return null
  return {
    files: whole(v.files),
    bytes: whole(v.bytes),
    items: (v.items as Record<string, unknown>[]).flatMap((item) =>
      typeof item.path === 'string'
        ? [
            {
              path: item.path,
              kind: item.kind === 'folder' ? 'folder' : 'file',
              files: whole(item.files),
              bytes: whole(item.bytes),
            },
          ]
        : [],
    ),
    truncated: v.truncated === true,
  }
}

/** The name a trash entry shows: the file or folder name, or null for macOS leftovers. */
export function entryName(entry: TrashEntry): string | null {
  return entry.kind === 'leftovers' ? null : (entry.path.split('/').pop() ?? entry.path)
}

/** The folder it came from, below the card root ('' for the root). */
export function entryFolder(entry: TrashEntry, cardRoot: string): string {
  const parent = entry.path.slice(0, entry.path.lastIndexOf('/'))
  return parent.startsWith(cardRoot) ? parent.slice(cardRoot.length).replace(/^\//, '') : parent
}
