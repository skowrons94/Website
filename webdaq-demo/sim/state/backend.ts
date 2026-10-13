/**
 * The simulated backend as one object: the DAQ state machine plus the router.
 * The worker (worker.ts) wraps it in postMessage; the contract tests use it directly.
 */
import { Daq, type DaqOptions } from './daq'
import { buildRouter, LAZY_FAMILIES } from '../../shim/handlers'
import type { Req, Res, Router } from '../../shim/router'
import { loadPhysicsData, type Scenario, type DetectorKind } from '../physics/api'

export interface BackendResponse extends Res {
  /** True when no mock route matched (recorded as an unmocked request). */
  miss?: boolean
}

export type ControlCommand =
  | { type: 'scenario'; scenario: Partial<Scenario> }
  | { type: 'fault'; board_fail_at_s?: number | null; stall_at_s?: number | null }
  | { type: 'state' }
  | { type: 'fwhm'; channel: number; energy_keV: number }
  | { type: 'snapshot' }

export class Backend {
  readonly daq: Daq
  readonly router: Router
  misses: { method: string; path: string }[] = []

  constructor(opts: DaqOptions) {
    this.daq = new Daq(opts)
    this.router = buildRouter(this.daq)
  }

  private loaded = new Set<number>()

  /** Register the lazily loaded handler families a path needs (all of them with no path). */
  async ensureFamilies(path?: string): Promise<void> {
    for (let i = 0; i < LAZY_FAMILIES.length; i++) {
      if (this.loaded.has(i) || (path !== undefined && !LAZY_FAMILIES[i].prefix.test(path))) continue
      const m = await LAZY_FAMILIES[i].load()
      if (this.loaded.has(i)) continue
      m.default(this.router, this.daq)
      this.loaded.add(i)
    }
  }

  async handle(req: Req): Promise<BackendResponse> {
    await this.ensureFamilies(req.path)
    return this.handleSync(req)
  }

  /** Handle a request whose handler family is already registered (tests: after ensureFamilies()). */
  handleSync(req: Req): BackendResponse {
    this.daq.advance()
    const m = this.router.match(req.method, req.path)
    if (!m.ok) {
      this.misses.push({ method: req.method, path: req.path })
      if (m.status === 405) return { status: 405, data: { message: 'The method is not allowed for the requested URL.' }, headers: { allow: (m.allow ?? []).join(', ') }, miss: true }
      return { status: 404, data: { message: 'Not Found' }, miss: true }
    }
    try {
      return m.rule.handler(req, m.params)
    } catch (e) {
      // An exception in a handler is a 500, as Flask would answer; the message helps debugging.
      return { status: 500, data: { message: 'Internal Server Error', error: String((e as Error)?.message ?? e) } }
    }
  }

  /**
   * Create a backend once the physics data of the detector kinds it needs are loaded
   * (lines.json and tables/<kind>.json are separate chunks).
   */
  static async create(opts: DaqOptions, snapshot?: { scenario?: Partial<Scenario> } | null): Promise<Backend> {
    const kinds = new Set<DetectorKind>([opts.scenario?.detectors ?? 'hpge', snapshot?.scenario?.detectors ?? 'hpge'])
    for (const k of kinds) await loadPhysicsData(k)
    const b = new Backend(opts)
    if (snapshot) b.daq.restore(snapshot)
    return b
  }

  /** Demo-shell commands that are not part of the WebDAQ API. */
  async control(cmd: ControlCommand): Promise<unknown> {
    const d = this.daq
    d.advance()
    switch (cmd.type) {
      case 'scenario':
        if (cmd.scenario.detectors) {
          try { await loadPhysicsData(cmd.scenario.detectors) } catch (e) { return { ok: false, message: `Could not load the detector data: ${String((e as Error)?.message ?? e)}` } }
        }
        return d.setScenario(cmd.scenario)
      case 'fault':
        if (cmd.board_fail_at_s !== undefined) d.faults.board_fail_at_s = cmd.board_fail_at_s
        if (cmd.stall_at_s !== undefined) d.faults.stall_at_s = cmd.stall_at_s
        return { ok: true }
      case 'fwhm': return d.physics.fwhmProbe(cmd.channel, cmd.energy_keV)
      case 'snapshot': return d.snapshot()
      case 'state':
      default: return this.summary()
    }
  }

  /** What the shell and the tour need to know, cheaply. */
  summary() {
    const d = this.daq
    return {
      seed: d.seed, simT: d.simT, scenario: d.scenario, running: d.running, runNumber: d.runNumber, save: d.save,
      boards: d.boards.map(b => ({ id: b.id, name: b.name, dpp: b.dpp, waveforms: d.waveformsOn(b) })),
      runs: d.runs.map(r => ({ run_number: r.run_number, start_time: r.start_time, end_time: r.end_time, flag: r.flag })),
      rois: d.hist.histograms.reduce((n, h) => n + h.rois.length, 0),
      unseenEvents: d.events.filter(e => !e.seen).length,
    }
  }
}
