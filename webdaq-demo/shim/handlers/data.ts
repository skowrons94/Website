// routes/data.py: the Logbook's run pages (record, files, beam current, stats.csv, conversion).
import type { RunSummary, RunDetail, ConversionStatus } from '@webdaq/lib/api'
import { ok, fail, type Router } from '../router'
import type { Daq, RunRecord } from '../../sim/state/daq'
import { listFiles, readCurrent, readStats } from '../../sim/state/runfiles'
// The run-file writers register the real sizes; they ride in this lazy chunk.
import '../../sim/files'

const NO_RUREADER = 'RUReader is not available in the in-browser demo. Download the run\'s .caendat from Run files and convert it yourself: RUReader -i <run directory> -o run.root'

export function summary(d: Daq, r: RunRecord): RunSummary {
  const files = listFiles(d, r)
  let duration: number | null = null
  if (r.start_time && r.end_time) duration = Math.round((Date.parse(r.end_time) - Date.parse(r.start_time))) / 1000
  return {
    run_number: r.run_number, start_time: r.start_time, end_time: r.end_time, duration_s: duration,
    run_type: r.run_type, target_name: r.target_name, terminal_voltage: r.terminal_voltage,
    accumulated_charge: r.accumulated_charge, flag: r.flag, notes: r.notes, sync_mode: r.sync_mode,
    has_data: files.data.length > 0, has_current: files.current !== null, converted: files.root.length > 0,
    n_data_files: files.data.length, total_bytes: files.total_bytes, complete: r.end_time !== null,
  }
}

function conversion(d: Daq, r: RunRecord | undefined): ConversionStatus {
  return {
    state: 'idle', outputs: r ? listFiles(d, r).root.map(f => f.name) : [], converted: false, binary: null,
    capabilities: { ts_unit: false, compression: false, ignore_fail: false, header_boards: false, algo: false, buffer: false, wave: false, force_dual_trace: false, ignore_psd_boards: false, verbose: false },
  }
}

export default function data(r: Router, d: Daq) {
  const run = (n: string) => d.runs.find(x => x.run_number === Number(n))
  const maxPts = (q: Record<string, string>) => {
    const n = parseInt(q.max_points ?? '2000', 10)
    return Number.isFinite(n) ? Math.max(100, Math.min(20000, n)) : 2000
  }

  r.get('/data/runs', () => ok({
    runs: [...d.runs].sort((a, b) => b.run_number - a.run_number).map(x => summary(d, x)),
    rureader_available: false,
  }))
  r.get('/data/runs/<int:run_number>', (_q, p) => {
    const x = run(p.run_number)
    if (!x) return fail(404, { message: `Run ${p.run_number} not found` })
    const files = listFiles(d, x)
    const cfg = x.demo.config
    const detail: RunDetail = {
      ...summary(d, x), probe_voltage: x.probe_voltage, user_id: x.user_id,
      board_info: x.board_info as unknown as RunDetail['board_info'],
      software_versions: x.software_versions as RunDetail['software_versions'],
      files, directory: `data/run${x.run_number}`,
      board_configs: files.board_config.map(f => {
        if (cfg && f.name === `${cfg.dgtzs.BoardName}_${cfg.dgtzs.BoardNb}.json`) {
          return { file: f.name, board: { ...cfg.dgtzs }, n_registers: Object.keys(cfg.registers).length, registers: cfg.registers }
        }
        // roi.json also ends in .json, so run_data files it as a board configuration.
        return { file: f.name, board: {}, n_registers: 0, registers: {} }
      }),
    }
    return ok(detail)
  })
  r.get('/data/runs/<int:run_number>/current', (req, p) => {
    const x = run(p.run_number)
    if (!x) return fail(404, { message: `Run ${p.run_number} has no data directory` })
    return ok(readCurrent(d, x, maxPts(req.query)))
  })
  r.get('/data/runs/<int:run_number>/stats', (req, p) => {
    const x = run(p.run_number)
    if (!x) return fail(404, { message: `Run ${p.run_number} has no data directory` })
    return ok(readStats(d, x, maxPts(req.query)))
  })
  r.get('/data/runs/<int:run_number>/convert', (_q, p) => ok(conversion(d, run(p.run_number))))
  r.post('/data/runs/<int:run_number>/convert', (_q, p) => ok({ ...conversion(d, run(p.run_number)), message: NO_RUREADER }, 409))
}
