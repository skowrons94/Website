/**
 * The gap between what has been measured and the energies a star uses.
 *
 * For a charged-particle reaction at temperature T₉ the rate integrand, with
 * a constant S-factor (the non-resonant approximation, σ(E) ∝ S(E₀)/E ·
 * exp(−2πη)), is
 *
 *     f(E) = exp(−E/kT − b/√E),   b = 31.29 Z₁Z₂√μ keV^½  (2πη = b/√E, E in keV)
 *
 * and for a neutron capture with σ ∝ 1/v it is f(E) = √E exp(−E/kT). An
 * endothermic reaction has f = 0 below its threshold. The share of the rate
 * from unmeasured energies is the integral of f outside the union of the
 * measured energy ranges over its integral everywhere. Resonances make the
 * true integrand lumpy; this is the smooth baseline, stated as such on the
 * page.
 *
 * All energies here are centre-of-mass, keV.
 */

import { NOT_DATA, REPLACED, groupOf, type Group } from "./quantity.ts"

export const K_T9_KEV = 86.17333

/** A dataset as the gap map needs it (one index row). */
export interface GapRow {
  id: string
  /** quantity class (meta.json) and its SF5–SF8 string */
  q: string
  qs: string
  /** lowest/highest E_cm (MeV) of its points, extrapolated rows excluded */
  e0: number | null
  e1: number | null
  /** kT range (MeV) of a Maxwellian average */
  k0: number | null
  k1: number | null
  n: number
  y: number | null
  /** first author (+ when more) */
  a: string
  /** first institute code */
  i: string
  /** flag bits */
  f: number
  /** number of distinct final levels */
  lv: number
  /** energy frame index: 0 lab, 1 cm, 2 lab-res, 3 cm-res, 4 none */
  fr: number
}

export function rowGroup(r: GapRow): Group {
  return groupOf(r.q, r.lv, r.qs)
}

/**
 * Whether a dataset counts as measured cross-section data for the rate: an
 * angle-integrated σ or S (total or partial) of a measurement, not a
 * calculation, derivation, ratio, deleted or superseded set, nor a single
 * S value (singleS), with a positive energy (resonance-energy frames
 * excluded).
 */
export function countsForRate(r: GapRow): boolean {
  const g = rowGroup(r)
  if (g !== "sigma" && g !== "S" && g !== "partial") return false
  if (singleS(r)) return false
  if (r.f & (NOT_DATA | REPLACED)) return false
  if (r.fr === 2 || r.fr === 3) return false
  return r.e0 !== null && r.e1 !== null && r.e0 > 0
}

/**
 * A single S-factor value: in EXFOR almost always the result of a fit
 * (S(300 keV) of ¹²C(α,γ), S(0) of a capture) rather than a measurement at
 * that energy, even where no flag says so. Shown, never counted as data.
 */
export function singleS(r: GapRow): boolean {
  return r.q === "S" && r.n <= 1
}

/** The lowest measured E_cm (keV) among the datasets that count, and the dataset. */
export function lowestMeasured(rows: GapRow[]): { E: number; id: string; y: number | null; a: string } | null {
  let best: { E: number; id: string; y: number | null; a: string } | null = null
  for (const r of rows) {
    if (!countsForRate(r)) continue
    const E = (r.e0 as number) * 1000
    if (!best || E < best.E) best = { E, id: r.id, y: r.y, a: r.a }
  }
  return best
}

