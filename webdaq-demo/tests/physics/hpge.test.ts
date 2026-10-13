/**
 * HPGe on DPP-PHA (design §3.4, §6.5): peak positions, FWHM vs energy against the
 * §3.4 formula (with the ballistic deficit folded in numerically), escape peaks,
 * the ⁶⁰Co sum peak, saturation and the trapezoid trace.
 */
import { describe, expect, it } from 'vitest'
import { Response } from '../../sim/physics/response'
import { n14pgModel } from '../../sim/physics/sources'
import { fitPeak } from '../../sim/physics/probe'
import { registerPhysicsData } from '../../sim/physics/engine'
import { LINES, engine, makeBoard, run, scenario, table, tuneHpge, type TestBoard } from './helpers'

const STEP_US = 0.008

/** §3.4 written out independently of the engine: FWHM² of the trapezoid, keV². */
function formulaFwhm2(E: number, b: TestBoard, rate_per_us: number, e2: number): number {
  const tr = b.chReg(0x105c, 0) * STEP_US, tf = b.chReg(0x1060, 0) * STEP_US, M = b.chReg(0x1068, 0) * STEP_US
  const tin = b.chReg(0x1058, 0) * 8, ns = b.chReg(0x1054, 0)
  const sigmaTr = 18 * Math.sqrt((48 * 4) / (tin * ns))
  const sigmaT = Math.min(60, Math.max(20, 20 * (sigmaTr / 18) + 0.1 * tin)) / 1000
  const wel2 = 1.33 / tr + 0.08 * ((2 * tr) / 3 + tf) + 0.2
  const wf = 2.355 * Math.sqrt(0.08 * 2.96e-3 * E)
  const wcc = 3.8e-4 * E
  const mis = 1 / 50 - 1 / M
  const wpz = 2.355 * Math.abs(mis) * sigmaT * E
  const blCode = (b.chReg(0x1080, 0) >>> 20) & 7
  const tbl = blCode === 0 ? 0 : (4 ** (blCode + 1) * 2) / 1000
  const fBlr = tbl > 0 ? Math.min(1, (tbl + tr + tf) / 50) : 1
  const s2 = rate_per_us * e2 * (tr * mis) ** 2 * 50 / 2 * fBlr ** 2
  return wel2 + wf * wf + wcc * wcc + wpz * wpz + 2.355 ** 2 * s2
}

/**
 * The line shape the model predicts, E(1 − δ(t_c)) + N(0, σ) with t_c uniform on
 * 0.1–0.6 µs (§3.4 ballistic deficit), integrated numerically into the engine's
 * spectrum bins, then measured with the same half-maximum fitter as the simulated
 * spectrum. Comparing the two checks the Monte Carlo against the model, whatever
 * the line shape (the default settings give a strongly non-Gaussian peak).
 */
function predictedFwhm(e: any, E: number, fwhm: number, tr: number, tf: number): number {
  const g = e.gain(0)
  const sigma = fwhm / 2.355
  const spec = new Float64Array(32768)
  const K = 2000
  for (let k = 0; k < K; k++) {
    const tc = 0.1 + (0.5 * (k + 0.5)) / K
    const d = tc <= tf ? 0 : Math.min(1, ((tc - tf) ** 2) / (4 * tr * tc))
    const mu = E * (1 - d)
    const i0 = Math.max(0, Math.floor((mu - 6 * sigma) * g)), i1 = Math.min(32767, Math.ceil((mu + 6 * sigma) * g))
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) / g - mu
      spec[i] += Math.exp(-(x * x) / (2 * sigma * sigma))
    }
  }
  // same window and smoothing as engine.fwhmProbe
  const fb = Math.max(1, e.expectedFwhm(0, E) * g)
  const f = fitPeak(spec, E * g, Math.max(4 * fb, 12 * g, 20), Math.max(1, fb / 8))!
  return f.fwhm / g
}

/**
 * 2 × the half width at half maximum on the high-energy side, in keV. The ballistic
 * deficit only makes a low-energy tail, so this is the Gaussian part of the line even
 * when the default settings turn the low side into a plateau that sits near half
 * maximum (where a full-width measurement is ill-conditioned).
 */
function highSideWidth(spec: ArrayLike<number>, g: number, E: number, fwhmGuess: number): number {
  const lo = Math.floor((E - 2 * fwhmGuess) * g), hi = Math.ceil((E + 3 * fwhmGuess) * g)
  const w = Math.max(1, Math.round((fwhmGuess * g) / 10))
  const sm = (i: number) => { let t = 0; for (let k = i - w; k <= i + w; k++) t += spec[k]; return t / (2 * w + 1) }
  let im = lo, ym = -1
  for (let i = lo; i <= hi; i++) { const y = sm(i); if (y > ym) { ym = y; im = i } }
  // background: mean well above the peak
  let bg = 0
  const b0 = Math.ceil((E + 4 * fwhmGuess) * g), b1 = Math.ceil((E + 6 * fwhmGuess) * g)
  for (let i = b0; i < b1; i++) bg += spec[i]
  bg /= Math.max(1, b1 - b0)
  const half = bg + (ym - bg) / 2
  let j = im
  while (j < hi && sm(j) > half) j++
  const yj = sm(j), yp = sm(j - 1)
  const x = j - (half - yj) / (yp - yj)
  return (2 * (x - im)) / g
}

