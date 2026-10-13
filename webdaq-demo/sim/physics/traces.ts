/**
 * The traces of one simulated event, as the x730 firmware would record them with
 * waveforms on (design §3.4 "Waveforms"; the Tuner redesign's P4): analogue trace 1,
 * trace 2 when Dual Trace is on, and the two digital probes, all from the same event so
 * that they line up when drawn together.
 *
 * Probe selection follows Board Configuration (0x8000), as LUNADAQ's register
 * descriptions give it (caen-registers.ts, UM5678 rev.3 / UM4380 rev.6):
 *   DPP-PHA  Dual Trace [11], Analog Probe 1 [13:12] (Input, RC-CR, RC-CR², Trapezoid),
 *            Analog Probe 2 [15:14] (Input, Threshold, Trapezoid − Baseline, Baseline),
 *            Digital Virtual Probe 1 [23:20], Digital Virtual Probe 2 [28:26] (Trigger).
 *   DPP-PSD  Dual Trace [11], Analog Probe [13:12] (Input / CFD / Input + CFD, trace 2 the
 *            baseline or the CFD), Digital Virtual Probe 1 [25:23], 2 [28:26], Enable
 *            Digital Probe [31].
 * Digital probes are 0/1 signals; they are returned on the scale of trace 1 (low at its
 * baseline, high a quarter of its span above, probe 2 a little lower), so that they
 * overlay it the way the Tuner draws them. What a probe needs that the simulation does
 * not have (coincidences, validation, a full memory) stays low.
 *
 * WebDAQ's server at the pin answers trace 2 and the digital probes with an empty
 * histogram; the demo is ahead of it here, for the Tuner's design work.
 *
 * Loaded lazily (with the trace routes): it registers itself with the engine.
 */
import type { BoardView, DetectorKind } from './api'
import { ADC_MAX, POSITIVE, R, type PhaParams, type PsdParams, type ScintModel } from './detectors'
import { hpgePulse, lightShape, movingAverage, rcCr2, toInt16, trapezoid } from './filters'
import type { Rng } from './rng'
import { setTraceSynth } from './engine'

export interface TraceContext {
  dpp: 'DPP-PHA' | 'DPP-PSD'
  kind: DetectorKind
  ch: number
  board: BoardView
  P: PhaParams | PsdParams
  /** energy (keV) and heavy-particle part of the channel's last accepted pulse; 0 = none yet */
  E: number
  heavy: number
  tauP_us: number
  tc_us: [number, number]
  scint: ScintModel | null
  rng: Rng
}

export interface TraceCapture {
  wave1: Int16Array
  /** null without Dual Trace (or when trace 2 is "Reserved") */
  wave2: Int16Array | null
  /** null when the digital probes are off (DPP-PSD: Enable Digital Probe, bit 31) */
  probe1: Int16Array | null
  probe2: Int16Array | null
  labels: { wave1: string; wave2: string | null; probe1: string | null; probe2: string | null }
  /** sample of the trigger, −1 when the pulse did not trigger */
  trigger: number
}

const PHA_AP1 = ['Input', 'RC-CR', 'RC-CR2', 'Trapezoid']
const PHA_AP2 = ['Input', 'Threshold', 'Trapezoid - Baseline', 'Baseline']
const PHA_DP1 = ['Peaking', 'Armed', 'Peak Run', 'Pile-up', 'Peaking', 'TRG Validation Window', 'Baseline Freeze',
  'TRG Hold-off', 'TRG Validation', 'Acq Busy', 'Zero Crossing Window', 'Ext TRG', 'Busy']
const PSD_DP1 = ['Long Gate', 'Over Threshold', 'Shaped TRG', 'TRG Validation Acceptance Window', 'Pile Up', 'Coincidence', 'Reserved', 'Trigger']
const PSD_DP2 = ['Short Gate', 'Over Threshold', 'TRG Validation', 'TRG Hold-off', 'Pile Up Trigger', 'PSD Cut High', 'Baseline Freeze', 'Trigger']
const CFD_FRACTION = [0.25, 0.5, 0.75, 1]

