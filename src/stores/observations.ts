/**
 * Session observations beyond now-playing, reduced as the reference reader
 * does (session.py LiveClient._update): position from a103 ticks (unknown
 * after a track change or a stop/loading state), play mode from a102, scan
 * activity from a622 and a60a (000F start, 0005 end).
 */
import { reactive, readonly } from 'vue'
import { currentPlayback } from '../gateway/playback'
import { onSessionOpened } from './connection'

interface ObservationModel {
  positionMs: number | null
  /** performance.now() when that position arrived, for extrapolation between ticks. */
  positionAt: number | null
  /** Stock play mode 0..4 (list once, random, repeat one, repeat list, single once). */
  mode: number | null
  scanActive: boolean
  /** Scan records seen on this session; operations compare it around their sends. */
  scanEvents: number
  /** Scan discoveries (a622) since the last start. */
  discovered: number | null
}

const state = reactive<ObservationModel>({
  positionMs: null,
  positionAt: null,
  mode: null,
  scanActive: false,
  scanEvents: 0,
  discovered: null,
})
export const observations = readonly(state)

let identity = ''

onSessionOpened((session) => {
  Object.assign(state, { positionMs: null, mode: null, scanActive: false, discovered: null })
  identity = ''
  session.onRecord(({ tag, payload }) => {
    if (tag === 'a103') {
      const value = /^[0-9a-fA-F]{1,8}$/.test(payload) ? parseInt(payload, 16) : NaN
      if (Number.isFinite(value)) {
        state.positionMs = value
        state.positionAt = performance.now()
      }
    } else if (tag === 'a102') {
      const value = /^[0-9a-fA-F]{4}$/.test(payload) ? parseInt(payload, 16) : NaN
      if (value >= 0 && value <= 4) state.mode = value
    } else if (tag === 'a622') {
      state.scanEvents++
      state.scanActive = true
      if (/^[0-9a-fA-F]{1,8}$/.test(payload)) state.discovered = parseInt(payload, 16)
    } else if (tag === 'a60a') {
      const value = parseInt(payload, 16)
      if (value === 0x0f) {
        state.scanEvents++
        state.scanActive = true
        state.discovered = null
      } else if (value === 0x05) {
        state.scanEvents++
        state.scanActive = false
      }
    } else if (tag === 'a202') {
      try {
        const playback = currentPlayback(session)
        const next = playback.track
          ? JSON.stringify([playback.source, playback.track.title, playback.track.path, playback.track.queuePosition])
          : ''
        if (playback.state === 'loading') state.positionMs = null
        if (next && next !== identity) {
          identity = next
          state.positionMs = null
        }
      } catch {
        // Invalid a202 is handled by the playback store.
      }
    }
  })
  session.onClose(() => {
    Object.assign(state, { positionMs: null, mode: null, scanActive: false })
  })
})
