// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ArtworkSleeve from '../../../src/components/artwork/ArtworkSleeve.vue'
import CoverCard from '../../../src/components/collection/CoverCard.vue'
import CoverCardSkeleton from '../../../src/components/collection/CoverCardSkeleton.vue'
import PlayerTransport from '../../../src/components/player/PlayerTransport.vue'
import SeekBar from '../../../src/components/player/SeekBar.vue'
import VolumeControl from '../../../src/components/player/VolumeControl.vue'
import TrackTiles from '../../../src/components/track/TrackTiles.vue'
import UiNowPlaying from '../../../src/ui/UiNowPlaying.vue'
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
  it('opens from the cover and the title, links the artist and renders metadata as text', () => {
    const card = mount(CoverCard, {
      props: {
        title: '<b>x</b>',
        to: '/album/x',
        lines: [{ text: 'Берег', to: '/artist/Берег' }, { text: '4 трека' }],
        openLabel: 'Открыть <b>x</b>',
      },
      global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="String(to)"><slot /></a>' } } },
    })
    const links = card.findAll('a')
    expect(links.map((link) => link.attributes('href'))).toEqual(['/album/x', '/album/x', '/artist/Берег'])
    expect(links[0]?.attributes('aria-label')).toBe('Открыть <b>x</b>')
    expect(card.find('b').exists()).toBe(false)
    expect(card.text()).toContain('4 трека')
  })
})

describe('TrackList', () => {
  it('drops album and duration columns that no row knows, or the album when asked', () => {
    const list = mount(TrackList, { props: { tracks: [track('Волны', null, null)] } })
    expect(list.findAll('[role=cell]')).toHaveLength(2)
    const full = mount(TrackList, { props: { tracks: [track('Волны', 'Тихий океан', 185_000)] } })
    expect(full.findAll('[role=cell]')).toHaveLength(4)
    expect(full.text()).toContain('3:05')
    const albumPage = mount(TrackList, {
      props: { tracks: [track('Волны', 'Тихий океан', 185_000)], showAlbum: false },
    })
    expect(albumPage.text()).not.toContain('Тихий океан')
  })

  it('offers track actions from the ⋯ button and the context menu', async () => {
    const list = mount(TrackList, {
      props: { tracks: [track('Волны', 'Тихий океан', null)], menuLabel: 'Track actions' },
    })
    const button = list.get('[data-track-menu]')
    expect(button.attributes('aria-haspopup')).toBe('menu')
    expect(button.attributes('aria-label')).toBe('Track actions: Волны')
    await button.trigger('click')
    await list.get('[role=row]').trigger('contextmenu')
    expect(list.emitted('menu')?.map(([index]) => index)).toEqual([0, 0])
  })

  it('marks only the playing track of a CUE sheet whose tracks share one file', () => {
    const cue = (title: string): Track => ({
      ...track(title, 'Best of', null),
      path: '/tmp/sdcard/Image.flac',
      cue: true,
    })
    const list = mount(TrackList, {
      props: {
        tracks: [cue('Break the Line'), cue('Open Your Eyes'), cue('Big in Japan')],
        currentPath: '/tmp/sdcard/Image.flac',
        currentTitle: 'Open Your Eyes',
        currentCue: true,
      },
    })
    const current = list.findAll('[role=row]').map((row) => row.classes().includes('bg-selected'))
    expect(current).toEqual([false, true, false])
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
    const rows = mount(TrackListSkeleton, { props: { rows: 3, album: true, duration: true, actions: true } })
    const list = mount(TrackList, {
      props: { tracks: [track('Волны', 'Тихий океан', 185_000)], menuLabel: 'Track actions' },
    })
    const skeletonRow = rows.findAll(':scope > div')[0]
    const contentRow = list.findAll('[role=row]')[0]
    expect(skeletonRow?.classes()).toEqual(
      contentRow?.classes().filter((name) => !name.startsWith('hover:') && !name.startsWith('group/')),
    )
    expect(rows.attributes('aria-hidden')).toBe('true')
    expect(
      mount(CoverCardSkeleton, { props: { artist: true, lines: 0 } })
        .find('.rounded-full')
        .exists(),
    ).toBe(true)
  })
})

