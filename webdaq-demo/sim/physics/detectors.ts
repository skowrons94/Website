/**
 * Detector and DPP models (design §3.4): what the registers the tuner writes do to
 * resolution, trigger, pile-up windows, dead time and saturation.
 *
 * Units: the tuner shows time registers in steps of 8 ns on the x730
 * (param-tuner.tsx:127-132, caen-settings.md §2.5), i.e. 4 ADC samples of 2 ns.
 * DPP-PSD gates are in samples of 2 ns (design §3.2, "units to confirm by Jakub").
 * Record Length is in units of 8 samples and Pre-Trigger in units of 4 samples
 * (UM5678 / UM4380; to confirm).
 */

import type { BoardView, DetectorKind } from './api'
import type { LinesJson } from './sources'
import { lightFraction } from './filters'
import type { Rng } from './rng'

// Register addresses (channel-0 form), board_defaults.py.
export const R = {
  recordLength: 0x1020, inputRange: 0x1028, preTrigger: 0x1038,
  // PHA
  smoothing: 0x1054, inputRise: 0x1058, trapRise: 0x105c, trapFlat: 0x1060,
  peaking: 0x1064, decay: 0x1068, phaThreshold: 0x106c, triggerHoldOff: 0x1074,
  peakHoldOff: 0x1078, algo: 0x1080, dcOffset: 0x1098, fineGain: 0x10c4,
  // PSD
  shortGate: 0x1054, longGate: 0x1058, gateOffset: 0x105c, psdThreshold: 0x1060,
  purGap: 0x107c, boardConfig: 0x8000,
} as const

export const ADC_MAX = 16383
/** Readout link budget, bytes/s (CONET2-like, design §3.4). */
export const LINK_BYTES_PER_S = 80e6

/** Things every channel model shares. */
export interface ChannelParams {
  /** DPP time step, ns (8 on the x730). */
  step: number
  tho_ns: number
  /** pile-up window, ns */
  pu_ns: number
  threshold: number
  /** trigger-filter noise σ, LSB */
  sigmaTr: number
  /** noise-trigger rate, Hz (Rice) */
  fNoise: number
  /** ADC LSB per keV of pulse height (raw polarity) */
  adcPerKeV: number
  /** headroom in LSB before the ADC saturates, for this detector's raw polarity */
  headroom: number
  baseline: number
  /** false when the firmware polarity does not match the pulses: nothing triggers */
  polarityOk: boolean
  recordSamples: number
  preSamples: number
  invert: boolean
}

export interface PhaParams extends ChannelParams {
  tr_us: number
  tf_us: number
  tpk_us: number
  M_us: number
  tin_ns: number
  nSmooth: number
  rescale: number
  fineGain: number
  /** ADC channels per keV of the energy histogram */
  gain: number
  /** trigger time jitter σ_t, µs */
  sigmaT_us: number
  /** baseline-mean window, µs (0x1080[22:20]); 0 = fixed baseline */
  blr_us: number
}

export interface PsdParams extends ChannelParams {
  S_ns: number
  L_ns: number
  off_ns: number
  chargeSens: number
  /** Q_long channels per keV(ee) for the whole light */
  qPerKeV: number
}

/** HPGe constants (design §3.4), read from lines.json so every number has its source. */
export interface HpgeConst {
  A: number; B: number; C: number; F: number; eps_keV: number; c: number
  tc: [number, number]; tauP_us: number
}

export function hpgeConst(L: LinesJson): HpgeConst {
  const h = L.hpge
  return {
    A: h.A_keV2us.v, B: h.B_keV2perus.v, C: h.C_keV2.v, F: h.fano.v,
    eps_keV: h.eps_eV.v / 1000, c: h.c_cc.v, tc: h.tc_us.v, tauP_us: h.tau_preamp_us.v,
  }
}

/** Raw pulse polarity per detector kind: HPGe preamps give positive pulses, PMTs and
 * the ³He charge preamp negative ones (design §3.2). */
export const POSITIVE: Record<DetectorKind, boolean> = { hpge: true, bgo: false, ej309: false, he3: false }

/** ADC LSB per keV of pulse height at 2 Vpp, from lines.json. */
export function adcPerKeV(kind: DetectorKind, L: LinesJson): number {
  return L[kind].adc_per_keV.v
}

