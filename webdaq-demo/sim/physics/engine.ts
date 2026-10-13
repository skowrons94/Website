/**
 * The physics engine behind sim/physics/api.ts (design §3.1, §3.3–§3.5, §3.11).
 *
 * Per 50 ms tick: sources emit the decays that reach a detector (conditional
 * sampling, sources.ts), deposits within one decay add up per detector (true
 * coincidence summing), noise triggers are added (Rice), then each channel's
 * arrivals go, in time order, through the DPP model driven by the registers:
 * trigger threshold, trigger hold-off, pile-up window, saturation, then the
 * board's readout budget (lost events), then energy/charge and the histograms.
 */

import type {
  BoardView, ChannelCounters, DetectorKind, FwhmProbe, PhysicsEngine, Scenario, TickEnv, TickResult,
} from './api'
import {
  ADC_MAX, LINK_BYTES_PER_S, R, ballisticDeficit, gateFractions, hpgeConst, hpgeFwhm2, npCrossSection,
  phaParams, phaTriggerHeight, protonLight, psdParams, sampleCharges, scintModel,
  type HpgeConst, type PhaParams, type PsdParams, type ScintModel,
} from './detectors'
import type { TraceCapture, TraceContext } from './traces'
import { beamSample } from './beam'
import { fitPeak } from './probe'
import { Response, type ResponseJson, solidAngle } from './response'
import { Rng } from './rng'
import {
  CascadeEmitter, DirectEmitter, FissionEmitter, enumeratePaths, n14pgModel,
  type Deposit, type Emitter, type LinesJson,
} from './sources'

// Array sizes of caendaq's HistogramStore (same values as api.ts; repeated here so
// this module has no runtime import of api.ts).
const ENERGY_BINS = 32768
const QLONG_BINS = 65536
const PSD_XBINS = 2048
const PSD_YBINS = 256
const QLONG_MAX = 65536
const E_CHARGE_UC = 1.602176634e-13 // µC per proton (CODATA 2018 e)

// ───────────────────────────────────────────────────────── data registry

export type ResponseKind = 'hpge' | 'bgo' | 'ej309'
export interface PhysicsData {
  lines?: LinesJson
  response?: Partial<Record<ResponseKind, ResponseJson>>
}

const registry: { lines: LinesJson | null; response: Partial<Record<ResponseKind, ResponseJson>> } = {
  lines: null,
  response: {},
}

/** Hand the engine its data (tests, or a worker that fetched the JSON itself). */
export function registerPhysicsData(d: PhysicsData): void {
  if (d.lines) registry.lines = d.lines
  Object.assign(registry.response, d.response ?? {})
}

/**
 * Load lines.json and the response table of a detector kind as separate chunks
 * (design §6.4: "tables load after the detector choice"). Await it before
 * configure() with that kind.
 */
export async function loadPhysicsData(kind: DetectorKind): Promise<void> {
  if (!registry.lines) {
    const m: any = await import('../data/lines.json')
    registry.lines = (m.default ?? m) as LinesJson
  }
  if (kind === 'he3' || registry.response[kind as ResponseKind]) return
  let m: any
  if (kind === 'hpge') m = await import('../../tables/hpge.json')
  else if (kind === 'bgo') m = await import('../../tables/bgo.json')
  else m = await import('../../tables/ej309.json')
  registry.response[kind as ResponseKind] = (m.default ?? m) as ResponseJson
}

export function physicsDataReady(kind: DetectorKind): boolean {
  return !!registry.lines && (kind === 'he3' || !!registry.response[kind as ResponseKind])
}

// ───────────────────────────────────────────────────────────── helpers

const DPP_OF: Record<DetectorKind, 'DPP-PHA' | 'DPP-PSD'> = { hpge: 'DPP-PHA', bgo: 'DPP-PSD', ej309: 'DPP-PSD', he3: 'DPP-PSD' }

/**
 * Noise triggers per channel and tick above which they are no longer drawn one by
 * one. At a threshold inside the noise (EJ-309 at 8 LSB: about 6 MHz of crossings on
 * each of 16 channels) drawing every crossing took seconds per 50 ms tick and the
 * worker fell further behind on every tick. Above it, only the crossings the trigger
 * hold-off lets through are generated (a renewal process: hold-off plus an
 * exponential wait), at most NOISE_SIMULATED of them; the rest are counted.
 */
export const NOISE_DIRECT = 500
export const NOISE_SIMULATED = 500

interface Pending {
  t: number
  E: number
  heavy: number
  extra: number
  extraHeavy: number
  tc: number
  pu: boolean
  satu: boolean
  noise: boolean
}

