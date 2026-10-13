/**
 * The simulated DAQ: what WebDAQ's daq_manager, caen_acquisition, spy_manager,
 * the current module, the stats manager, histogram_config and the alert
 * services hold, as one deterministic state machine. Handlers (shim/handlers)
 * read and change it; the physics engine (sim/physics/api.ts) fills it.
 *
 * Time: `simT` is demo time in seconds since the session started. It advances
 * in fixed 50 ms ticks keyed to the injected wall clock, so a given seed and a
 * given sequence of actions at the same tick indices replay identically.
 */
import {
  createPhysics, DEFAULT_SCENARIO, dppFor, th1f, th2f, emptyTH1F, waveformTH1F,
  ENERGY_BINS, QLONG_BINS, PSD_XBINS, PSD_YBINS, QLONG_MAX, DISTANCE_MIN_CM, DISTANCE_MAX_CM,
} from '../physics/api'
import type { PhysicsEngine, Scenario, BoardView, Dpp, RootJson, TickResult } from '../physics/api'
import type { HistogramDashboardConfig, DashboardSettings, HistogramConfig, ROI } from '@webdaq/lib/histogram-config'
import {
  defaultBoardConfig, regValue, setRegValue, hex4, START_MODE_NAMES,
  type BoardConfigFile,
} from './registers'

export const TICK_S = 0.05
/** Logbook pages are exported for runs 1…DEMO_MAX_RUN (overlay layout.tsx). */
export const DEMO_MAX_RUN = 30
export const DEMO_NOTICE = 'Simulated data. Not a measurement.'
const BEAM_DT = 0.1           // 10 Hz, as the mock current module
const CATCH_UP_S = 10         // a gap longer than this is filled in one physics tick (§3.11)
const METRIC_KEEP = 3600      // points per metric (1 h at 1 s)
const STATS_CSV_KEEP = 7200

export interface BoardCfg {
  id: number
  name: string
  vme: string
  link_type: string
  link_num: string
  dpp: Dpp
  chan: number
}

/** One row of the run-metadata table (models/run_metadata.py), plus demo provenance. */
export interface RunRecord {
  run_number: number
  start_time: string | null
  end_time: string | null
  notes: string | null
  target_name: string | null
  terminal_voltage: number | null
  probe_voltage: number | null
  run_type: string | null
  accumulated_charge: number | null
  user_id: number | null
  flag: string
  board_info: Record<string, unknown>[]
  software_versions: Record<string, unknown>
  sync_mode: string | null
  // ── demo-only: what is needed to regenerate the run's files (P3) ──
  demo: {
    seed: number
    scenario: Scenario
    sim_start_s: number
    sim_end_s: number | null
    /** Register file as copied into data/run<N>/ at start. */
    config: BoardConfigFile | null
    /** Register writes made during the run: [sim time, reg key, value]. */
    timeline: [number, string, string][]
    events: number[]
    bytes: number
    /** stats.csv columns (alias, unit, source) and rows [elapsed_s, ...values]. */
    stats: { metrics: { name: string; unit: string; source: string }[]; rows: number[][] } | null
    /** roi.json body, written at stop (roi_analysis.build_snapshot). */
    roi: Record<string, unknown> | null
    /** Whether a current.txt was recorded (beam module recording during the run). */
    current: boolean
    /**
     * Wall-clock epoch (ms) of the run start, fixed once: every time stamp of the
     * run's files derives from it, so the files never change after the run ends
     * (demo time is remapped to the wall clock after a reload).
     */
    wall_start_ms?: number
    /** When the run record last changed (stop, metadata, flag, notes): metadata.json's "Updated At". */
    updated_ms?: number
  }
}

export interface StatsPath { path: string; alias: string; unit: string; enabled: boolean }

export interface AlertRuleState {
  id: string
  type: 'board_failure' | 'stalled_buffers' | 'beam_current' | 'graphite_metric'
  name: string
  enabled: boolean
  transports: string[]
  params: Record<string, string | number | boolean>
}

export interface AlertEventRec {
  id: string; at: number; kind: 'alert' | 'recovery' | 'info'; title: string; lines: string[]
  rule_id: string; rule_type: string; subject: string; run_number: number | null
  deliveries: Record<string, boolean>; seen: boolean
}

interface ChannelWindow { events: number; pileup: number; lost: number; satu: number; dead: number }

export interface ScanState {
  status: 'idle' | 'running' | 'done' | 'cancelled' | 'error'
  message: string
  total: number
  done: number
  started: number   // sim time
  finished: number
  found: Record<string, unknown>[]
  errors: string[]
  /** Probe targets still to visit; the simulated board answers at Optical 0 / node 0. */
  targets: { link_type: string; link_num: string; node: number; vme: number }[]
}

/** Where the simulated board answers a probe. */
export const SIM_BOARD_LINK = { link_type: 'Optical', link_num: '0', node: 0, vme: 0 }
export const SIM_SERIAL = 0
const SCAN_PROBE_S = 0.02

export interface Clock { now(): number }

export interface DaqOptions {
  seed: number
  clock?: Clock
  physics?: (seed: number) => PhysicsEngine
  scenario?: Partial<Scenario>
}

const r6 = (x: number) => Math.round(x * 1e6) / 1e6

export function detectorLabel(kind: Scenario['detectors'], ch: number): string {
  const names: Record<Scenario['detectors'], string> = { hpge: 'HPGe', bgo: 'BGO', ej309: 'EJ-309', he3: '³He' }
  return ch < 2 ? `${names[kind]} ${ch === 0 ? 'A' : 'B'}` : 'not connected'
}

/** Flask's jsonify of a datetime: RFC 1123 in GMT. */
export const httpDate = (ms: number) => new Date(ms).toUTCString()

/** An ISO-8601 timestamp with the local UTC offset, as datetime.now().astimezone().isoformat(). */
export function isoLocal(ms: number): string {
  const d = new Date(ms)
  const off = -d.getTimezoneOffset()
  const pad = (n: number, w = 2) => String(Math.floor(Math.abs(n))).padStart(w, '0')
  const local = new Date(ms + off * 60000)
  const base = local.toISOString().replace('Z', '').replace(/\.(\d{3})$/, '.$1000')
  return `${base}${off >= 0 ? '+' : '-'}${pad(off / 60)}:${pad(off % 60)}`
}
/** A naive ISO timestamp, as datetime.now().isoformat() stored in SQLite. */
export function isoNaive(ms: number): string {
  const d = new Date(ms)
  const local = new Date(ms - d.getTimezoneOffset() * 60000)
  return local.toISOString().replace('Z', '').replace(/\.(\d{3})$/, '.$1000')
}

export class Daq {
  readonly seed: number
  clock: Clock
  physics: PhysicsEngine
  private makePhysics: (seed: number) => PhysicsEngine
  scenario: Scenario

  // ── time ──
  simT = 0
  private wall0: number
  private sim0 = 0
  private nextBeamT = 0
  private nextSecond = 1
  private nextAlertT = 2
  tickCount = 0

  // ── daq_manager state (conf/settings.json) ──
  boards: BoardCfg[] = []
  configs: Record<string, BoardConfigFile> = {}
  calib: Record<string, [number, number][]> = {}
  running = false
  startTime: string | null = null
  runNumber = 1
  save = true
  limitSize = false
  fileSizeLimit = 0
  /** Set at configure: the boards caendaq holds (board index = position). */
  runBoards: string[] | null = null
  runSimStart = 0
  runs: RunRecord[] = []
  autoRestart = { enabled: false, delay: 30, pending: false, last: null as Record<string, unknown> | null, at: 0 }
  boardFailures: Record<string, number> = {}
  faults: { board_fail_at_s: number | null; stall_at_s: number | null } = { board_fail_at_s: null, stall_at_s: null }
  /** Sim time of the last readout that brought data (stalled_buffers). */
  lastDataT = 0
  /** The beam was switched on or off during a run: the HPGe gain for it is set at the next run start. */
  pendingGain = false

  // ── caendaq counters for the run ──
  diag: Record<string, { buffers_read: number; bytes_read: number; bytes_written: number; blocks_dropped: number; comm_errors: number; events_decoded: number; board_failures: number }> = {}
  private win: ChannelWindow[] = []
  private winBytes = 0
  private winStart = 0
  private winEnd = 0
  rates: { channels: { event_rate: number; pileup_rate: number; lost_rate: number; satu_rate: number; dead: number }[]; write_rate: number } | null = null
  runEvents: number[] = []
  runBytes = 0
  private lastTraces: Record<string, Int16Array | null> = {}

  // ── spy ──
  rebinFactor = 1

  // ── histogram dashboard (conf/histograms.json) ──
  hist: HistogramDashboardConfig

  // ── scan ──
  scan: ScanState = { status: 'idle', message: '', total: 0, done: 0, started: 0, finished: 0, found: [], errors: [], targets: [] }

