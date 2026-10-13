/**
 * Scintillators and counters on DPP-PSD (design §3.4): BGO charge integration and
 * PSD band, EJ-309 n/γ discrimination with ²⁵²Cf, ³He thermal-neutron peak.
 */
import { describe, expect, it } from 'vitest'
import { registerPhysicsData } from '../../sim/physics/engine'
import { PSD_XBINS, PSD_YBINS } from '../../sim/physics/api'
import { fitPeak } from '../../sim/physics/probe'
import { LINES, engine, makeBoard, run } from './helpers'

/** Projection of the PSD plot onto the PSD axis for Q_long in [q0, q1). */
function psdProjection(psd: Uint32Array, q0: number, q1: number): Float64Array {
  const x0 = Math.floor(q0 / 32), x1 = Math.min(PSD_XBINS, Math.ceil(q1 / 32))
  const out = new Float64Array(PSD_YBINS)
  for (let iy = 0; iy < PSD_YBINS; iy++) for (let ix = x0; ix < x1; ix++) out[iy] += psd[iy * PSD_XBINS + ix]
  return out
}

describe('BGO (DPP-PSD charge integration)', () => {
  it('PSD band mean in [0.78, 0.87] at the default gates; a single band', () => {
    const b = makeBoard('DPP-PSD')
    const e = engine(21, { detectors: 'bgo', source: 'cs137', distance_cm: 10, activity_Bq: 50e3 }, b)
    run(e, 40)
    const g = (e as any).gain(0)
    const proj = psdProjection(e.psd(0)!, 200 * g, 1000 * g)
    let s0 = 0, s1 = 0
    proj.forEach((v, i) => { s0 += v; s1 += v * ((i + 0.5) / PSD_YBINS) })
    const mean = s1 / s0
    console.log(`BGO PSD mean ${mean.toFixed(3)} from ${s0} events`)
    expect(mean).toBeGreaterThanOrEqual(0.78)
    expect(mean).toBeLessThanOrEqual(0.87)
  })

  it('FWHM(662) in [9, 13] % with a long gate, worse at the default 200 ns gate; centroid ±1 %', () => {
    const fw = (longGate: number) => {
      const b = makeBoard('DPP-PSD')
      b.set(0x1058, longGate)
      const e = engine(22, { detectors: 'bgo', source: 'cs137', distance_cm: 10, activity_Bq: 50e3 }, b)
      run(e, 40)
      const p = e.fwhmProbe(0, 661.657)!
      expect(Math.abs(p.centroid_keV / 661.657 - 1)).toBeLessThan(0.01)
      return p.fwhm_keV / 661.657
    }
    const tuned = fw(500), def = fw(100)
    console.log(`BGO FWHM(662): ${(tuned * 100).toFixed(1)} % at L = 1 µs, ${(def * 100).toFixed(1)} % at L = 200 ns`)
    expect(tuned).toBeGreaterThanOrEqual(0.09)
    expect(tuned).toBeLessThanOrEqual(0.13)
    expect(def).toBeGreaterThan(tuned * 1.15)
  })

  it('⁴⁰K and ²⁰⁸Tl centroids within 1 %; strong ⁶⁰Co sum peak in each crystal', () => {
    const boosted = structuredClone(LINES)
    boosted.background.components.v = boosted.background.components.v.map(([n, a]: [string, number]) => [n, a * 500])
    registerPhysicsData({ lines: boosted })
    try {
      const b = makeBoard('DPP-PSD')
      b.set(0x1058, 500)
      const e = engine(23, { detectors: 'bgo', source: 'background', distance_cm: 10 }, b)
      run(e, 100)
      for (const E of [1460.82, 2614.511]) {
        const p = e.fwhmProbe(0, E)!
        console.log(`BGO ${E}: centroid ${p.centroid_keV.toFixed(1)}, FWHM ${(100 * p.fwhm_keV / E).toFixed(1)} %`)
        expect(Math.abs(p.centroid_keV / E - 1)).toBeLessThan(0.01)
      }
    } finally {
      registerPhysicsData({ lines: LINES })
    }
    const b = makeBoard('DPP-PSD')
    b.set(0x1058, 500)
    const e = engine(24, { detectors: 'bgo', source: 'co60', distance_cm: 5, activity_Bq: 50e3 }, b)
    run(e, 20)
    const sum = e.fwhmProbe(0, 2505.7)!
    expect(Math.abs(sum.centroid_keV / 2505.7 - 1)).toBeLessThan(0.015)
    expect(sum.counts).toBeGreaterThan(1000)
  })
})

