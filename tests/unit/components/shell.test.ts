// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ArtworkSleeve from '../../../src/components/artwork/ArtworkSleeve.vue'
import CoverCard from '../../../src/components/collection/CoverCard.vue'
import CoverCardSkeleton from '../../../src/components/collection/CoverCardSkeleton.vue'
import PlayerTransport from '../../../src/components/player/PlayerTransport.vue'
import TrackList from '../../../src/components/track/TrackList.vue'
import TrackListSkeleton from '../../../src/components/track/TrackListSkeleton.vue'
import type { Track } from '../../../src/domain/track'

const labels = {
  shuffle: 'Shuffle',
  previous: 'Previous',
  play: 'Play',
  pause: 'Pause',
  next: 'Next',
  repeat: 'Repeat',
  seek: 'Seek',
}
const track = (title: string, album: string | null, durationMs: number | null): Track => ({
  title,
  artist: 'Берег',
  album,
  durationMs,
  path: `/tmp/sdcard/${title}.flac`,
  queuePosition: null,
})

describe('ArtworkSleeve', () => {
  it('is decorative, shows the letters and is stable per title', () => {
    const a = mount(ArtworkSleeve, { props: { title: 'Тихий океан' } })
    const b = mount(ArtworkSleeve, { props: { title: 'Тихий океан' } })
    expect(a.attributes('aria-hidden')).toBe('true')
    expect(a.text()).toBe('ТИ')
    expect(a.classes()).toEqual(b.classes())
  })
})

describe('CoverCard', () => {
  it('opens through a labelled cover button and renders metadata as text', async () => {
    const card = mount(CoverCard, {
      props: { title: '<b>x</b>', lines: ['Берег', '4 трека'], openLabel: 'Открыть <b>x</b>' },
    })
    await card.get('button').trigger('click')
    expect(card.emitted('open')).toHaveLength(1)
    expect(card.get('button').attributes('aria-label')).toBe('Открыть <b>x</b>')
    expect(card.find('b').exists()).toBe(false)
    expect(card.text()).toContain('4 трека')
  })
})

describe('TrackList', () => {
  it('drops album and duration columns that no row knows', () => {
    const list = mount(TrackList, { props: { tracks: [track('Волны', null, null)] } })
    expect(list.findAll('[role=cell]')).toHaveLength(3)
    const full = mount(TrackList, { props: { tracks: [track('Волны', 'Тихий океан', 185_000)] } })
    expect(full.findAll('[role=cell]')).toHaveLength(5)
    expect(full.text()).toContain('3:05')
  })

  it('marks the current row by path', () => {
    const list = mount(TrackList, {
      props: { tracks: [track('A', null, null), track('B', null, null)], currentPath: '/tmp/sdcard/B.flac' },
    })
    const rows = list.findAll('[role=row]')
    expect(rows[1]?.classes()).toContain('bg-selected')
    expect(rows[0]?.classes()).not.toContain('bg-selected')
  })
})

describe('skeletons', () => {
  it('mirror the geometry of the content they replace', () => {
    const rows = mount(TrackListSkeleton, { props: { rows: 3, header: true, album: true, duration: true } })
    const list = mount(TrackList, {
      props: { tracks: [track('Волны', 'Тихий океан', 185_000)], header: { title: 'T', album: 'A' } },
    })
    const skeletonRow = rows.findAll(':scope > div')[1]
    const contentRow = list.findAll('[role=row]')[1]
    expect(skeletonRow?.classes()).toEqual(contentRow?.classes().filter((name) => !name.startsWith('hover:')))
    expect(rows.attributes('aria-hidden')).toBe('true')
    expect(
      mount(CoverCardSkeleton, { props: { artist: true, lines: 0 } })
        .find('.rounded-full')
        .exists(),
    ).toBe(true)
  })
})

describe('PlayerTransport', () => {
  it('emits intents, shows pause while playing and stays inert when disabled', async () => {
    const enabled = mount(PlayerTransport, {
      props: { state: 'playing', durationMs: 200_000, controlsDisabled: false, modeDisabled: true, labels },
    })
    const toggle = enabled.get('[data-testid=toggle]')
    expect(toggle.attributes('aria-label')).toBe('Pause')
    await toggle.trigger('click')
    await enabled.get('[aria-label=Next]').trigger('click')
    expect(enabled.emitted('transport')).toEqual([['toggle'], ['next']])
    expect(enabled.text()).toContain('3:20')
    const disabled = mount(PlayerTransport, {
      props: { state: 'paused', durationMs: null, controlsDisabled: true, modeDisabled: true, labels },
    })
    expect(disabled.get('[data-testid=toggle]').attributes('disabled')).toBeDefined()
    expect(disabled.get('[data-testid=toggle]').attributes('aria-label')).toBe('Play')
  })
})
