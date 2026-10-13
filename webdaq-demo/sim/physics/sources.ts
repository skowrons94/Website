/**
 * Sources (design §3.3): radioactive decays walked through their ENSDF level schemes,
 * the room background, ¹⁴N(p,γ)¹⁵O on the 278 keV resonance, and ²⁵²Cf fission.
 *
 * Each emitter produces, per tick, only the decays that leave something in at
 * least one of the two detectors: the number of such decays is Poisson with mean
 * rate·dt·P(any hit), and the cascade and the first interacting γ are drawn
 * conditionally. That keeps the cost proportional to the detected rate, not to the
 * activity (a 1 MBq source costs the same per detected event as a 1 kBq one).
 */

import { Alias, Rng } from './rng'
import type { LineResponse, Response } from './response'

export const ME_KEV = 510.99895

/** What ends up in one detector from one decay/reaction. */
export interface Deposit {
  /** Electron-equivalent energy, keV (true energy for HPGe). */
  E: number
  /** Part of E produced by heavy particles (recoil protons, ³He(n,p) products), keVee. */
  heavy: number
}

export type Sink = (t: number, d0: Deposit | null, d1: Deposit | null) => void

export interface Emitter {
  /** Emit the detected decays of [t0, t0+dt). `scale` multiplies the rate (beam current, …). */
  emit(t0: number, dt: number, scale: number, r: Rng, sink: Sink): void
  /** Detected decays per second at scale 1 (for budgets and tests). */
  detectedRate(): number
}

// ───────────────────────────────────────────────────────────── lines.json

export type LevelRow = [number, number, [number, number, number, number][]]
export interface NuclideJson {
  src: string
  levels: LevelRow[]
  lines: [number, number][]
}
export interface LinesJson {
  sources: Record<string, { ref: string }>
  nuclides: Record<string, NuclideJson>
  [k: string]: any
}

/** A γ cascade: the photons of one decay path, each with its emission probability. */
export interface Path {
  p: number
  gammas: number[]
  photon: number[]
}

/** Enumerate decay paths (feeding × branchings), dropping those below pMin. */
export function enumeratePaths(n: NuclideJson, pMin = 1e-6, maxPaths = 3000): Path[] {
  const out: Path[] = []
  const walk = (lvl: number, p: number, gs: number[], ph: number[]) => {
    const row = n.levels[lvl]
    const tr = row[2]
    if (!tr.length || lvl === 0) { out.push({ p, gammas: gs, photon: ph }); return }
    for (const [to, b, phot, eg] of tr) {
      const q = p * b
      if (q < pMin) continue
      walk(to, q, gs.concat(eg), ph.concat(phot))
    }
  }
  n.levels.forEach((row, i) => { if (row[1] > 0) walk(i, row[1], [], []) })
  out.sort((a, b) => b.p - a.p)
  return out.slice(0, maxPaths).filter((x) => x.gammas.length > 0)
}

// ───────────────────────────────────────────────────── discrete cascades

interface PreparedPath {
  gammas: number[]
  /** per γ: hit probability in det 0 and det 1 (photon emission included) */
  h0: Float64Array
  h1: Float64Array
  resp: LineResponse[]
  pAny: number
}

/**
 * A set of γ cascades with a rate (decays or reactions per second at scale 1),
 * seen by two identical detectors at distance d.
 */
export class CascadeEmitter implements Emitter {
  private prepared: PreparedPath[] = []
  private alias: Alias | null = null
  private rateAny = 0

  /**
   * @param wSame angular-correlation factor applied to later γs of a cascade once one
   *   has hit (W(0°) normalised; 1 when there is no correlation)
   */
  constructor(
    paths: Path[],
    private rate: number,
    private resp: Response,
    private d_cm: number,
    private wSame = 1,
    /** Energy transformation applied to each γ before detection (Doppler, recoil). */
    xform?: (E: number, i: number) => number,
  ) {
    const cache = new Map<number, LineResponse>()
    const lr = (E: number) => {
      let v = cache.get(E)
      if (!v) { v = resp.line(E, d_cm); cache.set(E, v) }
      return v
    }
    let total = 0
    const weights: number[] = []
    for (const p of paths) total += p.p
    for (const p of paths) {
      const gammas = p.gammas.map((E, i) => (xform ? xform(E, i) : E))
      const resp = gammas.map(lr)
      const h0 = Float64Array.from(resp, (x, i) => x.eT * p.photon[i])
      const h1 = h0.slice()
      let none = 1
      for (let i = 0; i < h0.length; i++) none *= 1 - Math.min(1, h0[i] + h1[i])
      const pAny = 1 - none
      this.prepared.push({ gammas, h0, h1, resp, pAny })
      weights.push((p.p / total) * pAny)
      this.rateAny += (rate * p.p / total) * pAny
    }
    this.alias = new Alias(weights)
  }

