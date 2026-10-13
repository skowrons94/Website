/**
 * The simulated DAQ through its HTTP surface, with a fake clock: board scan and
 * add, run start/stop with WebDAQ's refusals, run numbers, metadata, registers,
 * spectra, ROIs, snapshots and determinism.
 */
import { describe, expect, it } from 'vitest'
import { Backend } from '../../sim/state/backend'

function make(seed = 7, scenario = {}) {
  let t = 1_700_000_000_000
  const clock = { now: () => t }
  const advance = (s: number) => { t += s * 1000 }
  return Backend.create({ seed, clock, scenario }).then(b => {
    const call = async (method: string, path: string, body: unknown = null, query: Record<string, string> = {}) =>
      b.handle({ method, path, query, body })
    return { b, call, advance }
  })
}

async function withBoard(seed = 7, scenario = {}) {
  const x = await make(seed, scenario)
  const s = await x.call('POST', '/digitizer/scan', { optical: { enabled: true, links: 1, nodes: 2 } })
  expect(s.status).toBe(202)
  x.advance(1)
  const st = await x.call('GET', '/digitizer/scan')
  const found = (st.data as any).found
  expect(found).toHaveLength(1)
  expect(found[0]).toMatchObject({ model: 'V1730', link_type: 'Optical', link_num: '0', id: 0 })
  const add = await x.call('POST', '/experiment/add_board', { id: '0', vme: found[0].vme, link_type: 'Optical', link_num: '0', dpp: found[0].dpp })
  expect(add.status).toBe(200)
  return x
}

