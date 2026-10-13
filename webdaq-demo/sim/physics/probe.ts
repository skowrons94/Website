/**
 * Peak finding for the tour's live FWHM line (design §4.1) and the physics tests:
 * linear background from the window edges, half-maximum crossings with linear
 * interpolation, centroid from the counts above half maximum.
 */

export interface PeakFit {
  centroid: number
  fwhm: number
  net: number
  height: number
}

/**
 * Fit a peak in `spec` (bins) near `center` (bin units, fractional allowed), looking at
 * ±halfWindow bins; `smooth` is the moving-average width applied before the
 * half-maximum search (use ≈ FWHM/10 bins, ≥ 1).
 */
export function fitPeak(spec: ArrayLike<number>, center: number, halfWindow: number, smooth = 1): PeakFit | null {
  const lo = Math.max(0, Math.floor(center - halfWindow))
  const hi = Math.min(spec.length - 1, Math.ceil(center + halfWindow))
  const n = hi - lo + 1
  if (n < 8) return null
  const y = new Float64Array(n)
  for (let i = 0; i < n; i++) y[i] = spec[lo + i]
  const edge = Math.max(2, Math.floor(n * 0.12))
  let bl = 0, br = 0
  for (let i = 0; i < edge; i++) { bl += y[i]; br += y[n - 1 - i] }
  bl /= edge; br /= edge
  const xl = (edge - 1) / 2, xr = n - 1 - (edge - 1) / 2
  const net = new Float64Array(n)
  for (let i = 0; i < n; i++) net[i] = y[i] - (bl + ((br - bl) * (i - xl)) / (xr - xl))
  const w = Math.max(1, Math.round(smooth))
  const sm = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0
    for (let k = i - (w >> 1); k <= i + ((w - 1) >> 1); k++) if (k >= 0 && k < n) { s += net[k]; c++ }
    sm[i] = s / c
  }
  // maximum in the central half of the window
  const c0 = Math.round(center) - lo
  let im = -1, ym = -Infinity
  for (let i = Math.max(edge, c0 - (n >> 2)); i <= Math.min(n - 1 - edge, c0 + (n >> 2)); i++) {
    if (sm[i] > ym) { ym = sm[i]; im = i }
  }
  if (im < 0 || !(ym > 0)) return null
  const half = ym / 2
  let a = im
  while (a > 0 && sm[a] > half) a--
  let b = im
  while (b < n - 1 && sm[b] > half) b++
  if (sm[a] > half || sm[b] > half) return null
  const xa = a + (half - sm[a]) / (sm[a + 1] - sm[a])
  const xb = b - (half - sm[b]) / (sm[b - 1] - sm[b])
  const fwhm = xb - xa
  // centroid: counts within ±FWHM/2 of the half-maximum midpoint
  const mid = (xa + xb) / 2
  let s0 = 0, s1 = 0, tot = 0
  for (let i = 0; i < n; i++) {
    const d = i - mid
    if (Math.abs(d) <= fwhm / 2) { s0 += net[i]; s1 += net[i] * i }
    if (Math.abs(d) <= 1.5 * fwhm) tot += net[i]
  }
  const centroid = s0 > 0 ? s1 / s0 : mid
  return { centroid: lo + centroid, fwhm, net: tot, height: ym }
}