  // ── current module ──
  current = {
    module_type: 'tetramm' as 'tetramm' | 'rbd9103' | 'graphite',
    ip: '169.254.145.10', port: 10001 as number | string, charge_channel: 0,
    graphite_host: 'graphite.demo.invalid', graphite_port: 2003,
    graphite_metric: '', graphite_metric_scale: 1.0, graphite_poll_interval_s: 1.0,
    rbd_port: '/dev/ttyUSB0', rbd_baudrate: 57600, rbd_high_speed: false,
    connected: true, acquiring: true, recording: false, recordingRun: null as number | null,
    accumulating: false, accumulated: 0, total: 0,
    latest: [0, 0, 0, 0] as number[],
    deviceSettings: { RNG: 'AUTO', NRSAMP: 1000, TRG: 'OFF', NAQ: 4 } as Record<string, unknown>,
    misc: {} as Record<string, unknown>,
  }

  // ── stats manager (conf/stats.json) and the Graphite-like store ──
  stats = {
    graphite_host: 'graphite.demo.invalid', graphite_port: 80, graphite_prefix: 'demo.rates',
    paths: [] as StatsPath[],
    stats_interval_ms: 1000, stats_first_interval_ms: 2000,
    collecting: false, current_run: null as number | null,
    csvStart: 0, csvRows: [] as number[][], csvPaths: [] as StatsPath[],
  }
  metrics = new Map<string, { t: number[]; v: number[] }>()

  // ── notifications ──
  telegram = { enabled: false, bot_token: '', chat_id: '' }
  zulip = { enabled: false, site: '', bot_email: '', api_key: '', stream: '', topic: '' }
  rules: AlertRuleState[] = []
  notifyRecovery = true
  watching = true
  alertState: Record<string, { latched: boolean; value: number | string | null; last_fired: number | null; since: number | null }> = {}
  events: AlertEventRec[] = []
  private idCounter = 0

  // ── ELOG / Grafana (not connected in the demo) ──
  elog = { enabled: false, url: '', user: '', password: '', default_attributes: {} as Record<string, string> }
  grafana = { url: '', api_key: '' }

  // ── Next.js route handlers' small caches (app/api/cache) ──
  cache: Record<string, unknown> = {}
  /** The Flask server as server-status.tsx sees it: always up, in test mode. */
  server = { running: true }

  constructor(opts: DaqOptions) {
    this.seed = opts.seed >>> 0
    this.clock = opts.clock ?? { now: () => Date.now() }
    this.makePhysics = opts.physics ?? createPhysics
    this.physics = this.makePhysics(this.seed)
    this.scenario = this.normaliseScenario({ ...DEFAULT_SCENARIO, ...(opts.scenario ?? {}) })
    this.wall0 = this.clock.now()
    this.hist = { version: 1, settings: defaultHistSettings(), histograms: [] }
    this.stats.paths = [
      { path: 'demo.accelerator.terminal_voltage', alias: 'Terminal voltage (simulated)', unit: 'kV', enabled: true },
      { path: 'demo.beam.current', alias: 'Beam current (simulated)', unit: 'uA', enabled: true },
    ]
    this.seedBeamRule()
    // A failed or silent board must show in the bell and on Troubleshoot: the demo
    // starts with one rule of each kind (they deliver nothing; the visitor may edit them).
    this.rules.push(
      { id: 'demofail0001', type: 'board_failure', name: 'Board failure (demo)', enabled: true, transports: ['telegram'], params: {} },
      { id: 'demostal0001', type: 'stalled_buffers', name: 'Board stopped producing data (demo)', enabled: true, transports: ['telegram'], params: { seconds: 20 } },
    )
  }

  /**
   * In-beam scenarios get one beam-current rule, so a beam trip shows in the bell and
   * on Troubleshoot (design §1.10). Added once, the first time the beam is chosen;
   * the visitor may edit or delete it like any other rule.
   */
  seededBeamRule = false
  seedBeamRule() {
    if (this.seededBeamRule || this.scenario.source !== 'n14pg') return
    this.seededBeamRule = true
    this.rules.push({
      id: 'demobeam0001', type: 'beam_current', name: 'Beam current (demo)', enabled: true,
      transports: ['telegram'],
      params: { comparison: 'below', threshold: 20, seconds: 1, during_run_only: true },
    })
  }

  // ─────────────────────────────────────────────────────────── helpers

  nowMs() { return this.clock.now() }
  newId(prefix = '') {
    this.idCounter++
    const h = (Math.imul(this.seed ^ 0x9e3779b9, this.idCounter + 1) >>> 0).toString(16).padStart(8, '0')
    return `${prefix}${h}${this.idCounter.toString(16).padStart(4, '0')}`
  }
  board(id: string | number): BoardCfg | undefined {
    return this.boards.find(b => String(b.id) === String(id))
  }
  boardKey(b: BoardCfg) { return `${b.name}_${b.id}` }
  regs(b: BoardCfg) { return this.configs[this.boardKey(b)]?.registers ?? {} }
  configFor(id: string | number): BoardConfigFile | null {
    const b = this.board(id)
    return b ? this.configs[this.boardKey(b)] ?? null : null
  }
  boardIndex(id: string | number): number | null {
    if (!this.runBoards) return null
    const i = this.runBoards.indexOf(String(id))
    return i < 0 ? null : i
  }
  waveformsOn(b: BoardCfg) { return (regValue(this.regs(b), 0x8000) & (1 << 16)) !== 0 }

  view(b: BoardCfg): BoardView {
    const regs = this.regs(b)
    return {
      dpp: b.dpp,
      nChannels: b.chan,
      nsPerSample: 2,
      chReg: (base, ch) => regValue(regs, base + ch * 0x100),
      reg: a => regValue(regs, a),
      channelEnabled: ch => ((regValue(regs, 0x8120) >>> ch) & 1) === 1,
      waveformsEnabled: this.waveformsOn(b),
    }
  }

  normaliseScenario(s: Scenario): Scenario {
    const d = Number(s.distance_cm)
    return {
      ...s,
      distance_cm: Number.isFinite(d) ? Math.min(DISTANCE_MAX_CM, Math.max(DISTANCE_MIN_CM, d)) : DEFAULT_SCENARIO.distance_cm,
      beam_I0_uA: s.source === 'n14pg' ? (s.beam_I0_uA || 100) : 0,
    }
  }

  /** Re-configure physics from the first board (the demo has one). */
  reconfigure(): string | null {
    const b = this.boards[0]
    if (!b) return null
    try { this.physics.configure(this.scenario, this.view(b)); return null } catch (e) { return String((e as Error)?.message ?? e) }
  }

  /** Visitor's scenario (start page, scenario panel). Changing the detector re-creates the board's firmware. */
  setScenario(partial: Partial<Scenario>): { ok: boolean; message: string } {
    const next = this.normaliseScenario({ ...this.scenario, ...partial })
    const dppChange = dppFor(next.detectors) !== dppFor(this.scenario.detectors)
    if (this.running && (dppChange || next.detectors !== this.scenario.detectors)) {
      return { ok: false, message: 'Stop the run before changing the detectors.' }
    }
    const prev = this.scenario
    this.scenario = next
    const sourceChange = next.source !== prev.source
    // The starting configuration depends on the detector and on in-beam vs source.
    const recreate = dppChange || next.detectors !== prev.detectors
    const beamSwitch = !recreate && sourceChange && (next.source === 'n14pg' || prev.source === 'n14pg')
    try {
      if (recreate) for (const b of this.boards) this.recreateBoardFirmware(b)
      // Switching to or from the beam keeps the visitor's tuning and only moves the
      // gain and DC offset the in-beam lines need (both online-safe on DPP-PHA).
      // During a run the gain stays (the spectrum and its ROIs keep their meaning): the
      // in-beam gain then applies from the next run start.
      if (beamSwitch && next.detectors === 'hpge') {
        if (this.running) this.pendingGain = true
        else { this.pendingGain = false; for (const b of this.boards) this.seedInBeam(b, next.source === 'n14pg') }
      }
      const err = this.reconfigure()
      if (err) throw new Error(err)
    } catch (e) {
      this.scenario = prev
      if (recreate) for (const b of this.boards) { try { this.recreateBoardFirmware(b) } catch { /* keep going */ } }
      this.reconfigure()
      return { ok: false, message: String((e as Error)?.message ?? e) }
    }
    this.seedBeamRule()
    // A scenario change mid-run (the beam switched on) is part of the run's timeline.
    const rec = this.running && this.save ? this.runs.find(r => r.run_number === this.runNumber) : undefined
    if (rec && rec.demo.timeline.length < 5000) rec.demo.timeline.push([r6(this.simT - this.runSimStart), 'scenario', JSON.stringify(this.scenario)])
    if (this.running && this.pendingGain && beamSwitch) {
      return { ok: true, message: 'Scenario updated. The gain for the new lines is set when the next run starts; this run keeps its gain.' }
    }
    return { ok: true, message: 'Scenario updated' }
  }

