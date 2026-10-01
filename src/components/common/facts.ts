/** A fact's value as a run of parts joined by " · ": text, an outside link, or an action the parent runs. */
export type FactPart = string | { text: string; href: string } | { text: string; action: string }
/** One label and value row of a facts table (components/common/FactTable.vue). */
export interface FactRow {
  key: string
  label: string
  parts: FactPart[]
}
