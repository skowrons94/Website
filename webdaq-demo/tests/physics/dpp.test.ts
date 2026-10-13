/**
 * Timing and the DPP (design §3.4, §3.11): pile-up, hold-off and live time, the
 * readout budget, Rice noise triggers, per-tick cost, beam charge, determinism.
 */
import { describe, expect, it } from 'vitest'
import { beamSample, integrateCharge, tripping } from '../../sim/physics/beam'
import { riceRate } from '../../sim/physics/detectors'
import { createPhysics } from '../../sim/physics/engine'
import { engine, makeBoard, run, scenario, tuneHpge } from './helpers'
import { createHash } from 'node:crypto'

/** Activity giving about `kcps` triggers per detector channel. */
function activityFor(kcps: number, det: 'hpge' | 'bgo' = 'hpge', source: 'cs137' | 'co60' = 'cs137'): number {
  const b = makeBoard(det === 'hpge' ? 'DPP-PHA' : 'DPP-PSD')
  const e = engine(99, { detectors: det, source, distance_cm: 10, activity_Bq: 1e5 }, b)
  const r = run(e, 2)
  return (1e5 * kcps * 1000) / (r.tot[0].offered / 2)
}

describe('pile-up, hold-off, live time', () => {
  it('pile-up fraction = 1 − exp(−2 r τ_PU) within 3σ at 1, 10 and 50 kcps', () => {
    for (const kcps of [1, 10, 50]) {
      const b = makeBoard('DPP-PHA')
      b.set(0x1074, 1) // hold-off 8 ns: pile-up only
      const T = kcps >= 10 ? 10 : 60
      const e = engine(51, { detectors: 'hpge', source: 'cs137', activity_Bq: activityFor(kcps) }, b)
      const c = run(e, T).tot[0]
      const r = c.offered / T
      const tau = 800e-9 // max(peak hold-off 100 × 8 ns, rise + flat = 600 ns)
      const want = 1 - Math.exp(-2 * r * tau)
      const got = c.pileup / c.events
      const sigma = Math.sqrt((want * (1 - want)) / c.events)
      console.log(`${(r / 1000).toFixed(1)} kcps: pile-up ${(got * 100).toFixed(3)} % (expected ${(want * 100).toFixed(3)} ± ${(sigma * 100).toFixed(3)})`)
      expect(Math.abs(got - want)).toBeLessThan(3 * sigma + 1e-4)
    }
  })

  it('live fraction falls monotonically with rate; dead time grows', () => {
    let prev = 1.1, prevDead = -1
    for (const kcps of [1, 10, 50, 150]) {
      const b = makeBoard('DPP-PHA')
      const e = engine(52, { detectors: 'hpge', source: 'cs137', activity_Bq: activityFor(kcps) }, b)
      const c = run(e, 4).tot[0]
      const live = c.events / c.offered
      console.log(`${kcps} kcps: written/offered ${live.toFixed(4)}, dead ${(c.dead_s / 4 * 100).toFixed(2)} %`)
      expect(live).toBeLessThan(prev)
      expect(c.dead_s).toBeGreaterThan(prevDead)
      prev = live; prevDead = c.dead_s
    }
  })

  it('longer hold-off: fewer triggers written, more dead time', () => {
    const go = (tho: number) => {
      const b = makeBoard('DPP-PHA')
      b.set(0x1074, tho)
      const e = engine(53, { detectors: 'hpge', source: 'cs137', activity_Bq: activityFor(30) }, b)
      return run(e, 3).tot[0]
    }
    const short = go(10), long = go(1000)
    expect(long.events).toBeLessThan(short.events * 0.9)
    expect(long.dead_s).toBeGreaterThan(short.dead_s * 3)
  })
})