function predictedShape(e: any, E: number, fwhm: number, tr: number, tf: number): Float64Array {
  const g = e.gain(0)
  const sigma = fwhm / 2.355
  const spec = new Float64Array(32768)
  const K = 2000
  for (let k = 0; k < K; k++) {
    const tc = 0.1 + (0.5 * (k + 0.5)) / K
    const d = tc <= tf ? 0 : Math.min(1, ((tc - tf) ** 2) / (4 * tr * tc))
    const mu = E * (1 - d)
    const i0 = Math.max(0, Math.floor((mu - 6 * sigma) * g)), i1 = Math.min(32767, Math.ceil((mu + 6 * sigma) * g))
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) / g - mu
      spec[i] += Math.exp(-(x * x) / (2 * sigma * sigma))
    }
  }
  return spec
}

function probe(e: any, E: number) {
  const p = e.fwhmProbe(0, E)
  expect(p, `peak at ${E}`).toBeTruthy()
  return p!
}

describe('HPGe peak positions and FWHM vs energy', () => {
  for (const tuned of [true, false]) {
    it(`⁶⁰Co and ¹³⁷Cs, ${tuned ? 'tuned' : 'default (mis-tuned)'} trapezoid`, () => {
      for (const [source, lines] of [['co60', [1173.228, 1332.492]], ['cs137', [661.657]]] as const) {
        const b = makeBoard('DPP-PHA')
        if (tuned) tuneHpge(b)
        const e = engine(11, { detectors: 'hpge', source, distance_cm: 10, activity_Bq: 50e3 }, b)
        const r = run(e, tuned ? 200 : 1600)
        expect(r.tot[0].events).toBeGreaterThan(1e5)
        const rate = (r.tot[0].offered / (tuned ? 200 : 1600)) * 1e-6
        for (const E of lines) {
          const p = probe(e, E)
          const tr = b.chReg(0x105c, 0) * STEP_US, tf = b.chReg(0x1060, 0) * STEP_US
          // ⟨E²⟩ of the pulses: the engine tracks it; the formula's rate term needs it
          const e2 = (e as any).chans[0].e2
          const want = predictedFwhm(e, E, Math.sqrt(formulaFwhm2(E, b, rate, e2)), tr, tf)
          const f = Math.sqrt(formulaFwhm2(E, b, rate, e2))
          if (tuned) {
            console.log(`tuned ${E} keV: centroid ${p.centroid_keV.toFixed(3)}, FWHM ${p.fwhm_keV.toFixed(3)} (formula ⊗ ballistic ${want.toFixed(3)}; formula ${f.toFixed(3)}), ${p.counts} counts`)
            expect(Math.abs(p.fwhm_keV / want - 1)).toBeLessThan(0.07)
          } else {
            const g = e.gain(0)
            const got = highSideWidth(e.spectrum(0), g, E, f)
            const exp = highSideWidth(predictedShape(e, E, f, tr, tf), g, E, f)
            console.log(`default ${E} keV: high-side FWHM ${got.toFixed(2)} (model ${exp.toFixed(2)}; formula ${f.toFixed(2)}), full FWHM ${p.fwhm_keV.toFixed(1)}`)
            expect(Math.abs(got / exp - 1)).toBeLessThan(0.07)
          }
          if (tuned) expect(Math.abs(p.centroid_keV - E)).toBeLessThan(0.3)
        }
        if (tuned && source === 'co60') expect(probe(e, 1332.492).fwhm_keV).toBeLessThanOrEqual(2.0)
      }
    })
  }

  it('⁴⁰K 1460.8 and ²⁰⁸Tl 2614.5 keV (room background, boosted for statistics)', () => {
    const boosted = structuredClone(LINES)
    boosted.background.components.v = boosted.background.components.v.map(([n, a]: [string, number]) => [n, a * 4000])
    registerPhysicsData({ lines: boosted })
    try {
      for (const tuned of [true, false]) {
        const b = makeBoard('DPP-PHA')
        if (tuned) tuneHpge(b)
        const e = engine(12, { detectors: 'hpge', source: 'background', distance_cm: 10 }, b)
        const r = run(e, 300)
        const rate = (r.tot[0].offered / 300) * 1e-6
        for (const E of [1460.82, 2614.511]) {
          const p = probe(e, E)
          const tr = b.chReg(0x105c, 0) * STEP_US, tf = b.chReg(0x1060, 0) * STEP_US
          const want = predictedFwhm(e, E, Math.sqrt(formulaFwhm2(E, b, rate, (e as any).chans[0].e2)), tr, tf)
          const f = Math.sqrt(formulaFwhm2(E, b, rate, (e as any).chans[0].e2))
          if (tuned) {
            console.log(`tuned ${E} keV: centroid ${p.centroid_keV.toFixed(3)}, FWHM ${p.fwhm_keV.toFixed(3)} (want ${want.toFixed(3)}), ${p.counts} counts`)
            expect(Math.abs(p.centroid_keV - E)).toBeLessThan(0.3)
            expect(Math.abs(p.fwhm_keV / want - 1)).toBeLessThan(0.07)
          } else {
            const g = e.gain(0)
            const got = highSideWidth(e.spectrum(0), g, E, f)
            const exp = highSideWidth(predictedShape(e, E, f, tr, tf), g, E, f)
            console.log(`default ${E} keV: high-side FWHM ${got.toFixed(2)} (model ${exp.toFixed(2)}; formula ${f.toFixed(2)})`)
            expect(Math.abs(got / exp - 1)).toBeLessThan(0.07)
          }
        }
      }
    } finally {
      registerPhysicsData({ lines: LINES })
    }
  })
})

