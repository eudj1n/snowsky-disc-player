/**
 * The service's diagnostics document (combined-008, GET /api/about): what
 * support reads without a console. Unknown fields are ignored.
 */

export interface About {
  /** The gateway's own version (0.9.0 since the combined images): not the release; see servicePackage. */
  version: string
  build: string
  /**
   * The package the boot layer runs this service as (its name and release, as
   * disc-server 2.57.2), from the boot layer's status; null outside the boot layer.
   */
  servicePackage: { name: string; version: string | null } | null
  uptime: number
  supervised: boolean
  image: { variant: string | null; firmware: string | null } | null
  /** The default app serving the page (combined-009) and its version from its app.json. */
  page: { source: 'card' | 'image' | 'embedded'; version: string | null }
  cardOwned: boolean
  database: {
    state: string
    schema: number | null
    bytes: number | null
    plays: number | null
    records: number | null
    trash: number | null
    /**
     * Combined-009: plays the service could not write since it started, when,
     * and the last reason ("card full", "card away", "newer schema",
     * "input/output" or "failed"); null on earlier images.
     */
    writes: { failed: number; lastFailure: number | null; lastSuccess: number | null; reason: string | null } | null
  } | null
  log: { at: number; message: string }[]
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
const number = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

export function parseAbout(value: unknown): About | null {
  const v = value as Record<string, unknown> | null
  const service = v?.service as Record<string, unknown> | undefined
  if (!v || !service || typeof service.version !== 'string') return null
  const image = v.image as Record<string, unknown> | null
  const page = (v.page ?? {}) as Record<string, unknown>
  const database = v.database as Record<string, unknown> | null
  const writes = (database?.writes ?? null) as Record<string, unknown> | null
  const role = ((v.boot as Record<string, unknown> | null | undefined)?.service ?? null) as Record<
    string,
    unknown
  > | null
  const roleName = text(role?.name)
  return {
    version: service.version,
    build: text(service.build) ?? 'unknown',
    servicePackage: roleName ? { name: roleName, version: text(role?.version) } : null,
    uptime: number(service.uptime) ?? 0,
    supervised: service.supervised === true,
    image: image ? { variant: text(image.variant), firmware: text(image.firmwareVersion) } : null,
    page: {
      source: page.source === 'card' || page.source === 'image' ? page.source : 'embedded',
      version: text(page.version),
    },
    cardOwned: (v.card as Record<string, unknown> | undefined)?.owned === true,
    database: database
      ? {
          state: text(database.state) ?? 'failed',
          schema: number(database.schema),
          bytes: number(database.bytes),
          plays: number(database.plays),
          records: number(database.records),
          trash: number(database.trash),
          writes: writes
            ? {
                failed: number(writes.failed) ?? 0,
                lastFailure: number(writes.lastFailure),
                lastSuccess: number(writes.lastSuccess),
                reason: text(writes.reason),
              }
            : null,
        }
      : null,
    log: Array.isArray(v.log)
      ? (v.log as Record<string, unknown>[]).flatMap((entry) =>
          typeof entry.m === 'string' ? [{ at: number(entry.t) ?? 0, message: entry.m }] : [],
        )
      : [],
  }
}
