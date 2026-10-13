/**
 * Numbers on the data explorer's pages: energies with the unit a reader
 * expects at that scale, percentages, the decimal comma in Italian.
 */

import type { Lang } from "../locale.ts"

export const dec = (s: string, lang: Lang) => (lang === "it" ? s.replace(/(\d)\.(\d)/g, "$1,$2") : s)

/** n significant figures without exponent noise: 70.08 → "70.1", 0.0012 → "0.0012". */
export function sig(x: number, n = 3): string {
  if (!Number.isFinite(x)) return "–"
  if (x === 0) return "0"
  const v = Number(x.toPrecision(n))
  if (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-4) return v.toExponential(n - 1).replace(/\.?0+e/, "e")
  return String(v)
}

/** An energy given in keV, in meV, eV, keV or MeV as fits: "70.1 keV", "2.35 MeV", "25.3 meV". */
export function energy(keV: number, lang: Lang, n = 3): string {
  const a = Math.abs(keV)
  if (a >= 1000) return `${dec(sig(keV / 1000, n), lang)} MeV`
  if (a >= 1 || a === 0) return `${dec(sig(keV, n), lang)} keV`
  if (a >= 1e-3) return `${dec(sig(keV * 1000, n), lang)} eV`
  return `${dec(sig(keV * 1e6, n), lang)} meV`
}

/** A plain keV number for tables: "70.1", "2350". */
export function kev(keV: number | null | undefined, lang: Lang, n = 3): string {
  if (keV === null || keV === undefined || !Number.isFinite(keV)) return "–"
  return dec(sig(keV, n), lang)
}

/** A share 0–1 as a percentage with sensible precision: 99.97%, 42%, 0.3%, < 0.01% (Italian: 42 %). */
export function percent(x: number, lang: Lang): string {
  const p = x * 100
  let s: string
  if (p >= 99.995 && p < 100) s = "> 99.99"
  else if (p >= 99) s = p.toFixed(2).replace(/\.?0+$/, "")
  else if (p >= 10) s = p.toFixed(0)
  else if (p >= 1) s = p.toFixed(1)
  else if (p >= 0.01) s = p.toPrecision(1)
  else if (p > 0) s = "< 0.01"
  else s = "0"
  return `${dec(s, lang)}${lang === "it" ? " " : ""}%`
}

/** T₉ = 0.015 as "T₉ = 0.015 (15 MK)". */
export function temperature(T9: number, lang: Lang): string {
  const mk = T9 * 1000
  const mkText = mk >= 1000 ? `${dec(sig(T9, 3), lang)} GK` : `${dec(sig(mk, 3), lang)} MK`
  return `T₉ = ${dec(String(T9), lang)} (${mkText})`
}

/** The year span of a list: "1951–2024", "2006". */
export function years(ys: (number | null)[]): string {
  const v = ys.filter((y): y is number => typeof y === "number").sort((a, b) => a - b)
  if (!v.length) return ""
  return v[0] === v[v.length - 1] ? String(v[0]) : `${v[0]}–${v[v.length - 1]}`
}
