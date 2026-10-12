/**
 * Axis ticks at round values.
 *
 * Recharts, given a numeric domain and nothing else, may put its ticks on the
 * data themselves (0.317, 0.341, …) or on arbitrary fifths of the range
 * (−1.0000, 2.4471, …). A reader wants 0.3, 0.4, 0.5 or 10⁻², 10⁻¹, 1. These
 * helpers return a domain that ends on ticks and the ticks themselves.
 */

/** 1, 2 or 5 × 10ⁿ: the step closest to `span / target`. */
function niceStep(span: number, target: number): number {
  const raw = span / Math.max(target, 1)
  const power = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / power
  const nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10
  return nice * power
}

/** Round off floating-point noise (0.30000000000000004 → 0.3). */
function clean(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  return Number(value.toFixed(Math.min(decimals, 15)))
}

export interface Axis {
  domain: [number, number]
  ticks: number[]
}

/** Linear axis: about `target` ticks on 1-2-5 steps, domain snapped to them. */
export function linearTicks(min: number, max: number, target = 5): Axis {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { domain: [0, 1], ticks: [0, 1] }
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1
    min -= pad
    max += pad
  }
  const step = niceStep(max - min, target)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(clean(v, step))
  return { domain: [clean(lo, step), clean(hi, step)], ticks }
}

/**
 * Logarithmic axis: one tick per decade, or every second/third decade when
 * the range is wide; 1-2-5 within a decade when it is narrow.
 */
export function logTicks(min: number, max: number): Axis {
  if (!(min > 0) || !(max > 0)) return { domain: [1, 10], ticks: [1, 10] }
  let lo = Math.floor(Math.log10(min))
  let hi = Math.ceil(Math.log10(max))
  if (hi === lo) hi += 1
  const decades = hi - lo

  if (decades <= 2) {
    // Too few decades for decade ticks alone: add 2 and 5, and trim the
    // domain to the ticks that bracket the data rather than whole decades.
    const build = (multipliers: number[]) => {
      const ticks: number[] = []
      for (let d = lo; d <= hi; d++) {
        for (const m of multipliers) ticks.push(Number((m * 10 ** d).toPrecision(3)))
      }
      const below = ticks.filter((t) => t <= min)
      const above = ticks.filter((t) => t >= max)
      const from = below.length ? below[below.length - 1] : ticks[0]
      const to = above.length ? above[0] : ticks[ticks.length - 1]
      return { domain: [from, to] as [number, number], ticks: ticks.filter((t) => t >= from && t <= to) }
    }
    const coarse = build([1, 2, 5])
    // Data within a factor of a few: 1-2-5 leaves two or three ticks, so
    // every integer multiple is labelled instead.
    return coarse.ticks.length >= 4 ? coarse : build([1, 2, 3, 4, 5, 6, 7, 8, 9])
  }

  const every = decades > 12 ? 3 : decades > 6 ? 2 : 1
  lo = Math.floor(lo / every) * every
  hi = Math.ceil(hi / every) * every
  const ticks: number[] = []
  for (let d = lo; d <= hi; d += every) ticks.push(Number((10 ** d).toPrecision(3)))
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks }
}

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹"

/** Tick label: `10⁻³` for powers of ten on a log axis, else a short number. */
export function tickLabel(value: number, log: boolean, lang: "en" | "it" = "en"): string {
  if (!Number.isFinite(value)) return ""
  if (value === 0) return "0"
  const exponent = Math.log10(Math.abs(value))
  const decimal = (s: string) => (lang === "it" ? s.replace(".", ",") : s)
  if (log && Math.abs(exponent - Math.round(exponent)) < 1e-9) {
    const e = Math.round(exponent)
    if (e >= -2 && e <= 3) return decimal(String(Number(value.toPrecision(3))))
    const digits = String(Math.abs(e))
      .split("")
      .map((d) => SUPERSCRIPT[Number(d)])
      .join("")
    return `10${e < 0 ? "⁻" : ""}${digits}`
  }
  const magnitude = Math.abs(value)
  if (magnitude >= 1e5 || magnitude < 1e-3) {
    const [m, e] = value.toExponential(1).split("e")
    const exp = Number(e)
    const digits = String(Math.abs(exp))
      .split("")
      .map((d) => SUPERSCRIPT[Number(d)])
      .join("")
    return `${decimal(m.replace(/\.0$/, ""))}×10${exp < 0 ? "⁻" : ""}${digits}`
  }
  // Up to four significant figures, trailing zeros dropped; a real minus.
  return decimal(String(Number(value.toPrecision(4)))).replace("-", "\u2212")
}

/**
 * One formatter for a whole axis, so its labels share a style: plain numbers
 * when every tick reads well that way (0.002, 0.005, 0.01), powers of ten
 * otherwise (10⁻⁶, 2×10⁻⁶, …) -- never a mix of the two.
 */
export function axisFormatter(axis: Axis, log: boolean, lang: "en" | "it" = "en") {
  const magnitudes = axis.ticks.filter((v) => v !== 0).map((v) => Math.abs(v))
  const small = Math.min(...magnitudes)
  const large = Math.max(...magnitudes)
  const scientific = small < 1e-3 || large >= 1e5
  const decimal = (s: string) => (lang === "it" ? s.replace(".", ",") : s)
  return (value: number): string => {
    if (!Number.isFinite(value)) return ""
    if (value === 0) return "0"
    if (!scientific) {
      return decimal(String(Number(value.toPrecision(log ? 3 : 4)))).replace("-", "−")
    }
    const exp = Math.floor(Math.log10(Math.abs(value)) + 1e-9)
    const mantissa = Number((value / 10 ** exp).toPrecision(3))
    const digits = String(Math.abs(exp))
      .split("")
      .map((d) => SUPERSCRIPT[Number(d)])
      .join("")
    const power = `10${exp < 0 ? "⁻" : ""}${digits}`
    return mantissa === 1 ? power : `${decimal(String(mantissa)).replace("-", "−")}×${power}`
  }
}