describe('EJ-309 liquid scintillator: n/γ PSD with ²⁵²Cf', () => {
  const fom = (e: any, lo: number, hi: number) => {
    const g = e.gain(0)
    const proj = psdProjection(e.psd(0)!, lo * g, hi * g)
    let ig = 0, inn = 0
    for (let i = 1; i < 40; i++) if (proj[i] > proj[ig]) ig = i
    for (let i = ig + 12; i < 120; i++) if (proj[i] > proj[inn] || inn < ig + 12) inn = i
    const fg = fitPeak(proj, ig, 14, 1), fn = fitPeak(proj, inn, 18, 1)
    if (!fg || !fn) return { fom: 0, g: ig, n: inn }
    return { fom: (fn.centroid - fg.centroid) / (fn.fwhm + fg.fwhm), g: fg.centroid / 256, n: fn.centroid / 256 }
  }

  it('two bands; the figure of merit grows with energy and depends on the gates', () => {
    const b = makeBoard('DPP-PSD')
    const e = engine(31, { detectors: 'ej309', source: 'cf252', distance_cm: 5, activity_Bq: 2e6 }, b)
    const r = run(e, 60)
    const low = fom(e, 60, 150), high = fom(e, 300, 1000)
    console.log(`EJ-309 FOM: ${low.fom.toFixed(2)} at 60–150 keVee, ${high.fom.toFixed(2)} at 300–1000 keVee; bands γ ${high.g.toFixed(3)}, n ${high.n.toFixed(3)}; ${r.tot[0].events} events`)
    expect(high.n).toBeGreaterThan(high.g + 0.05)
    expect(high.fom).toBeGreaterThan(1.0)
    expect(high.fom).toBeGreaterThan(low.fom * 1.4)
    // the gates change the separation
    const b2 = makeBoard('DPP-PSD')
    b2.set(0x1054, 40) // 80 ns short gate
    const e2 = engine(31, { detectors: 'ej309', source: 'cf252', distance_cm: 5, activity_Bq: 2e6 }, b2)
    run(e2, 60)
    const other = fom(e2, 300, 1000)
    console.log(`EJ-309 FOM with an 80 ns short gate: ${other.fom.toFixed(2)}`)
    expect(Math.abs(other.fom - high.fom)).toBeGreaterThan(0.05)
  })

  it('neutron traces have a longer tail than γ traces (tail/total of the trace)', () => {
    const b = makeBoard('DPP-PSD')
    b.set(0x1020, 100) // 800 samples
    const e: any = engine(32, { detectors: 'ej309', source: 'cf252', distance_cm: 5, activity_Bq: 2e6 }, b)
    run(e, 0.2)
    const tail = (heavy: number) => {
      e.chans[0].lastE = 800; e.chans[0].lastHeavy = heavy
      const w: Int16Array = e.waveform(0)
      const base = w[0], pre = 400
      let tot = 0, t = 0
      for (let i = pre; i < pre + 200; i++) { const v = base - w[i]; tot += v; if (i > pre + 15) t += v }
      return t / tot
    }
    expect(tail(800)).toBeGreaterThan(tail(0) + 0.05)
  })
})

describe('³He proportional counter: thermal capture', () => {
  it('764 keV peak and the wall-effect continuum (191–764 keV)', () => {
    const b = makeBoard('DPP-PSD')
    b.set(0x1058, 3000) // 6 µs long gate for the slow pulses
    const e: any = engine(41, { detectors: 'he3', source: 'cf252', distance_cm: 5, activity_Bq: 2e6 }, b)
    run(e, 30)
    const p = e.fwhmProbe(0, 764)!
    console.log(`³He: centroid ${p.centroid_keV.toFixed(1)}, FWHM ${p.fwhm_keV.toFixed(1)} keV, ${p.counts} counts`)
    expect(Math.abs(p.centroid_keV / 764 - 1)).toBeLessThan(0.02)
    const g = e.gain(0), s = e.spectrum(0)
    let wall = 0
    for (let i = Math.floor(250 * g); i < Math.floor(650 * g); i++) wall += s[i]
    expect(wall / p.counts).toBeGreaterThan(0.1)
    // with the default 200 ns gate most of the slow pulse is missed
    const b2 = makeBoard('DPP-PSD')
    const e2: any = engine(41, { detectors: 'he3', source: 'cf252', distance_cm: 5, activity_Bq: 2e6 }, b2)
    expect(e2.gain(0)).toBeLessThan(0.2 * g)
  })
})
