import type { Lang } from "@/lib/locale"

const YEAR = 3.15576e7
const SUP: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
}

/** 1.2 × 10⁻⁵, with the decimal comma in Italian. */
export function sci(x: number, lang: Lang, digits = 2): string {
  if (!Number.isFinite(x)) return "∞"
  if (x === 0) return "0"
  const e = Math.floor(Math.log10(Math.abs(x)))
  if (e >= -2 && e <= 3) return dec(Number(x.toPrecision(digits)).toString(), lang)
  const m = x / 10 ** e
  const ms = Number(m.toPrecision(digits)).toString()
  const exp = String(e)
    .split("")
    .map((c) => SUP[c] ?? c)
    .join("")
  return `${ms === "1" ? "" : `${dec(ms, lang)} × `}10${exp}`
}

/** A power of ten as 10ⁿ. */
export function pow10(e: number): string {
  if (e === 0) return "1"
  if (e === 1) return "10"
  return `10${String(e)
    .split("")
    .map((c) => SUP[c] ?? c)
    .join("")}`
}

export const dec = (s: string, lang: Lang) => (lang === "it" ? s.replace(".", ",") : s)

/** Two significant figures, plain. */
export function sig2(x: number, lang: Lang): string {
  if (x >= 100) return Number(x.toPrecision(2)).toLocaleString(lang === "it" ? "it-IT" : "en-GB")
  return dec(Number(x.toPrecision(2)).toString(), lang)
}

/** A duration a general reader can feel: 3.2 seconds, 17 days, 4.1 million years. */
export function duration(s: number, lang: Lang): string {
  const it = lang === "it"
  if (!Number.isFinite(s)) return it ? "per sempre" : "forever"
  const u = (v: number, one: string, many: string) => `${sig2(v, lang)} ${Number(v.toPrecision(2)) === 1 ? one : many}`
  if (s < 1e-3) return `${sci(s, lang)} s`
  if (s < 1) return it ? u(s * 1000, "millisecondo", "millisecondi") : u(s * 1000, "millisecond", "milliseconds")
  if (s < 120) return it ? u(s, "secondo", "secondi") : u(s, "second", "seconds")
  if (s < 7200) return it ? u(s / 60, "minuto", "minuti") : u(s / 60, "minute", "minutes")
  if (s < 2 * 86400) return it ? u(s / 3600, "ora", "ore") : u(s / 3600, "hour", "hours")
  if (s < YEAR) return it ? u(s / 86400, "giorno", "giorni") : u(s / 86400, "day", "days")
  const y = s / YEAR
  if (y < 1e4) return it ? u(y, "anno", "anni") : u(y, "year", "years")
  if (y < 1e6) return it ? `${sig2(y / 1e3, lang)} mila anni` : `${sig2(y / 1e3, lang)} thousand years`
  if (y < 1e9) return it ? `${sig2(y / 1e6, lang)} milioni di anni` : `${sig2(y / 1e6, lang)} million years`
  if (y < 1e12) return it ? `${sig2(y / 1e9, lang)} miliardi di anni` : `${sig2(y / 1e9, lang)} billion years`
  return it ? `${sci(y, lang)} anni` : `${sci(y, lang)} years`
}

/** A short axis label for a time: 1 s, 1 min, 1 h, 1 d, 1 yr, 1 kyr, 1 Myr, 1 Gyr. */
export function shortTime(s: number, lang: Lang): string {
  const it = lang === "it"
  const yr = it ? "a" : "yr"
  const fmt = (v: number) => sig2(v, lang)
  if (s < 1) return `${sci(s, lang, 1)} s`
  if (s < 60) return `${fmt(s)} s`
  if (s < 3600) return `${fmt(s / 60)} min`
  if (s < 86400) return `${fmt(s / 3600)} h`
  if (s < YEAR) return `${fmt(s / 86400)} ${it ? "g" : "d"}`
  const y = s / YEAR
  if (y < 1e3) return `${fmt(y)} ${yr}`
  if (y < 1e6) return `${fmt(y / 1e3)} k${yr}`
  if (y < 1e9) return `${fmt(y / 1e6)} M${yr}`
  return `${fmt(y / 1e9)} G${yr}`
}

/** T9 as the reader likes it: 16 million K, 0.25 GK. */
export function temperature(T9: number, lang: Lang): string {
  const mk = T9 * 1000
  if (mk < 1000) return lang === "it" ? `${sig2(mk, lang)} milioni di K` : `${sig2(mk, lang)} million K`
  return `${sig2(T9, lang)} GK`
}

export function density(rho: number, lang: Lang): string {
  return `${rho >= 0.01 && rho < 1e4 ? sig2(rho, lang) : sci(rho, lang)} g/cm³`
}

export const YEAR_S = YEAR