describe('readout throughput', () => {
  it('waveforms on at high rate overflow the link: lost events and dropped blocks', () => {
    const b = makeBoard('DPP-PHA')
    const A = activityFor(20)
    const e = engine(54, { detectors: 'hpge', source: 'cs137', activity_Bq: A }, b)
    const off = run(e, 2)
    expect(off.tot[0].lost).toBe(0)
    b.waveformsEnabled = true
    e.configure(scenario({ detectors: 'hpge', source: 'cs137', activity_Bq: A }), b)
    let blocks = 0, lost = 0, bytes = 0
    for (let i = 0; i < 40; i++) {
      const t = e.tick({ t_s: 2 + i * 0.05, dt_s: 0.05, beamCurrent_uA: 0 })
      blocks += t.blocksDropped; lost += t.channels[0].lost + t.channels[1].lost; bytes += t.bytes
    }
    console.log(`waveforms on: ${(bytes / 2 / 1e6).toFixed(1)} MB/s written, ${lost} lost, ${blocks} blocks dropped`)
    expect(lost).toBeGreaterThan(1000)
    expect(blocks).toBeGreaterThan(100)
    expect(bytes / 2).toBeLessThanOrEqual(80e6 * 1.01)
  })
})

describe('noise triggers (Rice)', () => {
  it('rate on an empty channel follows f0·exp(−Th²/2σ²), σ ∝ 1/√(τ_in·n_smooth)', () => {
    const b = makeBoard('DPP-PHA')
    const e = engine(55, { detectors: 'hpge', source: 'cs137', activity_Bq: 1e3 }, b)
    for (const [th, smooth] of [[60, 4], [70, 4], [80, 4], [40, 16]] as const) {
      b.set(0x106c, th, 5)
      b.set(0x1054, smooth, 5)
      e.configure(scenario({ detectors: 'hpge', source: 'cs137', activity_Bq: 1e3 }), b)
      const T = 20
      const c = run(e, T).tot[5]
      const sigma = 18 * Math.sqrt((48 * 4) / (48 * smooth))
      const want = riceRate(th, sigma, Math.max(48, smooth * 2)) * T
      console.log(`Th ${th}, smoothing ${smooth}: ${c.offered} noise triggers, Rice ${want.toFixed(0)}`)
      expect(Math.abs(c.offered - want)).toBeLessThan(4 * Math.sqrt(want) + 2)
    }
  })
})

describe('cost per tick (design §6.4: ≤ 2 ms at 2 × 20 kcps)', () => {
  for (const det of ['hpge', 'bgo'] as const) {
    it(det, () => {
      const b = makeBoard(det === 'hpge' ? 'DPP-PHA' : 'DPP-PSD')
      if (det === 'hpge') tuneHpge(b)
      const A = activityFor(20, det, 'co60')
      const e = engine(56, { detectors: det, source: 'co60', activity_Bq: A }, b)
      run(e, 2) // warm-up (JIT)
      const t0 = performance.now()
      const r = run(e, 10)
      const ms = (performance.now() - t0) / 200
      console.log(`${det}: ${(r.tot[0].offered / 10 / 1000).toFixed(1)} + ${(r.tot[1].offered / 10 / 1000).toFixed(1)} kcps, ${ms.toFixed(3)} ms per 50 ms tick`)
      expect(r.tot[0].offered / 10).toBeGreaterThan(18e3)
      expect(ms).toBeLessThanOrEqual(2)
    })
  }

  it('catching up 60 s in one call costs ≤ 30 ms and gives the right number of counts', () => {
    const b = makeBoard('DPP-PHA')
    const e = engine(57, { detectors: 'hpge', source: 'cs137', activity_Bq: 5e4 }, b)
    run(e, 5)
    const sum = () => e.spectrum(0).reduce((a, x) => a + x, 0)
    const before = sum()
    const t0 = performance.now()
    const r = e.tick({ t_s: 5, dt_s: 60, beamCurrent_uA: 0 })
    const ms = performance.now() - t0
    const added = sum() - before
    console.log(`catch-up 60 s: ${ms.toFixed(1)} ms, ${added} counts (5 s gave ${before})`)
    expect(ms).toBeLessThan(30)
    expect(Math.abs(added / (before * 12) - 1)).toBeLessThan(0.05)
    expect(Math.abs(r.channels[0].events / (added * 1.0) - 1)).toBeLessThan(0.1)
  })
})

