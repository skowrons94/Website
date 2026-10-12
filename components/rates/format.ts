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
  // grouped by hand, not by toLocaleString: the server's and the browser's
  // ICU disagree on Italian four-digit numbers (3500 or 3.500), which breaks
  // hydration. Italian groups from 10 000 (CLDR), English from 1,000.
  if (x >= 100) {
    const v = String(Math.round(Number(x.toPrecision(2))))
    if (v.length < (lang === "it" ? 5 : 4)) return v
    return v.replace(/\B(?=(\d{3})+(?!\d))/g, lang === "it" ? "." : ",")
  }
  return dec(Number(x.toPrecision(2)).toString(), lang)
}

/** A narrow no-break space, between a number and its unit. */
export const NB = "\u202f"

/**
 * A count with its noun, singular or plural as the rounded number reads:
 * "1 miliardo di anni", "2,5 miliardi di anni", "1 million years". Italian
 * nouns after a decimal take the plural ("1,5 milioni").
 */
export function counted(v: number, lang: Lang, one: string, many: string): string {
  const shown = Number(v.toPrecision(2))
  return `${sig2(v, lang)} ${shown === 1 ? one : many}`
}

/** A duration a general reader can feel: 3.2 seconds, 17 days, 4.1 million years. */
export function duration(s: number, lang: Lang): string {
  const it = lang === "it"
  if (!Number.isFinite(s)) return it ? "per sempre" : "forever"
  const u = (v: number, one: string, many: string) => counted(v, lang, one, many)
  if (s < 1e-3) return `${sci(s, lang)}${NB}s`
  if (s < 1) return it ? u(s * 1000, "millisecondo", "millisecondi") : u(s * 1000, "millisecond", "milliseconds")
  if (s < 120) return it ? u(s, "secondo", "secondi") : u(s, "second", "seconds")
  if (s < 7200) return it ? u(s / 60, "minuto", "minuti") : u(s / 60, "minute", "minutes")
  if (s < 2 * 86400) return it ? u(s / 3600, "ora", "ore") : u(s / 3600, "hour", "hours")
  if (s < YEAR) return it ? u(s / 86400, "giorno", "giorni") : u(s / 86400, "day", "days")
  const y = s / YEAR
  if (y < 1e4) return it ? u(y, "anno", "anni") : u(y, "year", "years")
  if (y < 1e6)
    return it
      ? Number((y / 1e3).toPrecision(2)) === 1
        ? "mille anni"
        : `${sig2(y / 1e3, lang)} mila anni`
      : `${sig2(y / 1e3, lang)} thousand years`
  if (y < 1e9) return it ? u(y / 1e6, "milione di anni", "milioni di anni") : `${sig2(y / 1e6, lang)} million years`
  if (y < 1e12) return it ? u(y / 1e9, "miliardo di anni", "miliardi di anni") : `${sig2(y / 1e9, lang)} billion years`
  return it ? `${sci(y, lang)} anni` : `${sci(y, lang)} years`
}

/** A short axis label for a time: 1 s, 1 min, 1 h, 1 d, 1 yr, 1 kyr, 1 Myr, 1 Gyr. */
export function shortTime(s: number, lang: Lang): string {
  const it = lang === "it"
  const yr = it ? "a" : "yr"
  const fmt = (v: number) => sig2(v, lang)
  if (s < 1) return `${sci(s, lang, 1)}${NB}s`
  if (s < 60) return `${fmt(s)}${NB}s`
  if (s < 3600) return `${fmt(s / 60)}${NB}min`
  if (s < 86400) return `${fmt(s / 3600)}${NB}h`
  if (s < YEAR) return `${fmt(s / 86400)}${NB}${it ? "g" : "d"}`
  const y = s / YEAR
  if (y < 1e3) return `${fmt(y)}${NB}${yr}`
  if (y < 1e6) return `${fmt(y / 1e3)}${NB}k${yr}`
  if (y < 1e9) return `${fmt(y / 1e6)}${NB}M${yr}`
  if (y < 1e12) return `${fmt(y / 1e9)}${NB}G${yr}`
  return `${sci(y, lang, 1)}${NB}${yr}`
}

/** T9 as the reader likes it: 16 million K, 0.25 GK. */
export function temperature(T9: number, lang: Lang): string {
  const mk = T9 * 1000
  if (mk < 1000) return lang === "it" ? `${sig2(mk, lang)} milioni di K` : `${sig2(mk, lang)} million K`
  return `${sig2(T9, lang)}${NB}GK`
}

/** T9 compactly, for chart labels and chips: 16 MK, 1.2 GK. */
export function tShort(T9: number, lang: Lang): string {
  return T9 < 1 ? `${sig2(T9 * 1000, lang)}${NB}MK` : `${sig2(T9, lang)}${NB}GK`
}

export function density(rho: number, lang: Lang): string {
  return `${rho >= 0.01 && rho < 1e4 ? sig2(rho, lang) : sci(rho, lang)}${NB}g/cm³`
}

export const YEAR_S = YEAR