  detectedRate(): number {
    return this.rateAny
  }

  emit(t0: number, dt: number, scale: number, r: Rng, sink: Sink): void {
    if (!this.alias || this.rateAny <= 0 || scale <= 0) return
    const n = r.poisson(this.rateAny * dt * scale)
    for (let k = 0; k < n; k++) {
      const P = this.prepared[this.alias.sample(r)]
      const m = P.gammas.length
      // first γ that interacts: P(i) ∝ Π_{j<i}(1 − h_j) h_i
      let u = r.next() * P.pAny
      let first = m - 1
      let surv = 1
      for (let i = 0; i < m; i++) {
        const h = Math.min(1, P.h0[i] + P.h1[i])
        const pi = surv * h
        if (u < pi) { first = i; break }
        u -= pi
        surv *= 1 - h
      }
      let e0 = 0, e1 = 0
      for (let i = first; i < m; i++) {
        let a = P.h0[i], b = P.h1[i]
        if (i === first) {
          const s = a + b
          a /= s; b /= s
        } else {
          a *= this.wSame; b *= this.wSame
        }
        const v = r.next()
        if (v < a) e0 += this.resp.deposit(P.resp[i], r)
        else if (v < a + b) e1 += this.resp.deposit(P.resp[i], r)
      }
      sink(t0 + r.next() * dt, e0 > 0 ? { E: e0, heavy: 0 } : null, e1 > 0 ? { E: e1, heavy: 0 } : null)
    }
  }
}

// ─────────────────────────────────────────────── continuum backgrounds

/**
 * Deposits drawn directly (no transport): a power law E^-index on [lo, hi] keV at a
 * fixed rate per detector, or a line.
 */
export class DirectEmitter implements Emitter {
  constructor(private rate: number, private lo: number, private hi: number, private index: number) {}

  detectedRate(): number {
    return 2 * this.rate
  }

  sample(r: Rng): number {
    const { lo, hi, index: a } = this
    if (lo === hi) return lo
    if (Math.abs(a - 1) < 1e-9) return lo * Math.pow(hi / lo, r.next())
    const k = 1 - a
    const x = Math.pow(lo, k) + r.next() * (Math.pow(hi, k) - Math.pow(lo, k))
    return Math.pow(x, 1 / k)
  }

  emit(t0: number, dt: number, scale: number, r: Rng, sink: Sink): void {
    for (let det = 0; det < 2; det++) {
      const n = r.poisson(this.rate * dt * scale)
      for (let k = 0; k < n; k++) {
        const d = { E: this.sample(r), heavy: 0 }
        sink(t0 + r.next() * dt, det === 0 ? d : null, det === 1 ? d : null)
      }
    }
  }
}

// ──────────────────────────────────────────────────── ¹⁴N(p,γ)¹⁵O

export interface N14pgModel {
  /** reactions per µC of protons, before the yield factor */
  yieldPerProton: number
  paths: Path[]
  /** γ energies after recoil correction and Doppler shift at the detector angle */
  xform: (E: number, i: number) => number
  beta: number
  bgLines: [number, number][]
}

/**
 * Thick-target yield of a narrow resonance, Y = (λ²/2)·ωγ/ε_eff (Rolfs & Rodney),
 * with λ the centre-of-mass de Broglie wavelength and ε_eff the stopping cross section
 * per ¹⁴N atom in TiN in the centre-of-mass system.
 */
export function n14pgModel(L: LinesJson): N14pgModel {
  const n = L.n14pg
  const Q = n.Q_keV.v, Ecm = n.Ecm_res_keV.v, Ep = n.Ep_res_keV.v
  const Mp = n.Mp_MeV.v, M15 = n.M15O_MeV.v
  const M14 = M15 - Mp + Q / 1000 // MeV, from the masses and Q
  const mu = (Mp * M14) / (Mp + M14) // MeV
  const hbarc = 197.3269804 // MeV fm (CODATA 2018)
  const p = Math.sqrt(2 * mu * Ecm / 1000) // MeV/c
  const lambda_cm = (2 * Math.PI * hbarc / p) * 1e-13
  const eps_lab = (n.eps_N.v + n.eps_Ti.v) * 1e-15 // eV cm² per N atom (TiN 1:1)
  const eps_cm = eps_lab * M14 / (M14 + Mp)
  const wg_eV = n.omega_gamma_meV.v * 1e-3
  const Y = (lambda_cm * lambda_cm / 2) * wg_eV / eps_cm
  const levels: number[] = n.levels_keV.v
  const br: number[] = n.branching_pct.v
  const Ex = Q + Ecm
  const paths: Path[] = []
  for (let i = 0; i < levels.length; i++) {
    const gs = i === 0 ? [Ex] : [Ex - levels[i], levels[i]]
    paths.push({ p: br[i] / 100, gammas: gs, photon: gs.map(() => 1) })
  }
  // recoil velocity of ¹⁵O: proton momentum over the compound mass
  const pp = Math.sqrt(2 * Mp * Ep / 1000 + (Ep / 1000) ** 2)
  const beta = pp / (M15 + Ex / 1000)
  const cos = Math.cos((n.detector_angle_deg.v * Math.PI) / 180)
  const M15keV = M15 * 1000
  const xform = (E: number) => {
    const Erec = E - (E * E) / (2 * M15keV)
    return Erec * (1 + beta * cos)
  }
  return { yieldPerProton: Y, paths, xform, beta, bgLines: n.beam_bg.v }
}

