/**
 * Chart tokens and formatting helpers.
 *
 * The categorical colors are a validated palette, not a taste choice. These
 * plots are scatter-shaped (any two datasets can end up adjacent), so the
 * all-pairs colorblind separation applies, and only the first three slots clear
 * it — checked with the palette validator in both light and dark modes:
 *
 *   light  worst CVD dE 9.2, worst normal-vision dE 24.0
 *   dark   worst CVD dE 9.4, worst normal-vision dE 20.9
 *
 * That is why overlaying is capped at OVERLAY_LIMIT datasets and anything
 * beyond it is drawn as small multiples, where each panel holds one dataset and
 * identity comes from the panel title rather than from a color. Adding a fourth
 * hue here would put yellow next to orange and fail the floor.
 */

/** Maximum datasets drawn on one pair of axes before faceting takes over. */
import type { Lang } from "@/lib/i18n"

export const OVERLAY_LIMIT = 3

/** Categorical slots, light and dark steps of the same three hues. */
export const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a"] as const
export const SERIES_DARK = ["#3987e5", "#d95926", "#199e70"] as const

/**
 * Marker shapes, paired 1:1 with the color slots.
 *
 * Secondary encoding: the shape alone identifies a dataset in print, in forced
 * -colors mode, and wherever markers overlap.
 */
export const SERIES_SHAPES = ["circle", "square", "triangle"] as const

export function seriesColor(slot: number, dark = false): string {
  const palette = dark ? SERIES_DARK : SERIES_LIGHT
  return palette[slot % palette.length]
}

export function seriesShape(slot: number): (typeof SERIES_SHAPES)[number] {
  return SERIES_SHAPES[slot % SERIES_SHAPES.length]
}

/* -- number formatting ----------------------------------------------------- */

/**
 * Compact axis tick: 1.2e-4, 0.0035, 1.25, 340.
 *
 * `digits` is clamped because this is easy to hand to a caller that supplies a
 * second argument of its own -- recharts invokes a tickFormatter as
 * `(value, index)`, and an index of 0 would otherwise reach `toPrecision(0)`,
 * which throws a RangeError and takes the whole chart down. Call sites should
 * still wrap this rather than pass it point-free.
 */
export function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return ""
  if (value === 0) return "0"
  const safe = Math.min(Math.max(Math.round(digits) || 3, 1), 20)
  const magnitude = Math.abs(value)
  if (magnitude < 1e-3 || magnitude >= 1e5) return value.toExponential(2)
  if (magnitude < 1) return value.toPrecision(safe)
  if (magnitude < 100) return value.toPrecision(Math.min(safe + 1, 21))
  return value.toFixed(0)
}

/** Energies read best at a fixed precision rather than a shifting one. */
export function formatEnergy(value: number): string {
  if (!Number.isFinite(value)) return ""
  if (value === 0) return "0"
  const magnitude = Math.abs(value)
  if (magnitude < 1e-3) return value.toExponential(2)
  if (magnitude < 10) return value.toFixed(4)
  return value.toFixed(2)
}

/**
 * Two significant digits, without dropping into exponent form for values that
 * read perfectly well in decimal.
 */
export function significant(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return ""
  if (value === 0) return "0"
  const magnitude = Math.abs(value)
  if (magnitude < 1e-3 || magnitude >= 1e5) {
    return value.toExponential(digits - 1)
  }
  // Enough decimals for `digits` significant figures, and no more.
  const decimals = Math.max(0, digits - 1 - Math.floor(Math.log10(magnitude)))
  return value.toFixed(Math.min(decimals, 20))
}

/**
 * A channel value with the unit it is actually in.
 *
 * Partial widths are rescaled through eV / keV / MeV so a 5 MeV background pole
 * does not read as `5.0e+6 eV`. Everything else keeps its own unit: a bound
 * channel holds an ANC in fm^(-1/2), and the photon pair's own level holds a
 * static moment — rescaling those, or calling them eV, would be wrong.
 */