/** A 0/1 signal high on [a, b). */
function window(N: number, a: number, b: number): Uint8Array {
  const out = new Uint8Array(N)
  for (let i = Math.max(0, Math.floor(a)); i < Math.min(N, Math.ceil(b)); i++) out[i] = 1
  return out
}

/** 0/1 on the scale of trace 1, so the probe overlays it. */
function onScale(bits: Uint8Array, ref: Int16Array, pre: number, frac: number): Int16Array {
  const n = Math.max(1, Math.min(16, pre, ref.length))
  let lo = 0, min = Infinity, max = -Infinity
  for (let i = 0; i < n; i++) lo += ref[i]
  lo /= n
  for (let i = 0; i < ref.length; i++) { if (ref[i] < min) min = ref[i]; if (ref[i] > max) max = ref[i] }
  const hi = lo + Math.max(100, frac * (max - min))
  const out = new Int16Array(bits.length)
  for (let i = 0; i < bits.length; i++) out[i] = Math.round(bits[i] ? hi : lo)
  return out
}

export function captureTraces(x: TraceContext): TraceCapture {
  const { board: b, P, rng: r } = x
  const isPha = x.dpp === 'DPP-PHA'
  const N = Math.min(P.recordSamples, 65536)
  const Ts = b.nsPerSample
  const pre = P.preSamples
  const t0 = pre * Ts
  const A = x.E * P.adcPerKeV
  const cfg = b.reg(R.boardConfig)
  const dual = ((cfg >>> 11) & 1) === 1

  // the analogue pulse at the ADC, raw polarity
  let pulse: Float64Array
  if (isPha) {
    const tc = (x.tc_us[0] + r.next() * (x.tc_us[1] - x.tc_us[0])) * 1000
    pulse = hpgePulse(N, Ts, t0, A, x.tauP_us * 1000, tc)
  } else {
    const m = x.scint!
    const hf = x.E > 0 ? Math.min(1, x.heavy / x.E) : 0
    const w = m.wE.map((v, i) => v * (1 - hf) + m.wH[i] * hf)
    let peak = 0
    for (let t = 0; t < 5 * m.rise + 50; t += 0.5) peak = Math.max(peak, lightShape(t, m.taus, w, m.rise))
    pulse = new Float64Array(N)
    for (let i = 0; i < N; i++) pulse[i] = (A / peak) * lightShape(i * Ts - t0, m.taus, w, m.rise)
  }
  const pos = POSITIVE[x.kind]
  const raw = new Float64Array(N)
  let slow = 0
  for (let i = 0; i < N; i++) {
    slow = 0.995 * slow + 0.1 * r.normal()
    const v = P.baseline + (pos ? 1 : -1) * pulse[i] + 2.5 * r.normal() + slow
    raw[i] = Math.max(0, Math.min(ADC_MAX, Math.round(v)))
  }
  // firmware view: baseline removed, inverted if asked
  const sign = P.invert ? -1 : 1
  const v = new Float64Array(N)
  for (let i = 0; i < N; i++) v[i] = sign * (raw[i] - P.baseline)
  const input = toInt16(raw)
  const algo = b.chReg(R.algo, x.ch)
  return isPha ? pha(x, N, Ts, pre, v, input, cfg, dual, algo) : psd(x, N, Ts, pre, v, raw, input, cfg, dual)
}

