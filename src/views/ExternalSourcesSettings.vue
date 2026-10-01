<script setup lang="ts">
/**
 * The Settings page's outside sources (owner, 2026-10-01): grouped by what
 * they bring, each off until allowed, and automatic only when also chosen.
 * The choice is kept on the player, so changing it needs pairing; a source
 * the release's origins do not admit stays unavailable here, and so does one
 * whose needs (MusicBrainz for the sources found by its ids) are not allowed:
 * its saved choice stays in place, dimmed.
 */
import { computed, reactive } from 'vue'
import { t, type MessageKey } from '../i18n'
import { artistPhotoOriginsAdmitted } from '../stores/artistPictures'
import { originAllowed, originHosts } from '../stores/connection'
import { coverOriginsAdmitted } from '../stores/coverSearch'
import {
  chooseSource,
  externalSources,
  missingKey,
  missingNeeds,
  setSourceKey,
  SOURCE_KEY,
  SOURCE_KINDS,
  SOURCES,
  type SourceKind,
  type SourceName,
} from '../stores/externalSources'
import { lrclibAdmitted } from '../stores/lyrics'
import { pairing } from '../stores/pairing'
import { openDialog } from '../stores/ui'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'

const KIND_TITLES: Record<SourceKind, MessageKey> = {
  metadata: 'source_kind_metadata',
  lyrics: 'source_kind_lyrics',
  album_covers: 'source_kind_album_covers',
  artist_images: 'source_kind_artist_images',
}
interface SourceText {
  about: MessageKey
  sends: MessageKey
  /** When it is asked automatically; none for a source used only through others. */
  auto: MessageKey | null
  admitted: () => boolean
}
const TEXTS: Record<SourceName, SourceText> = {
  musicbrainz: {
    about: 'source_musicbrainz_about',
    sends: 'source_musicbrainz_sends',
    auto: null,
    admitted: () => originAllowed('musicbrainz'),
  },
  lrclib: {
    about: 'source_lrclib_about',
    sends: 'source_lrclib_sends',
    auto: 'source_lrclib_auto',
    admitted: lrclibAdmitted,
  },
  coverartarchive: {
    about: 'source_coverartarchive_about',
    sends: 'source_coverartarchive_sends',
    auto: 'source_coverartarchive_auto',
    admitted: coverOriginsAdmitted,
  },
  wikimedia: {
    about: 'source_wikimedia_about',
    sends: 'source_wikimedia_sends',
    auto: 'source_wikimedia_auto',
    admitted: artistPhotoOriginsAdmitted,
  },
  fanarttv: {
    about: 'source_fanarttv_about',
    sends: 'source_fanarttv_sends',
    auto: 'source_fanarttv_auto',
    admitted: () => originAllowed('fanart_api') && originAllowed('fanart_assets'),
  },
}

/** The release's origins each source reaches (owner, 2026-10-01: Cover Art Archive's images come from archive.org). */
const ORIGINS: Record<SourceName, readonly string[]> = {
  musicbrainz: ['musicbrainz'],
  lrclib: ['lrclib'],
  coverartarchive: ['coverartarchive', 'archive_root', 'archive'],
  fanarttv: ['fanart_api', 'fanart_assets'],
  wikimedia: ['commons', 'wikidata', 'wikimedia_thumb', 'wikimedia_upload'],
}
const groups = computed(() =>
  SOURCE_KINDS.map((kind) => ({ kind, sources: SOURCES.filter((source) => source.kind === kind) })).filter(
    (group) => group.sources.length > 0,
  ),
)
/** Why nothing can change now, if so. */
const blocked = computed<MessageKey | null>(() =>
  !externalSources.available ? 'sources_unavailable' : !pairing.stored ? 'sources_pair' : null,
)
const allowed = (name: SourceName) => externalSources.choices[name]?.allowed === true
const automatic = (name: SourceName) => allowed(name) && externalSources.choices[name]?.auto === true
const titleOf = (name: SourceName) => SOURCES.find((source) => source.name === name)?.title ?? name
/** What the source waits for, as its names. */
const waiting = (name: SourceName) => missingNeeds(name).map(titleOf).join(', ')
/** Nothing about the source can change now. */
const frozen = (name: SourceName) => blocked.value !== null || externalSources.busy !== null || !TEXTS[name].admitted()
const locked = (name: SourceName) => frozen(name) || waiting(name) !== '' || missingKey(name)
const keyOf = (name: SourceName) => externalSources.choices[name]?.key ?? null
/** Keys being typed, and whether the last one was refused as malformed. */
const drafts = reactive<Partial<Record<SourceName, string>>>({})
const malformed = reactive<Partial<Record<SourceName, boolean>>>({})
async function saveKey(name: SourceName): Promise<void> {
  const value = drafts[name]?.trim() ?? ''
  malformed[name] = !SOURCE_KEY.test(value)
  if (!malformed[name] && (await setSourceKey(name, value))) drafts[name] = ''
}
/** Asks the player; the box then shows what the player keeps, whatever the click showed. */
async function choose(event: Event, name: SourceName, field: 'allowed' | 'auto'): Promise<void> {
  const input = event.target as HTMLInputElement
  await chooseSource(name, { [field]: input.checked })
  input.checked = field === 'allowed' ? allowed(name) : automatic(name)
}
const hostOf = (site: string) => new URL(site).host
</script>

