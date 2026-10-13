/**
 * What data/run<N>/ holds for a demo run, as services/run_data.py sees it, and
 * the readers behind the Logbook's run page (read_current, read_stats).
 *
 * Nothing is stored: every file is regenerated from the run record (seed,
 * scenario, register timeline, demo time span). Sizes here are the P1
 * estimates; the file writers (sim/files, phase P3) replace `fileSizes` with
 * the real byte counts through `setRunFileProvider`.
 */
import type { Daq, RunRecord } from './daq'
import type { Scenario } from '../physics/api'
import { beamSample } from '../physics/beam'

export interface RunFileEntry { name: string; bytes: number }

export interface RunFileProvider {
  /** Every file of the run, with its size in bytes, in directory order. */
  list(d: Daq, run: RunRecord): RunFileEntry[]
}

let provider: RunFileProvider | null = null
export function setRunFileProvider(p: RunFileProvider | null) { provider = p }

export const CAENDAT_EVENT_CAP = 50000

function estimate(d: Daq, run: RunRecord): RunFileEntry[] {
  const out: RunFileEntry[] = []
  const n = run.demo.events.reduce((a, b) => a + b, 0)
  const ev = Math.min(n, CAENDAT_EVENT_CAP)
  out.push({ name: `run_${run.run_number}_0000.sim.caendat`, bytes: 4 * 7 + ev * 8 + Math.ceil(ev / 10) * 16 })
  if (run.demo.config) out.push({ name: `${run.demo.config.dgtzs.BoardName}_${run.demo.config.dgtzs.BoardNb}.json`, bytes: JSON.stringify(run.demo.config, null, 4).length })
  if (run.demo.current) out.push({ name: 'current.txt', bytes: 80 + Math.round(duration(d, run) * 10) * 56 })
  if (run.demo.stats) out.push({ name: 'stats.csv', bytes: 400 + run.demo.stats.rows.length * 12 * (run.demo.stats.metrics.length + 1) })
  if (run.demo.roi) out.push({ name: 'roi.json', bytes: JSON.stringify(run.demo.roi, null, 2).length })
  out.push({ name: 'metadata.json', bytes: 2600 })
  out.push({ name: 'events.csv', bytes: 40 + ev * 34 })
  return out.sort((a, b) => (a.name < b.name ? -1 : 1))
}

export function runFiles(d: Daq, run: RunRecord): RunFileEntry[] {
  return (provider ?? { list: estimate }).list(d, run)
}

export function duration(d: Daq, run: RunRecord) {
  const end = run.demo.sim_end_s ?? (d.running && d.runNumber === run.run_number ? d.simT : run.demo.sim_start_s)
  return Math.max(0, end - run.demo.sim_start_s)
}

