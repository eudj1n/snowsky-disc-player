/**
 * A page's place in the collection for the top bar's breadcrumbs (owner,
 * 2026-09-30: they replace the pages' back links). A page without its own
 * shows the name of its section.
 */
import { onBeforeUnmount, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { clearCrumbs, setCrumbs, type Crumb } from '../stores/ui'

export function useCrumbs(items: () => Crumb[]): void {
  const route = useRoute()
  const owner = {}
  watchEffect(() => setCrumbs(owner, route.path, items()))
  onBeforeUnmount(() => clearCrumbs(owner))
}
