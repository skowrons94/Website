/**
 * Digital pulse processing on sampled traces (design §3.4 "Waveforms"): the same
 * filters DPP-PHA applies, run on one simulated preamplifier pulse per request.
 * Pure functions on Float64Array, no DOM: also usable by the companion page's
 * mini-demo (design §4.2 item 4).
 */

/** Preamplifier step response: A·(e^{−t/τ} − e^{−t/τ_rise}) for t ≥ t0, samples of Ts. */
export function preampPulse(n: number, Ts_ns: number, t0_ns: number, A: number, tau_ns: number, rise_ns: number): Float64Array {
  const v = new Float64Array(n)
  const r = Math.max(rise_ns, 0.1)
  for (let i = 0; i < n; i++) {
    const t = i * Ts_ns - t0_ns
    if (t > 0) v[i] = A * (Math.exp(-t / tau_ns) - Math.exp(-t / r))
  }
  return v
}

/**
 * Charge-collection-limited preamplifier pulse: a linear ramp of duration tc (the
 * current pulse of a coaxial HPGe, approximated as constant) followed by the
 * exponential decay of the feedback, amplitude A. This is what makes ballistic deficit.
 */
export function hpgePulse(n: number, Ts_ns: number, t0_ns: number, A: number, tau_ns: number, tc_ns: number): Float64Array {
  const v = new Float64Array(n)
  const tc = Math.max(tc_ns, Ts_ns)
  for (let i = 0; i < n; i++) {
    const t = i * Ts_ns - t0_ns
    if (t <= 0) continue
    if (t < tc) {
      // ∫0^t e^{−(t−s)/τ} ds / tc
      v[i] = A * (tau_ns / tc) * (1 - Math.exp(-t / tau_ns))
    } else {
      v[i] = A * (tau_ns / tc) * (1 - Math.exp(-tc / tau_ns)) * Math.exp(-(t - tc) / tau_ns)
    }
  }
  return v
}

/**
 * Jordanov–Knoll trapezoid (NIM A 345, 337 (1994)), k = rise, l = k + flat, M = decay,
 * all in samples:
 *   d[n] = v[n] − v[n−k] − v[n−l] + v[n−k−l]
 *   p[n] = p[n−1] + d[n];  r[n] = p[n] + M·d[n];  s[n] = s[n−1] + r[n]
 * The output is divided by k·M so a step of height A gives a flat top of height ≈ A.
 * With M ≠ τ the flat top tilts.
 */
export function trapezoid(v: ArrayLike<number>, k: number, flat: number, M: number): Float64Array {
  const n = v.length
  k = Math.max(1, Math.round(k))
  const l = k + Math.max(0, Math.round(flat))
  const out = new Float64Array(n)
  const at = (i: number) => (i >= 0 ? v[i] : v[0])
  let p = 0, s = 0
  const norm = 1 / (k * Math.max(M, 1e-9))
  for (let i = 0; i < n; i++) {
    const d = at(i) - at(i - k) - at(i - l) + at(i - k - l)
    p += d
    const r = p + M * d
    s += r
    out[i] = s * norm
  }
  return out
}

/** Moving average over w samples (the RC-CR² smoothing). */
export function movingAverage(v: ArrayLike<number>, w: number): Float64Array {
  w = Math.max(1, Math.round(w))
  const out = new Float64Array(v.length)
  let acc = 0
  for (let i = 0; i < v.length; i++) {
    acc += v[i] - (i >= w ? v[i - w] : v[0])
    out[i] = i >= w ? acc / w : acc / w + v[0] * (w - i - 1) / w
  }
  return out
}

/**
 * RC-CR and RC-CR² of the trigger (UM5678 §"Trigger and timing filter"):
 * smoothing over nSmooth samples, then differences over the input rise time k.
 * Returns [RC-CR, RC-CR²], both scaled by `gain`.
 */
export function rcCr2(v: ArrayLike<number>, k: number, nSmooth: number, gain = 1): [Float64Array, Float64Array] {
  const sm = movingAverage(v, nSmooth)
  k = Math.max(1, Math.round(k))
  const n = v.length
  const d1 = new Float64Array(n), d2 = new Float64Array(n)
  for (let i = 0; i < n; i++) d1[i] = (sm[i] - sm[Math.max(0, i - k)]) * gain
  for (let i = 0; i < n; i++) d2[i] = (d1[i] - d1[Math.max(0, i - k)])
  return [d1, d2]
}

/**
 * Light pulse of a scintillator: Σ a_k e^{−t/τ_k} with a common rise τ_r,
 * normalised so the integral is 1 (per unit light).
 */
export function lightShape(t: number, taus: number[], weights: number[], rise: number): number {
  if (t <= 0) return 0
  let s = 0
  for (let i = 0; i < taus.length; i++) {
    const tau = taus[i]
    s += (weights[i] * (Math.exp(-t / tau) - Math.exp(-t / rise))) / (tau - rise)
  }
  return s
}

/** Fraction of the light of lightShape emitted in [0, x]. */
export function lightFraction(x: number, taus: number[], weights: number[], rise: number): number {
  if (x <= 0) return 0
  let s = 0
  for (let i = 0; i < taus.length; i++) {
    const tau = taus[i]
    s += weights[i] * (tau * (1 - Math.exp(-x / tau)) - rise * (1 - Math.exp(-x / rise))) / (tau - rise)
  }
  return s
}

/** Clamp to the 14-bit ADC and to int16. */
export function toAdc(v: ArrayLike<number>, bits = 14): Int16Array {
  const max = (1 << bits) - 1
  const out = new Int16Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = Math.max(0, Math.min(max, Math.round(v[i])))
  return out
}

/** Clamp to int16 (filter probes can be negative). */
export function toInt16(v: ArrayLike<number>): Int16Array {
  const out = new Int16Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(v[i])))
  return out
}
