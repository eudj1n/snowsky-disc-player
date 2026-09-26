/**
 * The sidebar as a full column or an icon rail (owner, round 14): a browser
 * preference for wide windows, chosen from the top bar. Windows of 800px and
 * less always show the rail and phones the bottom navigation, whatever the
 * choice. public/theme.js applies the saved choice before the stylesheet
 * paints, so a reload does not jump.
 */
import { computed, ref, watchEffect } from 'vue'
import { readPreference, writePreference } from '../lib/storage'

export const SIDEBAR_KEY = 'disc-player.sidebar'

export const sidebarRail = ref(readPreference(SIDEBAR_KEY) === 'rail')

const narrow = typeof matchMedia === 'function' ? matchMedia('(max-width: 800px)') : null
const narrowWindow = ref(narrow?.matches ?? false)
narrow?.addEventListener('change', (event) => (narrowWindow.value = event.matches))
/** The sidebar shows icons only (its links then carry their names as tooltips). */
export const railShown = computed(() => sidebarRail.value || narrowWindow.value)

watchEffect(() => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (sidebarRail.value) root.dataset.sidebar = 'rail'
  else delete root.dataset.sidebar
})

export function toggleSidebar(): void {
  sidebarRail.value = !sidebarRail.value
  writePreference(SIDEBAR_KEY, sidebarRail.value ? 'rail' : null)
}
