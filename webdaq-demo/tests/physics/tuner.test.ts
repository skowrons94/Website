/**
 * What the Tuner redesign (P1–P8) needs from the simulator: trace 2 and the digital
 * probes, a threshold inside the noise that degrades instead of hanging, the PSD and
 * PHA registers acting on spectra and resolution, and counters that agree with the
 * spectra.
 */
import { describe, expect, it } from 'vitest'
import { captureTraces } from '../../sim/physics/traces'
import { NOISE_SIMULATED } from '../../sim/physics/engine'
import { ENERGY_BINS } from '../../sim/physics/api'
import { engine, makeBoard, run, tuneHpge } from './helpers'

const sum = (a: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s }
/** Samples where a digital probe is high (above its low level). */
const highs = (p: Int16Array) => { const lo = p[0]; const out: number[] = []; p.forEach((v, i) => { if (v > lo) out.push(i) }); return out }

describe('traces: trace 2 and the digital probes (0x8000)', () => {
  it('DPP-PHA: trace 2 only with Dual Trace; Threshold, Baseline; Peaking inside the flat top; Trigger', () => {
    const b = makeBoard('DPP-PHA')
    tuneHpge(b)
    const e: any = engine(31, { detectors: 'hpge', source: 'cs137', activity_Bq: 2e5 }, b)
    run(e, 0.3)
    const cfg0 = b.reg(0x8000)
    expect(captureTraces(e.traceContext(0)).wave2).toBeNull()
    // dual trace, trace 1 = trapezoid, trace 2 = threshold
    b.setBoard(0x8000, cfg0 | (1 << 11) | (3 << 12) | (1 << 14))
    let c = captureTraces(e.traceContext(0))
    expect(c.labels).toMatchObject({ wave1: 'Trapezoid', wave2: 'Threshold', probe1: 'Peaking', probe2: 'Trigger' })
    expect(new Set(c.wave2!).size).toBe(1)
    expect(c.wave2![0]).toBe(b.chReg(0x106c, 0))
    expect(c.trigger).toBeGreaterThan(b.chReg(0x1038, 0) * 4)
    // Peaking: the energy is sampled inside the flat top
    const pk = highs(c.probe1!)
    const start = c.trigger - Math.round(e.pha[0].tin_ns / 2)
    const rise = (e.pha[0].tr_us * 1000) / 2, flat = (e.pha[0].tf_us * 1000) / 2
    expect(pk.length).toBeGreaterThan(0)
    expect(pk[0]).toBeGreaterThanOrEqual(start + rise - 1)
    expect(pk[pk.length - 1]).toBeLessThanOrEqual(start + rise + flat + 1)
    expect(highs(c.probe2!)[0]).toBe(c.trigger)
    // the probes overlay trace 1 (same length, on its scale)
    expect(c.probe1!.length).toBe(c.wave1.length)
    // trace 2 = baseline of the trapezoid: flat at ~0, frozen through the pulse
    b.setBoard(0x8000, cfg0 | (1 << 11) | (3 << 12) | (3 << 14))
    c = captureTraces(e.traceContext(0))
    expect(Math.max(...Array.from(c.wave2!, Math.abs))).toBeLessThan(0.05 * Math.max(...c.wave1))
    // Digital probe 1 = TRG Hold-off: as long as the hold-off register says (8 ns steps)
    b.setBoard(0x8000, cfg0 | (7 << 20))
    c = captureTraces(e.traceContext(0))
    expect(highs(c.probe1!).length).toBeCloseTo(b.chReg(0x1074, 0) * 4, -1)
  })

  it('DPP-PSD: gates on the digital probes, Enable Digital Probe, baseline and CFD on trace 2', () => {
    const b = makeBoard('DPP-PSD')
    b.set(0x1080, 1 << 16)                      // invert: EJ-309 pulses are negative
    b.set(0x1058, 250); b.set(0x1054, 20); b.set(0x105c, 10)
    const e: any = engine(32, { detectors: 'ej309', source: 'cf252', distance_cm: 5 }, b)
    run(e, 1)
    const cfg0 = b.reg(0x8000)
    let c = captureTraces(e.traceContext(0))
    expect(c.probe1).toBeNull()                 // bit 31 off: no digital traces
    b.setBoard(0x8000, (cfg0 | (1 << 31) | (1 << 11)) >>> 0)   // digital on; dual, AP 0 → Input + Baseline
    c = captureTraces(e.traceContext(0))
    expect(c.labels).toMatchObject({ wave1: 'Input', wave2: 'Baseline', probe1: 'Long Gate', probe2: 'Short Gate' })
    const L = highs(c.probe1!), S = highs(c.probe2!)
    expect(L.length).toBeGreaterThanOrEqual(249); expect(L.length).toBeLessThanOrEqual(251)
    expect(S.length).toBeGreaterThanOrEqual(19); expect(S.length).toBeLessThanOrEqual(21)
    expect(L[0]).toBe(S[0])                     // both gates open at trigger − gate offset
    expect(L[0]).toBe(c.trigger - 10)
    expect(Math.abs(c.wave2![0] - e.psdp[0].baseline)).toBeLessThan(20)
    // AP 2: Input + CFD; the CFD fraction is read from 0x1n3C[9:8]
    b.setBoard(0x8000, (cfg0 | (1 << 31) | (1 << 11) | (2 << 12)) >>> 0)
    b.set(0x103c, (0 << 8) | 4); const q25 = captureTraces(e.traceContext(0)).wave2!
    b.set(0x103c, (3 << 8) | 4); const q100 = captureTraces(e.traceContext(0)).wave2!
    expect(Math.max(...q100)).toBeGreaterThan(Math.max(...q25))
  })
})