describe('in-beam ¹⁴N(p,γ)¹⁵O on HPGe', () => {
  const m = n14pgModel(LINES)
  const E6791 = m.xform(6792, 1)

  it('6791 keV line: recoil and Doppler at 55°, escape peaks in table ratio', () => {
    expect(E6791 - 6790.35).toBeGreaterThan(5) // ≈ +6 keV at 55° (design §3.3)
    const b = makeBoard('DPP-PHA')
    tuneHpge(b)
    // the default gain stops at 2.95 MeV: rescale the trapezoid (0x1080[5:0] = 6, 2.78 ch/keV)
    b.set(0x1080, (0x400000 & ~0x3f) | 6)
    const e = engine(13, { detectors: 'hpge', source: 'n14pg', distance_cm: 5, beam_I0_uA: 100 }, b)
    const r = run(e, 200, 100)
    expect(r.tot[0].saturated).toBe(0)
    const fe = probe(e, E6791)
    console.log(`6791 line: expected ${E6791.toFixed(2)}, centroid ${fe.centroid_keV.toFixed(2)}, FWHM ${fe.fwhm_keV.toFixed(2)}, ${fe.counts} counts`)
    expect(Math.abs(fe.centroid_keV - E6791)).toBeLessThan(0.3)
    const se = probe(e, E6791 - 510.999)
    const de = probe(e, E6791 - 1021.998)
    expect(Math.abs(se.centroid_keV - (E6791 - 510.999))).toBeLessThan(0.3)
    expect(Math.abs(de.centroid_keV - (E6791 - 1021.998))).toBeLessThan(0.3)
    const lr = new Response(table('hpge')).line(E6791, 5)
    const wantSE = (lr.pSE * lr.eT) / lr.eFE, wantDE = (lr.pDE * lr.eT) / lr.eFE
    console.log(`SE/FE ${(se.counts / fe.counts).toFixed(3)} (table ${wantSE.toFixed(3)}), DE/FE ${(de.counts / fe.counts).toFixed(3)} (table ${wantDE.toFixed(3)})`)
    expect(Math.abs(se.counts / fe.counts / wantSE - 1)).toBeLessThan(0.15)
    expect(Math.abs(de.counts / fe.counts / wantDE - 1)).toBeLessThan(0.2)
  })

  it('saturates with the default 50 % DC offset, not at 10 %', () => {
    const b = makeBoard('DPP-PHA')
    const e = engine(14, { detectors: 'hpge', source: 'n14pg', distance_cm: 5, beam_I0_uA: 100 }, b)
    expect(run(e, 10, 100).tot[0].saturated).toBeGreaterThan(50)
    b.set(0x1098, 0x1999)
    e.configure(scenario({ detectors: 'hpge', source: 'n14pg', distance_cm: 5, beam_I0_uA: 100 }), b)
    expect(run(e, 10, 100).tot[0].saturated).toBe(0)
  })

  it('the count rate follows the beam current', () => {
    const b = makeBoard('DPP-PHA')
    tuneHpge(b)
    const e = engine(15, { detectors: 'hpge', source: 'n14pg', distance_cm: 5, beam_I0_uA: 100 }, b)
    const on = run(e, 5, 100).tot[0].events
    const trip = run(e, 5, 15).tot[0].events
    expect(trip).toBeLessThan(on * 0.3)
  })
})

