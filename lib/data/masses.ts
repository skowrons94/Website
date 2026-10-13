/**
 * The atlas' AME2020 mass-excess table (content/atlas/nuclear-data/
 * ame2020-mass-excess.txt), read exactly as scripts/data/nucdata/masses.py
 * reads it, so the exports convert energies with the same numbers.
 */

/** {"A,Z": mass excess MeV}, from the text of the table. */
export function parseAme(text: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const line of text.split("\n")) {
    const parts = line.trim().split(/\s+/)
    if (parts.length === 3 && /^\d+$/.test(parts[0]) && /^-?\d+$/.test(parts[1])) {
      const v = Number(parts[2])
      if (parts[2] !== "" && Number.isFinite(v)) out[`${Number(parts[0])},${Number(parts[1])}`] = v
    }
  }
  return out
}

/** A lookup over parseAme's table: (A, Z) → mass excess (MeV) or null. */
export function massTable(table: Record<string, number>) {
  return (A: number, Z: number): number | null => table[`${A},${Z}`] ?? null
}