interface ChanState {
  pending: Pending | null
  lastAcc: number
  rate: number
  e2: number
  lastE: number
  lastHeavy: number
  // per-tick arrivals
  // per-tick arrivals (growable typed buffers)
  n: number
  ts: Float64Array
  es: Float64Array
  hs: Float64Array
}

interface Scaled { e: Emitter; beam: boolean }

function newChan(): ChanState {
  return { pending: null, lastAcc: -1e9, rate: 0, e2: 0, lastE: 0, lastHeavy: 0, n: 0, ts: new Float64Array(256), es: new Float64Array(256), hs: new Float64Array(256) }
}

function scenarioKey(s: Scenario): string {
  return JSON.stringify([s.detectors, s.source, +s.distance_cm.toFixed(3), s.activity_Bq, s.background, s.yield_factor])
}

// ────────────────────────────────────────────────────────────── traces

let traceSynth: ((x: TraceContext) => TraceCapture) | null = null
/** traces.ts registers its synthesis here when it is loaded (it stays out of the first chunk). */
export function setTraceSynth(f: ((x: TraceContext) => TraceCapture) | null) { traceSynth = f }

// ────────────────────────────────────────────────────────────── engine

export function createPhysics(seed: number): PhysicsEngine & PhysicsExtras {
  return new Engine(seed >>> 0)
}

/** Extra introspection used by tests and the tour; not part of the state-machine contract. */
export interface PhysicsExtras {
  /** Analytic FWHM (keV) the model predicts for E on ch at the current settings, without ballistic deficit. */
  expectedFwhm(ch: number, E: number): number
  /** keV per spectrum bin centre: E = (bin + 0.5) / gain. */
  gain(ch: number): number
  /** Detected decays per second, all emitters, at scale 1 (beam: per µA). */
  detectedRate(): number
  readonly kind: DetectorKind | null
  /**
   * P3 (run files): when set, called for every event the board writes (not the
   * lost ones), per channel in time order: t_s in run time; for PHA `a` is the
   * 15-bit energy word value (0 for pile-up and saturated events), for PSD `a` is
   * Q_short and `b` Q_long. Used only by a replay engine regenerating a run's data
   * file, never by the live one.
   */
  eventSink: ((ch: number, t_s: number, a: number, b: number, pu: boolean, satu: boolean) => void) | null
  /**
   * The work the last tick() did, in arrivals taken through the DPP model (deposits and
   * simulated noise triggers) plus bulk histogram fills: what a tick costs, counted
   * rather than timed, so the tests can bound it deterministically.
   */
  readonly lastTickWork: number
}

class Engine implements PhysicsEngine, PhysicsExtras {
  private scenario: Scenario | null = null
  private board: BoardView | null = null
  kind: DetectorKind | null = null
  eventSink: PhysicsExtras['eventSink'] = null
  lastTickWork = 0
  private L: LinesJson | null = null
  private resp: Response | null = null
  private hk: HpgeConst | null = null
  private scint: ScintModel | null = null
  private emitters: Scaled[] = []
  private key = ''
  private pha: PhaParams[] = []
  private psdp: PsdParams[] = []
  private spectra: Uint32Array[] = []
  /**
   * Channels 0 and 1 again, counting only events taken with the present settings: the
   * tour's live FWHM fits these, so a peak filled before and after a register change
   * is never fitted as one (it could look narrower than the detector can be).
   */
  private probe: (Uint32Array | null)[] = []
  private probeKey = ''
  private psds: (Uint32Array | null)[] = []
  private chans: ChanState[] = []
  private rSrc: Rng
  private rCh: Rng[] = []
  private rWave: Rng
  private dpp: 'DPP-PHA' | 'DPP-PSD' = 'DPP-PHA'
  private nCh = 0
  private blocksFrac = 0
  /** per PSD channel: gate fractions [fS_e, fL_e, fS_h, fL_h] at the current gates */
  private gf: Float64Array[] = []

  constructor(private seed: number) {
    this.rSrc = new Rng(seed, 'sources')
    this.rWave = new Rng(seed, 'waveform')
  }

  // ── configuration ──────────────────────────────────────────────────