/** RC-CR² noise reference: σ at τ_in = 48 ns and 4-sample smoothing (lines.json). */
const TIN_REF = 48, NS_REF = 4

function common(board: BoardView, ch: number, kind: DetectorKind, thrAddr: number, L: LinesJson): ChannelParams {
  const step = 4 * board.nsPerSample
  const g = (a: number) => board.chReg(a, ch)
  const range = g(R.inputRange) & 1 ? 0.5 : 2
  const scale = adcPerKeV(kind, L) * (2 / range)
  const invert = ((g(R.algo) >>> 16) & 1) === 1
  const baseline = (g(R.dcOffset) / 65535) * ADC_MAX
  const headroom = POSITIVE[kind] ? ADC_MAX - baseline : baseline
  const polarityOk = POSITIVE[kind] !== invert
  const rl = Math.max(1, g(R.recordLength)) * 8
  const pre = Math.min(rl - 1, g(R.preTrigger) * 4)
  return {
    step, tho_ns: g(R.triggerHoldOff) * step, pu_ns: 0, threshold: Math.max(1, g(thrAddr)),
    sigmaTr: 0, fNoise: 0, adcPerKeV: scale, headroom, baseline, polarityOk,
    recordSamples: rl, preSamples: pre, invert,
  }
}

/** Rice's formula: rate of upward crossings of level Th by Gaussian noise. */
export function riceRate(th: number, sigma: number, tauEff_ns: number): number {
  const f0 = 1 / (2 * Math.PI * tauEff_ns * 1e-9)
  return f0 * Math.exp(-(th * th) / (2 * sigma * sigma))
}

export function phaParams(board: BoardView, ch: number, L: LinesJson): PhaParams {
  const c = common(board, ch, 'hpge', R.phaThreshold, L)
  const SIGMA_TR_REF = L.hpge.sigma_tr_ref_lsb.v
  const g = (a: number) => board.chReg(a, ch)
  const step = c.step
  const tr_us = Math.max(1, g(R.trapRise)) * step / 1000
  const tf_us = g(R.trapFlat) * step / 1000
  const tpk_us = g(R.peaking) * step / 1000
  const M_us = Math.max(1, g(R.decay)) * step / 1000
  const tin_ns = Math.max(1, g(R.inputRise)) * step
  const nSmooth = Math.max(1, g(R.smoothing))
  const algo = g(R.algo)
  const rescale = algo & 0x3f
  // Baseline mean (UM5678): 0 fixed, 1..6 → 16, 64, 256, 1024, 4096, 16384 samples
  const blCode = (algo >>> 20) & 7
  const blr_us = blCode === 0 || blCode > 6 ? 0 : (Math.pow(4, blCode + 1) * board.nsPerSample) / 1000
  const fg = g(R.fineGain) || 0x1000
  // ch = E·g0·(FineGain/0x1000)·2^(3 − rescale); g0 puts 2.7 MeV near ch 30 000 at the
  // defaults (FineGain 0x1000, rescale 4). The exact CAEN scaling is approximated (§3.4).
  const gain = L.hpge.gain_g0.v * (fg / 0x1000) * Math.pow(2, 3 - rescale)
  const sigmaTr = SIGMA_TR_REF * Math.sqrt((TIN_REF * NS_REF) / (tin_ns * nSmooth))
  const tauEff = Math.max(tin_ns, nSmooth * board.nsPerSample)
  // Energy-sampling jitter: 20 ns at the reference trigger noise, more with a noisier
  // or slower RC-CR², within the 20–60 ns of design §3.4 (model).
  const sigmaT_us = Math.min(60, Math.max(20, 20 * (sigmaTr / SIGMA_TR_REF) + 0.1 * tin_ns)) / 1000
  return {
    ...c,
    pu_ns: Math.max(g(R.peakHoldOff) * step, (tr_us + tf_us) * 1000),
    sigmaTr, fNoise: c.polarityOk ? riceRate(c.threshold, sigmaTr, tauEff) : 0,
    tr_us, tf_us, tpk_us, M_us, tin_ns, nSmooth, rescale, fineGain: fg, gain, sigmaT_us, blr_us,
  }
}

