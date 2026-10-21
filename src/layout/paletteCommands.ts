/**
 * The search palette's commands (owner, 2026-09-30): a section, settings, the
 * theme, adding music, sound, the side that plays, a refresh of the
 * collection and the connection. Each runs after the palette has closed.
 */
import { computed } from 'vue'
import type { Router } from 'vue-router'
import { indexOf } from '../domain/globalSearch'
import { t } from '../i18n'
import { SECTIONS } from '../router'
import { chooseAppearance, darkActive } from '../stores/appearance'
import { switchSide } from '../stores/handoff'
import { setImportDestination } from '../stores/imports'
import { library, loadCollection } from '../stores/library'
import { nowPlaying, output } from '../stores/output'
import { openDialog } from '../stores/ui'
import type { IconName } from '../ui/icons'
import { miniPlayerOpen, miniPlayerSupported, toggleMiniPlayer } from './miniPlayer'

export interface Command {
  id: string
  label: string
  icon: IconName
  /** More words it answers to. */
  words?: string
  enabled?: boolean
  run: (router: Router) => void
}

export const commands = computed<Command[]>(() => [
  ...SECTIONS.map<Command>((section) => ({
    id: `go:${section.name}`,
    label: t('go_to_section', { name: t(section.title) }),
    icon: section.icon,
    // Settings is also found by what it holds.
    words: section.name === 'settings' ? `${t('language')} ${t('appearance')}` : undefined,
    run: (router) => void router.push(section.path),
  })),
  {
    id: 'theme',
    label: t(darkActive.value ? 'cmd_light_theme' : 'cmd_dark_theme'),
    icon: darkActive.value ? 'sun' : 'moon',
    words: t('cmd_theme_words'),
    run: () => chooseAppearance(darkActive.value ? 'light' : 'dark'),
  },
  {
    id: 'import',
    label: t('import_music'),
    icon: 'add-music',
    run: () => {
      setImportDestination('')
      openDialog('import')
    },
  },
  { id: 'sound', label: t('sound_title'), icon: 'sliders', run: () => openDialog('sound') },
  {
    id: 'side',
    label: t(output.side === 'disc' ? 'cmd_to_browser' : 'cmd_to_disc'),
    icon: output.side === 'disc' ? 'browser' : 'device',
    enabled: !output.switching,
    run: switchSide,
  },
  // The mini player's window, where the browser has one (2026-10-21).
  ...(miniPlayerSupported
    ? [
        {
          id: 'mini-player',
          label: t(miniPlayerOpen.value ? 'mini_player_close' : 'mini_player'),
          icon: 'pip' as const,
          words: t('mini_player_words'),
          enabled: nowPlaying.value.track !== null,
          run: toggleMiniPlayer,
        },
      ]
    : []),
  {
    id: 'refresh',
    label: t('refresh_collection'),
    icon: 'refresh',
    enabled: library.status !== 'loading',
    run: () => void loadCollection(true),
  },
  { id: 'connection', label: t('disc_connection'), icon: 'device', run: () => openDialog('connection') },
])

export const commandIndex = computed(() => indexOf(commands.value, (command) => [command.label, command.words]))