  configure(scenario: Scenario, board: BoardView): void {
    const kind = scenario.detectors
    if (!physicsDataReady(kind)) throw new Error(`physics data for '${kind}' not loaded (await loadPhysicsData('${kind}'))`)
    if (board.dpp !== DPP_OF[kind]) throw new Error(`${kind} runs on ${DPP_OF[kind]}, the board is ${board.dpp}`)
    if (scenario.source === 'ambe') throw new Error('AmBe is not modelled: no sourced neutron spectrum is bundled; use ²⁵²Cf')
    this.L = registry.lines!
    const realloc = board.nChannels !== this.nCh || board.dpp !== this.dpp
    this.board = board
    this.dpp = board.dpp
    this.nCh = board.nChannels
    if (realloc) this.alloc()
    if (kind !== this.kind) {
      this.kind = kind
      this.resp = kind === 'he3' ? null : new Response(registry.response[kind as ResponseKind]!)
      this.hk = kind === 'hpge' ? hpgeConst(this.L) : null
      this.scint = kind === 'hpge' ? null : scintModel(kind, this.L)
      this.key = ''
    }
    this.scenario = scenario
    const key = scenarioKey(scenario)
    if (key !== this.key) { this.buildEmitters(scenario); this.key = key }
    this.pha = []; this.psdp = []
    for (let c = 0; c < this.nCh; c++) {
      if (this.dpp === 'DPP-PHA') this.pha.push(phaParams(board, c, this.L))
      else this.psdp.push(psdParams(board, c, kind, this.scint!.qPerKeV, this.L))
    }
    this.gf = this.psdp.map((p) => Float64Array.from([...gateFractions(this.scint!, p, 0), ...gateFractions(this.scint!, p, 1)]))
    const pk = this.key + JSON.stringify(this.dpp === 'DPP-PHA' ? this.pha.slice(0, 2) : this.psdp.slice(0, 2))
    if (pk !== this.probeKey) { this.probeKey = pk; for (const p of this.probe) p?.fill(0) }
  }

  private alloc(): void {
    const bins = this.dpp === 'DPP-PSD' ? QLONG_BINS : ENERGY_BINS
    this.spectra = Array.from({ length: this.nCh }, () => new Uint32Array(bins))
    this.probe = Array.from({ length: this.nCh }, (_, c) => (c < 2 ? new Uint32Array(bins) : null))
    this.psds = Array.from({ length: this.nCh }, () => (this.dpp === 'DPP-PSD' ? new Uint32Array(PSD_XBINS * PSD_YBINS) : null))
    this.chans = Array.from({ length: this.nCh }, newChan)
    this.rCh = Array.from({ length: this.nCh }, (_, c) => new Rng(this.seed, `ch${c}`))
  }

  private buildEmitters(s: Scenario): void {
    const L = this.L!, resp = this.resp, kind = s.detectors
    const d = Math.max(1, Math.min(50, s.distance_cm))
    const out: Scaled[] = []
    const A = Math.max(0, s.activity_Bq)
    if (resp) {
      if (s.source === 'co60') {
        const c = L.co60_correlation
        // W(0°)/⟨W⟩ for a 4→2→0 cascade (Legendre a2, a4, so ⟨W⟩ = 1): both γs entering the same small detector
        const w0 = 1 + c.a2 + c.a4
        out.push({ e: new CascadeEmitter(enumeratePaths(L.nuclides.Co60), A, resp, d, w0), beam: false })
      } else if (s.source === 'cs137') {
        out.push({ e: new CascadeEmitter(enumeratePaths(L.nuclides.Cs137), A, resp, d), beam: false })
      } else if (s.source === 'n14pg') {
        const m = n14pgModel(L)
        // reactions per second per µA: Y × protons/s per µA × declared yield factor
        const perUA = (m.yieldPerProton * s.yield_factor * 1e-6) / (E_CHARGE_UC * 1e-6)
        out.push({ e: new CascadeEmitter(m.paths, perUA, resp, d, 1, m.xform), beam: true })
        for (const [E, f] of m.bgLines) {
          out.push({ e: new CascadeEmitter([{ p: 1, gammas: [E], photon: [1] }], perUA * f, resp, d), beam: true })
        }
      }
      // room background, always present (γ detectors only)
      const bg = L.background
      for (const [nuc, act] of bg.components.v as [string, number][]) {
        out.push({ e: new CascadeEmitter(enumeratePaths(L.nuclides[nuc]), act, resp, 25), beam: false })
      }
      const cont = bg.continuum
      out.push({ e: new DirectEmitter(cont.rate_cps, 50, 3000, cont.index), beam: false })
      out.push({ e: new DirectEmitter(bg.annihilation_cps.v, 511, 511, 0), beam: false })
      const cos = bg.cosmic_surface_cps.v / (s.background === 'surface' ? 1 : bg.underground_suppression.v)
      out.push({ e: new DirectEmitter(cos, 3000, 10000, 1), beam: false })
    }
    if (s.source === 'cf252') {
      const c = L.cf252
      let nHit: ((E: number) => number) | null = null
      let nLight: ((E: number, r: Rng) => number) | null = null
      if (kind === 'ej309') {
        const e = L.ej309
        const om = solidAngle(d + 0.2, e.cell_radius_cm.v)
        const pint = (E: number) => 1 - Math.exp(-e.nH_per_cm3.v * npCrossSection(E, L) * 1e-24 * e.cell_length_cm.v)
        nHit = (E) => om * pint(E)
        nLight = (E, r) => {
          // first n–p scatter (isotropic in CM: recoil energy uniform), maybe a second
          const u = r.next()
          let l = protonLight(E * u, L)
          const E2 = E * (1 - u)
          if (E2 > 0.05 && r.next() < pint(E2)) l += protonLight(E2 * r.next(), L)
          return l * 1000
        }
      } else if (kind === 'he3') {
        const h = L.he3
        const om = solidAngle(d + 0.2, h.tube_radius_cm.v)
        nHit = () => om * h.intrinsic_eff_thermal.v
        nLight = (_E, r) => {
          // ³He(n,p)t: 764 keV, or a wall-effect continuum (p or t partly in the wall)
          if (r.next() >= h.wall_fraction.v) return h.Q_keV.v
          return r.next() < 0.5
            ? h.E_t_keV.v + r.next() * h.E_p_keV.v
            : h.E_p_keV.v + r.next() * h.E_t_keV.v
        }
      }
      out.push({ e: new FissionEmitter(A * c.sf_branch.v, L, resp, d, nHit, nLight), beam: false })
    }
    this.emitters = out
  }

