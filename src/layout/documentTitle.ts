/**
 * The tab's title follows the current track (owner, 2026-10-23): "Orbit ·
 * Forma & Lumi Vale — DISC" on whichever side plays, the page's own name
 * when no track is known. One owner of document.title: the language's
 * change passes through here too.
 */
import { watchEffect } from 'vue'
import { documentTitleLine } from '../domain/mediaSession'
import { t } from '../i18n'
import { nowPlaying } from '../stores/output'

export function documentTitle(): string {
  const line = documentTitleLine(nowPlaying.value.track)
  return line ? t('document_title_track', { track: line }) : t('document_title')
}

if (typeof document !== 'undefined') {
  watchEffect(() => {
    document.title = documentTitle()
  })
}
