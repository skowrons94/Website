import { elideItalian } from "../localize.mjs"

/**
 * "{n} datasets" with {n: 3} → "3 datasets": the data explorer's string
 * templates (lib/i18n.ts, dataExpert). The Italian article before a nuclide
 * that arrives as a value is set by its mass number ("Il {cn}" with ⁸Be →
 * "L'⁸Be"); English text has no such articles and passes through unchanged.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return elideItalian(template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m)))
}
