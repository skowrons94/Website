/** "{n} datasets" with {n: 3} → "3 datasets": the data explorer's string templates (lib/i18n.ts, dataExpert). */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m))
}
