/**
 * An automatic list's rare actions behind "⋯" (owner, 2026-09-30), the same
 * in its page's heading and in its row on the Playlists page: how often it is
 * drawn again, updating it now, removing it from the player.
 */
import { PERIODS, type AutoPlaylist, type RotationPeriod } from '../domain/autoPlaylists'
import { t } from '../i18n'
import { refreshAutoPlaylists, removeAutoList, setAutoPeriod } from '../stores/autoPlaylists'
import type { ActionItem } from '../ui/UiActionMenu.vue'

export function autoListItems(list: AutoPlaylist, busy: boolean): ActionItem[] {
  return [
    ...PERIODS.map((period, index) => ({
      id: `period:${period}`,
      label: t(`auto_period_${period}`),
      checked: (list.period ?? 'day') === period,
      enabled: !busy,
      ...(index === 0 ? { group: t('auto_period') } : {}),
    })),
    { id: 'refresh', label: t('auto_refresh'), icon: 'refresh', enabled: !busy, separator: true },
    { id: 'remove', label: t('auto_remove_from_player'), icon: 'trash', enabled: !busy, danger: true },
  ]
}

/** Runs a chosen action; true when the list was removed from the player. */
export async function onAutoListAction(list: AutoPlaylist, id: string): Promise<boolean> {
  if (id.startsWith('period:')) {
    await setAutoPeriod(list, id.slice('period:'.length) as RotationPeriod)
    return false
  }
  if (id === 'refresh') {
    await refreshAutoPlaylists(true, list.name)
    return false
  }
  if (id === 'remove' && confirm(t('auto_remove_confirm', { name: list.name }))) {
    await removeAutoList(list)
    return true
  }
  return false
}

/** How the list is kept, for its row: "updated daily". */
export const keptLabel = (list: AutoPlaylist): string => t(`auto_kept_${list.period ?? 'day'}`)
