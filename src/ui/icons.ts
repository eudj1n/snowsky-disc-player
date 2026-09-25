/** The reference icon set (DISC Web app.js) plus a few project additions, one stroked path per 24×24 icon. */
export const ICON_PATHS = {
  moon: 'M20.8 13.3A9 9 0 0 1 10.7 3.2a9 9 0 1 0 10.1 10.1Z',
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  album: 'M4 3h16v18H4Z M8 8h8v8H8Z M10 12h4',
  artist: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  music: 'M9 18V5l11-2v13 M9 7l11-2 M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3ZM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  playlist: 'M4 5h13M4 10h13M4 15h7M17 14v7M13.5 17.5h7',
  queue: 'M3 5h18M3 10h18M3 15h10M17 15l4 3-4 3Z',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM15 15l6 6',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 14v6h16v-6',
  refresh: 'M20 7a9 9 0 1 0 1 8M20 3v5h-5',
  device: 'M5 2h14v20H5Z M8 5h8v8H8Z M14 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  play: 'm9 5 11 7-11 7Z',
  pause: 'M8 5v14M16 5v14',
  previous: 'M5 5v14M19 5 8 12l11 7Z',
  next: 'M19 5v14M5 5l11 7L5 19Z',
  shuffle: 'M3 6h3c5 0 7 12 12 12h3M17 14l4 4-4 4M3 18h3c2 0 4-3 6-6s4-6 6-6h3M17 2l4 4-4 4',
  repeat: 'm17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4M21 13v3a2 2 0 0 1-2 2H3',
  volume: 'M11 4 6 8H2v8h4l5 4ZM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16',
  // Project additions in the same 24×24 stroke style.
  muted: 'M11 4 6 8H2v8h4l5 4ZM16 9l6 6M22 9l-6 6',
  'add-music': 'M9 17V5l10-2v7M9 17a3 3 0 1 1-3-3 3 3 0 0 1 3 3ZM18 14v7M14.5 17.5h7',
  close: 'M6 6l12 12M6 18 18 6',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  back: 'M19 12H5m5-5-5 5 5 5',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v6M12 7h.01',
  sliders: 'M5 3v6m0 4v8M12 3v10m0 4v4M19 3v2m0 4v12M2 9h6M9 13h6M16 5h6',
} as const

export type IconName = keyof typeof ICON_PATHS