describe('PlayerTransport', () => {
  const base = {
    positionMs: 42_000,
    identity: 'id',
    modesDisabled: false,
    seekDisabled: false,
    shuffle: false,
    repeat: true,
    labels,
  }

  it('emits transport and mode intents, shows pause while playing and the mode state', async () => {
    const bar = mount(PlayerTransport, {
      props: { ...base, state: 'playing', durationMs: 200_000, controlsDisabled: false },
    })
    const toggle = bar.get('[data-testid=toggle]')
    expect(toggle.attributes('aria-label')).toBe('Pause')
    await toggle.trigger('click')
    await bar.get('[aria-label=Next]').trigger('click')
    await bar.get('[aria-label=Shuffle]').trigger('click')
    expect(bar.emitted('transport')).toEqual([['toggle'], ['next']])
    expect(bar.emitted('mode')).toEqual([['shuffle']])
    expect(bar.get('[aria-label=Repeat]').attributes('aria-pressed')).toBe('true')
    expect(bar.text()).toContain('0:42')
    expect(bar.text()).toContain('3:20')
  })

  it('stays inert when disabled', () => {
    const bar = mount(PlayerTransport, {
      props: { ...base, state: 'paused', durationMs: null, controlsDisabled: true, modesDisabled: true },
    })
    expect(bar.get('[data-testid=toggle]').attributes('disabled')).toBeDefined()
    expect(bar.get('[aria-label=Shuffle]').attributes('disabled')).toBeDefined()
  })
})

describe('SeekBar', () => {
  it('previews while dragging and sends one seek on release with the captured track', async () => {
    const bar = mount(SeekBar, {
      props: { positionMs: 10_000, durationMs: 200_000, identity: 'track-a', disabled: false, label: 'Seek' },
    })
    const slider = bar.get('input')
    expect(slider.attributes('max')).toBe('199')
    await slider.trigger('pointerdown')
    ;(slider.element as HTMLInputElement).value = '120'
    await slider.trigger('input')
    expect(bar.text()).toContain('2:00')
    expect(bar.emitted('seek')).toBeUndefined()
    await bar.setProps({ positionMs: 11_000 })
    expect((slider.element as HTMLInputElement).value).toBe('120')
    await slider.trigger('change')
    expect(bar.emitted('seek')).toEqual([[120, 'track-a']])
  })

  it('discards a press without movement', async () => {
    const bar = mount(SeekBar, {
      props: { positionMs: 10_000, durationMs: 200_000, identity: 'track-a', disabled: false, label: 'Seek' },
    })
    await bar.get('input').trigger('pointerdown')
    await bar.get('input').trigger('pointerup')
    await bar.get('input').trigger('change')
    expect(bar.emitted('seek')).toBeUndefined()
  })
})

const LINK_STUB = {
  global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="JSON.stringify(to)"><slot /></a>' } } },
}

describe('TrackTiles', () => {
  it('links the title to the album and the artist to their page when routes are given', () => {
    const tiles = mount(TrackTiles, {
      props: {
        tracks: [track('Волны', 'Тихий океан', null)],
        playLabel: 'Play',
        menuLabel: 'Track actions',
        titleTo: (item: Track) => ({ name: 'album', params: { name: item.album, artist: item.artist } }),
        artistTo: (name: string) => ({ name: 'artist', params: { name } }),
      },
      ...LINK_STUB,
    })
    const links = tiles.findAll('a')
    expect(links.map((link) => link.text())).toEqual(['Волны', 'Берег'])
    expect(JSON.parse(links[0]?.attributes('href') ?? '{}')).toEqual({
      name: 'album',
      params: { name: 'Тихий океан', artist: 'Берег' },
    })
  })

  it('keeps plain text without routes and marks the current track with a resting or pulsing dot', async () => {
    const tiles = mount(TrackTiles, {
      props: {
        tracks: [track('Волны', 'Тихий океан', null)],
        playLabel: 'Play',
        menuLabel: 'Track actions',
        currentPath: '/tmp/sdcard/Волны.flac',
        playing: false,
      },
      ...LINK_STUB,
    })
    expect(tiles.findAll('a')).toHaveLength(0)
    expect(tiles.find('li').attributes('aria-current')).toBe('true')
    expect(tiles.findComponent(UiNowPlaying).attributes('data-playing')).toBe('false')
    await tiles.setProps({ playing: true })
    expect(tiles.findComponent(UiNowPlaying).attributes('data-playing')).toBe('true')
  })
})

describe('VolumeControl', () => {
  const props = { disabled: false, label: 'Volume', title: 'Volume', muteLabel: 'Mute', unmuteLabel: 'Unmute' }

  it('mutes from the icon and offers unmute at volume 0', async () => {
    const control = mount(VolumeControl, { props: { ...props, volume: 40 } })
    const button = control.get('button')
    expect(button.attributes('aria-label')).toBe('Mute')
    await button.trigger('click')
    expect(control.emitted('mute')).toHaveLength(1)
    await control.setProps({ volume: 0 })
    expect(control.get('button').attributes('aria-label')).toBe('Unmute')
    expect(control.get('button').attributes('aria-pressed')).toBe('true')
  })

  it('cannot toggle an unknown volume', () => {
    const control = mount(VolumeControl, { props: { ...props, volume: null } })
    expect(control.get('button').attributes('disabled')).toBeDefined()
  })
})

