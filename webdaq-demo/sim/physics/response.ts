/**
 * Detector response tables (design §3.5): efficiencies, escape probabilities and the
 * continuum quantile function, generated offline by tables/gen_response.py.
 *
 * TABLE FORMAT (also what Geant4-tuned tables would have to provide, open question 3):
 *
 *   {
 *     "detector": "hpge" | "bgo" | "ej309",
 *     "energies_keV": number[NE],            ascending, log-spaced is best
 *     "distances_cm": number[ND],            ascending, source to end cap
 *     "solidAngle":   number[ND],            Ω/4π the generator used at each distance
 *     "geometry": { "radius_cm", "endcap_gap_cm", "backscatter_fraction", … },
 *     "eT":  number[ND][NE],                 total efficiency (any deposit), per emitted γ
 *     "eFE": number[ND][NE],                 full-energy efficiency, per emitted γ
 *     "pSE": number[NE], "pDE": number[NE],  P(single / double escape | interaction)
 *     "nQ":  256,
 *     "q":   base64 of Uint16[NE][nQ]        quantiles of deposit/E for every other
 *                                            interaction (continuum), x·65535, at
 *                                            probabilities (i + 0.5)/nQ
 *   }
 *
 * The engine divides eT, eFE by the solid angle (intrinsic efficiencies), interpolates
 * them in log E and in distance, and multiplies by the exact solid angle of the
 * user's distance, so any distance from 1 to 50 cm works.
 */

import type { Rng } from './rng'

export interface ResponseJson {
  detector: string
  energies_keV: number[]
  distances_cm: number[]
  solidAngle?: number[]
  geometry: { radius_cm: number; endcap_gap_cm: number; backscatter_fraction?: number; [k: string]: unknown }
  eT: number[][]
  eFE: number[][]
  pSE: number[]
  pDE: number[]
  nQ: number
  q: string
}

const ME = 510.99895 // keV, electron rest energy (CODATA 2018)

function b64ToU16(s: string): Uint16Array {
  let bytes: Uint8Array
  if (typeof atob === 'function') {
    const bin = atob(s)
    bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  } else {
    // Node without atob (old versions); Buffer exists there.
    bytes = Uint8Array.from((globalThis as any).Buffer.from(s, 'base64'))
  }
  const out = new Uint16Array(bytes.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = bytes[2 * i] | (bytes[2 * i + 1] << 8)
  return out
}

/** Ω/4π of a disc of radius R seen on axis from distance z. */
export function solidAngle(z_cm: number, R_cm: number): number {
  return 0.5 * (1 - z_cm / Math.hypot(z_cm, R_cm))
}

/** Response of one detector type at one distance. */
export interface LineResponse {
  /** Energy, keV. */
  E: number
  eT: number
  eFE: number
  pSE: number
  pDE: number
  /** Index into the energy grid and interpolation weight, for the continuum. */
  j: number
  w: number
}

export class Response {
  readonly kind: string
  private lnE: Float64Array
  private dist: number[]
  private intrT: Float64Array[]
  private intrFE: Float64Array[]
  private pSE: number[]
  private pDE: number[]
  private q: Uint16Array
  private nQ: number
  readonly radius: number
  readonly gap: number
  readonly backscatter: number

  constructor(j: ResponseJson) {
    this.kind = j.detector
    this.lnE = Float64Array.from(j.energies_keV, Math.log)
    this.dist = j.distances_cm
    this.radius = j.geometry.radius_cm
    this.gap = j.geometry.endcap_gap_cm
    this.backscatter = j.geometry.backscatter_fraction ?? 0
    const om = j.distances_cm.map((d, i) => j.solidAngle?.[i] ?? solidAngle(d + this.gap, this.radius))
    this.intrT = j.eT.map((row, i) => Float64Array.from(row, (v) => v / om[i]))
    this.intrFE = j.eFE.map((row, i) => Float64Array.from(row, (v) => v / om[i]))
    this.pSE = j.pSE
    this.pDE = j.pDE
    this.nQ = j.nQ
    this.q = b64ToU16(j.q)
  }

  /** Ω/4π of the crystal face from a source d_cm in front of the end cap. */
  omega(d_cm: number): number {
    return solidAngle(d_cm + this.gap, this.radius)
  }

  private interpE(E: number): [number, number] {
    const x = Math.log(Math.max(E, 1))
    const g = this.lnE
    if (x <= g[0]) return [0, 0]
    if (x >= g[g.length - 1]) return [g.length - 2, 1]
    let lo = 0, hi = g.length - 1
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g[m] <= x) lo = m; else hi = m }
    return [lo, (x - g[lo]) / (g[lo + 1] - g[lo])]
  }

  private intr(tab: Float64Array[], j: number, w: number, d_cm: number): number {
    // linear in the E grid, log-linear in distance (clamped to the table's range)
    const D = this.dist
    const d = Math.max(D[0], Math.min(D[D.length - 1], d_cm))
    let k = 0
    while (k < D.length - 2 && D[k + 1] < d) k++
    const t = Math.log(d / D[k]) / Math.log(D[k + 1] / D[k])
    const v = (row: Float64Array) => row[j] * (1 - w) + row[j + 1] * w
    return v(tab[k]) * (1 - t) + v(tab[k + 1]) * t
  }

  /** Response to a γ of energy E (keV) from a point source d_cm before the end cap. */
  line(E: number, d_cm: number): LineResponse {
    const om = this.omega(d_cm)
    const [j, w] = this.interpE(E)
    const lowCut = E < Math.exp(this.lnE[0]) ? E / Math.exp(this.lnE[0]) : 1
    const eT = Math.max(0, this.intr(this.intrT, j, w, d_cm) * om * lowCut)
    const eFE = Math.min(eT, Math.max(0, this.intr(this.intrFE, j, w, d_cm) * om * lowCut))
    const pSE = E > 2 * ME ? this.pSE[j] * (1 - w) + this.pSE[j + 1] * w : 0
    const pDE = E > 2 * ME ? this.pDE[j] * (1 - w) + this.pDE[j + 1] * w : 0
    return { E, eT, eFE, pSE, pDE, j, w }
  }

  /**
   * Energy deposited by a γ that interacts (given that it does), keV.
   * Full energy, single/double escape, backscatter or continuum.
   */
  deposit(L: LineResponse, r: Rng): number {
    const E = L.E
    const pFE = L.eT > 0 ? L.eFE / L.eT : 0
    let u = r.next()
    if (u < pFE) return E
    u -= pFE
    if (u < L.pSE) return E - ME
    u -= L.pSE
    if (u < L.pDE) return E - 2 * ME
    if (this.backscatter > 0 && r.next() < this.backscatter) {
      // photon scattered by material behind the source, 120°–180°, then absorbed
      const c = -0.5 - 0.5 * r.next()
      return E / (1 + (E / ME) * (1 - c))
    }
    return E * this.quantile(L, r.next())
  }

  quantile(L: LineResponse, p: number): number {
    const n = this.nQ
    const x = p * n - 0.5
    const i = Math.max(0, Math.min(n - 2, Math.floor(x)))
    const f = Math.max(0, Math.min(1, x - i))
    const a = L.j * n, b = (L.j + 1) * n
    const qa = this.q[a + i] * (1 - f) + this.q[a + i + 1] * f
    const qb = this.q[b + i] * (1 - f) + this.q[b + i + 1] * f
    return ((qa * (1 - L.w) + qb * L.w) / 65535)
  }
}