/** Trigger-filter height of a pulse of amplitude A (LSB) with collection time tc (model). */
export function phaTriggerHeight(A: number, tin_ns: number, tc_ns: number): number {
  return 4 * A * tin_ns / (tin_ns + tc_ns)
}

/**
 * FWHM² (keV²) of the trapezoid for a γ of E keV (design §3.4), without the
 * ballistic deficit (applied per event).
 *   rate_per_us: the channel's trigger rate; e2: ⟨E²⟩ of its pulses, keV².
 */
export function hpgeFwhm2(E: number, p: PhaParams, k: HpgeConst, rate_per_us = 0, e2 = 0): number {
  const wel2 = k.A / p.tr_us + k.B * ((2 * p.tr_us) / 3 + p.tf_us) + k.C
  const wf = 2.355 * Math.sqrt(k.F * k.eps_keV * E)
  const wcc = k.c * E
  const mis = 1 / k.tauP_us - 1 / p.M_us
  const wpz = 2.355 * Math.abs(mis) * p.sigmaT_us * E
  // Campbell's theorem on the pole-zero undershoot (design §3.4), reduced by the
  // baseline restorer: the baseline mean follows the slow undershoot, leaving the part
  // that changes between the baseline window and the energy sample (model addition,
  // f = (T_bl + τ_r + τ_f)/τ_p, to review with the DAQ expert).
  const fBlr = p.blr_us > 0 ? Math.min(1, (p.blr_us + p.tr_us + p.tf_us) / k.tauP_us) : 1
  const srate2 = rate_per_us * e2 * (p.tr_us * mis) ** 2 * k.tauP_us / 2 * fBlr * fBlr
  return wel2 + wf * wf + wcc * wcc + wpz * wpz + 2.355 * 2.355 * srate2
}

/** Relative ballistic deficit of the trapezoid for collection time tc (design §3.4). */
export function ballisticDeficit(tc_us: number, tr_us: number, tf_us: number): number {
  if (tc_us <= tf_us) return 0
  return Math.min(1, ((tc_us - tf_us) ** 2) / (4 * tr_us * tc_us))
}

// ───────────────────────────────────────────────────────────────── PSD

export function psdParams(board: BoardView, ch: number, kind: DetectorKind, qPerKeV0: number, L: LinesJson): PsdParams {
  const c = common(board, ch, kind, R.psdThreshold, L)
  const g = (a: number) => board.chReg(a, ch)
  const ns = board.nsPerSample
  const S_ns = g(R.shortGate) * ns
  const L_ns = Math.max(1, g(R.longGate)) * ns
  const off_ns = g(R.gateOffset) * ns
  // DPP Algorithm Control [2:0], charge sensitivity: each step is ×4 fC/LSB (UM4380).
  const chargeSens = g(R.algo) & 0x7
  const sigmaTr = 8
  return {
    ...c,
    pu_ns: L_ns,
    sigmaTr, fNoise: c.polarityOk ? riceRate(c.threshold, sigmaTr, 16) : 0,
    S_ns, L_ns, off_ns, chargeSens, qPerKeV: qPerKeV0 / Math.pow(4, chargeSens),
  }
}

/** Light-pulse description of a scintillator/counter for charge integration. */
export interface ScintModel {
  kind: DetectorKind
  /** decay constants, ns */
  taus: number[]
  /** component weights for electrons (γ) and for heavy particles */
  wE: number[]
  wH: number[]
  rise: number
  /** photoelectrons per keV(ee), times 1/ENF */
  pePerKeV: number
  /** constant resolution term (σ, relative) */
  rInt: number
  /** electronic noise per √ns of gate, keV */
  noiseKeV: number
  /** Q_long channels per keV(ee) at full integration, charge sensitivity 0 */
  qPerKeV: number
}

