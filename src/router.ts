/**
 * Hash routing: the gateway serves only / and release files, so navigation
 * state lives in the hash (#/albums). As in the reference, a real navigation
 * clears the search and scrolls to the top (see App.vue).
 */
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import type { MessageKey } from './i18n'
import type { IconName } from './ui/icons'

export const SECTIONS = [
  { name: 'home', path: '/', icon: 'home', title: 'home' },
  { name: 'new', path: '/new', icon: 'clock', title: 'new_section' },
  { name: 'albums', path: '/albums', icon: 'album', title: 'albums' },
  { name: 'artists', path: '/artists', icon: 'artist', title: 'artists' },
  { name: 'genres', path: '/genres', icon: 'genre', title: 'genres', phone: false },
  { name: 'tracks', path: '/tracks', icon: 'music', title: 'tracks' },
  { name: 'favorites', path: '/favorites', icon: 'heart', title: 'favorites' },
  { name: 'playlists', path: '/playlists', icon: 'playlist', title: 'playlists' },
  // Settings (owner, 2026-10-01: a page under Your player); on phones the top bar's gear opens it.
  { name: 'settings', path: '/settings', icon: 'settings', title: 'settings', phone: false },
  // The player's own card (round 16); on phones it opens from the connection dialog.
  { name: 'card', path: '/card', icon: 'card', title: 'card_section', phone: false },
] as const satisfies readonly { name: string; path: string; icon: IconName; title: MessageKey; phone?: false }[]

export type SectionName = (typeof SECTIONS)[number]['name']

/** The section a route belongs to (detail pages highlight their list); the search page belongs to none. */
export function sectionOf(name: unknown): SectionName | null {
  if (name === 'search') return null
  if (name === 'album') return 'albums'
  if (name === 'artist') return 'artists'
  if (name === 'playlist' || name === 'list') return 'playlists'
  if (name === 'genre') return 'genres'
  if (name === 'cardFiles' || name === 'cardTrash' || name === 'cardState') return 'card'
  if (name === 'disliked') return 'favorites'
  return SECTIONS.find((section) => section.name === name)?.name ?? 'home'
}

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  { path: '/new', name: 'new', component: () => import('./views/NewView.vue') },
  { path: '/albums', name: 'albums', component: () => import('./views/AlbumsView.vue') },
  { path: '/artists', name: 'artists', component: () => import('./views/ArtistsView.vue') },
  { path: '/genres', name: 'genres', component: () => import('./views/GenresView.vue') },
  { path: '/genre/:name', name: 'genre', component: () => import('./views/GenreView.vue') },
  { path: '/tracks', name: 'tracks', component: () => import('./views/TracksView.vue') },
  { path: '/favorites', name: 'favorites', component: () => import('./views/FavoritesView.vue') },
  { path: '/disliked', name: 'disliked', component: () => import('./views/DislikedView.vue') },
  { path: '/playlists', name: 'playlists', component: () => import('./views/PlaylistsView.vue') },
  // The global search's page (owner, 2026-09-30): #/search?q=…&from=albums.
  { path: '/search', name: 'search', component: () => import('./views/SearchView.vue') },
  { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
  { path: '/card', name: 'card', component: () => import('./views/CardView.vue') },
  { path: '/card/files', name: 'cardFiles', component: () => import('./views/CardFilesView.vue') },
  { path: '/card/trash', name: 'cardTrash', component: () => import('./views/CardTrashView.vue') },
  { path: '/card/state', name: 'cardState', component: () => import('./views/CardStateView.vue') },
  // The optional artist narrows a title group to one release (reference scope).
  { path: '/album/:name/:artist?', name: 'album', component: () => import('./views/AlbumView.vue') },
  { path: '/artist/:name', name: 'artist', component: () => import('./views/ArtistView.vue') },
  { path: '/playlist/:id(\\d+)', name: 'playlist', component: () => import('./views/PlaylistView.vue') },
  // An automatic playlist (an M3U list of the page's, combined-009), by its name.
  { path: '/list/:name', name: 'list', component: () => import('./views/ListView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  // Every view opens at its top (Settings' parts are tabs since 2026-10-02, `?part=` naming one).
  scrollBehavior: () => ({ top: 0 }),
})

/**
 * vue-router follows address changes only once its first navigation is done,
 * and that navigation then writes its own address: a hash changed while the
 * first view's chunk still loads (an address typed or Back pressed right after
 * opening the page, 2026-09-29 on the emulator) was lost and the page stayed
 * on the first view. The last such change is applied once the router is ready.
 * popstate comes first, with the new address; hashchange may come only after
 * that navigation rewrote it, so it is read from the event.
 */
export function keepEarlyAddress(): void {
  let early: string | null = null
  const fromHash = (hash: string) => hash.slice(1) || '/'
  const onPop = () => {
    early = fromHash(location.hash)
  }
  const onHash = (event: HashChangeEvent) => {
    early = fromHash(new URL(event.newURL).hash)
  }
  window.addEventListener('popstate', onPop)
  window.addEventListener('hashchange', onHash)
  void router
    .isReady()
    .catch(() => undefined)
    .then(() => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onHash)
      if (early !== null && early !== router.currentRoute.value.fullPath) void router.replace(early)
    })
}