  private recreateBoardFirmware(b: BoardCfg) {
    const oldKey = this.boardKey(b)
    b.dpp = dppFor(this.scenario.detectors)
    delete this.configs[oldKey]
    this.configs[this.boardKey(b)] = this.startingConfig(b)
    const err = this.reconfigure()
    if (err) throw new Error(err)
    this.calib[this.boardKey(b)] = calibRows(Array.from({ length: b.chan }, (_, c) => this.physics.calibration(c)))
    this.runBoards = null
    this.lastTraces = {}
  }

  private seedInBeam(b: BoardCfg, on: boolean) {
    const regs = this.regs(b)
    for (let c = 0; c < b.chan; c++) {
      const algo = 0x1080 + c * 0x100
      setRegValue(regs, algo, (regValue(regs, algo) & ~0x3f) | (on ? 6 : 4))
      setRegValue(regs, 0x1098 + c * 0x100, on ? 0x1999 : 0x8000)
    }
    for (let c = 0; c < b.chan; c++) {
      this.noteRegisterWrite(b, `reg_${hex4(0x1080 + c * 0x100)}`)
      this.noteRegisterWrite(b, `reg_${hex4(0x1098 + c * 0x100)}`)
    }
    // The demo moved the gain, not the visitor: keep the spectra in keV.
    if (this.reconfigure() === null) this.calib[this.boardKey(b)] = calibRows(Array.from({ length: b.chan }, (_, c) => this.physics.calibration(c)))
  }

  /** Test-mode defaults, plus the per-scenario starting point of design §3.2. */
  startingConfig(b: BoardCfg): BoardConfigFile {
    const cfg = defaultBoardConfig(b.name, b.id, b.dpp, b.chan)
    const kind = this.scenario.detectors
    const inBeam = this.scenario.source === 'n14pg'
    for (let c = 0; c < b.chan; c++) {
      const algo = 0x1080 + c * 0x100
      // Negative pulses (BGO and EJ-309 PMTs, the ³He preamplifier): invert the
      // input (0x1n80 bit 16), or nothing triggers — realistic, but a dead start.
      if (kind !== 'hpge') setRegValue(cfg.registers, algo, regValue(cfg.registers, algo) | (1 << 16))
      // ³He: the charge arrives over microseconds; a long gate of 2000 samples (4 µs).
      if (kind === 'he3') setRegValue(cfg.registers, 0x1058 + c * 0x100, 2000)
      // In-beam HPGe: coarser trapezoid rescaling (0x1n80[5:0] = 6) and the DC offset at
      // ~10 % for positive pulses (caen-settings.md §2.1), or the 6.79 MeV line is off scale.
      if (inBeam && kind === 'hpge') {
        setRegValue(cfg.registers, algo, (regValue(cfg.registers, algo) & ~0x3f) | 6)
        setRegValue(cfg.registers, 0x1098 + c * 0x100, 0x1999)
      }
    }
    return cfg
  }

  // ─────────────────────────────────────────────────────────── time

  /** Bring simulated time up to the wall clock. Called before every request and on a timer. */
  advance() {
    const target = this.sim0 + (this.clock.now() - this.wall0) / 1000
    let gap = target - this.simT
    if (gap < TICK_S) return
    if (gap > CATCH_UP_S) {
      // Fill a long hidden-tab gap with one large step, then carry on in ticks.
      const n = Math.floor((gap - TICK_S) / TICK_S)
      this.step(n * TICK_S)
      gap = target - this.simT
    }
    while (gap >= TICK_S) {
      this.step(TICK_S)
      gap -= TICK_S
    }
  }

  /** Advance by a number of ticks regardless of the wall clock (tests). */
  runTicks(n: number) {
    for (let i = 0; i < n; i++) this.step(TICK_S)
    this.sim0 = this.simT
    this.wall0 = this.clock.now()
  }

  step(dt: number) {
    const t0 = this.simT
    const t1 = t0 + dt
    this.tickCount++
    // Beam module: 10 Hz samples, charge = Σ I·Δt (µC), as mock_current.py.
    while (this.nextBeamT <= t1 + 1e-9) {
      const s = this.physics.beamSample(this.nextBeamT)
      this.current.latest = s
      const ch = Math.min(this.current.charge_channel, 3)
      const dq = Math.max(0, s[ch]) * BEAM_DT
      this.current.total += dq
      if (this.current.accumulating) this.current.accumulated += dq
      this.nextBeamT = r6(this.nextBeamT + BEAM_DT)
    }
    if (this.scan.status === 'running') this.stepScan(t1)
    if (this.running) this.stepRun(t0, dt)
    this.simT = t1
    while (this.nextSecond <= t1 + 1e-9) {
      this.everySecond(this.nextSecond)
      this.nextSecond += 1
    }
    if (this.nextAlertT <= t1) {
      this.evaluateAlerts()
      this.nextAlertT = Math.floor(t1 / 2) * 2 + 2
    }
    if (this.autoRestart.pending && t1 >= this.autoRestart.at) this.doAutoRestart()
  }

  private stepRun(t0: number, dt: number) {
    const b = this.boards.find(x => this.runBoards?.includes(String(x.id)))
    if (!b) return
    const tRun = t0 - this.runSimStart
    const stalled = this.faults.stall_at_s !== null && tRun >= this.faults.stall_at_s
    // A board with its FAIL flag set sends nothing until the run is restarted.
    const failed = !!this.boardFailures[String(b.id)]
    const res: TickResult = stalled || failed
      ? { channels: Array.from({ length: b.chan }, () => ({ offered: 0, events: 0, pileup: 0, lost: 0, saturated: 0, dead_s: 0 })), bytes: 0, blocksDropped: 0 }
      : this.physics.tick({ t_s: tRun, dt_s: dt, beamCurrent_uA: this.current.latest[0] })
    const d = this.diag[String(b.id)]
    let events = 0
    res.channels.forEach((c, i) => {
      const w = this.win[i] ?? (this.win[i] = { events: 0, pileup: 0, lost: 0, satu: 0, dead: 0 })
      w.events += c.events; w.pileup += c.pileup; w.lost += c.lost; w.satu += c.saturated; w.dead += c.dead_s
      this.runEvents[i] = (this.runEvents[i] ?? 0) + c.events
      events += c.events + c.pileup + c.saturated
    })
    this.winBytes += res.bytes
    this.runBytes += res.bytes
    if (res.bytes > 0) this.lastDataT = t0 + dt
    if (d) {
      if (res.bytes > 0) d.buffers_read += Math.max(1, Math.round(dt / 0.01))
      d.bytes_read += res.bytes
      d.bytes_written += this.save ? res.bytes : 0
      d.blocks_dropped += res.blocksDropped
      d.events_decoded += events
    }
    if (this.faults.board_fail_at_s !== null && tRun + dt >= this.faults.board_fail_at_s && !this.boardFailures[String(b.id)]) {
      this.boardFailures[String(b.id)] = 1
      if (d) d.board_failures = 1
      this.onBoardFailure(String(b.id))
    }
    // Rate window: the first one is short, as in CaenDAQ (stats_first_interval_ms).
    if (this.simT + dt >= this.winEnd - 1e-9) this.closeWindow(b, this.simT + dt)
  }

  private closeWindow(b: BoardCfg, t: number) {
    const len = Math.max(1e-6, t - this.winStart)
    this.rates = {
      write_rate: this.save ? this.winBytes / len : 0,
      channels: Array.from({ length: b.chan }, (_, i) => {
        const w = this.win[i] ?? { events: 0, pileup: 0, lost: 0, satu: 0, dead: 0 }
        return { event_rate: w.events / len, pileup_rate: w.pileup / len, lost_rate: w.lost / len, satu_rate: w.satu / len, dead: w.dead / len }
      }),
    }
    const epoch = this.wallAt(t)
    const p = this.stats.graphite_prefix
    this.pushMetric(`${p}.bo_${b.id}.writeRate`, epoch, this.rates.write_rate)
    this.rates.channels.forEach((c, i) => {
      const base = `${p}.bo_${b.id}.ch_${i}.`
      this.pushMetric(base + 'totalRate', epoch, c.event_rate)
      this.pushMetric(base + 'pileRate', epoch, c.pileup_rate)
      this.pushMetric(base + 'lostRate', epoch, c.lost_rate)
      this.pushMetric(base + 'satuRate', epoch, c.satu_rate)
      this.pushMetric(`demo.daq.b${b.id}.ch${i}.deadtime`, epoch, c.dead)
    })
    this.win = []
    this.winBytes = 0
    this.winStart = t
    this.winEnd = t + this.stats.stats_interval_ms / 1000
  }

