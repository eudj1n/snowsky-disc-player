import type { RouteLocationRaw } from 'vue-router'

/** One caption line of a cover card; a line with a route links elsewhere. */
export interface CardLine {
  text: string
  to?: RouteLocationRaw
}
