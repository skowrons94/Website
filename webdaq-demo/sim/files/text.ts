/**
 * The text files of a run directory, in the formats the WebDAQ server writes:
 * metadata.json (services/run_metadata_snapshot.py, plus a Demo block),
 * roi.json (services/roi_analysis.py), stats.csv (services/stats_manager.py,
 * plus one SIMULATED line), current.txt (utils/mock_current.py and the real
 * modules), the register dump (conf/<name>_<id>.json) and a README.txt.
 */
import type { Daq, RunRecord } from '../state/daq'
import { isoNaive } from '../state/daq'
import { currentRows, duration, scenarioSegments } from '../state/runfiles'
import { pyExp, pyG, pyIsoSeconds, pyJson, pyStamp } from './format'

export const SIMULATED_LINE = '# SIMULATED DATA — WebDAQ in-browser demo, not a measurement'
export const NOTICE = 'Simulated data. Not a measurement.'
export const DEMO_VERSION = '0.1.0'

export interface ManifestEntry { Name: string; Role: string; Bytes: number }

/** run_metadata_snapshot._artifact_role */
export function artifactRole(name: string): string {
  if (name.endsWith('.caendat')) return 'raw-data'
  if (name.endsWith('.root')) return 'root'
  if (name === 'current.txt') return 'beam-current'
  if (name === 'stats.csv') return 'statistics'
  if (name.endsWith('.json')) return 'board-configuration'
  return 'other'
}

/** run_metadata_snapshot.build_run_metadata_snapshot, with the demo's own block appended. */
export function metadataJson(d: Daq, run: RunRecord, others: { name: string; bytes: number }[], commit: string): string {
  const artifacts: ManifestEntry[] = others
    .filter(f => f.name !== 'metadata.json')
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map(f => ({ Name: f.name, Role: artifactRole(f.name), Bytes: f.bytes }))
  const by = (role: string) => artifacts.filter(a => a.Role === role).map(a => a.Name)
  let dur: number | null = null
  if (run.start_time && run.end_time) dur = Math.round(Date.parse(run.end_time) - Date.parse(run.start_time)) / 1000
  const s = run.demo.scenario
  const segs = scenarioSegments(run)
  const beamSeg = segs.find(x => x.scenario.source === 'n14pg')
  const scen = (x: typeof s) => ({
    'detectors': x.detectors, 'source': x.source, 'distance_cm': x.distance_cm,
    'activity_Bq': x.activity_Bq, 'background': x.background,
    'yield_factor': x.source === 'n14pg' ? x.yield_factor : null,
    'beam_I0_uA': x.beam_I0_uA,
  })
  // What changed during the run, in run time: the scenario (source, distance, beam…) and
  // every register written to the running board. A real WebDAQ keeps only the start
  // configuration; the demo needs the rest to regenerate the run, and says so.
  const changes: Record<string, unknown>[] = []
  for (const [t, key, value] of [...run.demo.timeline].sort((a, b) => a[0] - b[0])) {
    if (changes.length >= 500) break
    if (key === 'scenario') {
      let sc: typeof s | null = null
      try { sc = { ...s, ...JSON.parse(value) } } catch { /* skip */ }
      if (sc) changes.push({ 'time_s': Math.round(t * 1000) / 1000, 'scenario': scen(sc) })
    } else changes.push({ 'time_s': Math.round(t * 1000) / 1000, 'register': key, 'value': value })
  }
  const doc = {
    'Schema Version': 1,
    'Updated At': isoNaive(run.demo.updated_ms ?? d.runWallAt(run, run.demo.sim_end_s ?? run.demo.sim_start_s)),
    'Run Number': run.run_number,
    'Start Time': run.start_time,
    'Stop Time': run.end_time,
    'Duration (s)': dur,
    'Terminal Voltage': run.terminal_voltage,
    'Probe Voltage': run.probe_voltage,
    'Run Type': run.run_type,
    'Target Name': run.target_name,
    'Accumulated Charge': run.accumulated_charge,
    'User ID': run.user_id,
    'Notes': run.notes,
    'Flag': run.flag,
    'Acquisition': {
      'Synchronisation': run.sync_mode || 'independent',
      'Software': run.software_versions,
      'Boards': run.board_info,
    },
    'Files': {
      'Data': by('raw-data'),
      'Board Configuration': by('board-configuration'),
      'Current': by('beam-current'),
      'Statistics': by('statistics'),
      'ROOT': by('root'),
      'Other': by('other'),
      'Metadata': 'metadata.json',
      'Total Artifact Bytes': artifacts.reduce((n, a) => n + a.Bytes, 0),
      'Manifest': artifacts,
    },
    'Demo': {
      'simulated': true,
      'generator': `webdaq-demo ${DEMO_VERSION} (WebDAQ ${commit.slice(0, 7)})`,
      'seed': run.demo.seed,
      'scenario': scen(s),
      'changes during the run': changes,
      'in-beam yield': beamSeg
        ? `The simulated 14N(p,g)15O rate is the thick-target yield multiplied by yield_factor = ${beamSeg.scenario.yield_factor}, so that a short demo run fills its lines; a real target gives that many times fewer counts.`
        : null,
      'data file': 'The .caendat has the format CaenDAQ writes, which has no field to mark it simulated: ".sim" in its name, this block and README.txt say what it is.',
      'notice': NOTICE,
    },
  }
  return pyJson(doc, 4) + '\n'
}