  /** Wall-clock epoch (ms) of a demo instant. */
  wallAt(t: number) { return this.wall0 + (t - this.sim0) * 1000 }
  /** Wall-clock epoch (ms) of a demo instant of a run, fixed by the run's own start. */
  runWallAt(run: RunRecord, t: number) {
    return run.demo.wall_start_ms !== undefined ? run.demo.wall_start_ms + (t - run.demo.sim_start_s) * 1000 : this.wallAt(t)
  }
  /** A finished run's record changed (metadata, flag, notes): metadata.json says when. */
  touchRun(run: RunRecord) { run.demo.updated_ms = this.clock.now() }

  private everySecond(t: number) {
    const epoch = this.wallAt(t)
    const inBeam = this.scenario.source === 'n14pg'
    // Accelerator terminal voltage, illustrative only (not used by the physics).
    const tv = inBeam ? 300 + 0.05 * Math.sin(t / 30) : 0
    this.pushMetric('demo.accelerator.terminal_voltage', epoch, r6(tv))
    this.pushMetric('demo.beam.current', epoch, r6(this.current.latest[0]))
    if (this.stats.collecting) {
      const row = [r6(t - this.stats.csvStart)]
      for (const p of this.stats.csvPaths) row.push(this.lastMetric(p.path) ?? 0)
      if (this.stats.csvRows.length < STATS_CSV_KEEP) this.stats.csvRows.push(row)
    }
  }

  // ── Graphite-like store ──
  pushMetric(path: string, epochMs: number, v: number) {
    let m = this.metrics.get(path)
    if (!m) { m = { t: [], v: [] }; this.metrics.set(path, m) }
    m.t.push(Math.round(epochMs / 1000)); m.v.push(v)
    if (m.t.length > METRIC_KEEP) { m.t.splice(0, m.t.length - METRIC_KEEP); m.v.splice(0, m.v.length - METRIC_KEEP) }
  }
  lastMetric(path: string): number | null {
    const m = this.metrics.get(path)
    return m && m.v.length ? m.v[m.v.length - 1] : null
  }
  /** graphite get_data(): [[http-date, value], …] within [from, until]. */
  series(path: string, from = '-10s', until = 'now'): [string, number | null][] {
    const m = this.metrics.get(path)
    if (!m) return []
    const now = this.clock.now() / 1000
    const lo = parseGraphiteTime(from, now) ?? now - 10
    const hi = parseGraphiteTime(until, now) ?? now
    const out: [string, number | null][] = []
    for (let i = 0; i < m.t.length; i++) if (m.t[i] >= lo && m.t[i] <= hi) out.push([httpDate(m.t[i] * 1000), m.v[i]])
    return out
  }
  metricTree(): string[] {
    return [...this.metrics.keys()].sort()
  }

  // ─────────────────────────────────────────────────────────── scan

  startScan(opts: any): { status: number; data: unknown } {
    if (this.running) return { status: 409, data: { message: 'Cannot scan for boards while a run is in progress. Stop the run first.' } }
    if (this.scan.status === 'running') return { status: 409, data: { message: 'A scan is already running.' } }
    const targets: ScanState['targets'] = []
    const warnings: string[] = []
    const add = (lt: string, ln: unknown, nodes: number, vme = 0) => {
      for (let n = 0; n < nodes; n++) targets.push({ link_type: lt, link_num: String(ln), node: n, vme })
    }
    const o = opts ?? {}
    if (o.usb?.enabled) for (let l = 0; l < Number(o.usb.links ?? 8); l++) add('USB', l, 1)
    if (o.optical?.enabled) for (let l = 0; l < Number(o.optical.links ?? 4); l++) add('Optical', l, Number(o.optical.nodes ?? 8))
    if (o.a4818?.enabled) {
      const pids = (o.a4818.pids ?? []).map((p: unknown) => String(p).trim()).filter(Boolean)
      if (!pids.length) warnings.push('No A4818 adapter found on the USB bus — enter its PID by hand to scan it.')
      for (const pid of pids) add('A4818', pid, Number(o.a4818.nodes ?? 8))
    }
    if (o.vme?.enabled) {
      const lt = o.vme.link_type ?? 'Optical'
      if (!['USB', 'Optical', 'A4818'].includes(lt)) return { status: 400, data: { message: `Unknown link type '${lt}' for the VME scan.` } }
      const parse = (f: string, d: string) => parseInt(String(o.vme[f] ?? d).trim().replace(/^0x/i, '') || d, 16)
      const start = parse('start', '0'), end = parse('end', '0'), step = parse('step', '10000') || 0x10000
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return { status: 400, data: { message: 'Invalid VME address range.' } }
      const count = Math.floor((end - start) / step) + 1
      if (count > 1024) return { status: 400, data: { message: `That VME range is ${count} probes; the limit is 1024.` } }
      for (let i = 0; i < count; i++) targets.push({ link_type: lt, link_num: String(o.vme.link_num ?? 0), node: 0, vme: start + i * step })
    }
    if (!targets.length) return { status: 400, data: { message: 'Nothing to scan — enable at least one link type.' + (warnings[0] ? ` ${warnings[0]}` : '') } }
    this.scan = { status: 'running', message: '', total: targets.length, done: 0, started: this.simT, finished: 0, found: [], errors: warnings, targets }
    return { status: 202, data: this.scanStatus() }
  }

  private stepScan(t: number) {
    const s = this.scan
    while (s.targets.length && s.started + (s.done + 1) * SCAN_PROBE_S <= t) {
      const tg = s.targets.shift()!
      const known = this.boards.find(b => b.link_type === tg.link_type && String(b.link_num) === tg.link_num &&
        Number(b.id) === tg.node && (parseInt(b.vme || '0', 16) || 0) === tg.vme)
      const vmeHex = tg.vme.toString(16).toUpperCase()
      if (known) {
        s.found.push({ model: known.name, serial: '', channels: known.chan, adc_bits: 0, roc_firmware: '', amc_firmware: '',
          dpp: known.dpp, link_type: tg.link_type, link_num: tg.link_num, id: tg.node, vme: vmeHex, already_configured: true })
      } else if (tg.link_type === SIM_BOARD_LINK.link_type && tg.link_num === SIM_BOARD_LINK.link_num &&
        tg.node === SIM_BOARD_LINK.node && tg.vme === SIM_BOARD_LINK.vme) {
        s.found.push({ model: 'V1730', serial: String(SIM_SERIAL), channels: 16, adc_bits: 14, roc_firmware: 'sim',
          amc_firmware: 'sim', dpp: dppFor(this.scenario.detectors), link_type: tg.link_type, link_num: tg.link_num,
          id: tg.node, vme: vmeHex, already_configured: false })
      }
      s.done++
    }
    if (!s.targets.length) {
      s.status = 'done'
      s.finished = t
      s.message = `Scan complete — ${s.found.length} board${s.found.length !== 1 ? 's' : ''} found.`
    }
  }

  cancelScan() {
    if (this.scan.status !== 'running') return false
    this.scan.status = 'cancelled'
    this.scan.message = 'Scan cancelled.'
    this.scan.finished = this.simT
    this.scan.targets = []
    return true
  }

  scanStatus() {
    const s = this.scan
    const elapsed = s.started || s.status !== 'idle' ? ((s.finished || this.simT) - s.started) : 0
    const eta = s.status === 'running' && s.done && s.total ? Math.max(0, elapsed / s.done * (s.total - s.done)) : null
    return {
      status: s.status, message: s.message, progress: { done: s.done, total: s.total },
      elapsed: Math.round(elapsed * 10) / 10, eta: eta === null ? null : Math.round(eta * 10) / 10,
      found: s.found.map(f => ({ ...f })), errors: [...s.errors],
    }
  }

  // ─────────────────────────────────────────────────────────── boards