describe('simulated DAQ', () => {
  it('scan finds the simulated V1730 only where it is plugged in', async () => {
    const { call, advance } = await make()
    expect((await call('POST', '/digitizer/scan', {})).status).toBe(400)
    await call('POST', '/digitizer/scan', { usb: { enabled: true, links: 2 } })
    advance(1)
    expect((await call('GET', '/digitizer/scan')).data).toMatchObject({ status: 'done', found: [] })
    expect((await call('POST', '/experiment/add_board', { id: '0', vme: '0', link_type: 'USB', link_num: '0', dpp: 'DPP-PHA' })).status).toBe(404)
  })

  it('a board: registers, online writes, refusals', async () => {
    const { call } = await withBoard()
    const boards = (await call('GET', '/experiment/get_board_configuration')).data as any[]
    expect(boards).toEqual([{ id: 0, name: 'V1730', vme: '0', link_type: 'Optical', link_num: '0', dpp: 'DPP-PHA', chan: 16 }])
    expect((await call('POST', '/experiment/add_board', { id: '0', vme: '0', link_type: 'Optical', link_num: '0', dpp: 'DPP-PHA' })).status).toBe(409)
    const regs = (await call('GET', '/digitizer/0/registers')).data as any
    expect(regs.reg_1068).toMatchObject({ name: 'Decay Time', value_dec: 500, address: '0x1068', channel: 0 })
    expect(regs.reg_1168.channel).toBe(1)
    const w = await call('POST', '/digitizer/0/setting/reg_1068', { value: 6250, online: true })
    expect(w.data).toMatchObject({ saved: true, written: true, via: 'probe', value: '0x186a' })
    const r = await call('POST', '/digitizer/0/setting/reg_1020', { value: 1000, online: true })
    expect(r.data).toMatchObject({ saved: true, written: false })
    expect((r.data as any).reason).toMatch(/Record Length defines how the readout is organised/)
    expect((await call('GET', '/digitizer/0/online_registers')).data).toMatchObject({ dpp: 'DPP-PHA' })
    expect((await call('GET', '/digitizer/0/1068')).data).toBe(6250)
  })

  it('run start/stop, refusals, run numbers, metadata and spectra', async () => {
    const { b, call, advance } = await withBoard()
    expect((await call('GET', '/histograms/0/0')).data).toMatchObject({ fTitle: 'No data yet — start a run' })
    expect((await call('GET', '/experiment/get_run_number')).data).toBe(1)
    expect((await call('GET', '/experiment/check_run_directory')).data).toBe(false)
    expect((await call('POST', '/experiment/start_run')).status).toBe(200)
    expect((await call('POST', '/experiment/start_run')).data).toEqual({ message: 'DAQ is already running!' })
    expect((await call('POST', '/experiment/refresh_board_connections')).status).toBe(400)
    expect((await call('POST', '/digitizer/scan', { optical: { enabled: true } })).status).toBe(409)
    await call('POST', '/experiment/add_run_metadata', { run_number: 1, target_name: 'TiN', terminal_voltage: 300, probe_voltage: 0, run_type: 'calibration' })
    advance(5)
    const h = (await call('GET', '/histograms/0/0')).data as any
    expect(h._typename).toBe('TH1F')
    expect(h.fTitle).toMatch(/^SIMULATED — HPGe A/)
    expect(h.fXaxis.fNbins).toBe(32768)
    expect(h.fEntries).toBeGreaterThan(0)
    const stats = (await call('GET', '/experiment/stats')).data as any[]
    expect(stats[0].channels[0].event_rate).toBeGreaterThan(0)
    expect((await call('GET', '/experiment/board_diagnostics')).data).toMatchObject({ running: true })
    expect((await call('POST', '/experiment/stop_run')).status).toBe(200)
    expect((await call('GET', '/experiment/get_run_number')).data).toBe(2)
    const meta = (await call('GET', '/experiment/get_run_metadata/1')).data as any
    expect(meta).toMatchObject({ run_number: 1, target_name: 'TiN', run_type: 'calibration', flag: 'unknown' })
    expect(meta.end_time).toBeTruthy()
    expect(meta.board_info[0]).toMatchObject({ model_name: 'V1730 (simulated)', license: 'simulated' })
    expect(meta.software_versions).toMatchObject({ acquisition_mode: 'demo', caendaq: null })
    const detail = (await call('GET', '/data/runs/1')).data as any
    expect(detail.files.data[0].name).toBe('run_1_0000.sim.caendat')
    // Without saving, the run number stays.
    await call('POST', '/experiment/set_save_data', { value: false })
    await call('POST', '/experiment/start_run'); advance(1); await call('POST', '/experiment/stop_run')
    expect((await call('GET', '/experiment/get_run_number')).data).toBe(2)
    expect(b.misses).toEqual([])
  })

  it('ROIs integrate the live spectrum; the run keeps them as roi.json', async () => {
    const { b, call, advance } = await withBoard()
    const cfg = (await call('GET', '/histograms/config')).data as any
    expect(cfg.histograms).toHaveLength(2)
    const roi = await call('POST', `/histograms/config/histograms/${cfg.histograms[0].id}/rois`, { name: 'all', low: 0, high: 10000 })
    expect(roi.status).toBe(201)
    await call('POST', '/experiment/start_run'); advance(5)
    const res = ((await call('GET', '/histograms/roi_integrals')).data as any).results
    expect(res[0].gross).toBeGreaterThan(0)
    expect(res[0].net).toBe(res[0].gross)
    await call('POST', '/experiment/stop_run')
    expect(b.daq.runs[0].demo.roi).toMatchObject({ run_number: 1, histograms: [{ rois: [{ name: 'all' }] }] })
  })

  it('the same seed and the same actions give the same spectrum; snapshots restore', async () => {
    const run = async () => {
      const x = await withBoard(99)
      await x.call('POST', '/experiment/start_run'); x.advance(3)
      return x
    }
    const a = await run(), c = await run()
    const ha = (await a.call('GET', '/histograms/0/0')).data as any
    const hc = (await c.call('GET', '/histograms/0/0')).data as any
    expect(Array.from(ha.fArray)).toEqual(Array.from(hc.fArray))
    const snap = JSON.parse(JSON.stringify(a.b.daq.snapshot()))
    const restored = await Backend.create({ seed: 99, clock: { now: () => 1_700_000_000_000 + 3000 } }, snap)
    expect(restored.daq.running).toBe(true)
    expect(restored.daq.boards).toHaveLength(1)
    expect(JSON.stringify(snap).length).toBeLessThan(1_000_000)
  })

  it('scenario: the detector picks the firmware; neutron and in-beam starting points', async () => {
    const { b, call } = await withBoard(3)
    const r = await b.control({ type: 'scenario', scenario: { detectors: 'bgo' } }) as any
    expect(r.ok).toBe(true)
    const boards = (await call('GET', '/experiment/get_board_configuration')).data as any[]
    expect(boards[0].dpp).toBe('DPP-PSD')
    const regs = (await call('GET', '/digitizer/0/registers')).data as any
    expect((regs.reg_1080.value_dec >>> 16) & 1).toBe(1)
    const he3 = await b.control({ type: 'scenario', scenario: { detectors: 'he3', source: 'cf252', distance_cm: 30 } }) as any
    expect(he3.ok).toBe(true)
    expect(((await call('GET', '/digitizer/0/registers')).data as any).reg_1058.value_dec).toBe(2000)
    expect(b.daq.scenario.distance_cm).toBe(30)
    const ambe = await b.control({ type: 'scenario', scenario: { detectors: 'ej309', source: 'ambe' } }) as any
    expect(ambe.ok).toBe(false)
    expect(b.daq.scenario.detectors).toBe('he3')
    await b.control({ type: 'scenario', scenario: { detectors: 'hpge', source: 'n14pg' } })
    const pha = ((await call('GET', '/digitizer/0/registers')).data as any)
    expect(pha.reg_1080.value_dec & 0x3f).toBe(6)
    expect(pha.reg_1098.value_dec).toBe(0x1999)
  })

  it('the two Next route handlers answer through the fetch shim path', async () => {
    const { call } = await make()
    expect((await call('GET', '/api/server-control')).data).toEqual({ running: true, currentDirectory: 'in-browser demo', testMode: true })
    expect((await call('POST', '/api/cache', { type: 'wave-config', data: { selectedWaveform: { a: 1 } } })).status).toBe(200)
    expect((await call('GET', '/api/cache', null, { type: 'wave-config' })).data).toEqual({ success: true, data: { selectedWaveform: { a: 1 } } })
    expect((await call('GET', '/api/cache', null, { type: 'rois' })).status).toBe(410)
  })

  it('a failed board stops sending data and rings the bell; a stalled one too', async () => {
    const { b, call, advance } = await withBoard()
    await call('POST', '/experiment/start_run')
    await b.control({ type: 'fault', board_fail_at_s: 3 })
    for (let i = 0; i < 6; i++) { advance(1); await call('GET', '/experiment/get_run_status') }
    const ev1 = b.daq.runEvents[0]
    for (let i = 0; i < 5; i++) { advance(1); await call('GET', '/experiment/get_run_status') }
    expect(b.daq.runEvents[0]).toBe(ev1)                  // nothing after the FAIL flag
    const events = (await call('GET', '/notifications/events')).data as any
    const list = Array.isArray(events) ? events : events.events
    expect(list.some((e: any) => e.rule_type === 'board_failure')).toBe(true)
    await call('POST', '/experiment/stop_run')
    // a stall: no FAIL flag, no data, an alert after the rule's 20 s
    await call('POST', '/experiment/start_run')
    await b.control({ type: 'fault', stall_at_s: 2 })
    for (let i = 0; i < 30; i++) { advance(1); await call('GET', '/experiment/get_run_status') }
    const ev2 = (await call('GET', '/notifications/events')).data as any
    expect((Array.isArray(ev2) ? ev2 : ev2.events).some((e: any) => e.rule_type === 'stalled_buffers')).toBe(true)
  })
})
