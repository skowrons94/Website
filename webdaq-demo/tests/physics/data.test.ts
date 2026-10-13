/**
 * Line data provenance, sizes (design §6.4) and the ROOT JSON serialisers (§1.6).
 */
import { describe, expect, it } from 'vitest'
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { emptyTH1F, th1f, th2f, waveformTH1F, PSD_XBINS, PSD_YBINS } from '../../sim/physics/api'
import { LINES } from './helpers'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const META = new Set(['schema', 'generator', 'notice', 'sources'])

/** Every block, nuclide and value object must name a source listed in `sources`. */
function provenanceProblems(L: any): string[] {
  const missing: string[] = []
  const check = (o: any, path: string, inherited: boolean) => {
    if (Array.isArray(o) || o === null || typeof o !== 'object') return
    const own = 'src' in o
    if (own && !(o.src in L.sources)) missing.push(`${path}: unknown source '${o.src}'`)
    const hasValues = Object.values(o).some((x) => typeof x === 'number' || (Array.isArray(x) && x.length > 0))
    if ('v' in o && !own) missing.push(`${path}: value without src`)
    else if (hasValues && !own && !inherited) missing.push(`${path}: numbers without src`)
    for (const [k, x] of Object.entries(o)) check(x, `${path}.${k}`, own || inherited)
  }
  for (const [k, block] of Object.entries<any>(L)) {
    if (META.has(k)) continue
    if (k === 'nuclides') {
      for (const [n, nuc] of Object.entries<any>(block)) {
        if (!nuc.src) missing.push(`nuclides.${n}: no src`)
        check(nuc, `nuclides.${n}`, false)
      }
      continue
    }
    if (!block || typeof block !== 'object' || !block.src) missing.push(`${k}: block without src`)
    check(block, k, false)
  }
  return missing
}

describe('lines.json: every value has a source', () => {
  it('every source has a reference', () => {
    for (const [k, v] of Object.entries<any>(LINES.sources)) {
      expect(typeof v.ref, k).toBe('string')
      expect(v.ref.length, k).toBeGreaterThan(10)
    }
  })

  it('every data block, every nuclide and every value object names a known source', () => {
    expect(provenanceProblems(LINES)).toEqual([])
  })

  it('refuses values without a source', () => {
    const bad = structuredClone(LINES)
    bad.n14pg.new_value = { v: 42 }
    delete bad.nuclides.Co60.src
    bad.background.continuum.src = 'nowhere'
    bad.extra_block = { x: 1 }
    const p = provenanceProblems(bad)
    expect(p.some((x) => x.startsWith('n14pg.new_value'))).toBe(true)
    expect(p.some((x) => x.startsWith('nuclides.Co60'))).toBe(true)
    expect(p.some((x) => x.includes("unknown source 'nowhere'"))).toBe(true)
    expect(p.some((x) => x.startsWith('extra_block'))).toBe(true)
  })

  it('holds the design §3.3 lines (ENSDF)', () => {
    const has = (nuc: string, E: number, I: number, tolI = 0.02) => {
      const l = LINES.nuclides[nuc].lines.find((x: number[]) => Math.abs(x[0] - E) < 0.5)
      expect(l, `${nuc} ${E}`).toBeTruthy()
      expect(Math.abs(l[1] - I) / I, `${nuc} ${E} intensity`).toBeLessThan(tolI)
    }
    has('Co60', 1173.228, 0.9985); has('Co60', 1332.492, 0.999826)
    has('Cs137', 661.657, 0.851); has('K40', 1460.82, 0.1066)
    has('Bi214', 609.31, 0.455, 0.05); has('Bi214', 1764.49, 0.153, 0.05)
    has('Pb214', 351.93, 0.356, 0.05); has('Tl208', 2614.51, 0.9975)
    has('Ac228', 911.2, 0.258, 0.05)
    expect(LINES.n14pg.levels_keV.v).toContain(6792)
  })
})