  /** daq_manager.add_board: validation, then "open" the board at its link. */
  addBoard(raw: any): { status: number; data: unknown } {
    const cfg = { ...(raw ?? {}) }
    const rawId = cfg.id
    if (rawId === undefined || rawId === null || String(rawId).trim() === '') return { status: 409, data: { message: 'A board ID is required.' } }
    const id = Number(String(rawId).trim())
    if (!Number.isInteger(id)) return { status: 409, data: { message: `Board ID must be a whole number (got '${rawId}').` } }
    if (id < 0) return { status: 409, data: { message: `Board ID must not be negative (got ${id}).` } }
    const existing = this.board(id)
    if (existing) {
      return { status: 409, data: { message: `Board ID ${id} is already used by '${existing.name}'. Two boards cannot share an ID — it names the board's configuration file, identifies it in the data file, and picks the master of a synchronised chain. Give this board a different ID, or remove the existing one first.` } }
    }
    const vme = parseInt(String(cfg.vme ?? '0'), 16) || 0
    const reachable = cfg.link_type === SIM_BOARD_LINK.link_type && String(cfg.link_num) === SIM_BOARD_LINK.link_num &&
      id === SIM_BOARD_LINK.node && vme === SIM_BOARD_LINK.vme
    if (!reachable) return { status: 404, data: { message: 'Failed to connect to the board!' } }
    if (this.boards.length) return { status: 404, data: { message: 'Failed to connect to the board!' } }
    const want = dppFor(this.scenario.detectors)
    if (cfg.dpp !== want) {
      // A real board with the other firmware would answer with garbage registers.
      return { status: 404, data: { message: `Failed to connect to the board! (The simulated V1730 runs ${want} firmware in this scenario.)` } }
    }
    const b: BoardCfg = {
      id, name: 'V1730', vme: String(cfg.vme ?? '0'), link_type: String(cfg.link_type), link_num: String(cfg.link_num),
      dpp: want, chan: 16,
    }
    const conf = this.startingConfig(b)
    // daq_manager writes reg_EF08 = "0x" + str(id) (a decimal string with a hex prefix).
    if (conf.registers.reg_EF08) conf.registers.reg_EF08.value = '0x' + String(id)
    this.configs[this.boardKey(b)] = conf
    try {
      this.physics.configure(this.scenario, this.view({ ...b } as BoardCfg))
    } catch (e) {
      delete this.configs[this.boardKey(b)]
      return { status: 404, data: { message: `Failed to connect to the board! (${String((e as Error)?.message ?? e)})` } }
    }
    this.boards.push(b)
    this.boards.sort((x, y) => x.id - y.id)
    this.calib[this.boardKey(b)] = calibRows(Array.from({ length: b.chan }, (_, c) => this.physics.calibration(c)))
    // The dashboard gets a histogram per detector channel the first time a board appears.
    if (!this.hist.histograms.length) {
      for (let c = 0; c < 2; c++) {
        this.hist.histograms.push(normaliseHistogram({
          id: `hist_demo${c}`, boardId: String(id), channel: c,
          label: `Board ${id} - Channel ${c}`, customLabel: detectorLabel(this.scenario.detectors, c),
        }, c, () => this.newId('hist_')))
      }
    }
    return { status: 200, data: this.boardsJson() }
  }

  removeBoard(id: string): boolean {
    const i = this.boards.findIndex(b => String(b.id) === String(id))
    if (i < 0) return false
    const b = this.boards[i]
    delete this.calib[this.boardKey(b)]
    this.boards.splice(i, 1)
    return true
  }

  boardsJson() { return this.boards.map(b => ({ ...b })) }

  boardInfo(b: BoardCfg): Record<string, unknown> {
    const regs = this.regs(b)
    const ctl = regValue(regs, 0x8100)
    return {
      board_id: String(b.id), board_index: this.boardIndex(b.id) ?? 0,
      model_name: 'V1730 (simulated)', model: 1730, family_code: 11, form_factor: 0,
      channels: b.chan, adc_bits: 14, serial_number: SIM_SERIAL, pcb_revision: 0, board_reg_id: b.id,
      dpp_type: b.dpp, dpp_code: b.dpp === 'DPP-PHA' ? 139 : 136, ns_per_sample: 2, ns_per_timetag: 2,
      roc_firmware: 'sim', amc_firmware: 'sim', license: 'simulated',
      channel_enable_mask: regValue(regs, 0x8120), acquisition_control: ctl,
      board_configuration: regValue(regs, 0x8000), front_panel_io_control: regValue(regs, 0x811C),
      global_trigger_mask: regValue(regs, 0x810C), trg_out_enable_mask: regValue(regs, 0x8110),
      run_delay: regValue(regs, 0x8170), start_mode: ctl & 3, start_mode_name: START_MODE_NAMES[ctl & 3],
      sync_role: (ctl & 3) ? 'master' : 'independent', conn_type: b.link_type === 'USB' ? 0 : b.link_type === 'A4818' ? 5 : 1,
      link_num: Number(b.link_num) || 0, node: b.id, vme_base: parseInt(b.vme || '0', 16) || 0,
      configured_name: b.name, configured_dpp: b.dpp, link_type: b.link_type,
    }
  }

  syncMode(): string {
    return this.boards.some(b => (regValue(this.regs(b), 0x8100) & 3) !== 0) ? 'daisy-chain' : 'independent'
  }

  softwareVersions(): Record<string, unknown> {
    const commit = (globalThis as any).__WEBDAQ_COMMIT__ ?? 'pinned'
    return {
      webdaq: `${String(commit).slice(0, 7)} (in-browser demo)`, python: null,
      platform: (globalThis as any).navigator?.userAgent ? uaFamily((globalThis as any).navigator.userAgent) : 'browser',
      caendaq: null, caendaq_has_caen: null, acquisition_mode: 'demo',
    }
  }

  /** Online write (daq_manager.write_board_register) — the safe list is checked by the caller. */
  noteRegisterWrite(b: BoardCfg, key: string, value?: string) {
    // The run's register timeline lets the run's data file be regenerated (P3):
    // [run time, register key, new value]; '*' records every register's value.
    const rec = this.running && this.save ? this.runs.find(r => r.run_number === this.runNumber) : undefined
    if (rec && rec.demo.timeline.length < 5000) {
      const regs = this.regs(b)
      const t = r6(this.simT - this.runSimStart)
      if (key === '*') for (const [k, e] of Object.entries(regs)) rec.demo.timeline.push([t, k, e.value])
      else rec.demo.timeline.push([t, key, value ?? regs[key]?.value ?? ''])
    }
    if (b === this.boards[0]) this.reconfigure()
    this.lastTraces = {}
  }


  // ─────────────────────────────────────────────────────────── run

  startRun(): { status: number; data: unknown } {
    if (this.running) return { status: 404, data: { message: 'DAQ is already running!' } }
    if (!this.boards.length) return { status: 404, data: { message: 'No CAEN boards found!' } }
    if (this.save && this.runNumber > DEMO_MAX_RUN) {
      return { status: 500, data: { message: `Failed to prepare run start (the demo keeps runs 1–${DEMO_MAX_RUN}; use Reset demo to start again).` } }
    }
    if (this.pendingGain && this.scenario.detectors === 'hpge') for (const b of this.boards) this.seedInBeam(b, this.scenario.source === 'n14pg')
    this.pendingGain = false
    const err = this.reconfigure()
    if (err) return { status: 500, data: { message: `Failed to configure acquisition (${err})` } }
    this.runBoards = this.boards.map(b => String(b.id))
    this.physics.clear()
    this.lastTraces = {}
    this.running = true
    this.runSimStart = this.simT
    this.lastDataT = this.simT
    this.startTime = isoLocal(this.clock.now())
    this.boardFailures = {}
    this.runEvents = []
    this.runBytes = 0
    this.diag = {}
    for (const b of this.boards) this.diag[String(b.id)] = { buffers_read: 0, bytes_read: 0, bytes_written: 0, blocks_dropped: 0, comm_errors: 0, events_decoded: 0, board_failures: 0 }
    this.win = []
    this.winBytes = 0
    this.winStart = this.simT
    this.winEnd = this.simT + this.stats.stats_first_interval_ms / 1000
    this.rates = null
    this.current.accumulating = true
    // Board-failure and stall verdicts belong to the run (alerting.reset_run_state).
    for (const k of Object.keys(this.alertState)) {
      const rule = this.rules.find(r => k.startsWith(r.id + ':'))
      if (rule && (rule.type === 'board_failure' || rule.type === 'stalled_buffers')) delete this.alertState[k]
    }
    if (this.save) this.recordRunStart()
    return { status: 200, data: { message: 'Run started successfully!' } }
  }

  private recordRunStart(carry?: Partial<RunRecord>, notes?: string) {
    const now = this.clock.now()
    let rec = this.runs.find(r => r.run_number === this.runNumber)
    const b0 = this.boards[0]
    const demo: RunRecord['demo'] = {
      seed: this.seed, scenario: { ...this.scenario }, sim_start_s: r6(this.simT), sim_end_s: null,
      config: b0 ? JSON.parse(JSON.stringify(this.configs[this.boardKey(b0)])) : null,
      timeline: [], events: [], bytes: 0, stats: null, roi: null, current: false,
      wall_start_ms: now, updated_ms: now,
    }
    if (!rec) {
      rec = {
        run_number: this.runNumber, start_time: isoNaive(now), end_time: null, notes: null, target_name: null,
        terminal_voltage: null, probe_voltage: null, run_type: null, accumulated_charge: null, user_id: 1,
        flag: 'unknown', board_info: [], software_versions: {}, sync_mode: null, demo,
      }
      this.runs.push(rec)
    } else {
      rec.start_time = isoNaive(now)
      rec.end_time = null
      rec.demo = demo
    }
    Object.assign(rec, carry ?? {})
    if (notes) rec.notes = notes
    // The browser starts the current log (GET /current/start/<run>) before start_run.
    if (this.current.recording && this.current.recordingRun === this.runNumber) rec.demo.current = true
    rec.board_info = this.boards.map(b => this.boardInfo(b))
    rec.software_versions = this.softwareVersions()
    rec.sync_mode = this.syncMode()
  }

