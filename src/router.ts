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
  { name: 'albums', path: '/albums', icon: 'album', title: 'albums' },
  { name: 'artists', path: '/artists', icon: 'artist', title: 'artists' },
  { name: 'tracks', path: '/tracks', icon: 'music', title: 'tracks' },
  { name: 'favorites', path: '/favorites', icon: 'heart', title: 'favorites' },
  { name: 'playlists', path: '/playlists', icon: 'playlist', title: 'playlists' },
] as const satisfies readonly { name: string; path: string; icon: IconName; title: MessageKey }[]

export type SectionName = (typeof SECTIONS)[number]['name']

/** The section a route belongs to (detail pages highlight their list). */
export function sectionOf(name: unknown): SectionName {
  if (name === 'album') return 'albums'
  if (name === 'artist') return 'artists'
  if (name === 'playlist') return 'playlists'
  return SECTIONS.find((section) => section.name === name)?.name ?? 'home'
}

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  { path: '/albums', name: 'albums', component: () => import('./views/AlbumsView.vue') },
  { path: '/artists', name: 'artists', component: () => import('./views/ArtistsView.vue') },
  { path: '/tracks', name: 'tracks', component: () => import('./views/TracksView.vue') },
  { path: '/favorites', name: 'favorites', component: () => import('./views/FavoritesView.vue') },
  { path: '/playlists', name: 'playlists', component: () => import('./views/PlaylistsView.vue') },
  { path: '/album/:name', name: 'album', component: () => import('./views/AlbumView.vue') },
  { path: '/artist/:name', name: 'artist', component: () => import('./views/ArtistView.vue') },
  { path: '/playlist/:id(\\d+)', name: 'playlist', component: () => import('./views/PlaylistView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})
