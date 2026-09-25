// Applies the saved appearance before the stylesheet paints (no light flash
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
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
