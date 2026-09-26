/**
 * The compact heading's button (owner, round 14, option A): while the current
 * track belongs to this page it pauses or resumes it, otherwise it starts the
 * page's music like the heading's own play button.
 */
import { computed } from 'vue'
import type { HeadingAction } from '../components/collection/headingAction'
import type { Track } from '../domain/track'
import { t } from '../i18n'
import { isPlaying, playback } from '../stores/playback'
import { toggleCurrent } from './trackRows'

export function useHeadingAction(options: {
  owns: (track: Track) => boolean
  label: () => string
  disabled: () => boolean
  play: () => void
}) {
  const current = computed(() => {
    const track = playback.current.track
    return track !== null && options.owns(track)
  })
  const action = computed<HeadingAction>(() =>
    current.value
      ? { label: t(isPlaying.value ? 'pause' : 'play'), icon: isPlaying.value ? 'pause' : 'play', disabled: false }
      : { label: options.label(), icon: 'play', disabled: options.disabled() },
  )
  const run = (): void => {
    if (current.value) toggleCurrent()
    else options.play()
  }
  return { action, run }
}