// ──────────────────────────────────────────────────────────── ²⁵²Cf

/** Watt spectrum sampling (Everett & Cashwell, LA-5499; the MCNP method). */
export function sampleWatt(a: number, b: number, r: Rng): number {
  const K = 1 + (a * b) / 8
  const Lw = a * (K + Math.sqrt(K * K - 1))
  const M = Lw / a - 1
  for (;;) {
    const x = r.exp(), y = r.exp()
    if ((y - M * (x + 1)) ** 2 <= b * Lw * x) return Lw * x
  }
}

/** Response of a detector to a neutron of energy E_MeV; returns heavy-particle light (keVee) or 0. */
export type NeutronResponse = (E_MeV: number, r: Rng) => number

export class FissionEmitter implements Emitter {
  private eTmax = 0
  private hMax = 0

  constructor(
    private fissionRate: number,
    private L: LinesJson,
    private resp: Response | null,
    private d_cm: number,
    /** probability that a neutron of E MeV gives a pulse in one detector */
    private nHit: ((E_MeV: number) => number) | null,
    /** light (keVee) of a neutron of E MeV that gives a pulse */
    private nLight: NeutronResponse | null,
  ) {
    // Bounds for Poisson thinning: γ and neutron multiplicities are taken as Poisson,
    // so "candidates" at the bounding probability, accepted with p(E)/p_max, are exact.
    for (let E = 30; E < 10000; E *= 1.05) {
      if (resp) this.eTmax = Math.max(this.eTmax, resp.line(E, d_cm).eT)
      if (nHit) this.hMax = Math.max(this.hMax, nHit(E / 1000))
    }
  }

  detectedRate(): number {
    const c = this.L.cf252
    const gam = this.resp ? 2 * c.gammas_per_fission.v * this.resp.line(c.gamma_mean_MeV.v * 1000, this.d_cm).eT : 0
    const neu = this.nHit ? 2 * c.nubar.v * this.nHit(2.0) : 0
    return this.fissionRate * (gam + neu)
  }

  emit(t0: number, dt: number, scale: number, r: Rng, sink: Sink): void {
    const c = this.L.cf252
    const n = r.poisson(this.fissionRate * dt * scale)
    const gMean = 2 * c.gammas_per_fission.v * this.eTmax
    const nMean = 2 * c.nubar.v * this.hMax
    for (let k = 0; k < n; k++) {
      const kg = this.resp ? r.poisson(gMean) : 0
      const kn = this.nHit ? r.poisson(nMean) : 0
      if (kg === 0 && kn === 0) continue
      let e0 = 0, e1 = 0, h0 = 0, h1 = 0
      for (let g = 0; g < kg; g++) {
        // prompt fission γ: exponential spectrum with the measured mean (Verbinski 1973)
        const E = Math.min(10000, 30 + r.exp() * c.gamma_mean_MeV.v * 1000)
        const lr = this.resp!.line(E, this.d_cm)
        if (r.next() * this.eTmax >= lr.eT) continue
        const dep = this.resp!.deposit(lr, r)
        if (r.next() < 0.5) e0 += dep; else e1 += dep
      }
      for (let i = 0; i < kn; i++) {
        const E = sampleWatt(c.watt_a_MeV.v, c.watt_b_perMeV.v, r)
        if (r.next() * this.hMax >= this.nHit!(E)) continue
        const l = this.nLight!(E, r)
        if (r.next() < 0.5) { e0 += l; h0 += l } else { e1 += l; h1 += l }
      }
      if (e0 > 0 || e1 > 0) {
        // fission neutrons arrive a few ns after the γ flash: within one event here
        sink(t0 + r.next() * dt, e0 > 0 ? { E: e0, heavy: h0 } : null, e1 > 0 ? { E: e1, heavy: h1 } : null)
      }
    }
  }
}