/** run_data.list_files: split by role, exactly as upstream (roi.json lands in board_config). */
export function listFiles(d: Daq, run: RunRecord | undefined) {
  const out = { data: [] as RunFileEntry[], board_config: [] as RunFileEntry[], root: [] as RunFileEntry[], current: null as RunFileEntry | null, metadata: null as RunFileEntry | null, total_bytes: 0 }
  if (!run) return out
  for (const e of runFiles(d, run)) {
    out.total_bytes += e.bytes
    if (e.name.endsWith('.caendat')) out.data.push(e)
    else if (e.name.endsWith('.root')) out.root.push(e)
    else if (e.name === 'current.txt') out.current = e
    else if (e.name === 'metadata.json') out.metadata = e
    else if (e.name.endsWith('.json')) out.board_config.push(e)
  }
  return out
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
/** datetime.strftime('%Y-%m-%d %H:%M:%S.%f') in local time. */
export function pyStamp(ms: number) {
  const t = new Date(ms)
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}.${pad(t.getMilliseconds(), 3)}000`
}

/**
 * The scenario in force at each moment of the run: the one it started with, then
 * every change recorded in its timeline ([run time, 'scenario', JSON]).
 */
export function scenarioSegments(run: RunRecord): { from_s: number; scenario: Scenario }[] {
  const out = [{ from_s: 0, scenario: { ...run.demo.scenario } }]
  for (const [t, key, value] of [...run.demo.timeline].sort((a, b) => a[0] - b[0])) {
    if (key !== 'scenario') continue
    try { out.push({ from_s: t, scenario: { ...out[out.length - 1].scenario, ...JSON.parse(value) } }) } catch { /* skip */ }
  }
  return out
}

/**
 * The rows current.txt holds: [relative time, ch0..ch3] at 10 Hz, from the run's own
 * history (the beam was on only while its scenario said so), never from the present.
 */
export function currentRows(d: Daq, run: RunRecord): number[][] {
  const t0 = run.demo.sim_start_s
  const n = Math.floor(duration(d, run) * 10)
  const segs = scenarioSegments(run)
  const rows: number[][] = []
  let k = 0
  for (let i = 0; i <= n; i++) {
    const rel = i * 0.1
    while (k + 1 < segs.length && segs[k + 1].from_s <= rel + 1e-9) k++
    const sc = segs[k].scenario
    const I0 = sc.source === 'n14pg' ? sc.beam_I0_uA : 0
    const t = Math.round((t0 + rel) * 10) / 10
    const s = beamSample(t, I0, run.demo.seed)
    rows.push([rel, ...s.map(v => Math.max(0, v))])
  }
  return rows
}

/** run_data.read_current. */
export function readCurrent(d: Daq, run: RunRecord, maxPoints: number) {
  const result = { available: false, start_time: null as string | null, columns: [] as string[], samples: [] as number[][], n_samples: 0, downsampled: false, integration: null as unknown }
  if (!run.demo.current) return result
  const rows = currentRows(d, run)
  if (!rows.length) return result
  const columns = ['Time(s)', 'Ch0(uA)', 'Ch1(uA)', 'Ch2(uA)', 'Ch3(uA)']
  result.available = true
  result.start_time = pyStamp(d.runWallAt(run, run.demo.sim_start_s))
  result.columns = columns
  result.n_samples = rows.length
  result.integration = integrate(rows, columns.slice(1))
  const step = Math.max(1, Math.floor(rows.length / maxPoints))
  result.downsampled = step > 1
  for (let i = 0; i < rows.length; i += step) result.samples.push(rows[i])
  return result
}

export function integrate(rows: number[][], names: string[]) {
  if (rows.length < 2) return { channels: [], duration_s: 0, note: 'not enough samples to integrate' }
  const nc = rows[0].length - 1
  const q = new Array(nc).fill(0)
  for (let i = 1; i < rows.length; i++) {
    const dt = rows[i][0] - rows[i - 1][0]
    if (dt <= 0) continue
    for (let c = 0; c < nc; c++) q[c] += 0.5 * (rows[i][c + 1] + rows[i - 1][c + 1]) * dt
  }
  const dur = rows[rows.length - 1][0] - rows[0][0]
  return {
    channels: q.map((x, c) => ({ name: names[c] ?? `Ch${c}(uA)`, charge_uC: x, charge_nC: x * 1e3, charge_mC: x * 1e-3, mean_current_uA: dur > 0 ? x / dur : 0 })),
    duration_s: dur, method: 'trapezoidal',
  }
}

/** run_data.read_stats. */
export function readStats(d: Daq, run: RunRecord, maxPoints: number) {
  const result = { available: false, start_time: null as string | null, columns: [] as string[], metrics: [] as { name: string; unit: string; source: string }[], samples: [] as number[][], n_samples: 0, downsampled: false }
  const s = run.demo.stats
  if (!s || !s.rows.length) return result
  result.available = true
  const t = new Date(d.runWallAt(run, run.demo.sim_start_s))
  result.start_time = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
  result.columns = ['Time [s]', ...s.metrics.map(m => (m.unit ? `${m.name} [${m.unit}]` : m.name))]
  result.metrics = s.metrics.map(m => ({ ...m }))
  result.n_samples = s.rows.length
  const step = Math.max(1, Math.floor(s.rows.length / maxPoints))
  result.downsampled = step > 1
  for (let i = 0; i < s.rows.length; i += step) result.samples.push(s.rows[i])
  return result
}