  stopRun(): { status: number; data: unknown } {
    if (!this.running) return { status: 200, data: { message: 'Run stopped successfully!' } }
    // Close the last (partial) rate window so the final numbers are published.
    const b = this.boards.find(x => this.runBoards?.includes(String(x.id)))
    if (b && this.simT > this.winStart) this.closeWindow(b, this.simT)
    if (this.save) {
      const rec = this.runs.find(r => r.run_number === this.runNumber)
      if (rec) {
        rec.end_time = isoNaive(this.clock.now())
        rec.demo.sim_end_s = r6(this.simT)
        rec.demo.events = [...this.runEvents]
        rec.demo.bytes = this.runBytes
        rec.demo.roi = this.roiSnapshot(rec.run_number)
        rec.demo.updated_ms = this.clock.now()
      }
      this.runNumber++
    }
    this.running = false
    this.startTime = null
    this.current.accumulating = false
    this.autoRestart.pending = false
    this.faults = { board_fail_at_s: null, stall_at_s: null }
    return { status: 200, data: { message: 'Run stopped successfully!' } }
  }

  checkRunDirectory(): boolean {
    // data/run<N>/ exists once a run with that number was started with saving on.
    return this.runs.some(r => r.run_number === this.runNumber)
  }

  /** POST /experiment/reset (daq_manager.reset_acquisition). */
  resetAcquisition(): boolean {
    if (this.running) this.stopRun()
    this.runBoards = null
    this.lastTraces = {}
    return true
  }

  private onBoardFailure(boardId: string) {
    this.raiseRule('board_failure', `board ${boardId}`, 1, () => ({
      title: `Board ${boardId} reported a failure`,
      lines: [`Run ${this.runNumber}: the board set its FAIL flag (simulated fault).`,
        this.autoRestart.enabled ? `Auto-restart is enabled: the run restarts in ${this.autoRestart.delay} s.` : 'Auto-restart is disabled — manual intervention required.'],
    }), true)
    if (this.autoRestart.enabled && this.running) {
      this.autoRestart.pending = true
      this.autoRestart.at = this.simT + this.autoRestart.delay
      this.autoRestart.last = null
    }
  }

  /** experiment.perform_auto_restart, without a browser. */
  private doAutoRestart() {
    this.autoRestart.pending = false
    if (!this.running) return
    const old = this.runs.find(r => r.run_number === this.runNumber)
    const carry: Partial<RunRecord> = {}
    if (old) for (const f of ['target_name', 'terminal_voltage', 'probe_voltage', 'run_type'] as const) if (old[f] !== null) (carry as any)[f] = old[f]
    const failed = this.runNumber
    const wasRecording = this.current.recording
    const wasCollecting = this.stats.collecting
    if (wasRecording) this.stopCurrentRecording()
    if (wasCollecting) this.stopStatsRun()
    this.stopRun()
    if (old) {
      old.flag = 'bad'
      old.demo.updated_ms = this.clock.now()
      old.notes = `${old.notes ? old.notes + '\n' : ''}[AUTO-RESTART] Run stopped by a board failure (board ${this.runBoards?.[0] ?? '0'}, simulated) and restarted as run ${this.runNumber}.`
    }
    this.startRun()
    if (this.save) {
      const rec = this.runs.find(r => r.run_number === this.runNumber)
      if (rec) {
        Object.assign(rec, carry)
        rec.notes = `[AUTO-RESTART] Continues run ${failed} after a board failure.`
      }
      if (wasRecording) this.startCurrentRecording(this.runNumber)
      if (wasCollecting) this.startStatsRun(this.runNumber)
    }
    this.autoRestart.last = { timestamp: isoLocal(this.clock.now()), board_id: '0', failure_type: 'board failure (simulated)', old_run: failed, new_run: this.runNumber }
    this.logEvent({ kind: 'info', title: `Run ${failed} restarted automatically as run ${this.runNumber}`, lines: ['Auto-restart after a board failure (simulated fault).'], rule_id: '', rule_type: 'auto_restart', subject: 'acquisition' })
  }

  // ── current recording (current.py start_run_recording / stop_run_recording) ──
  startCurrentRecording(run: number): { message: string } {
    this.current.accumulated = 0
    this.current.recordingRun = run
    if (this.save) {
      const rec = this.runs.find(r => r.run_number === run)
      if (rec) rec.demo.current = true
    }
    this.current.recording = true
    return { message: 'Acquisition started' }
  }
  stopCurrentRecording(): { message: string } {
    this.current.recording = false
    const rec = this.runs.find(r => r.run_number === this.current.recordingRun)
    // µC to 1 nC: the picoammeter's own resolution is far coarser than a float's digits.
    if (rec) { rec.accumulated_charge = Math.round(this.current.accumulated * 1000) / 1000; rec.demo.updated_ms = this.clock.now() }
    return { message: 'Acquisition stopped' }
  }

  // ── stats.csv (stats_manager.start_run / stop_run) ──
  startStatsRun(run: number): boolean {
    this.stats.collecting = true
    this.stats.current_run = run
    this.stats.csvStart = this.simT
    this.stats.csvRows = []
    this.stats.csvPaths = this.stats.paths.filter(p => p.enabled).map(p => ({ ...p }))
    return true
  }
  stopStatsRun(): boolean {
    if (!this.stats.collecting) return false
    const rec = this.runs.find(r => r.run_number === this.stats.current_run)
    if (rec) {
      rec.demo.updated_ms = this.clock.now()
      rec.demo.stats = {
        metrics: this.stats.csvPaths.map(p => ({ name: p.alias || p.path, unit: p.unit, source: p.path })),
        rows: this.stats.csvRows,
      }
    }
    this.stats.collecting = false
    this.stats.current_run = null
    this.stats.csvRows = []
    return true
  }

  // ─────────────────────────────────────────────────────────── spectra

  spectrumTitle(htype: string, b: BoardCfg, ch: number) {
    return `SIMULATED — ${detectorLabel(this.scenario.detectors, ch)} (b${this.boardIndex(b.id) ?? 0} ch${ch}) · ${htype}_b${this.boardIndex(b.id) ?? 0}_ch${ch}`
  }

  /** spy_manager.get_histogram: the board's default spectrum, calibrated axis, spy rebin. */
  histogram(boardId: string, channel: string, htype?: string, rebinArg?: number): RootJson {
    const b = this.board(boardId)
    const ch = parseInt(channel, 10)
    if (!this.runBoards) return emptyTH1F('No data yet — start a run')
    const idx = this.boardIndex(boardId)
    if (idx === null || !b) return emptyTH1F('This board is not part of the current run')
    if (!Number.isFinite(ch) || ch < 0 || ch >= b.chan) return emptyTH1F('Could not read this histogram — see the server log')
    const type = htype ?? (b.dpp === 'DPP-PHA' ? 'energy' : 'qlong')
    if (type === 'psd') return this.psd(boardId, channel)
    if (type !== 'energy' && type !== 'qlong' && type !== 'qshort') return emptyTH1F(`No counts yet on channel ${ch}`)
    const isPha = b.dpp === 'DPP-PHA'
    // caendaq has energy for PHA and qshort/qlong for PSD; the other is empty.
    const valid = isPha ? type === 'energy' : type !== 'energy'
    const nb = type === 'qlong' ? QLONG_BINS : ENERGY_BINS
    const raw = valid && type !== 'qshort' ? this.physics.spectrum(ch) : new Uint32Array(nb)
    const [off, slope] = this.calibration(b, ch)
    const n = raw.length
    const lim = (off !== 0 || slope !== 1) ? { xmin: off, xmax: off + slope * n } : {}
    const rebin = rebinArg ?? (this.rebinFactor > 1 ? this.rebinFactor : 1)
    return th1f(raw, { name: `${type}_b${idx}_ch${ch}`, title: this.spectrumTitle(type, b, ch), rebin, ...lim })
  }

  psd(boardId: string, channel: string): RootJson {
    const b = this.board(boardId)
    const ch = parseInt(channel, 10)
    if (!this.runBoards) return emptyTH1F('No data yet — start a run')
    const idx = this.boardIndex(boardId)
    if (idx === null || !b) return emptyTH1F('This board is not part of the current run')
    const raw = (b.dpp === 'DPP-PSD' && Number.isFinite(ch) ? this.physics.psd(ch) : null) ?? new Uint32Array(PSD_XBINS * PSD_YBINS)
    const [off, slope] = this.calibration(b, ch)
    // spy_manager applies the calibration to the TH2 x axis as well (Appendix B, finding 6).
    const cal = off !== 0 || slope !== 1
    return th2f(raw, PSD_XBINS, PSD_YBINS, {
      name: `psd_b${idx}_ch${ch}`, title: this.spectrumTitle('psd', b, ch),
      xmin: cal ? off : 0, xmax: cal ? off + slope * PSD_XBINS : QLONG_MAX, ymin: 0, ymax: 1, rebinX: 16,
    })
  }

