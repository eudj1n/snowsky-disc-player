/**
 * The genre filter of Albums and Tracks lives in the hash query (`?genre=`),
 * so it survives reloads, works with Back and can be linked from a genre page.
 * Changing it keeps the search (App.vue clears the search on path changes only).
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sortGenres } from '../domain/genre'
import { locale } from '../i18n'
import { genres } from '../stores/library'

export function useGenreFilter() {
  const route = useRoute()
  const router = useRouter()
  const genre = computed<string | null>({
    get: () => {
      const value = route.query.genre
      return typeof value === 'string' && value !== '' ? value : null
    },
    set: (value) => void router.replace({ query: { ...route.query, genre: value ?? undefined } }),
  })
  const options = computed(() => sortGenres(genres.value, locale.value).map((item) => item.name))
  return { genre, options }
}