describe('a threshold inside the noise degrades, it does not hang (EJ-309 at 8 LSB)', () => {
  it('a tick stays cheap; offered, lost and dead time say what happens', () => {
    const go = (thr: number) => {
      const b = makeBoard('DPP-PSD')
      b.set(0x1080, 1 << 16)
      b.set(0x1060, thr)
      const e = engine(33, { detectors: 'ej309', source: 'cf252', distance_cm: 10 }, b)
      run(e, 0.2) // warm up
      const t = performance.now()
      const c = run(e, 1).tot[0]
      return { ms: (performance.now() - t) / 20, c }
    }
    const quiet = go(60), noisy = go(8)
    console.log(`threshold 60: ${quiet.ms.toFixed(2)} ms/tick ${JSON.stringify(quiet.c)}; threshold 8: ${noisy.ms.toFixed(2)} ms/tick ${JSON.stringify(noisy.c)}`)
    expect(noisy.ms).toBeLessThan(25)            // 16 channels at ~6 MHz of noise each; was seconds per tick
    expect(noisy.c.offered).toBeGreaterThan(3e6) // the crossings are all counted
    expect(noisy.c.lost).toBeGreaterThan(1e5)    // the readout cannot keep up
    expect(noisy.c.dead_s).toBeGreaterThan(0.3)  // the hold-off after each trigger
    expect(noisy.c.events).toBeGreaterThan(20 * NOISE_SIMULATED)
  })
})

describe('the registers the Tuner writes act on the spectra', () => {
  it('PHA: a peaking time past the flat top lowers and broadens the peak', () => {
    const peak = (tpk: number) => {
      const b = makeBoard('DPP-PHA')
      tuneHpge(b)
      b.set(0x1064, tpk)
      const e = engine(34, { detectors: 'hpge', source: 'cs137', activity_Bq: 5e4 }, b)
      run(e, 100)
      return e.fwhmProbe(0, 661.657) ?? e.fwhmProbe(0, 661.657 * (1 - (tpk * 8 / 1000 - 1) / 4))
    }
    const inside = peak(60)!, past = peak(160)!   // 480 ns into a 1 µs flat top vs 1.28 µs
    expect(Math.abs(inside.centroid_keV - 661.66)).toBeLessThan(0.5)
    expect(past).not.toBeNull()
    expect(past.centroid_keV).toBeLessThan(661.66 * 0.97)
    expect(past.fwhm_keV).toBeGreaterThan(1.5 * inside.fwhm_keV)
  })

  it('PSD: the charge sensitivity scales Q-long; the gates change the band separation', () => {
    const centroid = (cs: number) => {
      const b = makeBoard('DPP-PSD')
      b.set(0x1080, (1 << 16) | cs)
      b.set(0x1058, 500)
      const e = engine(35, { detectors: 'bgo', source: 'cs137', activity_Bq: 5e4 }, b)
      run(e, 10)
      const s = e.spectrum(0)
      let n = 0, m = 0
      for (let i = 200; i < s.length; i++) { n += s[i]; m += s[i] * i }
      return m / n
    }
    const c0 = centroid(0), c1 = centroid(1)
    expect(c0 / c1).toBeGreaterThan(3); expect(c0 / c1).toBeLessThan(5)  // ×4 fC/LSB per step
  })
})

describe('counters agree with the spectra', () => {
  for (const [what, det, setup] of [
    ['HPGe at high rate (pile-up)', 'hpge', (b: any) => { tuneHpge(b) }],
    ['BGO at 1.6 % DC offset (saturation)', 'bgo', (b: any) => { b.set(0x1080, 1 << 16); b.set(0x1098, 0x0400) }],
    ['EJ-309 at threshold 12 (noise)', 'ej309', (b: any) => { b.set(0x1080, 1 << 16); b.set(0x1060, 12) }],
  ] as const) {
    it(what, () => {
      const b = makeBoard(det === 'hpge' ? 'DPP-PHA' : 'DPP-PSD')
      setup(b)
      const e: any = engine(36, { detectors: det, source: det === 'ej309' ? 'cf252' : 'cs137', activity_Bq: det === 'hpge' ? 3e6 : 3e5, distance_cm: 3 }, b)
      let sink = 0, sinkPu = 0, sinkSatu = 0, fills = 0
      e.eventSink = (ch: number, _t: number, a: number, _b: number, pu: boolean, satu: boolean) => {
        if (ch !== 0) return
        sink++; if (pu) sinkPu++; if (satu) sinkSatu++
        if (!satu && (det !== 'hpge' || (a > 0 && a < ENERGY_BINS))) fills++
      }
      const c = run(e, 2).tot[0]
      e.eventSink = null
      const inSpectrum = sum(e.spectrum(0))
      console.log(`${what}: events ${c.events}, pile-up ${c.pileup}, saturated ${c.saturated}, lost ${c.lost}; spectrum ${inSpectrum}`)
      if (det === 'ej309') {
        // the counted (not simulated) noise events fill the spectrum in bulk
        expect(Math.abs(inSpectrum - (c.events - c.saturated)) / c.events).toBeLessThan(0.02)
        return
      }
      expect(sink).toBe(c.events)
      expect(sinkPu).toBe(c.pileup)
      expect(sinkSatu).toBe(c.saturated)
      expect(inSpectrum).toBe(fills)
      if (det === 'hpge') expect(c.pileup).toBeGreaterThan(0.01 * c.events)
      if (det === 'bgo') expect(c.saturated).toBeGreaterThan(0.1 * c.events)
      // saturated events are counted, not histogrammed; PHA pile-up events neither
      if (det === 'bgo') expect(inSpectrum).toBe(c.events - c.saturated)
    })
  }
})

