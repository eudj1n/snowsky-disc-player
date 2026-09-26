/**
 * Card media through the gateway's own read-only routes (service
 * combined-006): metadata, covers and lyrics of one music file by its card
 * path, and the lyrics stock prepared for the current track with their age.
 * Older images do not serve them; health reports `media: true` when they do.
 */
import { coverType, MAX_COVER_BYTES } from './artwork'
import type { GatewayHttp } from './http'

export interface MediaInfo {
  path: string
  format: string
  bytes: number
  durationMs: number | null
  sampleRate: number | null
  bitDepth: number | null
  channels: number | null
  /** Average kbit/s of lossy files (MP3, AAC; service next image), else null. */
  bitRate: number | null
  cover: 'embedded' | 'folder' | null
  lyrics: 'sidecar' | 'embedded' | null
  /** The year of the DATE tag (FLAC); stock keeps no year. */
  year: number | null
}

/** The leading year of a DATE tag ("2004", "2001-05-04"), within reason. */
export function tagYear(date: unknown): number | null {
  const match = typeof date === 'string' ? /^(\d{4})(?!\d)/.exec(date.trim()) : null
  const year = match?.[1] ? Number(match[1]) : null
  return year !== null && year >= 1000 && year <= 9999 ? year : null
}

export type LyricsSource = 'sidecar' | 'embedded' | 'player'

export interface LyricsText {
  text: string
  source: LyricsSource
}

/** The card path as URL path segments (each component percent-encoded). */
export function mediaPath(path: string): string {
  if (!path.startsWith('/')) throw new RangeError('Expected an absolute card path')
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

const count = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null)

export async function mediaInfo(http: GatewayHttp, path: string): Promise<MediaInfo | null> {
  const response = await http.media(`/info${mediaPath(path)}`)
  if (!response) return null
  const value = (await response.json()) as Record<string, unknown>
  if (typeof value.path !== 'string' || typeof value.format !== 'string') throw new SyntaxError('Invalid media info')
  return {
    path: value.path,
    format: value.format,
    bytes: typeof value.bytes === 'number' ? value.bytes : 0,
    durationMs: count(value.durationMs),
    sampleRate: count(value.sampleRate),
    bitDepth: count(value.bitDepth),
    channels: count(value.channels),
    bitRate: count(value.bitRate),
    cover: value.cover === 'embedded' || value.cover === 'folder' ? value.cover : null,
    lyrics: value.lyrics === 'sidecar' || value.lyrics === 'embedded' ? value.lyrics : null,
    year: tagYear((value.tags as Record<string, unknown> | undefined)?.date),
  }
}

/** The file's embedded or folder cover, checked as JPEG or PNG. */
export async function mediaCover(http: GatewayHttp, path: string): Promise<Blob | null> {
  const response = await http.media(`/cover${mediaPath(path)}`)
  if (!response) return null
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.length || bytes.length > MAX_COVER_BYTES) return null
  const type = coverType(bytes)
  return type ? new Blob([bytes], { type }) : null
}

/**
 * Lyrics bytes as text: UTF-8 when valid, otherwise the legacy encoding the
 * collection most likely uses (Cyrillic Windows-1251 by default).
 */
export function decodeLyrics(bytes: Uint8Array, fallback = 'windows-1251'): string {
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    return new TextDecoder(fallback).decode(body)
  }
}

export async function mediaLyrics(http: GatewayHttp, path: string): Promise<LyricsText | null> {
  const response = await http.media(`/lyrics${mediaPath(path)}`)
  if (!response) return null
  const source = response.headers.get('x-lyrics-source') === 'embedded' ? 'embedded' : 'sidecar'
  return { text: decodeLyrics(new Uint8Array(await response.arrayBuffer())), source }
}

/** Stock's lyrics for the current track and their age in seconds (the file names no track). */
export async function currentLyrics(http: GatewayHttp): Promise<{ text: string; ageSeconds: number } | null> {
  const response = await http.media('/current-lyrics')
  if (!response) return null
  const age = Number(response.headers.get('x-lyrics-age'))
  return {
    text: decodeLyrics(new Uint8Array(await response.arrayBuffer())),
    ageSeconds: Number.isFinite(age) && age >= 0 ? age : Number.POSITIVE_INFINITY,
  }
}