describe('sizes (design §6.4)', () => {
  const gz = (f: string) => gzipSync(readFileSync(join(ROOT, f)), { level: 9 }).length
  it('response table + line data ≤ 60 kB gz per detector type', () => {
    const lines = gz('sim/data/lines.json')
    for (const k of ['hpge', 'bgo', 'ej309']) {
      const total = gz(`tables/${k}.json`) + lines
      console.log(`tables/${k}.json + lines.json: ${(total / 1024).toFixed(1)} kB gz`)
      expect(total).toBeLessThanOrEqual(60 * 1024)
    }
  })

  it('physics part of the worker ≤ 40 kB gz (data chunks excluded)', async () => {
    const r = await build({
      entryPoints: [join(ROOT, 'sim/physics/api.ts')],
      bundle: true, minify: true, format: 'esm', write: false, platform: 'browser',
      external: ['*.json'], logLevel: 'silent',
    })
    const js = r.outputFiles[0].contents
    const size = gzipSync(js, { level: 9 }).length
    console.log(`physics bundle: ${(js.length / 1024).toFixed(1)} kB raw, ${(size / 1024).toFixed(1)} kB gz`)
    expect(size).toBeLessThanOrEqual(40 * 1024)
  })
})

describe('ROOT JSON serialisers (spy.py, TBufferJSON)', () => {
  it('TH1F: under/overflow, entries, rebin keeps the axis of the kept bins', () => {
    const a = new Uint32Array(32768)
    a[0] = 1; a[100] = 5; a[32767] = 2
    const h: any = th1f(a, { name: 'energy_b0_ch0', title: 't', rebin: 16 })
    expect(h._typename).toBe('TH1F')
    expect(h.fArray.length).toBe(2048 + 2)
    expect(h.fArray[1]).toBe(1)
    expect(h.fArray[1 + Math.floor(100 / 16)]).toBe(5)
    expect(h.fEntries).toBe(8)
    expect(h.fXaxis.fNbins).toBe(2048)
    expect(h.fXaxis.fXmax).toBe(32768)
    expect(h.fBits & 512).toBe(512) // SetStats(0)
    const h3: any = th1f(new Uint32Array(100), { name: 'x', title: 'x', rebin: 3, xmin: 0, xmax: 100 })
    expect(h3.fXaxis.fNbins).toBe(33)
    expect(h3.fXaxis.fXmax).toBeCloseTo(99)
  })

  it('empty TH1F has 100 bins and says why', () => {
    const h: any = emptyTH1F('No data yet — start a run')
    expect(h.fXaxis.fNbins).toBe(100)
    expect(h.fTitle).toBe('No data yet — start a run')
    expect(h.fEntries).toBe(0)
  })

  it('TH2F: PSD 2048×256 → RebinX(16) = 128×256, ix fastest with under/overflow', () => {
    const p = new Uint32Array(PSD_XBINS * PSD_YBINS)
    p[10 * PSD_XBINS + 33] = 7 // iy = 10, ix = 33 → rebinned ix = 2
    const h: any = th2f(p, PSD_XBINS, PSD_YBINS, { name: 'psd', title: 'psd', xmin: 0, xmax: 65536, ymin: 0, ymax: 1, rebinX: 16 })
    expect(h.fXaxis.fNbins).toBe(128)
    expect(h.fYaxis.fNbins).toBe(256)
    expect(h.fArray.length).toBe(130 * 258)
    expect(h.fArray[(10 + 1) * 130 + (2 + 1)]).toBe(7)
    expect(h.fEntries).toBe(7)
  })

  it('waveform TH1F has one bin per sample', () => {
    const h: any = waveformTH1F(new Int16Array(4000).fill(100), { name: 'w', title: 'w' })
    expect(h.fXaxis.fNbins).toBe(4000)
    expect(h.fArray[1]).toBe(100)
  })
})
