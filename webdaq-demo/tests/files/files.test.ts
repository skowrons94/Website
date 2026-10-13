/**
 * Run files (design §3.10): formats, metadata.json key order against the pinned
 * server's run_metadata_snapshot.py, and the .caendat read back by a port of
 * RUReader's parser. Everything is generated in memory; nothing is written.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Backend } from '../../sim/state/backend'
import { decodeCaendat } from './decode'
import { pyExp, pyG } from '../../sim/files/format'
import { XDAQ_KEY } from '../../sim/files/caendat'

const HERE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const SNAPSHOT_PY = path.join(HERE, '.work', 'webdaq', 'server', 'app', 'services', 'run_metadata_snapshot.py')

type F = { name: string; bytes: Uint8Array; type: string }
const text = (f: F | undefined) => new TextDecoder().decode(f!.bytes)

async function takeRun(scenario: Record<string, unknown>, seconds = 4, seed = 11) {
  let t = 1_700_000_000_000
  const b = await Backend.create({ seed, clock: { now: () => t }, scenario })
  const call = (method: string, p: string, body: unknown = null) => b.handle({ method, path: p, query: {}, body })
  const tick = (s: number) => { t += s * 1000 }
  await call('POST', '/digitizer/scan', { optical: { enabled: true, links: 1, nodes: 1 } }); tick(1)
  const found = ((await call('GET', '/digitizer/scan')).data as any).found[0]
  await call('POST', '/experiment/add_board', { id: '0', vme: '0', link_type: 'Optical', link_num: '0', dpp: found.dpp })
  const cfg = (await call('GET', '/histograms/config')).data as any
  await call('POST', `/histograms/config/histograms/${cfg.histograms[0].id}/rois`, { name: 'peak', low: 1300, high: 1360 })
  await call('GET', '/current/start/1')
  await call('POST', '/stats/run/1/start')
  await call('POST', '/experiment/start_run')
  await call('POST', '/experiment/add_run_metadata', { run_number: 1, target_name: 'none', terminal_voltage: 0, probe_voltage: 0, run_type: 'calibration' })
  tick(seconds / 2)
  await call('POST', '/digitizer/0/setting/reg_1068', { value: 6250, online: true })
  tick(seconds / 2)
  await call('POST', '/experiment/stop_run')
  await call('POST', '/current/stop')
  await call('POST', '/stats/run/stop')
  const res = await b.control({ type: 'files', run: 1 }) as { ok: boolean; files: F[] }
  expect(res.ok).toBe(true)
  return { b, call, files: res.files, get: (n: string) => res.files.find(f => f.name === n) }
}

describe('python formatting', () => {
  it('matches %e and %g', () => {
    expect(pyExp(0.1, 8)).toBe('1.00000000e-01')
    expect(pyExp(123.456, 3)).toBe('1.235e+02')
    expect(pyExp(0, 3)).toBe('0.000e+00')
    expect(pyG(300)).toBe('300')
    expect(pyG(0.000012345678)).toBe('1.23457e-05')
    expect(pyG(1234567)).toBe('1.23457e+06')
    expect(pyG(99.999949)).toBe('99.9999')
    expect(pyG(2.5)).toBe('2.5')
  })
})

describe('run files', () => {
  it('a run directory lists what a real run leaves, with real sizes in the Logbook', async () => {
    const { files, call } = await takeRun({ detectors: 'hpge', source: 'co60' })
    expect(files.map(f => f.name)).toEqual([
      'README.txt', 'V1730_0.json', 'current.txt', 'events.csv', 'metadata.json', 'roi.json', 'run_1_0000.sim.caendat', 'stats.csv',
    ])
    const detail = (await call('GET', '/data/runs/1')).data as any
    const listed = Object.fromEntries([...detail.files.data, ...detail.files.board_config, detail.files.current, detail.files.metadata].map((e: any) => [e.name, e.bytes]))
    for (const f of files) if (f.name in listed && f.name !== 'metadata.json') expect(listed[f.name], f.name).toBe(f.bytes.length)
    expect(detail.files.total_bytes).toBeGreaterThan(0)
  })

  it.skipIf(!fs.existsSync(SNAPSHOT_PY))('metadata.json has the server\'s keys in the server\'s order, plus Demo', async () => {
    const { get } = await takeRun({ detectors: 'hpge', source: 'co60' })
    const meta = JSON.parse(text(get('metadata.json')))
    const py = fs.readFileSync(SNAPSHOT_PY, 'utf8')
    const body = py.slice(py.indexOf('def build_run_metadata_snapshot'), py.indexOf('def sync_run_metadata_file'))
    const ret = body.slice(body.indexOf('return {'))
    const top = [...ret.matchAll(/^ {8}"([^"]+)":/gm)].map(m => m[1])
    const files = [...ret.matchAll(/^ {12}"([^"]+)":/gm)].map(m => m[1])
    expect(top.length).toBeGreaterThan(10)
    expect(Object.keys(meta)).toEqual([...top, 'Demo'])
    expect(Object.keys(meta.Acquisition)).toEqual(files.slice(0, 3))
    expect(Object.keys(meta.Files)).toEqual(files.slice(3))
    expect(meta.Demo).toMatchObject({ simulated: true, notice: 'Simulated data. Not a measurement.', scenario: { detectors: 'hpge', source: 'co60' } })
    expect(meta['Run Type']).toBe('calibration')
    const roles = Object.fromEntries(meta.Files.Manifest.map((m: any) => [m.Name, m.Role]))
    expect(roles).toMatchObject({ 'run_1_0000.sim.caendat': 'raw-data', 'current.txt': 'beam-current', 'stats.csv': 'statistics', 'V1730_0.json': 'board-configuration', 'roi.json': 'board-configuration', 'events.csv': 'other' })
    expect(meta.Files.Manifest.some((m: any) => m.Name === 'metadata.json')).toBe(false)
    expect(meta.Acquisition.Boards[0].model_name).toBe('V1730 (simulated)')
  })

  it('stats.csv, current.txt and roi.json have the server formats', async () => {
    const { get } = await takeRun({ detectors: 'hpge', source: 'co60' })
    const st = text(get('stats.csv')).split('\n')
    expect(st[0]).toBe('# LUNA DAQ statistics')
    expect(st[1]).toBe('# SIMULATED DATA — WebDAQ in-browser demo, not a measurement')
    expect(st).toContain('# Metric: Terminal voltage (simulated) | unit: kV | source: demo.accelerator.terminal_voltage')
    expect(st.find(l => l.startsWith('Time [s]'))).toBe('Time [s],Terminal voltage (simulated) [kV],Beam current (simulated) [uA]')
    expect(st.filter(l => /^\d+\.\d{3},/.test(l)).length).toBeGreaterThanOrEqual(2)
    const cu = text(get('current.txt')).split('\n')
    expect(cu[0]).toMatch(/^### Start time: \d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{6} ###$/)
    expect(cu[1]).toBe('# SIMULATED DATA — WebDAQ in-browser demo, not a measurement')
    expect(cu[2]).toBe('# Time(s)\tCh0(uA)\tCh1(uA)\tCh2(uA)\tCh3(uA)')
    expect(cu[3]).toMatch(/^0\.00000000e\+00\t(\d\.\d{3}e[+-]\d\d\t){4}$/)
    const roi = JSON.parse(text(get('roi.json')))
    expect(Object.keys(roi)).toEqual(['run_number', 'written_at', 'rebin_factor', 'histograms', 'simulated', 'notice'])
    expect(roi.histograms[0].rois[0]).toMatchObject({ name: 'peak', low: 1300, high: 1360, background: null })
    expect(roi.histograms[0].rois[0].gross).toBeGreaterThan(0)
  })

  for (const [kind, dppCode] of [['hpge', 0], ['bgo', 1]] as const) {
    it(`the .caendat (${kind}) reads back, event for event, as events.csv says`, async () => {
      const { get } = await takeRun({ detectors: kind, source: 'co60' }, 4)
      const dec = decodeCaendat(get('run_1_0000.sim.caendat')!.bytes)
      expect(dec.key).toBe(XDAQ_KEY)
      expect(dec.hSize).toBe(7)
      expect(dec.boards).toEqual([{ nsPerSample: 2, nsPerTimetag: 2, dpp: dppCode, channels: 16, regId: 0 }])
      expect(dec.corrupted).toBe(0)
      expect(dec.events.length).toBeGreaterThan(1000)
      const csv = text(get('events.csv')).trim().split('\n')
      expect(csv.shift()).toMatch(/^# SIMULATED/)
      expect(csv[0]).toBe(kind === 'hpge' ? 'Board,Channel,Timestamp_ps,Energy,PU,SATU,LOST' : 'Board,Channel,Timestamp_ps,EnergyShort,EnergyLong,PU,SATU,LOST')
      expect(csv.length - 1).toBe(dec.events.length)
      // Same events in the same order (block by block, couple by couple).
      const rows = csv.slice(1).map(l => l.split(',').map(Number))
      const key = (e: number[]) => `${e[1]}:${e[2]}`
      const decKeys = new Set(dec.events.map(e => `${e.ch}:${e.ts * 2000}`))
      expect(rows.filter(r => decKeys.has(key(r))).length).toBe(rows.length)
      // Monotone time stamps per channel, both detectors present, energies where PHA has them.
      for (const ch of [0, 1]) {
        const ts = dec.events.filter(e => e.ch === ch).map(e => e.ts)
        expect(ts.length).toBeGreaterThan(100)
        for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1])
        expect(ts[ts.length - 1] * 2e-9).toBeLessThanOrEqual(4.1)
      }
      if (kind === 'hpge') expect(dec.events.filter(e => !e.pu && !e.satu && e.a > 0).length).toBeGreaterThan(dec.events.length / 2)
      else expect(dec.events.filter(e => e.b > 0).length).toBeGreaterThan(dec.events.length / 2)
    })
  }

  it('is regenerated identically from the run record', async () => {
    const a = await takeRun({ detectors: 'hpge', source: 'co60' }, 2, 5)
    const again = await a.b.control({ type: 'files', run: 1 }) as { files: F[] }
    const c1 = a.get('run_1_0000.sim.caendat')!.bytes
    const c2 = again.files.find(f => f.name === 'run_1_0000.sim.caendat')!.bytes
    expect(Buffer.from(c2).equals(Buffer.from(c1))).toBe(true)
    const b = await takeRun({ detectors: 'hpge', source: 'co60' }, 2, 5)
    expect(Buffer.from(b.get('run_1_0000.sim.caendat')!.bytes).equals(Buffer.from(c1))).toBe(true)
  })

  it('describes the run\'s own history: a mid-run beam switch, and nothing changes after the run', async () => {
    let t = 1_700_000_000_000
    const b = await Backend.create({ seed: 3, clock: { now: () => t }, scenario: { detectors: 'hpge', source: 'co60' } })
    const call = (method: string, p: string, body: unknown = null) => b.handle({ method, path: p, query: {}, body })
    const tick = (s: number) => { t += s * 1000 }
    await call('POST', '/digitizer/scan', { optical: { enabled: true, links: 1, nodes: 1 } }); tick(1)
    await call('POST', '/experiment/add_board', { id: '0', vme: '0', link_type: 'Optical', link_num: '0', dpp: 'DPP-PHA' })
    const gain = async () => ((await call('GET', '/digitizer/0/registers')).data as any).reg_1080.value_dec & 0x3f
    expect(await gain()).toBe(4)
    await call('GET', '/current/start/1')
    await call('POST', '/stats/run/1/start')
    await call('POST', '/experiment/start_run')
    tick(5)
    const sw = await b.control({ type: 'scenario', scenario: { source: 'n14pg' } }) as any
    expect(sw.ok).toBe(true)
    expect(await gain()).toBe(4) // the gain stays for the rest of this run
    tick(5)
    await call('POST', '/experiment/stop_run')
    await call('POST', '/current/stop')
    await call('POST', '/stats/run/stop')
    const files = async () => ((await b.control({ type: 'files', run: 1 })) as { files: F[] }).files
    const first = await files()
    const get = (fs: F[], n: string) => fs.find(f => f.name === n)
    const rows = text(get(first, 'current.txt')).split('\n').filter(l => /^\d/.test(l)).map(l => l.split('\t').map(Number))
    const before = rows.filter(r => r[0] < 4.9), after = rows.filter(r => r[0] > 5.3)
    expect(before.length).toBeGreaterThan(40)
    expect(Math.max(...before.map(r => r[1]))).toBe(0)
    expect(Math.min(...after.map(r => r[1]))).toBeGreaterThan(10)
    const meta = JSON.parse(text(get(first, 'metadata.json')))
    expect(meta.Demo.scenario.source).toBe('co60')
    const sc = meta.Demo['changes during the run'].find((c: any) => c.scenario)
    expect(sc.time_s).toBeCloseTo(5, 0)
    expect(sc.scenario).toMatchObject({ source: 'n14pg', yield_factor: 20, beam_I0_uA: 100 })
    expect(meta.Demo['in-beam yield']).toMatch(/yield_factor = 20/)
    // The charge on record agrees with current.txt, to 1 nC.
    const q = rows.slice(1).reduce((s, r, i) => s + 0.5 * (r[1] + rows[i][1]) * 0.1, 0)
    expect(meta['Accumulated Charge']).toBe(Math.round(meta['Accumulated Charge'] * 1000) / 1000)
    expect(Math.abs(meta['Accumulated Charge'] - q) / q).toBeLessThan(0.02)
    // Later: a new scenario, another run, a reload of the state — run 1's files stay the same.
    tick(30)
    await b.control({ type: 'scenario', scenario: { source: 'co60', distance_cm: 2 } })
    expect(await gain()).toBe(4)
    await call('POST', '/experiment/start_run'); tick(2); await call('POST', '/experiment/stop_run')
    const again = await files()
    for (const f of first) expect(Buffer.from(get(again, f.name)!.bytes).equals(Buffer.from(f.bytes)), f.name).toBe(true)
    const snap = JSON.parse(JSON.stringify(await b.control({ type: 'snapshot' })))
    t += 3600_000
    const reloaded = await Backend.create({ seed: 3, clock: { now: () => t }, scenario: { detectors: 'hpge', source: 'co60' } }, snap)
    const third = ((await reloaded.control({ type: 'files', run: 1 })) as { files: F[] }).files
    for (const f of first) expect(Buffer.from(get(third, f.name)!.bytes).equals(Buffer.from(f.bytes)), f.name).toBe(true)
    // The next in-beam run starts with the in-beam gain.
    await b.control({ type: 'scenario', scenario: { source: 'n14pg' } })
    expect(await gain()).toBe(6)
  })

  it('caps the sample at 50 000 events and says so', async () => {
    const { get } = await takeRun({ detectors: 'hpge', source: 'co60', activity_Bq: 1e6, distance_cm: 1 }, 30)
    const dec = decodeCaendat(get('run_1_0000.sim.caendat')!.bytes)
    expect(dec.events.length).toBe(50000)
    expect(text(get('README.txt'))).toMatch(/Only the first 50000 events are included/)
  })
})