  // ── run control ────────────────────────────────────────────────────

  clear(): void {
    for (const s of this.spectra) s.fill(0)
    for (const p of this.psds) p?.fill(0)
    for (const p of this.probe) p?.fill(0)
    this.chans = Array.from({ length: this.nCh }, newChan)
    this.blocksFrac = 0
  }

  detectedRate(): number {
    let r = 0
    for (const s of this.emitters) r += s.e.detectedRate()
    return r
  }

  // ── the tick ───────────────────────────────────────────────────────

  tick(env: TickEnv): TickResult {
    this.lastTickWork = 0
    // a long gap simulates 0.5 s and scales it (O(bins), not O(events)): bounded work
    if (env.dt_s > 10) return this.catchUp(env)
    return this.step(env.t_s, env.dt_s, env.beamCurrent_uA)
  }

  private step(t0: number, dt: number, beam: number): TickResult {
    const board = this.board
    const n = this.nCh
    const res: ChannelCounters[] = Array.from({ length: n }, () => ({ offered: 0, events: 0, pileup: 0, lost: 0, saturated: 0, dead_s: 0 }))
    if (!board || !this.L) return { channels: res, bytes: 0, blocksDropped: 0 }
    for (const c of this.chans) c.n = 0
    const en = (c: number) => c < n && board.channelEnabled(c)
    const push = (c: number, t: number, d: Deposit) => {
      const s = this.chans[c]
      if (s.n === s.ts.length) {
        const grow = (a: Float64Array) => { const b = new Float64Array(a.length * 2); b.set(a); return b }
        s.ts = grow(s.ts); s.es = grow(s.es); s.hs = grow(s.hs)
      }
      s.ts[s.n] = t; s.es[s.n] = d.E; s.hs[s.n] = d.heavy; s.n++
    }
    const on0 = en(0), on1 = en(1)
    const sink = (t: number, d0: Deposit | null, d1: Deposit | null) => {
      if (d0 && on0) push(0, t, d0)
      if (d1 && on1) push(1, t, d1)
    }
    for (const s of this.emitters) s.e.emit(t0, dt, s.beam ? beam : 1, this.rSrc, sink)
    const isPha = this.dpp === 'DPP-PHA'
    // noise triggers (Rice)
    const noiseCounted = new Float64Array(n)    // crossings counted, not simulated (offered)
    const noiseAccepted = new Float64Array(n)   // of those, accepted by the trigger (dead time, readout)
    for (let c = 0; c < n; c++) {
      if (!en(c)) { this.chans[c].pending = null; continue }
      const P = isPha ? this.pha[c] : this.psdp[c]
      const f = P.fNoise, r = this.rCh[c]
      const lam = f * dt
      if (lam <= NOISE_DIRECT) {
        const k = r.poisson(lam)
        for (let i = 0; i < k; i++) push(c, t0 + r.next() * dt, { E: -1, heavy: 0 })
        continue
      }
      const tho = P.tho_ns * 1e-9
      const end = t0 + dt
      let t = Math.max(t0, this.chans[c].lastAcc + tho) + r.exp() / f, k = 0
      while (t < end && k < NOISE_SIMULATED) {
        push(c, t, { E: -1, heavy: 0 })
        k++
        t += tho + r.exp() / f
      }
      if (t < end) noiseAccepted[c] = r.poisson((end - t) / (tho + 1 / f))
      noiseCounted[c] = Math.max(0, r.poisson(lam) - k)
    }
    // per-channel DPP
    const commits: Pending[][] = []
    let bytes = 0
    const wave = board.waveformsEnabled
    for (let c = 0; c < n; c++) {
      const list: Pending[] = []
      commits.push(list)
      if (!en(c)) continue
      const s = this.chans[c], r = this.rCh[c]
      const P = isPha ? this.pha[c] : this.psdp[c]
      const m = s.n
      this.lastTickWork += m
      const ts = s.ts
      // time order: sort packed keys (time quantised to dt/2^30 ≈ 0.05 ns, index in the low 20 bits)
      const keys = new Float64Array(m)
      for (let i = 0; i < m; i++) keys[i] = Math.floor(((ts[i] - t0) / dt) * 1073741824) * 1048576 + i
      keys.sort()
      const tho = P.tho_ns * 1e-9, pu = P.pu_ns * 1e-9
      let dead = 0, offered = 0, sumE = 0, sumE2 = 0, nE = 0
      for (let ii = 0; ii < m; ii++) {
        const i = keys[ii] % 1048576
        const t = ts[i], E = s.es[i], heavy = s.hs[i]
        const noise = E < 0
        let tc = 0
        if (!noise) {
          if (!P.polarityOk) continue
          const A = E * P.adcPerKeV
          let h: number
          if (isPha) {
            const pp = P as PhaParams
            tc = this.hk!.tc[0] + r.next() * (this.hk!.tc[1] - this.hk!.tc[0])
            h = phaTriggerHeight(A, pp.tin_ns, tc * 1000)
          } else h = A
          const dh = h - P.threshold
          if (dh <= -6 * P.sigmaTr) continue
          if (dh < 6 * P.sigmaTr && dh + P.sigmaTr * r.normal() <= 0) continue
          sumE += E; sumE2 += E * E; nE++
        }
        offered++
        const dtAcc = t - s.lastAcc
        if (dtAcc < tho) {
          // inside the trigger hold-off: no trigger, but the pulse is in the signal
          const pend = s.pending
          if (pend && !noise) {
            if (isPha) {
              const pp = P as PhaParams
              const w = Math.max(0, Math.min(1, (pp.tr_us + pp.tf_us / 2 - dtAcc * 1e6) / pp.tr_us))
              pend.extra += E * w
            } else {
              const pp = P as PsdParams
              const win = (pp.L_ns - pp.off_ns) * 1e-9
              if (dtAcc < win) {
                const w = 1 - dtAcc / win
                pend.extra += E * w; pend.extraHeavy += heavy * w
                pend.pu = true
              }
            }
          }
          continue
        }
        const satu = !noise && E * P.adcPerKeV > P.headroom
        const cur: Pending = { t, E: noise ? 0 : E, heavy, extra: 0, extraHeavy: 0, tc, pu: false, satu, noise }
        if (s.pending && t - s.pending.t < pu) { s.pending.pu = true; cur.pu = true }
        if (s.pending) list.push(s.pending)
        s.pending = cur
        dead += Math.min(tho, dtAcc)
        s.lastAcc = t
        if (!noise) { s.lastE = E; s.lastHeavy = heavy }
      }
      res[c].offered = offered + noiseCounted[c]
      res[c].dead_s = Math.min(dt, dead + noiseAccepted[c] * tho)
      // running estimates for the rate-dependent resolution term
      const a = Math.min(1, dt / 0.5)
      s.rate += a * (nE / dt - s.rate)
      if (nE > 0) s.e2 += a * (sumE2 / nE - s.e2)
      bytes += (list.length + noiseAccepted[c]) * (8 + (wave ? 2 * P.recordSamples : 0))
    }
    // readout budget: the surplus is lost
    const budget = LINK_BYTES_PER_S * dt
    const lostFrac = bytes > budget ? 1 - budget / bytes : 0
    let lostTotal = 0, written = 0
    for (let c = 0; c < n; c++) {
      const r = this.rCh[c]
      const perEv = 8 + (wave ? 2 * (isPha ? this.pha[c] : this.psdp[c]).recordSamples : 0)
      const noiseFills: number[] = []
      for (const ev of commits[c]) {
        if (lostFrac > 0 && r.next() < lostFrac) { res[c].lost++; lostTotal++; continue }
        res[c].events++
        written += perEv
        if (ev.pu) res[c].pileup++
        if (ev.satu) { res[c].saturated++; this.eventSink?.(c, ev.t, 0, 0, ev.pu, true); continue }
        let a: number, b = 0
        if (isPha) { a = this.fillPha(c, ev); this.eventSink?.(c, ev.t, a, 0, ev.pu, false) }
        else { [a, b] = this.fillPsd(c, ev); this.eventSink?.(c, ev.t, a, b, ev.pu, false) }
        if (ev.noise && !ev.pu && noiseAccepted[c] > 0) noiseFills.push(a, b)
      }
      // Accepted noise triggers that were counted, not simulated: the readout keeps its
      // share, and those fill the spectra like the simulated noise events of this tick.
      const extra = noiseAccepted[c]
      if (extra > 0) {
        const lost = Math.min(extra, lostFrac > 0 ? r.poisson(extra * lostFrac) : 0)
        const kept = extra - lost
        res[c].lost += lost; lostTotal += lost
        res[c].events += kept
        written += kept * perEv
        // In bulk: each simulated noise event stands for kept/m more (Poisson), so the
        // cost is per simulated event, not per counted one.
        const m = noiseFills.length / 2
        if (m > 0) {
          const per = kept / m
          for (let q = 0; q < 2 * m; q += 2) {
            const k = r.poisson(per)
            if (k > 0) this.fillAgain(c, noiseFills[q], noiseFills[q + 1], k)
          }
          // a replay's data file gets a bounded sample of them
          if (this.eventSink) {
            for (let j = 0; j < Math.min(kept, NOISE_SIMULATED); j++) {
              const q = 2 * Math.floor(r.next() * m)
              this.eventSink(c, t0 + r.next() * dt, noiseFills[q], noiseFills[q + 1], false, false)
            }
          }
        }
      }
    }
    const perAgg = Math.max(1, board.chReg(0x1034, 0) || 1)
    this.blocksFrac += lostTotal / perAgg
    const blocks = Math.floor(this.blocksFrac)
    this.blocksFrac -= blocks
    return { channels: res, bytes: written, blocksDropped: blocks }
  }

