/** What the MusicBrainz window identifies: an artist by name, or an album by its identity key with what is searched for it. */
export type IdentifyTarget =
  | { kind: 'artist'; name: string }
  | { kind: 'album'; key: string; title: string; artist: string; trackCount: number | null }
