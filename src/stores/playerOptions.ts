/**
 * What the page takes from stock's stored settings (SYSCONFIG, read with the
 * system settings): the battery charge for the player card, and the options
 * that change where the player's own current cover and lyrics come from
 * (ONLINE_COVER / ONLINE_LRC). With them on, stock replaces the current track's cover.jpg and
 * encoder.lrc with results from iTunes and NetEase (static analysis of
 * mq_player V2.57), and nothing records which source a file came from.
 */
import { reactive, readonly } from 'vue'

const state = reactive({ onlineCovers: false, onlineLyrics: false, battery: null as number | null })
export const playerOptions = readonly(state)

export function adoptBattery(percent: number | null): void {
  state.battery = percent
}

export function adoptOnlineOptions(options: { covers: boolean; lyrics: boolean } | null): void {
  state.onlineCovers = options?.covers ?? false
  state.onlineLyrics = options?.lyrics ?? false
}