  waveform(kind: 'wave1' | 'wave2' | 'probe1' | 'probe2', boardId: string, channel: string): RootJson {
    const b = this.board(boardId)
    const ch = parseInt(channel, 10)
    if (!this.runBoards) return emptyTH1F('No data yet — start a run')
    const idx = this.boardIndex(boardId)
    if (idx === null || !b) return emptyTH1F('This board is not part of the current run')
    if (kind === 'wave2') return emptyTH1F('Trace 2 is not available')
    if (kind !== 'wave1') return emptyTH1F(`No counts yet on channel ${ch}`)
    const key = `${boardId}:${ch}`
    let trace = this.lastTraces[key] ?? null
    if (this.running && this.waveformsOn(b) && Number.isFinite(ch)) {
      trace = this.physics.waveform(ch)
      this.lastTraces[key] = trace
    }
    if (!trace || !trace.length) return emptyTH1F('No waveform — switch waveforms on for this board')
    return waveformTH1F(trace, { name: `wave1_b${idx}_ch${ch}`, title: this.spectrumTitle('wave1', b, ch) })
  }

  calibration(b: BoardCfg, ch: number): [number, number] {
    return this.calib[this.boardKey(b)]?.[ch] ?? [0, 1]
  }

  /** Integral between two axis values of a TH1F as the spy returns it (roi_analysis._integrate). */
  integrate(h: RootJson, low: number, high: number): number {
    const ax = h.fXaxis as { fNbins: number; fXmin: number; fXmax: number }
    const arr = h.fArray as ArrayLike<number>
    const n = ax.fNbins
    const find = (x: number) => {
      if (x < ax.fXmin) return 0
      if (x >= ax.fXmax) return n + 1
      return 1 + Math.floor((x - ax.fXmin) / ((ax.fXmax - ax.fXmin) / n))
    }
    let b1 = find(low), b2 = find(high)
    if (b1 < 0) b1 = 0
    if (b2 > n + 1) b2 = n + 1
    let s = 0
    for (let i = b1; i <= b2; i++) s += arr[i] ?? 0
    return s
  }

  roiIntegrals(visibleOnly: boolean, enabledOnly: boolean) {
    const results: { histogramId: string; roiId: string; gross: number; background: null; net: number }[] = []
    const cache = new Map<string, RootJson>()
    for (const h of this.hist.histograms) {
      if (visibleOnly && !h.visible) continue
      const rois = h.rois.filter(r => r.enabled || !enabledOnly)
      if (!rois.length) continue
      const key = `${h.boardId}:${h.channel}`
      let hist = cache.get(key)
      if (!hist) { hist = this.histogram(String(h.boardId), String(h.channel)); cache.set(key, hist) }
      for (const r of rois) {
        const gross = this.integrate(hist, r.low, r.high)
        results.push({ histogramId: h.id, roiId: r.id, gross, background: null, net: gross })
      }
    }
    return results
  }

  roiSnapshot(run: number) {
    const res = new Map(this.roiIntegrals(false, false).map(r => [`${r.histogramId}:${r.roiId}`, r]))
    const histograms: Record<string, unknown>[] = []
    for (const h of this.hist.histograms) {
      const rois = h.rois.map(r => {
        const x = res.get(`${h.id}:${r.id}`)
        return { ...r, gross: x?.gross ?? null, background: x?.background ?? null, net: x?.net ?? null }
      })
      if (!rois.length) continue
      histograms.push({ id: h.id, boardId: h.boardId, channel: h.channel, label: h.customLabel || h.label, rois })
    }
    return { run_number: run, written_at: isoLocal(this.clock.now()), rebin_factor: this.hist.settings.rebinFactor ?? 1, histograms }
  }

  // ─────────────────────────────────────────────────────────── alerts

  logEvent(e: Omit<AlertEventRec, 'id' | 'at' | 'seen' | 'deliveries' | 'run_number'> & { deliveries?: Record<string, boolean> }) {
    const ev: AlertEventRec = {
      id: this.newId('ev'), at: Math.round(this.clock.now() / 1000), seen: false,
      run_number: this.running ? this.runNumber : null, deliveries: e.deliveries ?? {}, ...e,
    } as AlertEventRec
    this.events.unshift(ev)
    if (this.events.length > 500) this.events.length = 500
  }

  private raiseRule(type: AlertRuleState['type'], subject: string, value: number | string | null,
    msg: () => { title: string; lines: string[] }, alerting: boolean) {
    for (const rule of this.rules) {
      if (rule.type !== type || !rule.enabled || !this.watching) continue
      const key = `${rule.id}:${subject}`
      const st = this.alertState[key] ?? (this.alertState[key] = { latched: false, value: null, last_fired: null, since: null })
      st.value = value
      if (alerting && !st.latched) {
        st.latched = true
        st.last_fired = Math.round(this.clock.now() / 1000)
        const m = msg()
        const deliveries: Record<string, boolean> = {}
        for (const t of rule.transports) deliveries[t] = false
        this.logEvent({ kind: 'alert', title: m.title, lines: [...m.lines, 'Not delivered: the demo never sends messages (nothing leaves your browser).'], rule_id: rule.id, rule_type: rule.type, subject, deliveries })
      } else if (!alerting && st.latched) {
        st.latched = false
        if (this.notifyRecovery) {
          const deliveries: Record<string, boolean> = {}
          for (const t of rule.transports) deliveries[t] = false
          this.logEvent({ kind: 'recovery', title: `${rule.name}: back to normal`, lines: [`${subject} is back in range.`], rule_id: rule.id, rule_type: rule.type, subject, deliveries })
        }
      }
    }
  }

  /** The rule types the demo evaluates locally: beam_current, board_failure (at the fault) and stalled_buffers (design §1.10). */
  evaluateAlerts() {
    if (!this.watching) return
    for (const rule of this.rules) {
      if (!rule.enabled || rule.type !== 'stalled_buffers') continue
      const b = this.boards.find(x => this.runBoards?.includes(String(x.id)))
      // A failed board has its own alert; the verdicts are reset at the next run start.
      if (!b || !this.running || this.boardFailures[String(b.id)]) continue
      const quiet = this.simT - this.lastDataT
      const limit = Number(rule.params.seconds ?? 60)
      this.raiseRuleOne(rule, `board ${b.id}`, r6(quiet), quiet >= limit, () => ({
        title: `Board ${b.id} stopped producing data`,
        lines: [`Run ${this.runNumber}: no new data blocks for ${Math.round(quiet)} s (simulated fault).`],
      }))
    }
    const I = this.current.latest[Math.min(this.current.charge_channel, 3)]
    for (const rule of this.rules) {
      if (!rule.enabled || rule.type !== 'beam_current') continue
      const p = rule.params
      const key = `${rule.id}:beam`
      const st = this.alertState[key] ?? (this.alertState[key] = { latched: false, value: null, last_fired: null, since: null })
      if (p.during_run_only && !this.running) { st.since = null; st.value = r6(I); continue }
      const bad = p.comparison === 'above' ? I > Number(p.threshold) : I < Number(p.threshold)
      if (bad) { if (st.since === null) st.since = this.simT } else st.since = null
      const sustained = bad && st.since !== null && this.simT - st.since >= Number(p.seconds ?? 0)
      this.raiseRuleOne(rule, 'beam', r6(I), sustained, () => ({
        title: `Beam current ${p.comparison} ${p.threshold} µA`,
        lines: [`The beam current reads ${I.toFixed(2)} µA (simulated).`],
      }))
    }
  }

  private raiseRuleOne(rule: AlertRuleState, subject: string, value: number, alerting: boolean, msg: () => { title: string; lines: string[] }) {
    const saved = this.rules
    this.rules = [rule]
    try { this.raiseRule(rule.type, subject, value, msg, alerting) } finally { this.rules = saved }
  }

  // ─────────────────────────────────────────────────────────── persistence