  /** Fill the histograms k more times as an event with these words did (fillPha/fillPsd's results). */
  private fillAgain(c: number, a: number, b: number, k: number): void {
    if (this.dpp === 'DPP-PHA') {
      if (a > 0 && a < ENERGY_BINS) { this.spectra[c][a] += k; const pr = this.probe[c]; if (pr) pr[a] += k }
      return
    }
    const qL = Math.min(QLONG_BINS - 1, Math.floor(b))
    this.spectra[c][qL] += k
    const pr = this.probe[c]
    if (pr) pr[qL] += k
    const psd = this.psds[c]
    if (psd && qL > 0) {
      const xb = Math.min(PSD_XBINS - 1, Math.floor((qL * PSD_XBINS) / QLONG_MAX))
      let ratio = 1 - a / qL
      ratio = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio
      const yb = Math.min(PSD_YBINS - 1, Math.floor(ratio * PSD_YBINS))
      psd[yb * PSD_XBINS + xb] += k
    }
  }

  private fillPha(c: number, ev: Pending): number {
    if (ev.pu) return 0 // pile-up energies are not histogrammed (design §3.4, to confirm)
    const p = this.pha[c], r = this.rCh[c], s = this.chans[c]
    let Em: number
    if (ev.noise) {
      Em = Math.abs(r.normal()) * Math.sqrt(this.hk!.A / p.tr_us + this.hk!.C) / 2.355 * 3
    } else {
      const E = ev.E + ev.extra
      const delta = ballisticDeficit(ev.tc, p.tr_us, p.tf_us)
      const f2 = hpgeFwhm2(E, p, this.hk!, s.rate * 1e-6, s.e2)
      Em = E * (1 - delta) + (Math.sqrt(f2) / 2.355) * r.normal()
      // Peaking time (the energy-sampling delay) past the flat top: the energy is read on
      // the falling edge, lower, and the trigger jitter now moves it along the slope.
      const edge = p.tpk_us > p.tf_us ? Math.min(1, (p.tpk_us - p.tf_us) / p.tr_us) : 0
      if (edge > 0) Em = Em * (1 - edge) + E * (p.sigmaT_us / p.tr_us) * r.normal()
    }
    const ch = Math.floor(Em * p.gain)
    if (ch > 0 && ch < ENERGY_BINS) { this.spectra[c][ch]++; const pr = this.probe[c]; if (pr) pr[ch]++; return ch }
    return 0
  }

