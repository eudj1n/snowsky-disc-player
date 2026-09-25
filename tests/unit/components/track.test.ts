// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TrackArtwork from '../../../src/components/track/TrackArtwork.vue'
import TrackSummary from '../../../src/components/track/TrackSummary.vue'
import type { Track } from '../../../src/domain/track'

const track: Track = {
  title: 'Шёлк',
  artist: 'Ваня Дмитриенко',
  album: null,
  queuePosition: 0,
  path: '/tmp/sdcard/Шёлк.flac',
  durationMs: 185_000,
}

describe('TrackSummary', () => {
  it('shows device metadata as is, with only known credits', () => {
    const wrapper = mount(TrackSummary, { props: { track, showDetails: true } })
    expect(wrapper.get('[data-testid=track-title]').text()).toBe('Шёлк')
    expect(wrapper.text()).toContain('Ваня Дмитриенко')
    expect(wrapper.text()).not.toContain('·')
    expect(wrapper.text()).toContain('FLAC')
    expect(wrapper.text()).toContain('3:05')
  })

  it('hides details unless asked', () => {
    expect(mount(TrackSummary, { props: { track } }).text()).not.toContain('FLAC')
  })

  it('renders untrusted text as text', () => {
    const wrapper = mount(TrackSummary, { props: { track: { ...track, title: '<img src=x onerror=alert(1)>' } } })
    expect(wrapper.find('img').exists()).toBe(false)
  })
})

describe('TrackArtwork', () => {
  it('is decorative and stable for the same title', () => {
    const a = mount(TrackArtwork, { props: { title: 'Mezmerize' } })
    const b = mount(TrackArtwork, { props: { title: 'Mezmerize' } })
    expect(a.attributes('aria-hidden')).toBe('true')
    expect(a.text()).toBe('M')
    expect(a.classes()).toEqual(b.classes())
    expect(mount(TrackArtwork, { props: { title: null } }).text()).toBe('♪')
  })
})
