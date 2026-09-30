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
  // Repeat one (2026-09-30): the repeat arrows with a small 1 between them.
  'repeat-one': 'm17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4M21 13v3a2 2 0 0 1-2 2H3M10.5 10.5 12.5 9v6',
  volume: 'M11 4 6 8H2v8h4l5 4ZM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16',
  // Project additions in the same 24×24 stroke style.
  muted: 'M11 4 6 8H2v8h4l5 4ZM16 9l6 6M22 9l-6 6',
  genre: 'M3 12V4h8l10 10-8 8ZM8 8.5h.01',
  lyrics: 'M4 5h10M9 5v14M15 11h5M15 15h5M12 19h8',
  'add-music': 'M9 17V5l10-2v7M9 17a3 3 0 1 1-3-3 3 3 0 0 1 3 3ZM18 14v7M14.5 17.5h7',
  close: 'M6 6l12 12M6 18 18 6',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  back: 'M19 12H5m5-5-5 5 5 5',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v6M12 7h.01',
  sliders: 'M5 3v6m0 4v8M12 3v10m0 4v4M19 3v2m0 4v12M2 9h6M9 13h6M16 5h6',
  chevron: 'm6 9 6 6 6-6',
  /* A memory card: cut corner and contacts (card space, round 16). */
  card: 'M9 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7Z M10 7v3 M13 7v3 M16 7v3',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z',
  /* Karaoke (round 16): a microphone, and full screen in and out. */
  karaoke: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z M5 11a7 7 0 0 0 14 0 M12 18v3 M9 21h6',
  fullscreen: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  'fullscreen-exit': 'M9 4v5H4 M15 4v5h5 M9 20v-5H4 M15 20v-5h5',
  /* combined-008: dislike (a stop sign), pin and trash. */
  ban: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM5.6 5.6l12.8 12.8',
  pin: 'M9 3h6l-1 6 3 3H7l3-3Z M12 12v9',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  /* A picture (2026-09-29): finding a cover for an album without one. */
  image: 'M4 5h16v14H4Z M4 15l4.5-4.5 4 4 2.5-2.5L20 17 M15 9.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  /* The visualizer (2026-09-29): the ringed disc sending out spokes of sound. */
  visualizer:
    'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0Z M12 11.9v.2 M12 6V2.5 M16.2 7.8l1.4-1.4 M18 12h4 M16.2 16.2l2.1 2.1 M12 18v2 M7.8 16.2l-2.5 2.5 M6 12H3 M7.8 7.8 6.4 6.4',
  /* Rare actions (2026-09-30): three dots, a check for the chosen option, a pencil for renaming. */
  more: 'M4.8 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0Z M10.8 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0Z M16.8 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0Z',
  check: 'M5 12.5 10 17.5 19 7',
  pencil: 'M4 20h4L19 9l-4-4L4 16Z M13.5 6.5l4 4',
  /* The switch between the player (device) and this browser (2026-09-30): a browser window. */
  // Settings (2026-09-30): an eight-toothed gear; the sun for the light theme command.
  settings:
    'M10.1 4.9 10.6 2.1h2.8l.5 2.8a7.4 7.4 0 0 1 1.8.7L18 4l2 2-1.6 2.3a7.4 7.4 0 0 1 .7 1.8l2.8.5v2.8l-2.8.5a7.4 7.4 0 0 1-.7 1.8L20 18l-2 2-2.3-1.6a7.4 7.4 0 0 1-1.8.7l-.5 2.8h-2.8l-.5-2.8a7.4 7.4 0 0 1-1.8-.7L6 20l-2-2 1.6-2.3a7.4 7.4 0 0 1-.7-1.8l-2.8-.5v-2.8l2.8-.5a7.4 7.4 0 0 1 .7-1.8L4 6l2-2 2.3 1.6a7.4 7.4 0 0 1 1.8-.7Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  browser: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M3 9h18 M6.5 6.5h.01 M9.5 6.5h.01',
  'sidebar-collapse':
    'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M9.5 4v16 M16 9.5 13.5 12l2.5 2.5',
  'sidebar-expand':
    'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M9.5 4v16 M13.5 9.5 16 12l-2.5 2.5',
} as const

export type IconName = keyof typeof ICON_PATHS