export function roiJson(run: RunRecord): string | null {
  return run.demo.roi ? pyJson({ ...run.demo.roi, simulated: true, notice: NOTICE }, 2) : null
}

/** stats_manager: '#' metadata lines, then CSV with the elapsed seconds first. */
export function statsCsv(d: Daq, run: RunRecord): string | null {
  const st = run.demo.stats
  if (!st) return null
  const cell = (s: string) => (/[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s)
  const lines = [
    '# LUNA DAQ statistics',
    SIMULATED_LINE,
    `# Run number: ${run.run_number}`,
    `# Start time: ${pyIsoSeconds(d.runWallAt(run, run.demo.sim_start_s))}`,
    '# Format: CSV. The first column is the elapsed acquisition time in seconds;',
    '# the rest are the metrics below, in this order. Missing samples are 0.',
    '#',
    ...st.metrics.map(m => `# Metric: ${m.name} | unit: ${m.unit.trim() || '-'} | source: ${m.source}`),
    '#',
    ['Time [s]', ...st.metrics.map(m => (m.unit ? `${m.name} [${m.unit}]` : m.name))].map(cell).join(','),
    ...st.rows.map(r => [r[0].toFixed(3), ...r.slice(1).map(v => pyG(v))].join(',')),
  ]
  return lines.join('\n') + '\n'
}

/** current.txt: '### Start time … ###', a '#' header, then f'{t:.8e}\t' + f'{v:.3e}\t' per channel. */
export function currentTxt(d: Daq, run: RunRecord): string | null {
  if (!run.demo.current) return null
  const out = [`### Start time: ${pyStamp(d.runWallAt(run, run.demo.sim_start_s))} ###`, SIMULATED_LINE, '# Time(s)\tCh0(uA)\tCh1(uA)\tCh2(uA)\tCh3(uA)']
  for (const r of currentRows(d, run)) out.push(pyExp(r[0], 8) + '\t' + r.slice(1).map(v => pyExp(v, 3) + '\t').join(''))
  return out.join('\n') + '\n'
}

export function boardConfigJson(run: RunRecord): { name: string; text: string } | null {
  const c = run.demo.config
  if (!c) return null
  return { name: `${c.dgtzs.BoardName}_${c.dgtzs.BoardNb}.json`, text: pyJson(c, 4) }
}

export function readmeTxt(d: Daq, run: RunRecord, caendat: string, truncated: boolean, nEvents: number): string {
  const s = run.demo.scenario
  return [
    `WebDAQ in-browser demo — run ${run.run_number}`,
    '',
    'SIMULATED DATA. NOT A MEASUREMENT. Nothing here came from a detector.',
    `Detectors: ${s.detectors}; source: ${s.source}; source–detector distance ${s.distance_cm} cm; seed ${run.demo.seed}.`,
    ...scenarioSegments(run).slice(1).map(x => `From ${x.from_s.toFixed(1)} s: source ${x.scenario.source}, distance ${x.scenario.distance_cm} cm${x.scenario.source === 'n14pg' ? `, beam ${x.scenario.beam_I0_uA} µA, yield ×${x.scenario.yield_factor}` : ''}.`),
    `Duration: ${duration(d, run).toFixed(1)} s of simulated time.`,
    '',
    'What a real WebDAQ run leaves in data/run<N>/, and what each file is:',
    '',
    `  ${caendat}`,
    '      Raw data: the XDAQ file header and V1730 board aggregates, the format',
    `      CaenDAQ writes. ${truncated ? `Only the first ${nEvents} events are included.` : `${nEvents} events.`}`,
    '      No waveforms. Convert with RUReader:  RUReader -i <this directory> -o run.root',
    '      The binary format has no field for it: ".sim" in the name marks it simulated.',
    '  events.csv',
    '      The same events as RUReader\'s tree columns (time stamps in ps), readable without ROOT;',
    '      its first line is a "# SIMULATED" comment.',
    '  V1730_0.json',
    '      The board\'s register configuration at run start (CAEN addresses and names).',
    '  current.txt',
    '      Beam current, 10 samples per second, four channels (simulated picoammeter).',
    '  stats.csv',
    '      The monitored metrics, one row per second; its header names each column\'s unit and source.',
    '  roi.json',
    '      The regions of interest defined on the spectra, with their counts at the end of the run.',
    '  metadata.json',
    '      The run record (times, target, run type, charge, flag, notes), the acquisition',
    '      provenance (boards, firmware, software versions) and a manifest of every file',
    '      with its role and size. The "Demo" block says how this run was simulated.',
    '',
    'FAIR in practice: the files are plain, open formats next to the binary data, they',
    'describe themselves (units, sources, register names) and metadata.json lists them all.',
    'Not done by WebDAQ today: persistent identifiers, a published JSON Schema, a licence field.',
    '',
  ].join('\n')
}