<template>
  <div class="grid max-w-720 gap-0" data-testid="settings-sources">
    <p
      v-if="blocked"
      class="mt-0 mb-20 flex flex-wrap items-center gap-x-12 gap-y-6 rounded-12 border border-line bg-raised px-16 py-12 text-footnote text-secondary"
      role="status"
      data-testid="sources-blocked"
    >
      {{ t(blocked) }}
      <UiTextButton v-if="blocked === 'sources_pair'" @click="openDialog('connection')">{{
        t('sources_pair_open')
      }}</UiTextButton>
    </p>
    <section v-for="group in groups" :key="group.kind" class="mb-24" :aria-labelledby="`sources-${group.kind}`">
      <h3
        :id="`sources-${group.kind}`"
        class="mt-0 mb-10 text-caption2 font-semibold tracking-caps text-muted uppercase"
      >
        {{ t(KIND_TITLES[group.kind]) }}
      </h3>
      <div class="grid gap-10">
        <article
          v-for="source in group.sources"
          :key="source.name"
          class="rounded-12 border border-line px-16 py-14"
          :data-testid="`source-${source.name}`"
        >
          <h4 class="m-0 flex flex-wrap items-baseline gap-x-8 text-callout font-semibold">
            {{ source.title }}
            <a
              :href="source.site"
              target="_blank"
              rel="noopener noreferrer"
              class="text-footnote font-normal text-muted underline-offset-2 hover:text-ink hover:underline"
              >{{ hostOf(source.site) }}</a
            >
          </h4>
          <p class="mt-4 mb-0 text-footnote leading-[1.5] text-secondary">{{ t(TEXTS[source.name].about) }}</p>
          <p class="mt-2 mb-0 text-caption leading-[1.5] text-muted">{{ t(TEXTS[source.name].sends) }}</p>
          <p
            v-if="originHosts(ORIGINS[source.name]).length"
            class="mt-2 mb-0 text-caption leading-[1.5] text-muted"
            :data-testid="`source-${source.name}-hosts`"
          >
            {{ t('source_hosts', { hosts: originHosts(ORIGINS[source.name]).join(', ') }) }}
          </p>
          <p v-if="!TEXTS[source.name].admitted()" class="mt-6 mb-0 text-caption text-muted">
            {{ t('source_not_admitted') }}
          </p>
          <p
            v-else-if="waiting(source.name)"
            class="mt-6 mb-0 text-caption text-muted"
            :data-testid="`source-${source.name}-needs`"
          >
            {{ t('source_needs', { names: waiting(source.name) }) }}
          </p>
          <p
            v-else-if="missingKey(source.name)"
            class="mt-6 mb-0 text-caption text-muted"
            :data-testid="`source-${source.name}-needs`"
          >
            {{ t('source_needs_key') }}
          </p>
          <div class="mt-10 flex flex-wrap gap-x-24 gap-y-8">
            <label class="flex items-center gap-8 text-footnote text-ink has-disabled:text-muted">
              <input
                type="checkbox"
                class="accent-progress-fill"
                :checked="allowed(source.name)"
                :disabled="locked(source.name)"
                :data-testid="`source-${source.name}-allow`"
                @change="choose($event, source.name, 'allowed')"
              />
              {{ t('source_allow') }}
            </label>
            <label
              v-if="source.automatic"
              class="flex items-center gap-8 text-footnote text-ink has-disabled:text-muted"
            >
              <input
                type="checkbox"
                class="accent-progress-fill"
                :checked="automatic(source.name)"
                :disabled="locked(source.name) || !allowed(source.name)"
                :data-testid="`source-${source.name}-auto`"
                @change="choose($event, source.name, 'auto')"
              />
              <span
                >{{ t('source_auto') }}
                <span v-if="TEXTS[source.name].auto" class="text-muted">· {{ t(TEXTS[source.name].auto!) }}</span></span
              >
            </label>
          </div>
          <form
            v-if="source.key"
            class="mt-14 flex flex-col gap-10 border-t border-line pt-14"
            :data-testid="`source-${source.name}-key`"
            @submit.prevent="saveKey(source.name)"
          >
            <div v-if="keyOf(source.name)" class="flex items-center justify-between gap-14">
              <p class="m-0 text-footnote text-secondary">{{ t('source_key_saved') }}</p>
              <UiTextButton :disabled="frozen(source.name)" @click="setSourceKey(source.name, null)">{{
                t('source_key_forget')
              }}</UiTextButton>
            </div>
            <template v-else>
              <label class="flex min-w-0 flex-col gap-7 text-footnote text-muted">
                {{ t('source_key') }}
                <input
                  v-model="drafts[source.name]"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  :disabled="frozen(source.name)"
                  :aria-invalid="malformed[source.name] === true"
                  class="w-full min-w-0 rounded-10 border border-line bg-raised p-12 text-body text-ink outline-offset-3 focus:border-secondary disabled:opacity-60 aria-invalid:border-accent"
                />
              </label>
              <p class="m-0 text-caption leading-[1.5] text-muted">
                {{ t('source_key_note') }}
                <a
                  :href="source.key"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-secondary underline underline-offset-2 hover:text-ink"
                  >{{ t('source_key_get') }}</a
                >
              </p>
              <p v-if="malformed[source.name]" role="status" class="m-0 text-footnote text-notice">
                {{ t('source_key_invalid') }}
              </p>
              <UiPillButton
                type="submit"
                variant="secondary"
                class="self-end"
                :disabled="frozen(source.name) || !drafts[source.name]?.trim()"
                >{{ t('source_key_save') }}</UiPillButton
              >
            </template>
          </form>
        </article>
      </div>
    </section>
  </div>
</template>