function pha(x: TraceContext, N: number, Ts: number, pre: number, v: Float64Array, input: Int16Array, cfg: number, dual: boolean, algo: number): TraceCapture {
  const p = x.P as PhaParams
  const k = Math.max(1, Math.round(p.tin_ns / Ts))
  const [d1, d2r] = rcCr2(v, k, p.nSmooth, 1)
  const d2 = d2r.map((y) => 4 * y)
  const g = (p.fineGain / 0x1000) * Math.pow(2, 4 - p.rescale)
  const trap = trapezoid(v, (p.tr_us * 1000) / Ts, (p.tf_us * 1000) / Ts, (p.M_us * 1000) / Ts).map((y) => y * g)
  // trigger: RC-CR² armed above the threshold, fires at its zero crossing
  let armed = -1, trig = -1
  if (x.E > 0 && p.polarityOk) {
    for (let i = pre; i < N; i++) if (d2[i] > p.threshold) { armed = i; break }
    if (armed >= 0) {
      for (let i = armed + 1; i < N; i++) if (d2[i] <= 0) { trig = i; break }
      if (trig < 0) trig = Math.min(N - 1, armed + k)
    }
  }
  const start = trig >= 0 ? trig - k : pre
  const trS = (p.tr_us * 1000) / Ts, tfS = (p.tf_us * 1000) / Ts, tpkS = (p.tpk_us * 1000) / Ts
  const freezeEnd = start + Math.max(trS + tfS, (p.pu_ns / Ts))
  // baseline of the trapezoid: mean over the baseline window, frozen during the pulse
  const blW = Math.max(1, Math.round((p.blr_us * 1000) / Ts))
  const avg = p.blr_us > 0 ? movingAverage(trap, blW) : new Float64Array(N)
  const bl = new Float64Array(N)
  let held = 0
  for (let i = 0; i < N; i++) {
    // frozen from the pulse until its window has left the average again
    const frozen = trig >= 0 && i >= start - k && i < freezeEnd + (p.blr_us > 0 ? blW : 0)
    if (!frozen) held = avg[i]
    bl[i] = held
  }
  const ap1 = (cfg >>> 12) & 3, ap2 = (cfg >>> 14) & 3
  const a1 = [input, toInt16(d1), toInt16(d2), toInt16(trap)][ap1]
  let a2: Int16Array | null = null
  if (dual) {
    a2 = ap2 === 0 ? input
      : ap2 === 1 ? toInt16(new Float64Array(N).fill(p.threshold))
      : ap2 === 2 ? toInt16(trap.map((y, i) => y - bl[i]))
      : toInt16(bl)
  }
  const peakMean = [1, 4, 16, 64][(algo >>> 12) & 3]
  const tho = p.tho_ns / Ts
  const none = new Uint8Array(N)
  const dp1 = (cfg >>> 20) & 0xf
  const peaking = window(N, start + trS + tpkS, start + trS + tpkS + peakMean)
  const d1bits = trig < 0 ? none
    : dp1 === 0 || dp1 === 4 ? peaking
    : dp1 === 1 ? window(N, armed, trig)
    : dp1 === 2 ? window(N, trig, start + trS + tfS)
    : dp1 === 6 ? window(N, start - k, freezeEnd)
    : dp1 === 7 ? window(N, trig, trig + tho)
    : dp1 === 10 ? window(N, armed, trig + 1)
    : none
  const d2bits = trig < 0 ? none : window(N, trig, trig + 4)   // Digital Virtual Probe 2: Trigger
  return {
    wave1: a1, wave2: a2,
    probe1: onScale(d1bits, a1, pre, 0.25), probe2: onScale(d2bits, a1, pre, 0.2),
    labels: { wave1: PHA_AP1[ap1], wave2: dual ? PHA_AP2[ap2] : null, probe1: PHA_DP1[dp1] ?? 'Reserved', probe2: 'Trigger' },
    trigger: trig,
  }
}