describe('TrackList links and header', () => {
  it('links artist and album when routes are given and aligns the title header with the cover', () => {
    const list = mount(TrackList, {
      props: {
        tracks: [track('Волны', 'Тихий океан', 185_000)],
        menuLabel: 'Track actions',
        header: { title: 'Title', album: 'Album', duration: 'Duration' },
        artistTo: (name: string) => ({ name: 'artist', params: { name } }),
        albumTo: (item: Track) => ({ name: 'album', params: { name: item.album, artist: item.artist } }),
      },
      ...LINK_STUB,
    })
    expect(list.findAll('a').map((link) => link.text())).toEqual(['Берег', 'Тихий океан'])
    const headers = list.findAll('[role=columnheader]')
    expect(headers[0]?.text()).toBe('Title')
    expect(headers[0]?.classes()).toContain('col-span-2')
  })

  it('leads album rows with the track number, or the position when it is unknown', () => {
    const numbered = { ...track('Волны', 'Тихий океан', null), trackNumber: 7 }
    const list = mount(TrackList, {
      props: { tracks: [numbered, track('Берег', 'Тихий океан', null)], lead: 'number', playLabel: 'Play' },
    })
    const leads = list.findAll('button[aria-label^="Play"]').map((button) => button.text())
    expect(leads).toEqual(['7', '2'])
  })

  it('shows a favorite heart in the gutter; only the current track can change it', async () => {
    const labels = {
      favorite: 'In favorites',
      add: 'Add',
      remove: 'Remove',
      onlyCurrent: 'Only the playing track',
      removeAny: 'Remove from favorites',
    }
    const a = track('Волны', 'Тихий океан', null)
    const b = track('Берег', 'Тихий океан', null)
    const list = mount(TrackList, {
      props: {
        tracks: [a, b],
        favoriteLabels: labels,
        favoriteOf: (item: Track) => item.title === 'Волны',
        currentPath: b.path,
        favoriteDisabled: false,
      },
    })
    expect(list.findAll('[role=row]')[0]?.text()).toContain('In favorites')
    const toggle = list.get('button[aria-label="Add"]')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await toggle.trigger('click')
    expect(list.emitted('favorite')).toHaveLength(1)
    await list.setProps({ favoriteDisabled: true })
    expect(list.find('button[aria-label="Add"]').exists()).toBe(false)
  })

  it('offers removal of a favorite that is not playing only when the catalog admits it', async () => {
    const labels = {
      favorite: 'Fav',
      add: 'Add',
      remove: 'Remove',
      onlyCurrent: 'Only',
      removeAny: 'Remove from favorites',
    }
    const a = track('Волны', 'Тихий океан', null)
    const list = mount(TrackList, {
      props: { tracks: [a], favoriteLabels: labels, favoriteOf: () => true },
    })
    expect(list.find('button[aria-label^="Remove from favorites"]').exists()).toBe(false)
    await list.setProps({ favoriteRemovable: true })
    await list.get('button[aria-label^="Remove from favorites"]').trigger('click')
    expect(list.emitted('unfavorite')?.[0]).toEqual([a])
  })
})

describe('CoverCard play', () => {
  it('offers a round play button instead of the arrow and keeps it outside the link', async () => {
    const card = mount(CoverCard, {
      props: { title: 'Blue Hours', to: '/album/Blue%20Hours', openLabel: 'Open', playLabel: 'Play Blue Hours' },
      ...LINK_STUB,
    })
    expect(card.html()).not.toContain('↗')
    const button = card.get('button[aria-label="Play Blue Hours"]')
    expect(button.element.closest('a')).toBeNull()
    await button.trigger('click')
    expect(card.emitted('play')).toHaveLength(1)
    const plain = mount(CoverCard, { props: { title: 'X', to: '/x', openLabel: 'Open' }, ...LINK_STUB })
    expect(plain.find('button').exists()).toBe(false)
  })
})

describe('TrackList progressive rendering', () => {
  it('draws long lists in batches as the end comes into view', async () => {
    const callbacks: ((entries: { isIntersecting: boolean }[]) => void)[] = []
    class FakeObserver {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        callbacks.push(callback)
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const tracks = Array.from({ length: 150 }, (_, index) => track(`Song ${index + 1}`, 'Album', 180_000))
    const list = mount(TrackList, { props: { tracks }, ...LINK_STUB })
    await nextTick()
    expect(list.findAll('[role=row]')).toHaveLength(60)
    callbacks.at(-1)?.([{ isIntersecting: true }])
    await nextTick()
    expect(list.findAll('[role=row]')).toHaveLength(120)
    callbacks.at(-1)?.([{ isIntersecting: true }])
    await nextTick()
    expect(list.findAll('[role=row]')).toHaveLength(150)
    vi.unstubAllGlobals()
  })
})