  private fillPsd(c: number, ev: Pending): [number, number] {
    const p = this.psdp[c], r = this.rCh[c]
    const E = ev.noise ? 0 : ev.E + ev.extra
    let qs: number, ql: number
    if (ev.noise) {
      const m = this.scint!
      ql = Math.abs(m.noiseKeV * Math.sqrt(Math.max(1, p.L_ns - p.off_ns)) * r.normal()) * p.qPerKeV
      qs = ql * r.next()
    } else {
      [qs, ql] = sampleCharges(E, ev.heavy + ev.extraHeavy, this.scint!, p, r, this.gf[c])
    }
    const qL = Math.min(QLONG_BINS - 1, Math.floor(ql))
    const qS = Math.floor(qs)
    this.spectra[c][qL]++
    const pr = this.probe[c]
    if (pr) pr[qL]++
    const psd = this.psds[c]
    if (psd && qL > 0) {
      // caendaq HistogramStore::fill, but stored x fastest (api.ts convention)
      const xb = Math.min(PSD_XBINS - 1, Math.floor((qL * PSD_XBINS) / QLONG_MAX))
      let ratio = 1 - qS / qL
      ratio = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio
      const yb = Math.min(PSD_YBINS - 1, Math.floor(ratio * PSD_YBINS))
      psd[yb * PSD_XBINS + xb]++
    }
    return [Math.max(0, Math.min(0x7fff, qS)), Math.max(0, qL)]
  }