function psd(x: TraceContext, N: number, Ts: number, pre: number, v: Float64Array, raw: Float64Array, input: Int16Array, cfg: number, dual: boolean): TraceCapture {
  const p = x.P as PsdParams
  const b = x.board
  const cfdReg = b.chReg(0x103c, x.ch)
  const delay = Math.max(1, cfdReg & 0xff)
  const frac = CFD_FRACTION[(cfdReg >>> 8) & 3]
  const cfd = new Float64Array(N)
  for (let i = 0; i < N; i++) cfd[i] = frac * v[i] - (i >= delay ? v[i - delay] : 0)
  const cfdMode = ((b.chReg(R.algo, x.ch) >>> 6) & 1) === 1
  // trigger: leading edge at the threshold, or the CFD zero crossing after arming
  let armed = -1, trig = -1
  if (x.E > 0 && p.polarityOk) {
    for (let i = pre; i < N; i++) if (v[i] > p.threshold) { armed = i; break }
    if (armed >= 0) {
      trig = armed
      if (cfdMode) {
        for (let i = Math.max(1, armed - delay); i < N; i++) if (cfd[i - 1] > 0 && cfd[i] <= 0) { trig = i; break }
      }
    }
  }
  // baseline: the mean before the pulse, held through the gate
  const nb = Math.max(4, Math.min(64, pre - 4))
  let base = 0
  for (let i = 0; i < nb; i++) base += raw[i]
  base /= nb
  const baseline = toInt16(new Float64Array(N).fill(base))
  const ap = (cfg >>> 12) & 3
  const cfdT = toInt16(cfd)
  let a1: Int16Array, a2: Int16Array | null = null, l1: string, l2: string | null = null
  if (!dual) { a1 = ap === 1 ? cfdT : input; l1 = ap === 1 ? 'CFD' : 'Input' }
  else if (ap === 0) { a1 = input; a2 = baseline; l1 = 'Input'; l2 = 'Baseline' }
  else if (ap === 1) { a1 = cfdT; a2 = baseline; l1 = 'CFD'; l2 = 'Baseline' }
  else if (ap === 2) { a1 = input; a2 = cfdT; l1 = 'Input'; l2 = 'CFD' }
  else { a1 = input; l1 = 'Input' }
  const digital = ((cfg >>> 31) & 1) === 1
  const gs = trig - p.off_ns / Ts, S = p.S_ns / Ts, L = p.L_ns / Ts
  const none = new Uint8Array(N)
  const over = new Uint8Array(N)
  for (let i = 0; i < N; i++) over[i] = v[i] > p.threshold ? 1 : 0
  // the event's PSD, for "PSD Cut High"
  let qS = 0, qL = 0
  for (let i = Math.max(0, Math.floor(gs)); i < Math.min(N, Math.ceil(gs + L)); i++) { qL += v[i]; if (i < gs + S) qS += v[i] }
  const psdCut = b.chReg(0x1078, x.ch) / 1024
  const dp1 = (cfg >>> 23) & 7, dp2 = (cfg >>> 26) & 7
  const shaped = Math.max(1, b.chReg(0x1070, x.ch))
  const sel = (code: number, which: 1 | 2): Uint8Array => {
    if (code === 1) return over
    if (trig < 0) return none
    if (which === 1) {
      if (code === 0) return window(N, gs, gs + L)
      if (code === 2) return window(N, trig, trig + shaped)
      if (code === 7) return window(N, trig, trig + 4)
      return none
    }
    if (code === 0) return window(N, gs, gs + S)
    if (code === 3) return window(N, trig, trig + p.tho_ns / Ts)
    if (code === 5) return qL > 0 && 1 - qS / qL > psdCut ? window(N, gs, gs + L) : none
    if (code === 6) return window(N, gs, gs + L)
    if (code === 7) return window(N, trig, trig + 4)
    return none
  }
  return {
    wave1: a1, wave2: a2,
    probe1: digital ? onScale(sel(dp1, 1), a1, pre, 0.25) : null,
    probe2: digital ? onScale(sel(dp2, 2), a1, pre, 0.2) : null,
    labels: { wave1: l1, wave2: l2, probe1: digital ? PSD_DP1[dp1] : null, probe2: digital ? PSD_DP2[dp2] : null },
    trigger: trig,
  }
}

setTraceSynth(captureTraces)
