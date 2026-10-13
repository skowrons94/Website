/**
 * The simulated backend as one object: the DAQ state machine plus the router.
 * The worker (worker.ts) wraps it in postMessage; the contract tests use it directly.
 */
import { Daq, type DaqOptions } from './daq'
import { buildRouter } from '../../shim/handlers'
import type { Req, Res, Router } from '../../shim/router'
import type { Scenario } from '../physics/api'

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

  handle(req: Req): BackendResponse {
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

  /** Demo-shell commands that are not part of the WebDAQ API. */
  control(cmd: ControlCommand): unknown {
    const d = this.daq
    d.advance()
    switch (cmd.type) {
      case 'scenario': return d.setScenario(cmd.scenario)
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