export function scintModel(kind: DetectorKind, L: LinesJson): ScintModel {
  if (kind === 'bgo') {
    const b = L.bgo
    return {
      kind, taus: b.tau_ns.v, wE: b.weights.v, wH: b.weights.v, rise: b.rise_ns.v,
      pePerKeV: (b.photons_per_keV.v * b.pe_fraction.v) / b.excess_noise.v,
      rInt: b.r_int.v, noiseKeV: b.noise_keV_per_sqrt_ns.v, qPerKeV: b.q_per_keV.v,
    }
  }
  if (kind === 'ej309') {
    const e = L.ej309
    return {
      kind, taus: e.tau_ns.v, wE: e.weights_electron.v, wH: e.weights_proton.v, rise: e.rise_ns.v,
      pePerKeV: (e.photons_per_MeVee.v / 1000) * e.pe_per_photon.v,
      // the constant (α) term of the Dietze–Klein form, as σ
      rInt: e.resolution.alpha / 2.355, noiseKeV: e.noise_keV_per_sqrt_ns.v, qPerKeV: e.q_per_keV.v,
    }
  }
  const h = L.he3
  return {
    kind, taus: [h.tau_ns.v], wE: [1], wH: [1], rise: h.rise_ns.v,
    pePerKeV: 1e6, rInt: h.r_int.v, noiseKeV: h.noise_keV_per_sqrt_ns.v, qPerKeV: h.q_per_keV.v,
  }
}

/** Expected fractions of light inside the short and long gates. */
export function gateFractions(m: ScintModel, p: PsdParams, heavyFrac: number): [number, number] {
  const w = m.wE.map((x, i) => x * (1 - heavyFrac) + m.wH[i] * heavyFrac)
  // The gates open `off` before the trigger; the leading-edge trigger fires about one
  // rise time after the pulse starts, so the pulse is integrated over [0, gate − off + rise].
  const fS = lightFraction(p.S_ns - p.off_ns + m.rise, m.taus, w, m.rise)
  const fL = lightFraction(p.L_ns - p.off_ns + m.rise, m.taus, w, m.rise)
  return [fS, fL]
}

/**
 * Charges (channels) for E keV(ee) of light, `heavy` of it from heavy particles:
 * photoelectron statistics in each gate (binomial split between short and long),
 * the intrinsic term and electronic noise.
 */
export function sampleCharges(E: number, heavy: number, m: ScintModel, p: PsdParams, r: Rng, gf?: ArrayLike<number>): [number, number] {
  const hf = E > 0 ? Math.min(1, heavy / E) : 0
  // light fractions are linear in the component weights, so mixing the electron and
  // heavy-particle fractions is exact
  let fS: number, fL: number
  if (gf) { fS = gf[0] * (1 - hf) + gf[2] * hf; fL = gf[1] * (1 - hf) + gf[3] * hf }
  else [fS, fL] = gateFractions(m, p, hf)
  const N = E * m.pePerKeV * fL
  if (N <= 0) return [0, 0]
  const NL = N + Math.sqrt(N) * r.normal()
  const ps = fL > 0 ? fS / fL : 0
  const NS = NL * ps + Math.sqrt(Math.max(0, NL * ps * (1 - ps))) * r.normal()
  const keVPerPe = 1 / m.pePerKeV
  // intrinsic term (common to both gates) and electronic noise of each gate
  const g = 1 + m.rInt * r.normal()
  const sL = m.noiseKeV * Math.sqrt(Math.max(p.L_ns - p.off_ns, 1))
  const sS = m.noiseKeV * Math.sqrt(Math.max(p.S_ns - p.off_ns, 1))
  const zL = r.normal()
  const qL = (NL * keVPerPe * g + sL * zL) * p.qPerKeV
  const qS = (NS * keVPerPe * g + sS * zL * Math.sqrt(Math.max(0, p.S_ns - p.off_ns) / Math.max(p.L_ns - p.off_ns, 1))) * p.qPerKeV
  return [Math.max(0, qS), Math.max(0, qL)]
}

// ────────────────────────────────────────────────────── neutron detection

/** n–p elastic cross section, barns, E in MeV (Marion & Young approximation, Knoll ch. 15). */
export function npCrossSection(E: number, L: LinesJson): number {
  const x = L.ej309.np_xs
  return Math.max(0.1, x.a_b / Math.sqrt(Math.max(E, 0.01)) - x.c_b)
}

/** EJ-309 proton light output, MeVee (Enqvist et al. 2013). */
export function protonLight(Ep: number, L: LinesJson): number {
  const { a, b, c } = L.ej309.proton_light
  return Math.max(0, a * Ep - b * (1 - Math.exp(-c * Ep)))
}