  snapshot(): Record<string, unknown> {
    return {
      v: 1, seed: this.seed, simT: this.simT, wall: this.clock.now(), tickCount: this.tickCount,
      nextBeamT: this.nextBeamT, nextSecond: this.nextSecond, nextAlertT: this.nextAlertT, idCounter: this.idCounter,
      scenario: this.scenario, boards: this.boards, configs: this.configs, calib: this.calib,
      running: this.running, startTime: this.startTime, runNumber: this.runNumber, save: this.save,
      limitSize: this.limitSize, fileSizeLimit: this.fileSizeLimit, runBoards: this.runBoards, runSimStart: this.runSimStart,
      runs: this.runs.map(r => ({ ...r, demo: { ...r.demo, config: r.demo.config ? diffConfig(r.demo.config) : null } })),
      autoRestart: this.autoRestart, boardFailures: this.boardFailures, faults: this.faults,
      diag: this.diag, win: this.win, winBytes: this.winBytes, winStart: this.winStart, winEnd: this.winEnd,
      rates: this.rates, runEvents: this.runEvents, runBytes: this.runBytes, rebinFactor: this.rebinFactor,
      hist: this.hist, current: this.current, stats: this.stats,
      metrics: [...this.metrics.entries()].map(([k, m]) => [k, m.t.slice(-600), m.v.slice(-600)]),
      telegram: this.telegram, zulip: this.zulip, rules: this.rules, notifyRecovery: this.notifyRecovery,
      watching: this.watching, alertState: this.alertState, events: this.events.slice(0, 100),
      elog: this.elog, grafana: this.grafana, cache: this.cache, scan: this.scan, seededBeamRule: this.seededBeamRule,
      lastDataT: this.lastDataT, pendingGain: this.pendingGain,
      physics: this.physics.snapshot(),
    }
  }

  restore(s: any) {
    if (!s || s.v !== 1 || (s.seed >>> 0) !== this.seed) return false
    const keys = ['tickCount', 'nextBeamT', 'nextSecond', 'nextAlertT', 'idCounter', 'scenario', 'boards', 'configs', 'calib',
      'running', 'startTime', 'runNumber', 'save', 'limitSize', 'fileSizeLimit', 'runBoards', 'runSimStart', 'runs',
      'autoRestart', 'boardFailures', 'faults', 'diag', 'win', 'winBytes', 'winStart', 'winEnd', 'rates', 'runEvents',
      'runBytes', 'rebinFactor', 'hist', 'current', 'stats', 'telegram', 'zulip', 'rules', 'notifyRecovery', 'watching',
      'alertState', 'events', 'elog', 'grafana', 'cache', 'scan', 'seededBeamRule', 'lastDataT', 'pendingGain'] as const
    for (const k of keys) if (k in s) (this as any)[k] = s[k]
    for (const r of this.runs) if (r.demo?.config) r.demo.config = expandConfig(r.demo.config as any)
    this.metrics = new Map((s.metrics ?? []).map(([k, t, v]: [string, number[], number[]]) => [k, { t, v }]))
    // Demo time continues from the snapshot; a closed tab's gap is caught up.
    this.simT = s.simT
    this.sim0 = s.simT + Math.max(0, (this.clock.now() - s.wall) / 1000)
    this.wall0 = this.clock.now()
    this.physics = this.makePhysics(this.seed)
    this.reconfigure()
    if (s.physics != null) this.physics.restore(s.physics)
    return true
  }
}

export function defaultHistSettings(): DashboardSettings {
  return {
    layout: 'grid', gridCols: 3, isLogScale: false, syncZoom: false, showLabels: true, showROIs: true,
    showIntegrals: true, autoUpdate: true, updateInterval: 5000, theme: 'auto', rebinFactor: 1,
  }
}

// ── histogram_config.py normalisation ─────────────────────────────────────

const asBool = (v: unknown, f: boolean) => typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0
  : typeof v === 'string' ? ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase()) : f
const asInt = (v: unknown, f: number) => { const n = typeof v === 'number' ? Math.trunc(v) : parseInt(String(v), 10); return Number.isFinite(n) ? n : f }
const asFloat = (v: unknown): number | null => { const n = typeof v === 'number' ? v : parseFloat(String(v)); return Number.isFinite(n) ? n : null }

export function normaliseSettings(raw: Record<string, unknown>): DashboardSettings {
  const d = defaultHistSettings() as unknown as Record<string, unknown>
  const out: Record<string, unknown> = { ...d }
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (!(k in d)) continue
    const def = d[k]
    out[k] = typeof def === 'boolean' ? asBool(v, def) : typeof def === 'number' ? asInt(v, def) : v != null ? String(v) : def
  }
  out.gridCols = Math.max(1, Math.min(6, out.gridCols as number))
  out.rebinFactor = Math.max(1, out.rebinFactor as number)
  out.updateInterval = Math.max(500, out.updateInterval as number)
  if (!['grid', 'rows', 'custom'].includes(out.layout as string)) out.layout = 'grid'
  if (!['auto', 'light', 'dark'].includes(out.theme as string)) out.theme = 'auto'
  return out as unknown as DashboardSettings
}

export function normaliseZoom(raw: any): HistogramConfig['zoom'] {
  if (!raw || typeof raw !== 'object') return null
  const z: Record<string, number> = {}
  for (const a of ['xmin', 'xmax', 'ymin', 'ymax']) { const v = asFloat(raw[a]); if (v !== null) z[a] = v }
  if (!('xmin' in z) || !('xmax' in z) || z.xmin >= z.xmax) return null
  return z as unknown as HistogramConfig['zoom']
}

export function normaliseRoi(raw: any, newId: () => string): ROI {
  let low = asFloat(raw?.low) ?? 0, high = asFloat(raw?.high) ?? 0
  if (high < low) [low, high] = [high, low]
  return {
    id: String(raw?.id || newId()), name: String(raw?.name || 'ROI'), low, high,
    color: String(raw?.color || '#ff0000'), enabled: asBool(raw?.enabled, true),
    background: raw?.background && typeof raw.background === 'object' && !Array.isArray(raw.background) ? raw.background : null,
  }
}

export function normaliseHistogram(raw: any, index: number, newId: () => string, newRoiId?: () => string): HistogramConfig {
  const boardId = String(raw?.boardId ?? raw?.board_id ?? '')
  const channel = asInt(raw?.channel, 0)
  const position = raw?.position && typeof raw.position === 'object' ? raw.position : {}
  return {
    id: String(raw?.id || newId()), boardId, channel, visible: asBool(raw?.visible, true),
    size: (['small', 'medium', 'large'].includes(raw?.size) ? raw.size : 'medium') as HistogramConfig['size'],
    label: String(raw?.label || `Board ${boardId} - Channel ${channel}`),
    customLabel: String(raw?.customLabel || ''), order: asInt(raw?.order, index),
    position: { row: asInt(position.row, 0), col: asInt(position.col, 0) },
    zoom: normaliseZoom(raw?.zoom ?? raw?.zoomRange),
    rois: (Array.isArray(raw?.rois) ? raw.rois : []).filter((r: unknown) => r && typeof r === 'object')
      .map((r: unknown) => normaliseRoi(r, newRoiId ?? newId)),
  }
}

/** Graphite time offsets: -10s, -30min, -1h, -2d, now, or epoch seconds. */
export function parseGraphiteTime(s: string, nowS: number): number | null {
  const t = String(s ?? '').trim()
  if (!t || t === 'now') return nowS
  if (/^\d+$/.test(t)) return Number(t)
  const m = /^-(\d+(?:\.\d+)?)(s|sec|min|h|d|w)$/.exec(t)
  if (!m) return null
  const mult: Record<string, number> = { s: 1, sec: 1, min: 60, h: 3600, d: 86400, w: 604800 }
  return nowS - Number(m[1]) * mult[m[2]]
}

function uaFamily(ua: string) {
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Edg\//.test(ua)) return 'Edge'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua)) return 'Safari'
  return 'browser'
}

/** calib/<name>_<id>.cal rows, rounded as the file would print them. */
function calibRows(rows: [number, number][]): [number, number][] {
  return rows.map(([a, b]) => [Number(a.toPrecision(10)), Number(b.toPrecision(10))])
}

/** A run's register file is stored as its difference from the defaults (sessionStorage budget). */
function diffConfig(cfg: BoardConfigFile): any {
  const nb = Number(cfg.dgtzs.NbChannels) || 16
  const dpp: Dpp = cfg.registers.reg_10C4 ? 'DPP-PHA' : 'DPP-PSD'
  const base = defaultBoardConfig(cfg.dgtzs.BoardName, Number(cfg.dgtzs.BoardNb) || 0, dpp, nb)
  const changed: Record<string, string> = {}
  for (const [k, e] of Object.entries(cfg.registers)) if (base.registers[k]?.value !== e.value) changed[k] = e.value
  return { diff: true, dgtzs: cfg.dgtzs, dpp, changed }
}
function expandConfig(c: any): BoardConfigFile {
  if (!c?.diff) return c
  const cfg = defaultBoardConfig(c.dgtzs.BoardName, Number(c.dgtzs.BoardNb) || 0, c.dpp, Number(c.dgtzs.NbChannels) || 16)
  cfg.dgtzs = c.dgtzs
  for (const [k, v] of Object.entries(c.changed as Record<string, string>)) if (cfg.registers[k]) cfg.registers[k].value = v
  return cfg
}

export { hex4 }
