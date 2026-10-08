/**
 * What the MusicBrainz window identifies: an artist by name, or an album by its identity key with what is searched
 * for it and its scope (the literal track artist it is narrowed to, or null), which finds its tracks on the card.
 */
export type IdentifyTarget =
  | { kind: 'artist'; name: string }
  | { kind: 'album'; key: string; title: string; artist: string; scope: string | null; trackCount: number | null }
