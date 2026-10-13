/**
 * The PSD 2-D histogram's x axis is Q_long, binned 2048 over 0…65536: with a
 * calibration it must cover the same keV range as the 1-D Q_long spectrum, so a
 * peak sits at the same energy in both (Daq.psd; it used slope·2048 instead).
 */
import { describe, expect, it } from 'vitest'
import { Backend } from '../../sim/state/backend'
import { QLONG_MAX } from '../../sim/physics/api'

describe('PSD 2-D x axis', () => {
  it('is calibrated over the Q_long range, like the 1-D spectrum', async () => {
    let t = 1_700_000_000_000
    const b = await Backend.create({ seed: 9, clock: { now: () => t }, scenario: { detectors: 'bgo', source: 'cs137', activity_Bq: 2e5, distance_cm: 5 } })
    const call = async (method: string, path: string, body: unknown = null) => (await b.handle({ method, path, query: {}, body })).data as any
    await call('POST', '/digitizer/scan', { optical: { enabled: true, links: 1, nodes: 1 } }); t += 1000
    await call('POST', '/experiment/add_board', { id: '0', vme: '0', link_type: 'Optical', link_num: '0', dpp: 'DPP-PSD' })
    await call('POST', '/experiment/start_run')
    t += 10_000; await call('GET', '/experiment/get_run_status')
    const [off, slope] = b.daq.calibration(b.daq.boards[0], 0)
    expect(slope).not.toBe(1)                                  // the board was added with its calibration
    const h1 = await call('GET', '/histograms/0/0'), h2 = await call('GET', '/psd/0/0')
    expect(h2.fXaxis.fXmin).toBeCloseTo(h1.fXaxis.fXmin, 6)
    expect(h2.fXaxis.fXmax).toBeCloseTo(h1.fXaxis.fXmax, 6)
    expect(h2.fXaxis.fXmax).toBeCloseTo(off + slope * QLONG_MAX, 6)
    // the mean energy of the events agrees between the two (to a 2-D bin)
    const mean1 = (() => {
      const n = h1.fXaxis.fNbins, w = (h1.fXaxis.fXmax - h1.fXaxis.fXmin) / n
      let s = 0, m = 0
      for (let i = 1; i <= n; i++) { s += h1.fArray[i]; m += h1.fArray[i] * (h1.fXaxis.fXmin + (i - 0.5) * w) }
      return m / s
    })()
    const mean2 = (() => {
      const nx = h2.fXaxis.fNbins, ny = h2.fYaxis.fNbins, w = (h2.fXaxis.fXmax - h2.fXaxis.fXmin) / nx
      let s = 0, m = 0
      for (let iy = 1; iy <= ny; iy++) for (let ix = 1; ix <= nx; ix++) {
        const v = h2.fArray[iy * (nx + 2) + ix]
        s += v; m += v * (h2.fXaxis.fXmin + (ix - 0.5) * w)
      }
      return m / s
    })()
    const bin2 = (h2.fXaxis.fXmax - h2.fXaxis.fXmin) / h2.fXaxis.fNbins
    console.log(`Q_long mean: ${mean1.toFixed(1)} keV (1-D), ${mean2.toFixed(1)} keV (2-D, bin ${bin2.toFixed(1)} keV)`)
    expect(Math.abs(mean2 - mean1)).toBeLessThan(bin2)
  })
})