/** Union of closed intervals, sorted and merged. */
export function union(intervals: [number, number][]): [number, number][] {
  const sorted = intervals.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a).sort((x, y) => x[0] - y[0])
  const out: [number, number][] = []
  for (const [a, b] of sorted) {
    const last = out[out.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/** The measured E_cm ranges (keV) of the datasets that count. */
export function measuredRanges(rows: GapRow[]): [number, number][] {
  return union(rows.filter(countsForRate).map((r) => [(r.e0 as number) * 1000, (r.e1 as number) * 1000]))
}

export interface Integrand {
  /** GK */
  T9: number
  /** b = 31.29 Z₁Z₂√μ (keV^½); 0 for a neutron */
  b: number
  /** power p of E^p in front (0 charged, ½ neutron with σ ∝ 1/v) */
  p: number
  /** keV; f = 0 below it (endothermic), 0 when none */
  threshold: number
}

export function coulombB(z1: number, z2: number, mu: number): number {
  return 31.29 * z1 * z2 * Math.sqrt(mu)
}

export function integrandFor(z1: number, z2: number, mu: number, T9: number, threshold = 0): Integrand {
  const neutral = z1 === 0 || z2 === 0
  return { T9, b: neutral ? 0 : coulombB(z1, z2, mu), p: neutral ? 0.5 : 0, threshold: Math.max(0, threshold) }
}

/** ln f(E) (unnormalised). */
export function logIntegrand(it: Integrand, E: number): number {
  if (E <= it.threshold || E <= 0) return -Infinity
  const kT = K_T9_KEV * it.T9
  return it.p * Math.log(E) - E / kT - (it.b ? it.b / Math.sqrt(E) : 0)
}

/** The energy (keV) where f peaks above threshold. */
export function peakEnergy(it: Integrand): number {
  const kT = K_T9_KEV * it.T9
  // d/dE: p/E − 1/kT + b/(2 E^{3/2}) = 0; solve by bisection on [tiny, big]
  const g = (E: number) => it.p / E - 1 / kT + (it.b ? it.b / (2 * E ** 1.5) : 0)
  let lo = 1e-6
  let hi = 1e6
  for (let k = 0; k < 200; k++) {
    const m = Math.sqrt(lo * hi)
    if (g(m) > 0) lo = m
    else hi = m
  }
  return Math.max(Math.sqrt(lo * hi), it.threshold)
}

/**
 * The cumulative integral of f on a log grid: energies (keV) and the
 * normalised cumulative share at each, from where f is negligible below the
 * peak to where it is negligible above it.
 */
export function cumulative(it: Integrand, points = 3000): { E: number[]; F: number[] } {
  const peak = peakEnergy(it)
  const fPeak = logIntegrand(it, peak * (1 + 1e-9))
  const cut = fPeak - 40 // e^-40 below the peak
  let lo = peak
  while (lo / 1.05 > Math.max(it.threshold, 1e-6) && logIntegrand(it, lo / 1.05) > cut) lo /= 1.05
  if (it.threshold > 0 && lo / 1.05 <= it.threshold) lo = it.threshold * (1 + 1e-9)
  let hi = peak
  while (logIntegrand(it, hi) > cut && hi < 1e9) hi *= 1.05
  const a = Math.log(Math.max(lo, 1e-9))
  const z = Math.log(hi)
  const E: number[] = []
  const F: number[] = [0]
  let prev = Math.exp(a)
  let prevW = Math.exp(logIntegrand(it, prev) - fPeak) * prev
  E.push(prev)
  let total = 0
  for (let k = 1; k <= points; k++) {
    const e = Math.exp(a + ((z - a) * k) / points)
    const w = Math.exp(logIntegrand(it, e) - fPeak) * e // f dE = f E d(lnE)
    total += ((w + prevW) / 2) * ((z - a) / points)
    E.push(e)
    F.push(total)
    prev = e
    prevW = w
  }
  return { E, F: F.map((x) => (total > 0 ? x / total : 0)) }
}

/** The cumulative share at E (keV), interpolated in ln E. */
export function shareBelow(c: { E: number[]; F: number[] }, E: number): number {
  const n = c.E.length
  if (!(E > c.E[0])) return 0
  if (E >= c.E[n - 1]) return 1
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (c.E[m] <= E) lo = m
    else hi = m
  }
  const t = (Math.log(E) - Math.log(c.E[lo])) / (Math.log(c.E[hi]) - Math.log(c.E[lo]))
  return c.F[lo] + t * (c.F[hi] - c.F[lo])
}

/** Share (0–1) of the rate integrand from energies outside the measured ranges (keV). */
export function unmeasuredShare(it: Integrand, measured: [number, number][]): number {
  const c = cumulative(it)
  let covered = 0
  for (const [a, b] of union(measured)) covered += shareBelow(c, b) - shareBelow(c, a)
  return Math.min(1, Math.max(0, 1 - covered))
}

/** How far E lies above the window, in Gamow widths: (E − E₀)/Δ. */
export function gamowWidths(E: number, E0: number, width: number): number {
  return (E - E0) / width
}

/**
 * Lanes for the gap map: bars that do not overlap (with a gap of `pad`, in
 * the axis' own units, e.g. log E) share a lane. Returns the lane of each.
 */
export function packLanes(spans: [number, number][], pad = 0): number[] {
  const order = spans.map((s, i) => [s[0], s[1], i] as const).sort((x, y) => x[0] - y[0] || x[1] - y[1])
  const ends: number[] = []
  const lane = Array(spans.length).fill(0)
  for (const [a, b, i] of order) {
    let k = ends.findIndex((end) => end + pad <= a)
    if (k < 0) {
      k = ends.length
      ends.push(b)
    } else ends[k] = b
    lane[i] = k
  }
  return lane
}

/** The 1/e window of an integrand around its peak (keV): for a charged pair, the Gamow window. */
export function windowOf(it: Integrand): { peak: number; lo: number; hi: number } {
  const c = cumulative(it, 4000)
  let peakE = c.E[0]
  let peakF = -Infinity
  for (const E of c.E) {
    const v = logIntegrand(it, E)
    if (v > peakF) {
      peakF = v
      peakE = E
    }
  }
  let lo = peakE
  let hi = peakE
  for (const E of c.E) {
    if (logIntegrand(it, E) >= peakF - 1) {
      lo = Math.min(lo, E)
      hi = Math.max(hi, E)
    }
  }
  return { peak: peakE, lo, hi }
}

/** A temperature's window and the gap metrics there (keV). */
export interface WindowMetrics {
  label: string
  network: string
  T9: number
  E0: number
  width: number
  lo: number
  hi: number
  /** kT, for a neutron */
  kT: number | null
  unmeasured: number
  widths: number | null
  below: number | null
}

export interface ChannelLite {
  z1: number
  z2: number
  mu: number
  threshold: number
}

/** Windows at chosen temperatures (any reaction), with the metrics. */
export function windowsAt(ch: ChannelLite, rows: GapRow[], temps: { label: string; T9: number; network?: string }[]): WindowMetrics[] {
  const ranges = measuredRanges(rows)
  const lowest = lowestMeasured(rows)
  const neutral = ch.z1 === 0 || ch.z2 === 0
  return temps.map((t) => {
    const it = integrandFor(ch.z1, ch.z2, ch.mu, t.T9, ch.threshold)
    const w = windowOf(it)
    const c = cumulative(it)
    return {
      label: t.label,
      network: t.network ?? "",
      T9: t.T9,
      E0: w.peak,
      width: w.hi - w.lo,
      lo: w.lo,
      hi: w.hi,
      kT: neutral ? K_T9_KEV * t.T9 : null,
      unmeasured: unmeasuredShare(it, ranges),
      widths: lowest && !neutral ? (lowest.E - w.peak) / (w.hi - w.lo) : null,
      below: lowest && !neutral ? shareBelow(c, lowest.E) : null,
    }
  })
}
