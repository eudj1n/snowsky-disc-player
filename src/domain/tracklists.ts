/**
 * An edition's tracks set beside the album's tracks on the card (owner,
 * 2026-10-08: choosing an edition blind is hard; the proposed structure on
 * the left, the card's on the right). Rows pair by place; a row's title
 * differs when the other side has no track there or another title (letters
 * and digits compared, case and accents aside), its length when both are
 * known and more than three seconds apart. The card's rows are marked only
 * where the edition has no track.
 */

export interface ListedTrack {
  /** The disc (medium) the track is on, when known. */
  disc: number | null
  /** Its number as printed ("3", "A1"), when known. */
  number: string | null
  title: string
  lengthMs: number | null
}

export interface ComparedTrack extends ListedTrack {
  /** "3", or "2·3" when the list spans several discs. */
  label: string
  titleDiffers: boolean
  lengthDiffers: boolean
}

export interface Tracklist {
  rows: ComparedTrack[]
  /** The whole length, when every track's is known. */
  lengthMs: number | null
}

const LENGTH_SLACK_MS = 3000

const titleKey = (title: string): string =>
  title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')

const lengthsApart = (a: ListedTrack, b: ListedTrack): boolean =>
  a.lengthMs !== null && b.lengthMs !== null && Math.abs(a.lengthMs - b.lengthMs) > LENGTH_SLACK_MS

function labelled(tracks: readonly ListedTrack[]): (track: ListedTrack) => string {
  const discs = new Set(tracks.map((track) => track.disc ?? 1))
  return (track) =>
    discs.size > 1 && track.disc !== null ? `${String(track.disc)}·${track.number ?? ''}` : (track.number ?? '')
}

function total(tracks: readonly ListedTrack[]): number | null {
  if (!tracks.length || tracks.some((track) => track.lengthMs === null)) return null
  return tracks.reduce((sum, track) => sum + (track.lengthMs ?? 0), 0)
}

/** Both lists, row by row, with what differs marked; nothing is marked while the edition's tracks are unknown. */
export function compareTracklists(
  proposed: readonly ListedTrack[],
  current: readonly ListedTrack[],
): { proposed: Tracklist; current: Tracklist } {
  const proposedLabel = labelled(proposed)
  const currentLabel = labelled(current)
  return {
    proposed: {
      rows: proposed.map((track, index) => {
        const there = current[index]
        return {
          ...track,
          label: proposedLabel(track),
          titleDiffers: !there || titleKey(track.title) !== titleKey(there.title),
          lengthDiffers: there !== undefined && lengthsApart(track, there),
        }
      }),
      lengthMs: total(proposed),
    },
    current: {
      rows: current.map((track, index) => ({
        ...track,
        label: currentLabel(track),
        titleDiffers: proposed.length > 0 && !proposed[index],
        lengthDiffers: false,
      })),
      lengthMs: total(current),
    },
  }
}
