/**
 * The API contract between the pinned WebDAQ and the simulated backend (design §2.4).
 *   (i)   every frontend call resolves to a mock handler;
 *   (ii)  every mock route mirrors a route of a registered Flask blueprint (or a Next
 *         route handler), and for every call the mock picks the same rule Flask would
 *         — converters and static-segment precedence included; calls that fail upstream
 *         (no route, wrong method) fail the same way here;
 *   (iii) handler shapes are typed with WebDAQ's own types: `npx tsc --noEmit`;
 *   plus the overlay drift check (pin.json hashes) and the committed api-surface.json.
 * Needs the pinned source in .work/webdaq (any build, or `node build.mjs --fetch-only`).
 * Writes nothing, except api-surface.json when WRITE_SURFACE=1 is set on purpose.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { Router } from '../../shim/router'
import { Backend } from '../../sim/state/backend'
import { extractSurface, flaskRoutes, NEXT_ROUTES, sampleRequest, surfaceHash, surfaceTable } from './surface'
import { overrideHash } from '../../build.mjs'

const HERE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const WEBDAQ = path.join(HERE, '.work', 'webdaq')
const pin = JSON.parse(fs.readFileSync(path.join(HERE, 'pin.json'), 'utf8'))
const have = fs.existsSync(path.join(WEBDAQ, '.complete'))

describe.skipIf(!have)('contract with WebDAQ ' + String(pin.commit).slice(0, 7), () => {
  let backend: Backend
  let flaskRouter: Router
  const flask = have ? flaskRoutes(path.join(WEBDAQ, 'server', 'app')) : []
  const calls = have ? extractSurface(path.join(WEBDAQ, pin.frontend, 'src')) : []
  const table = surfaceTable(calls)

  beforeAll(async () => {
    backend = await Backend.create({ seed: 1, clock: { now: () => 1_700_000_000_000 } })
    await backend.ensureFamilies()
    flaskRouter = new Router()
    for (const r of [...flask, ...NEXT_ROUTES]) flaskRouter.add(r.method, r.pattern, () => ({ status: 200, data: r.loc }))
  })

  it('the overlay still replaces what it was written against (pin.json overrides)', () => {
    for (const [rel, want] of Object.entries(pin.overrides as Record<string, string>)) {
      expect(overrideHash(path.join(WEBDAQ, pin.frontend), rel), rel).toBe(want)
    }
  })

  it('api-surface.json and pin.json describe the surface at the pin', () => {
    const file = path.join(HERE, 'api-surface.json')
    const body = { commit: pin.commit, hash: surfaceHash(table), calls: table }
    if (process.env.WRITE_SURFACE === '1') fs.writeFileSync(file, JSON.stringify(body, null, 1) + '\n')
    const committed = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(committed.calls).toEqual(table)
    expect(pin.apiSurfaceHash).toBe(body.hash)
  })

  it('finds the calls the design inventory lists', () => {
    expect(table.length).toBeGreaterThan(150)
    expect(table.some(c => c.template === '/digitizer/${id}/online_registers')).toBe(true)
    expect(table.some(c => c.via === 'grafana' && c.method === 'PUT')).toBe(true)
    expect(table.filter(c => c.via === 'fetch').length).toBeGreaterThanOrEqual(4)
  })

  it('(i) every frontend call has a mock handler, and the mock picks the rule Flask picks', () => {
    const problems: string[] = []
    for (const c of table) {
      const { path: p } = sampleRequest(c.template)
      const want = flaskRouter.match(c.method, p)
      const got = backend.router.match(c.method, p)
      const wantRule = want.ok ? `${want.rule.method} ${want.rule.pattern}` : `status ${want.status}`
      const gotRule = got.ok ? `${got.rule.method} ${got.rule.pattern}` : `status ${got.status}`
      if (wantRule !== gotRule) problems.push(`${c.method} ${c.template}: Flask → ${wantRule}, mock → ${gotRule}`)
    }
    expect(problems).toEqual([])
  })

  it('(ii) every mock route mirrors a registered Flask route or a Next route handler', () => {
    const upstream = new Set([...flask, ...NEXT_ROUTES].map(r => `${r.method} ${r.pattern}`))
    const orphans = backend.router.table().map(r => `${r.method} ${r.pattern}`).filter(k => !upstream.has(k))
    expect(orphans).toEqual([])
    const mocked = new Set(backend.router.table().map(r => `${r.method} ${r.pattern}`))
    // Not required, but reported: Flask routes the demo does not answer.
    const unmocked = [...upstream].filter(k => !mocked.has(k))
    expect(unmocked).toEqual([])
  })

  it('calls that fail upstream fail the same way in the mock', async () => {
    const cases: [string, string, number][] = [
      ['GET', '/histograms/rebin', 405],    // getRebinFactor: the server has POST only
      ['GET', '/qlong/0/0', 404],           // getQlong: no route
      ['GET', '/qshort/0/0', 404],          // getQshort: no route
      ['GET', '/faraday/open', 404],        // faraday blueprint is not registered
      ['GET', '/stats/not_a_metric', 404],  // getMetricData with a name the server lacks
    ]
    for (const [m, p, status] of cases) {
      const f = flaskRouter.match(m, p)
      expect(f.ok ? 200 : f.status, `${m} ${p} upstream`).toBe(status)
      const r = await backend.handle({ method: m, path: p, query: {}, body: null })
      expect(r.status, `${m} ${p} mock`).toBe(status)
    }
  })

  it('Werkzeug precedence: static segments beat converters', () => {
    const pick = (m: string, p: string) => { const x = backend.router.match(m, p); return x.ok ? x.rule.pattern : String(x.status) }
    expect(pick('GET', '/digitizer/0/registers')).toBe('/digitizer/<id>/registers')
    expect(pick('GET', '/digitizer/0/online_registers')).toBe('/digitizer/<id>/online_registers')
    expect(pick('GET', '/digitizer/0/reg_1060')).toBe('/digitizer/<id>/<setting>')
    expect(pick('GET', '/digitizer/scan')).toBe('/digitizer/scan')
    expect(pick('GET', '/digitizer/polarity/0/1')).toBe('/digitizer/polarity/<id>/<channel>')
    expect(pick('GET', '/histograms/config')).toBe('/histograms/config')
    expect(pick('GET', '/histograms/roi_integrals')).toBe('/histograms/roi_integrals')
    expect(pick('GET', '/histograms/0/1/10/20')).toBe('/histograms/<board_id>/<channel>/<int:roi_min>/<int:roi_max>')
    expect(pick('GET', '/histograms/0/1/a/b')).toBe('404')
    expect(pick('GET', '/stats/metric/demo.beam.current/last')).toBe('/stats/metric/<path:metric>/last')
    expect(pick('GET', '/stats/metric/demo.beam.current')).toBe('/stats/metric/<path:metric>')
    expect(pick('DELETE', '/stats/paths/a.b.c')).toBe('/stats/paths/<path:path>')
    expect(pick('GET', '/waveforms/1/0/0')).toBe('/waveforms/1/<board_id>/<channel>')
    expect(pick('GET', '/waveforms/wave1/0/0')).toBe('/waveforms/<waveform_type>/<board_id>/<channel>')
  })
})
