/**
 * Stock options that change where the player's own current cover and lyrics
 * come from (SYSCONFIG ONLINE_COVER / ONLINE_LRC, read with the system
 * settings). With them on, stock replaces the current track's cover.jpg and
 * encoder.lrc with results from iTunes and NetEase (static analysis of
 * mq_player V2.57), and nothing records which source a file came from.
 */
import { reactive, readonly } from 'vue'

const state = reactive({ onlineCovers: false, onlineLyrics: false })
export const playerOptions = readonly(state)

export function adoptOnlineOptions(options: { covers: boolean; lyrics: boolean } | null): void {
  state.onlineCovers = options?.covers ?? false
  state.onlineLyrics = options?.lyrics ?? false
}
