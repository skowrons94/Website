/**
 * Run files (phase P3): every file of data/run<N>/ for a demo run, generated on
 * demand from the run record, and the provider that gives the Logbook their real
 * sizes. This module is loaded lazily (with the Logbook's handler family, or on
 * a download), never in the worker's first chunk.
 */
import type { Daq, RunRecord } from '../state/daq'
import { setRunFileProvider, duration, type RunFileEntry } from '../state/runfiles'
import { replayRun, EVENT_CAP, type Replay } from './replay'
import { writeCaendat, writeEventsCsv } from './caendat'
import { boardConfigJson, currentTxt, metadataJson, readmeTxt, roiJson, statsCsv } from './text'
import { utf8 } from './format'

export interface RunFile { name: string; bytes: Uint8Array; type: string }

const commit = () => String((globalThis as any).__WEBDAQ_COMMIT__ ?? 'unknown')
const caendatName = (run: RunRecord) => `run_${run.run_number}_0000.sim.caendat`

/**
 * Replays (and current.txt, for a long run) are the expensive part. The bytes of
 * the last two runs are kept; the sizes of every finished run are kept, so the
 * Logbook's list does not regenerate anything twice.
 */
const runKey = (run: RunRecord) => `${run.demo.seed}:${run.run_number}:${run.demo.sim_start_s}:${run.demo.sim_end_s}:${run.demo.timeline.length}:${run.demo.current}`
interface Heavy { rep: Replay | null; caendat: Uint8Array | null; events: string | null; current: string | null }
const bytesCache = new Map<string, Heavy>()
const sizeCache = new Map<string, { caendat: number | null; events: number | null; current: number | null; total: number; truncated: boolean }>()
function heavy(d: Daq, run: RunRecord): Heavy {
  const key = runKey(run)
  let c = bytesCache.get(key)
  if (!c) {
    const rep = replayRun(run, run.demo.sim_end_s!)
    const epoch = Math.floor(d.runWallAt(run, run.demo.sim_start_s) / 1000)
    const events = rep ? writeEventsCsv(rep) : null
    c = { rep, caendat: rep ? writeCaendat(rep, epoch) : null, events, current: currentTxt(d, run) }
    if (bytesCache.size >= 2) bytesCache.delete(bytesCache.keys().next().value as string)
    bytesCache.set(key, c)
    sizeCache.set(key, {
      caendat: c.caendat?.length ?? null, events: events === null ? null : utf8(events).length,
      current: c.current === null ? null : utf8(c.current).length, total: rep?.total ?? 0, truncated: rep?.truncated ?? false,
    })
  }
  return c
}

/** Every file of a finished run, in directory order. */
export function runFilesFull(d: Daq, run: RunRecord): RunFile[] {
  const h = run.demo.sim_end_s !== null ? heavy(d, run) : null
  return assemble(d, run, {
    caendat: h?.caendat ?? null, events: h?.events ?? null, current: h ? h.current : currentTxt(d, run),
    total: h?.rep?.total ?? 0, truncated: h?.rep?.truncated ?? false,
  })
}

interface Parts { caendat: Uint8Array | number | null; events: string | number | null; current: string | number | null; total: number; truncated: boolean }

/** The run's files from their parts; a part given as a number is a size only (the Logbook list). */
function assemble(d: Daq, run: RunRecord, p: Parts): RunFile[] {
  const files: RunFile[] = []
  const put = (name: string, v: Uint8Array | string | number | null, type = 'text/plain') => {
    if (v === null) return
    files.push({ name, bytes: typeof v === 'number' ? new Uint8Array(0) : typeof v === 'string' ? utf8(v) : v, type, size: typeof v === 'number' ? v : undefined } as RunFile)
  }
  put(caendatName(run), p.caendat, 'application/octet-stream')
  put('events.csv', p.events, 'text/csv')
  const cfg = boardConfigJson(run)
  if (cfg) put(cfg.name, cfg.text, 'application/json')
  put('current.txt', p.current)
  put('stats.csv', statsCsv(d, run), 'text/csv')
  put('roi.json', roiJson(run), 'application/json')
  put('README.txt', readmeTxt(d, run, caendatName(run), p.truncated, p.total))
  put('metadata.json', metadataJson(d, run, files.map(f => ({ name: f.name, bytes: sizeOf(f) })), commit()), 'application/json')
  return files.sort((a, b) => (a.name < b.name ? -1 : 1))
}

const sizeOf = (f: RunFile) => (f as RunFile & { size?: number }).size ?? f.bytes.length

/** Sizes for the Logbook (run_data.list_files). */
function list(d: Daq, run: RunRecord): RunFileEntry[] {
  if (run.demo.sim_end_s === null) {
    // In progress: the data file is still being written; its size grows with the run.
    const n = Math.min(EVENT_CAP, run.demo.events.reduce((a, b) => a + b, 0) || Math.round(duration(d, run) * 1000))
    return [{ name: caendatName(run), bytes: 28 + n * 12 }]
  }
  if (!sizeCache.has(runKey(run))) heavy(d, run)
  const s = sizeCache.get(runKey(run))!
  return assemble(d, run, { caendat: s.caendat, events: s.events, current: s.current, total: s.total, truncated: s.truncated })
    .map(f => ({ name: f.name, bytes: sizeOf(f) }))
}

setRunFileProvider({ list })
