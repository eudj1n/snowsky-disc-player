/** The compact heading's one button: start this page's music, or pause/resume it while it plays. */
export interface HeadingAction {
  label: string
  icon: 'play' | 'pause'
  disabled: boolean
}
