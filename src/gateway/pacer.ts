/**
 * Mutation pacing from the reference Controller (device.py MutationPacer):
 * at least 2.1 s between mutation attempts, the first interval starting at
 * connection time. The wait happens before fresh preflight reads. The
 * gateway paces per class as well; this does not replace it.
 */
export class MutationPacer {
  private last: number

  constructor(
    private readonly intervalMs = 2100,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
  ) {
    this.last = now()
  }

  async wait(): Promise<void> {
    const remaining = this.last + this.intervalMs - this.now()
    if (remaining > 0) await this.sleep(remaining)
  }

  /** Marks an attempt before the write, so a failed write still counts. */
  attempted(): void {
    this.last = this.now()
  }
}

/** Thrown when a scan was observed; the operation sends nothing further. */
export class ScanObserved extends Error {
  constructor() {
    super('Library scan activity observed; nothing was sent')
  }
}