export function formatQuantity(
  value: number,
  unit: string,
): { text: string; unit: string } {
  if (!Number.isFinite(value)) return { text: "", unit }
  if (unit !== "eV") return { text: significant(value), unit }

  const magnitude = Math.abs(value)
  if (magnitude === 0) return { text: "0", unit: "eV" }
  if (magnitude >= 1e6) return { text: significant(value / 1e6), unit: "MeV" }
  if (magnitude >= 1e3) return { text: significant(value / 1e3), unit: "keV" }
  return { text: significant(value), unit: "eV" }
}

/** Convenience for a single string, e.g. `"34 keV"`. */
export function formatQuantityText(value: number, unit: string): string {
  const formatted = formatQuantity(value, unit)
  return formatted.unit
    ? `${formatted.text} ${formatted.unit}`
    : formatted.text
}

/** Human name for what a channel parameter represents. */
export function quantityName(quantity: string, lang: Lang = "en"): string {
  const it = lang === "it"
  switch (quantity) {
    case "anc":
      return "ANC"
    case "moment_m1":
      return it ? "Momento magnetico" : "Magnetic moment"
    case "moment_e2":
      return it ? "Momento di quadrupolo" : "Quadrupole moment"
    case "beta":
      return "B"
    default:
      return it ? "Larghezza parziale" : "Partial width"
  }
}

/** LaTeX symbol for a channel parameter, given the channel label. */
export function quantitySymbol(quantity: string, channelLabel: string): string {
  switch (quantity) {
    case "anc":
      return `C_{${channelLabel}}`
    case "moment_m1":
      return "\\mu"
    case "moment_e2":
      return "Q"
    case "beta":
      return "B"
    default:
      return `\\Gamma_{${channelLabel}}`
  }
}

/* -- observable axis labels ------------------------------------------------ */

/** Human label for a segment's observable code. */
export function observableLabel(observable: string, lang: Lang = "en"): string {
  return (OBSERVABLES[lang] ?? OBSERVABLES.en)[observable] ?? observable
}

const OBSERVABLES: Record<Lang, Record<string, string>> = {
  en: {
    "angle-integrated": "Angle-integrated",
    differential: "Differential",
    "differential-cm": "Differential (cm)",
    "phase-shift": "Phase shift",
    "total-capture": "Total capture",
    "angular-distribution": "Angular distribution",
    "angle-integrated-E1": "Angle-integrated (E1)",
    "angle-integrated-E2": "Angle-integrated (E2)",
  },
  it: {
    "angle-integrated": "Integrata sugli angoli",
    differential: "Differenziale",
    "differential-cm": "Differenziale (cm)",
    "phase-shift": "Sfasamento",
    "total-capture": "Cattura totale",
    "angular-distribution": "Distribuzione angolare",
    "angle-integrated-E1": "Integrata sugli angoli (E1)",
    "angle-integrated-E2": "Integrata sugli angoli (E2)",
  },
}

/** Y-axis title for a quantity, given what the segment measures. */
export function quantityLabel(
  quantity: "sfactor" | "cross_section",
  observable: string,
  lang: Lang = "en",
): string {
  if (quantity === "sfactor") return lang === "it" ? "Fattore S (MeV b)" : "S-factor (MeV b)"
  return observable.startsWith("differential")
    ? "dσ/dΩ (b/sr)"
    : lang === "it"
      ? "Sezione d'urto (b)"
      : "Cross section (b)"
}

/**
 * Log axes cannot show non-positive values, so a series is filtered rather than
 * silently dropped by the renderer. Returns the points safe to draw.
 */
export function positiveOnly<T extends { x: number; y: number | null }>(
  points: T[],
): T[] {
  return points.filter(
    (p) => p.y !== null && p.y > 0 && Number.isFinite(p.y) && p.x > 0,
  )
}