describe('⁶⁰Co true-coincidence summing', () => {
  it('sum peak at 2505.7 keV with area ε_FE(1173)·ε_FE(1332)·W(0°) per decay (±15 %)', () => {
    const b = makeBoard('DPP-PHA')
    tuneHpge(b)
    const A = 100e3, T = 300, d = 5
    const e = engine(16, { detectors: 'hpge', source: 'co60', distance_cm: d, activity_Bq: A }, b)
    const r = run(e, T)
    const p = probe(e, 2505.72)
    expect(Math.abs(p.centroid_keV - 2505.72)).toBeLessThan(0.3)
    const R = new Response(table('hpge'))
    const c = LINES.co60_correlation
    const w0 = (1 + c.a2 + c.a4) / (1 + c.a2 / 3 + c.a4 / 5)
    const live = 1 - r.tot[0].pileup / r.tot[0].events
    const want = A * T * R.line(1173.228, d).eFE * R.line(1332.492, d).eFE * w0 * live
    console.log(`sum peak ${p.counts} counts, expected ${want.toFixed(0)}`)
    expect(Math.abs(p.counts / want - 1)).toBeLessThan(0.15)
  })

  it('summing grows in close geometry (distance changes solid angle and summing)', () => {
    const ratio = (d: number) => {
      const b = makeBoard('DPP-PHA')
      tuneHpge(b)
      const e = engine(17, { detectors: 'hpge', source: 'co60', distance_cm: d, activity_Bq: 2e5 * (d / 5) ** 2 }, b)
      run(e, 100)
      return e.fwhmProbe(0, 2505.72)!.counts / e.fwhmProbe(0, 1332.492)!.counts
    }
    const near = ratio(2), far = ratio(20)
    console.log(`sum/1332 at 2 cm ${near.toFixed(4)}, at 20 cm ${far.toFixed(4)}`)
    expect(near).toBeGreaterThan(4 * far)
  })
})

describe('trapezoid trace (Jordanov) and probes', () => {
  it('the flat top is flat when Decay = τ_preamp and tilts when it is not', () => {
    const tilt = (decay: number) => {
      const b = makeBoard('DPP-PHA')
      tuneHpge(b)
      b.set(0x1068, decay)
      b.setBoard(0x8000, b.reg(0x8000) | (3 << 12)) // trace 1 = trapezoid
      b.set(0x1020, 2000) // 16 000 samples = 32 µs
      const e = engine(18, { detectors: 'hpge', source: 'cs137', activity_Bq: 2e5 }, b)
      run(e, 0.5)
      const w = e.waveform(0)!
      expect(w.length).toBe(16000)
      const pre = b.chReg(0x1038, 0) * 4
      // flat top: from pre + (rise + tc) to pre + rise + flat
      const i0 = pre + Math.round((4000 + 700) / 2), i1 = pre + Math.round((4000 + 1000) / 2)
      const mean = (a: number, z: number) => { let s = 0; for (let i = a; i < z; i++) s += w[i]; return s / (z - a) }
      const top = mean(i0, i1)
      const lateTail = mean(pre + 5500, pre + 6500) // after the trapezoid: back to 0 if pole-zero is right
      return { top, lateTail }
    }
    const good = tilt(6250), bad = tilt(500)
    console.log('tuned', good, 'decay 4 µs', bad)
    expect(Math.abs(good.lateTail)).toBeLessThan(0.05 * good.top)
    expect(Math.abs(bad.lateTail)).toBeGreaterThan(0.2 * Math.abs(bad.top))
  })

  it('trace 1 follows 0x8000[13:12]: input, RC-CR, RC-CR², trapezoid', () => {
    const b = makeBoard('DPP-PHA')
    const e = engine(19, { detectors: 'hpge', source: 'cs137', activity_Bq: 2e5 }, b)
    run(e, 0.2)
    const out: Int16Array[] = []
    for (let p = 0; p < 4; p++) {
      b.setBoard(0x8000, (b.reg(0x8000) & ~(3 << 12)) | (p << 12))
      out.push(e.waveform(0)!)
    }
    expect(out[0][0]).toBeGreaterThan(8000) // baseline at the 50 % DC offset
    expect(Math.abs(out[3][0])).toBeLessThan(50) // filters start at 0
    expect(out.every((w) => w.length === 4000)).toBe(true)
  })

  it('a peak fit helper sanity check', () => {
    const s = new Float64Array(1000)
    for (let i = 0; i < 1000; i++) s[i] = 10 + 1000 * Math.exp(-((i - 500.5) ** 2) / (2 * 4 * 4))
    const f = fitPeak(s, 500, 60, 1)!
    expect(Math.abs(f.fwhm / (2.355 * 4) - 1)).toBeLessThan(0.02)
    expect(f.centroid).toBeCloseTo(500.5, 1)
  })
})
