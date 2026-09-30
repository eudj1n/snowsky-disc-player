// Applies the saved appearance (sidebar, text size) before the stylesheet paints (no light flash
// in dark mode). External and synchronous because the gateway CSP forbids
// inline scripts. src/stores/appearance.ts owns the preference afterwards.
;(function () {
  var value
  try {
    value = localStorage.getItem('disc-player.appearance')
  } catch {
    value = null
  }
  var dark = value === 'dark' || (value !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  var root = document.documentElement
  root.dataset.theme = dark ? 'dark' : 'light'
  // Palettes (src/domain/palettes.ts); an unknown name simply matches no palette.
  var light, darkPalette
  try {
    light = localStorage.getItem('disc-player.light-palette')
    darkPalette = localStorage.getItem('disc-player.dark-palette')
  } catch {
    light = darkPalette = null
  }
  if (light && /^[a-z]{1,16}$/.test(light)) root.dataset.lightPalette = light
  if (darkPalette && /^[a-z]{1,16}$/.test(darkPalette)) root.dataset.darkPalette = darkPalette
  // The collapsed sidebar (src/stores/sidebar.ts).
  var sidebar
  try {
    sidebar = localStorage.getItem('disc-player.sidebar')
  } catch {
    sidebar = null
  }
  if (sidebar === 'rail') root.dataset.sidebar = 'rail'
  // The text size (src/stores/appearance.ts); Standard sets no attribute.
  var size
  try {
    size = localStorage.getItem('disc-player.text-size')
  } catch {
    size = null
  }
  if (size === 'compact' || size === 'large' || size === 'extra-large') root.dataset.textSize = size
})()