  /** Long gaps (hidden tab): simulate 0.5 s, then scale the increments as Poisson draws (O(bins)). */
  private catchUp(env: TickEnv): TickResult {
    const tv = 0.5
    const before = this.spectra.map((s) => s.slice())
    const beforeP = this.psds.map((p) => (p ? p.slice() : null))
    const res = this.step(env.t_s, tv, env.beamCurrent_uA)
    const k = env.dt_s / tv - 1
    const r = this.rSrc
    const scale = (arr: Uint32Array, old: Uint32Array) => {
      for (let i = 0; i < arr.length; i++) {
        const d = arr[i] - old[i]
        if (d > 0) arr[i] += r.poisson(d * k)
      }
    }
    this.spectra.forEach((s, i) => scale(s, before[i]))
    this.psds.forEach((p, i) => { if (p) scale(p, beforeP[i]!) })
    const f = env.dt_s / tv
    for (const ch of res.channels) {
      ch.offered = Math.round(ch.offered * f); ch.events = Math.round(ch.events * f)
      ch.pileup = Math.round(ch.pileup * f); ch.lost = Math.round(ch.lost * f)
      ch.saturated = Math.round(ch.saturated * f); ch.dead_s *= f
    }
    res.bytes = Math.round(res.bytes * f)
    res.blocksDropped = Math.round(res.blocksDropped * f)
    for (const c of this.chans) c.lastAcc = -1e9
    return res
  }

  // ── accessors ──────────────────────────────────────────────────────

  spectrum(ch: number): Uint32Array {
    return this.spectra[ch] ?? new Uint32Array(this.dpp === 'DPP-PSD' ? QLONG_BINS : ENERGY_BINS)
  }

  psd(ch: number): Uint32Array | null {
    return this.psds[ch] ?? null
  }

  gain(ch: number): number {
    if (this.dpp === 'DPP-PHA') return this.pha[ch]?.gain ?? 1
    const p = this.psdp[ch]
    if (!p || !this.scint) return 1
    return p.qPerKeV * gateFractions(this.scint, p, 0)[1]
  }

  /** energy = offset + slope·bin, where bin b holds energies [b/gain, (b+1)/gain). */
  calibration(ch: number): [number, number] {
    return [0, 1 / this.gain(ch)]
  }

  expectedFwhm(ch: number, E: number): number {
    if (this.dpp === 'DPP-PHA') {
      const s = this.chans[ch]
      return Math.sqrt(hpgeFwhm2(E, this.pha[ch], this.hk!, s.rate * 1e-6, s.e2))
    }
    const m = this.scint!, p = this.psdp[ch]
    const fL = gateFractions(m, p, 0)[1]
    const N = E * m.pePerKeV * fL
    const noise = m.noiseKeV * Math.sqrt(Math.max(p.L_ns - p.off_ns, 1)) / Math.max(fL, 1e-9)
    const rel2 = 1 / N + m.rInt * m.rInt + (noise / E) ** 2
    return 2.355 * E * Math.sqrt(rel2)
  }

