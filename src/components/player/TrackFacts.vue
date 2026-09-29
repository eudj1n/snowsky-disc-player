<script setup lang="ts">
/**
 * The playing track's facts in the Now tab (owner, 2026-09-29): what is known
 * of it as a list of names and values (bit rate, channels, year, genre, disc
 * and track, album artist, the file's size and folder, plays, when added),
 * linking the genre, the album artist and the folder in the file manager,
 * with the dislike action beside the heading.
 */
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { formatBytes } from '../../domain/device'
import { relativeFolder } from '../../domain/files'
import type { TrackFacts } from '../../domain/nowFacts'
import { locale, t } from '../../i18n'
import UiIcon from '../../ui/UiIcon.vue'
import ArtistCredit from '../track/ArtistCredit.vue'

const props = defineProps<{
  facts: TrackFacts
  /** The service keeps a play history, so a count of none means never played. */
  playsKnown: boolean
  /** Whether the track is disliked; null where the store is not available. */
  disliked?: boolean | null
  dislikeLabel?: string
}>()
const emit = defineEmits<{ dislike: []; navigate: [] }>()

const date = (seconds: number) => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(seconds * 1000)

interface Row {
  key: string
  label: string
  text: string
  to?: RouteLocationRaw
  credit?: string
}

const rows = computed<Row[]>(() => {
  const facts = props.facts
  const rows: Row[] = []
  if (facts.bitRate)
    rows.push({ key: 'bit-rate', label: t('fact_bit_rate'), text: t('fact_bit_rate_value', { rate: facts.bitRate }) })
  if (facts.channels)
    rows.push({
      key: 'channels',
      label: t('fact_channels'),
      text:
        facts.channels === 1
          ? t('fact_mono')
          : facts.channels === 2
            ? t('fact_stereo')
            : t('fact_channel_count', { count: facts.channels }),
    })
  if (facts.year) rows.push({ key: 'year', label: t('fact_year'), text: String(facts.year) })
  if (facts.genre)
    rows.push({
      key: 'genre',
      label: t('fact_genre'),
      text: facts.genre,
      to: { name: 'genre', params: { name: facts.genre } },
    })
  if (facts.disc || facts.trackNumber) {
    const parts = [
      facts.disc ? t('fact_disc', { disc: facts.disc }) : null,
      facts.trackNumber ? t('fact_track', { track: facts.trackNumber }) : null,
    ]
    rows.push({ key: 'position', label: t('fact_position'), text: parts.filter(Boolean).join(' · ') })
  }
  if (facts.albumArtist)
    rows.push({ key: 'album-artist', label: t('fact_album_artist'), text: '', credit: facts.albumArtist })
  if (facts.bytes) rows.push({ key: 'size', label: t('fact_size'), text: formatBytes(facts.bytes, locale.value) })
  if (facts.folder) {
    const folder = relativeFolder(facts.folder)
    rows.push({
      key: 'folder',
      label: t('fact_folder'),
      text: folder || '/',
      to: { name: 'cardFiles', query: folder ? { folder } : {} },
    })
  }
  if (props.playsKnown)
    rows.push({
      key: 'plays',
      label: t('fact_plays'),
      text:
        facts.plays && facts.lastPlayedAt
          ? t('fact_plays_value', { count: facts.plays, date: date(facts.lastPlayedAt) })
          : t('fact_never_played'),
    })
  if (facts.addedAt) rows.push({ key: 'added', label: t('fact_added'), text: date(facts.addedAt) })
  return rows
})
</script>

<template>
  <section class="mt-26" data-testid="track-facts" :aria-label="t('facts_heading')">
    <div class="mb-8 flex items-center justify-between gap-10">
      <h3 class="m-0 text-10 font-[650] tracking-[1.8px] text-muted uppercase">{{ t('facts_heading') }}</h3>
      <button
        v-if="disliked !== null && disliked !== undefined"
        type="button"
        :aria-pressed="disliked"
        :aria-label="dislikeLabel"
        data-testid="now-dislike"
        class="flex items-center gap-6 rounded-14 px-10 py-5 text-11 text-muted hover:bg-soft hover:text-ink aria-pressed:text-accent"
        @click="emit('dislike')"
      >
        <UiIcon name="ban" class="size-14" />{{ dislikeLabel }}
      </button>
    </div>
    <dl class="m-0 grid grid-cols-[minmax(92px,auto)_minmax(0,1fr)] text-11">
      <template v-for="row in rows" :key="row.key">
        <dt class="border-t border-line/70 py-7 pr-14 text-muted">{{ row.label }}</dt>
        <dd
          class="m-0 min-w-0 border-t border-line/70 py-7 [overflow-wrap:anywhere] text-secondary"
          :data-fact="row.key"
          @click="($event.target as HTMLElement).closest('a') && emit('navigate')"
        >
          <ArtistCredit
            v-if="row.credit"
            :credit="row.credit"
            :to="(name) => ({ name: 'artist', params: { name } })"
            link-class="hover:text-ink hover:underline"
          />
          <RouterLink v-else-if="row.to" :to="row.to" class="hover:text-ink hover:underline">{{ row.text }}</RouterLink>
          <template v-else>{{ row.text }}</template>
        </dd>
      </template>
    </dl>
  </section>
</template>