describe('beam current and charge (mock_current.py)', () => {
  it('charge from 10 Hz samples = ∫I dt within 0.1 %', () => {
    const I0 = 100, seed = 7, T = 1200
    const samples: number[] = []
    for (let k = 0; k < T * 10; k++) samples.push(beamSample(k / 10, I0, seed)[0])
    const q = integrateCharge(samples, 0.1)
    // fine integral (1 kHz, midpoint)
    let fine = 0
    for (let k = 0; k < T * 1000; k++) fine += beamSample((k + 0.5) / 1000, I0, seed)[0] * 1e-3
    console.log(`charge: ${q.toFixed(1)} µC from 10 Hz samples, ${fine.toFixed(1)} µC integrated`)
    expect(Math.abs(q / fine - 1)).toBeLessThan(1e-3)
  })

  it('trips to 15 % for 2 s every 407 s; pure in t', () => {
    expect(tripping(371)).toBe(true)
    expect(tripping(371 + 407)).toBe(true)
    expect(tripping(373)).toBe(false)
    const a = beamSample(371, 100, 1)[0], b = beamSample(368, 100, 1)[0]
    expect(a).toBeLessThan(0.2 * b)
    expect(beamSample(123.4, 100, 3)).toEqual(beamSample(123.4, 100, 3))
    expect(beamSample(10, 0, 3)).toEqual([0, 0, 0, 0])
  })

  it('engine.beamSample uses I0 only for the in-beam source', () => {
    const b = makeBoard('DPP-PHA')
    const e = engine(58, { detectors: 'hpge', source: 'n14pg', beam_I0_uA: 100 }, b)
    expect(e.beamSample(10)[0]).toBeGreaterThan(80)
    e.configure(scenario({ detectors: 'hpge', source: 'co60', beam_I0_uA: 100 }), b)
    expect(e.beamSample(10)[0]).toBe(0)
  })
})

describe('determinism and persistence', () => {
  const digest = (e: any) => {
    const h = createHash('sha256')
    for (let c = 0; c < 2; c++) h.update(Buffer.from(e.spectrum(c).buffer))
    return h.digest('hex')
  }

  it('same seed and actions → byte-identical spectra; another seed differs', () => {
    const mk = (seed: number) => {
      const b = makeBoard('DPP-PHA')
      const e = engine(seed, { detectors: 'hpge', source: 'co60', activity_Bq: 5e4 }, b)
      run(e, 5)
      return digest(e)
    }
    expect(mk(1234)).toBe(mk(1234))
    expect(mk(1234)).not.toBe(mk(1235))
  })

  it('snapshot → restore continues exactly where it stopped', () => {
    const b = makeBoard('DPP-PSD')
    const s = { detectors: 'bgo' as const, source: 'cs137' as const, activity_Bq: 5e4 }
    const a = engine(77, s, b)
    run(a, 2)
    const snap = JSON.parse(JSON.stringify(a.snapshot()))
    for (let i = 0; i < 20; i++) a.tick({ t_s: 2 + i * 0.05, dt_s: 0.05, beamCurrent_uA: 0 })
    const c = createPhysics(77)
    c.configure(scenario(s), b)
    c.restore(snap)
    for (let i = 0; i < 20; i++) c.tick({ t_s: 2 + i * 0.05, dt_s: 0.05, beamCurrent_uA: 0 })
    expect(digest(c)).toBe(digest(a))
    expect(Buffer.from(c.psd(0)!.buffer).equals(Buffer.from(a.psd(0)!.buffer))).toBe(true)
    expect(JSON.stringify(snap).length).toBeLessThan(200e3)
  })

  it('refuses what it does not model, and a DPP that does not match the detector', () => {
    const e = createPhysics(1)
    expect(() => e.configure(scenario({ detectors: 'bgo' }), makeBoard('DPP-PHA'))).toThrow()
    expect(() => e.configure(scenario({ detectors: 'ej309', source: 'ambe' }), makeBoard('DPP-PSD'))).toThrow(/AmBe/)
  })

  it('calibration(ch) maps bins to keV; fwhmProbe returns null without a peak', () => {
    const b = makeBoard('DPP-PHA')
    const e = engine(5, { detectors: 'hpge', source: 'cs137', activity_Bq: 1e3 }, b)
    const [off, slope] = e.calibration(0)
    expect(off).toBe(0)
    expect(30000 * slope).toBeGreaterThan(2600)
    expect(30000 * slope).toBeLessThan(2800)
    expect(e.fwhmProbe(0, 661.657)).toBeNull()
  })
})