  /**
   * What the trace synthesis (traces.ts, a lazy chunk) needs about a channel: its
   * parameters and the last pulse it accepted. Null when the channel shows nothing.
   */
  traceContext(ch: number): TraceContext | null {
    const b = this.board
    if (!b || !this.kind || ch >= this.nCh || !b.channelEnabled(ch)) return null
    const isPha = this.dpp === 'DPP-PHA'
    const s = this.chans[ch]
    return {
      dpp: this.dpp, kind: this.kind, ch, board: b, P: isPha ? this.pha[ch] : this.psdp[ch],
      E: ch < 2 ? s.lastE : 0, heavy: ch < 2 ? s.lastHeavy : 0,
      tauP_us: this.hk?.tauP_us ?? 50, tc_us: this.hk ? [this.hk.tc[0], this.hk.tc[1]] : [0.2, 0.2],
      scint: this.scint, rng: this.rWave,
    }
  }

  /** Trace 1 of a fresh capture (null until traces.ts is loaded, or when the channel shows nothing). */
  waveform(ch: number): Int16Array | null {
    const ctx = this.traceContext(ch)
    return ctx && traceSynth ? traceSynth(ctx).wave1 : null
  }

  beamSample(t_s: number): [number, number, number, number] {
    const s = this.scenario
    const I0 = s && s.source === 'n14pg' ? s.beam_I0_uA : 0
    return beamSample(t_s, I0, this.seed)
  }

  fwhmProbe(ch: number, energy_keV: number): FwhmProbe | null {
    const spec = this.probe[ch]
    if (!spec || !this.board) return null
    const g = this.gain(ch)
    const exp = this.expectedFwhm(ch, energy_keV)
    const fb = Math.max(1, exp * g)
    const half = Math.max(4 * fb, 12 * g, 20)
    const fit = fitPeak(spec, energy_keV * g, half, Math.max(1, fb / 8))
    // Too few counts for a width that means anything: say nothing yet.
    if (!fit || fit.net < 400) return null
    return {
      energy_keV,
      centroid_keV: (fit.centroid + 0.5) / g,
      fwhm_keV: fit.fwhm / g,
      counts: Math.round(fit.net),
    }
  }

  // ── persistence ────────────────────────────────────────────────────

  snapshot(): unknown {
    return {
      v: 1,
      key: this.key,
      src: this.rSrc.state(),
      wave: this.rWave.state(),
      ch: this.rCh.map((r) => r.state()),
      spectra: this.spectra.map(encodeSparse),
      psds: this.psds.map((p) => (p ? encodeSparse(p) : null)),
      chans: this.chans.map((c) => ({ rate: c.rate, e2: c.e2, lastE: c.lastE, lastHeavy: c.lastHeavy, lastAcc: c.lastAcc, pending: c.pending })),
      blocksFrac: this.blocksFrac,
    }
  }

  restore(snap: unknown): void {
    const s = snap as any
    if (!s || s.v !== 1) return
    this.rSrc.setState(s.src)
    this.rWave.setState(s.wave)
    s.ch.forEach((st: (number | null)[], i: number) => this.rCh[i]?.setState(st))
    s.spectra.forEach((e: string, i: number) => { if (this.spectra[i]) decodeSparse(e, this.spectra[i]) })
    s.psds.forEach((e: string | null, i: number) => { if (e && this.psds[i]) decodeSparse(e, this.psds[i]!) })
    s.chans.forEach((c: any, i: number) => { if (this.chans[i]) Object.assign(this.chans[i], c, { pending: c.pending ? { ...c.pending } : null }) })
    this.blocksFrac = s.blocksFrac ?? 0
  }
}

// ───────────────────────────────────────────── sparse spectra encoding

/** Non-zero bins as varint (gap, value) pairs, base64: a few kB per live spectrum. */
export function encodeSparse(a: Uint32Array): string {
  const bytes: number[] = []
  const put = (x: number) => {
    while (x >= 0x80) { bytes.push((x & 0x7f) | 0x80); x = Math.floor(x / 128) }
    bytes.push(x)
  }
  let last = -1
  for (let i = 0; i < a.length; i++) {
    if (a[i]) { put(i - last - 1); put(a[i]); last = i }
  }
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return typeof btoa === 'function' ? btoa(bin) : (globalThis as any).Buffer.from(bin, 'binary').toString('base64')
}

export function decodeSparse(s: string, into: Uint32Array): void {
  const bin = typeof atob === 'function' ? atob(s) : (globalThis as any).Buffer.from(s, 'base64').toString('binary')
  into.fill(0)
  let p = 0
  const get = () => {
    let x = 0, m = 1, b: number
    do { b = bin.charCodeAt(p++); x += (b & 0x7f) * m; m *= 128 } while (b & 0x80)
    return x
  }
  let i = -1
  while (p < bin.length) {
    i += get() + 1
    const v = get()
    if (i < into.length) into[i] = v
  }
}
