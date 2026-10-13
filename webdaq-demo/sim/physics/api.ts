/**
 * The interface between the simulated DAQ (sim/state, owned by the mock-backend
 * phase) and the physics engine (sim/physics, owned by the physics phase).
 *
 * The state machine only ever talks to physics through what is declared here.
 * The bodies below are the P1 PLACEHOLDER: flat spectra, a flat noisy trace and
 * a constant beam, so the mock backend can be built and tested before the
 * physics exists. The physics phase replaces the bodies (or re-exports its own
 * implementation from here) and keeps the signatures. Changing a signature is a
 * change to both phases: say so in webdaq-demo/README.md ("Physics interface").
 *
 * Conventions
 *  - Times are in seconds (simulated), energies in keV, currents in µA.
 *  - Channel numbers are 0..nChannels-1 of the single simulated V1730 (board 0).
 *  - Register addresses are numbers. Per-channel registers are given by their
 *    channel-0 address (0x10XX); the value for channel c lives at 0x1cXX
 *    (board_defaults.py:18-26), which BoardView.chReg resolves.
 *  - Everything must be deterministic for a given seed and call sequence:
 *    no Math.random(), no Date.now(). Use streams derived from the seed.
 *  - The engine runs inside the Web Worker; no DOM, no imports from shim/.
 */

// ─────────────────────────────────────────────────────────────── scenario

export type Dpp = 'DPP-PHA' | 'DPP-PSD'

/**
 * hpge → DPP-PHA; bgo, ej309 (liquid scintillator, n/γ PSD) and he3 → DPP-PSD.
 * The physics engine may refuse a kind it does not model yet by throwing in
 * configure(); the state machine then keeps the previous scenario.
 */
export type DetectorKind = 'hpge' | 'bgo' | 'ej309' | 'he3'
/** Neutron sources (ambe, cf252) are meant for the ej309/he3 detectors. */
export type SourceId = 'co60' | 'cs137' | 'background' | 'n14pg' | 'ambe' | 'cf252'

/** The firmware each detector kind runs on the simulated V1730 (Jakub: V1730 for both). */
export function dppFor(kind: DetectorKind): Dpp {
  return kind === 'hpge' ? 'DPP-PHA' : 'DPP-PSD'
}

/** What the visitor chose on the start page / scenario panel (design §3.2). */
export interface Scenario {
  detectors: DetectorKind
  source: SourceId
  /** Source–detector distance (front face), cm; user-adjustable, 1–50. */
  distance_cm: number
  /** Calibration-source activity, Bq (default 20e3, range 1e3–1e6). */
  activity_Bq: number
  /** Room background level (design §3.3). */
  background: 'underground' | 'surface'
  /** Declared in-beam yield factor (default 20, shown in the scenario panel). */
  yield_factor: number
  /** Beam current I0 for the in-beam source, µA (default 100; 0 for sources). */
  beam_I0_uA: number
}

export const DISTANCE_MIN_CM = 1
export const DISTANCE_MAX_CM = 50

export const DEFAULT_SCENARIO: Scenario = {
  detectors: 'hpge',
  source: 'co60',
  distance_cm: 10,
  activity_Bq: 20e3,
  background: 'underground',
  yield_factor: 20,
  beam_I0_uA: 0,
}

/** Read-only view of the simulated board, exactly as the tuner/dashboard set it. */
export interface BoardView {
  dpp: Dpp
  /** 16 for the V1730. */
  nChannels: number
  /** ADC sampling period, ns (2 for x730). The tuner's time step is 8 ns. */
  nsPerSample: number
  /** Value of a per-channel register, given its channel-0 address (0x10XX). */
  chReg(base: number, ch: number): number
  /** Value of a board-wide register (0x8000, 0x8100, 0x8120, …). */
  reg(addr: number): number
  /** 0x8120 channel-enable mask bit for ch. */
  channelEnabled(ch: number): boolean
  /**
   * Waveform recording on for the board: the per-board spy switch
   * (/waveforms/activate/<id>) — which sets 0x8000 bit 16, as WebDAQ does.
   */
  waveformsEnabled: boolean
}

// ──────────────────────────────────────────────────────────────── ticking

export interface TickEnv {
  /** Simulated seconds since run start, at the start of this tick. */
  t_s: number
  /** Tick length in seconds: 0.05 normally, longer when catching up (§3.11). */
  dt_s: number
  /** Beam current on target during this tick, µA (from beamSample). */
  beamCurrent_uA: number
}

/** What one channel did during one tick. Rates are these divided by dt_s. */
export interface ChannelCounters {
  /** Arrivals offered to the channel (physics + noise triggers). */
  offered: number
  /** Accepted triggers, i.e. events written (event_rate). */
  events: number
  /** Events flagged pile-up (pileup_rate); not histogrammed. */
  pileup: number
  /** Events lost to readout throughput (lost_rate). */
  lost: number
  /** Events over the input range (satu_rate); not histogrammed. */
  saturated: number
  /** Dead time accumulated in this tick, seconds. */
  dead_s: number
}

export interface TickResult {
  /** Length nChannels. */
  channels: ChannelCounters[]
  /** Bytes the board read out in this tick (write_rate, bandwidth). */
  bytes: number
  /** Aggregates dropped for lack of link bandwidth (board-health blocks_dropped). */
  blocksDropped: number
}

/** Ground truth for the tour's live line (design §4.1). */
export interface FwhmProbe {
  energy_keV: number
  centroid_keV: number
  fwhm_keV: number
  /** Net counts in the peak so far. */
  counts: number
}

export interface PhysicsEngine {
  /**
   * (Re)configure from the scenario and the board's registers. Called at run
   * start, when the scenario changes, and after every register write (online
   * tuning), so derived quantities can be cached here rather than per tick.
   */
  configure(scenario: Scenario, board: BoardView): void
  /** Zero every spectrum and counter (run start, POST /experiment/reset). */
  clear(): void
  /** Advance by env.dt_s and fill the spectra. Called only while running. */
  tick(env: TickEnv): TickResult
  /**
   * The live 1-D spectrum of a channel: energy (PHA, 32768 bins) or Q_long
   * (PSD, 65536 bins), raw ADC bins without under/overflow. The caller does not
   * mutate it and does not keep it across ticks.
   */
  spectrum(ch: number): Uint32Array
  /**
   * The PSD 2-D histogram of a channel (PSD boards only, else null):
   * PSD_XBINS × PSD_YBINS, x fastest, index = iy * PSD_XBINS + ix,
   * x = Q_long over [0, QLONG_MAX), y = 1 − Q_short/Q_long over [0, 1].
   */
  psd(ch: number): Uint32Array | null
  /**
   * A fresh trace for the probe selected in 0x8000[13:12], int16 samples, one
   * per ADC sample, length = Record Length. Called on request only (one per
   * tuner / waveform-dashboard refresh), while running with waveforms on.
   * Null when the channel has nothing to show.
   */
  waveform(ch: number): Int16Array | null
  /** Beam-current readings at simulated time t_s: [target, coll. 1, coll. 2, idle], µA. */
  beamSample(t_s: number): [number, number, number, number]
  /** Fitted peak near energy_keV on channel ch, or null when there is none. */
  fwhmProbe(ch: number, energy_keV: number): FwhmProbe | null
  /** JSON-serialisable state for sessionStorage (spectra compactly encoded). */
  snapshot(): unknown
  /** Restore what snapshot() returned (same seed, same scenario). */
  restore(snapshot: unknown): void
}

/** Array sizes of caendaq's HistogramStore (spy.py:33, HistogramStore.hpp:22-28). */
export const ENERGY_BINS = 32768
export const QLONG_BINS = 65536
export const PSD_XBINS = 2048
export const PSD_YBINS = 256
export const QLONG_MAX = 65536

// ───────────────────────────────────────────────────────────── ROOT JSON

/** A TBufferJSON-shaped TH1F/TH2F, as JSROOT.parse expects it. */
export type RootJson = Record<string, unknown> & { _typename: string }

export interface TH1Options {
  /** fName ("energy_b0_ch0"). */
  name: string
  /** fTitle; the demo prefixes "SIMULATED — " (design §5.1). */
  title: string
  /** Axis limits; defaults [0, nbins). The calibration moves them (§1.6). */
  xmin?: number
  xmax?: number
  /** Rebin factor applied by ROOT's TH1::Rebin (sums groups, drops the rest). */
  rebin?: number
}

function axis(name: string, nbins: number, xmin: number, xmax: number): RootJson {
  return {
    _typename: 'TAxis', fUniqueID: 0, fBits: 0, fName: name, fTitle: '',
    fNdivisions: 510, fAxisColor: 1, fLabelColor: 1, fLabelFont: 42,
    fLabelOffset: 0.005, fLabelSize: 0.035, fTickLength: 0.03, fTitleOffset: 1,
    fTitleSize: 0.035, fTitleColor: 1, fTitleFont: 42,
    fNbins: nbins, fXmin: xmin, fXmax: xmax, fXbins: [], fFirst: 0, fLast: 0,
    fBits2: 0, fTimeDisplay: false, fTimeFormat: '', fLabels: null, fModLabs: null,
  }
}

function histBase(typename: string, name: string, title: string, ncells: number, entries: number): RootJson {
  return {
    _typename: typename, fUniqueID: 0, fBits: 8, fName: name, fTitle: title,
    fLineColor: 602, fLineStyle: 1, fLineWidth: 1, fFillColor: 0, fFillStyle: 1001,
    fMarkerColor: 1, fMarkerStyle: 1, fMarkerSize: 1, fNcells: ncells,
    fBarOffset: 0, fBarWidth: 1000, fEntries: entries, fTsumw: 0, fTsumw2: 0,
    fTsumwx: 0, fTsumwx2: 0, fMaximum: -1111, fMinimum: -1111, fNormFactor: 0,
    fContour: [], fSumw2: [], fOption: '',
    fFunctions: { _typename: 'TList', name: 'TList', arr: [], opt: [] },
    fBufferSize: 0, fBuffer: [], fBinStatErrOpt: 0, fStatOverflows: 2,
  }
}

/**
 * TH1F as TBufferJSON writes it: fArray has nbins+2 entries (underflow, bins,
 * overflow), fEntries is the sum, no stats box (spy.py:75-93). `contents` holds
 * the bins only. fArray is a Float64Array so the worker can transfer it; the
 * main-thread adapter turns it back into a plain array.
 */
export function th1f(contents: ArrayLike<number>, o: TH1Options): RootJson {
  const n0 = contents.length
  const r = Math.max(1, Math.floor(o.rebin ?? 1))
  const n = Math.max(1, Math.floor(n0 / r))
  const arr = new Float64Array(n + 2)
  let entries = 0
  for (let i = 0; i < n * r; i++) { arr[1 + Math.floor(i / r)] += contents[i]; entries += contents[i] }
  for (let i = n * r; i < n0; i++) { arr[n + 1] += contents[i]; entries += contents[i] }
  const xmin = o.xmin ?? 0
  const xmaxRaw = o.xmax ?? n0
  // TH1::Rebin keeps the axis limits of the bins it keeps.
  const xmax = xmin + (xmaxRaw - xmin) * (n * r) / n0
  const h = histBase('TH1F', o.name, o.title, n + 2, entries)
  h.fXaxis = axis('xaxis', n, xmin, xmax)
  h.fYaxis = axis('yaxis', 1, 0, 1)
  h.fZaxis = axis('zaxis', 1, 0, 1)
  h.fArray = arr
  return h
}

/** The 100-bin TH1F whose title says why there is nothing (spy.py:46-66). */
export function emptyTH1F(reason: string): RootJson {
  return th1f(new Float64Array(100), { name: 'no_data', title: reason })
}

export interface TH2Options {
  name: string
  title: string
  xmin: number
  xmax: number
  ymin: number
  ymax: number
  /** TH2::RebinX factor (the PSD route uses 16: 2048 → 128 bins). */
  rebinX?: number
}

/** TH2F as TBufferJSON writes it: fArray is (ny+2)×(nx+2), ix fastest. */
export function th2f(contents: ArrayLike<number>, nx: number, ny: number, o: TH2Options): RootJson {
  const r = Math.max(1, Math.floor(o.rebinX ?? 1))
  const mx = Math.floor(nx / r)
  const arr = new Float64Array((ny + 2) * (mx + 2))
  let entries = 0
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < mx * r; ix++) {
      const v = contents[iy * nx + ix]
      if (v) { arr[(iy + 1) * (mx + 2) + 1 + Math.floor(ix / r)] += v; entries += v }
    }
  }
  const h = histBase('TH2F', o.name, o.title, (ny + 2) * (mx + 2), entries)
  h.fXaxis = axis('xaxis', mx, o.xmin, o.xmin + (o.xmax - o.xmin) * (mx * r) / nx)
  h.fYaxis = axis('yaxis', ny, o.ymin, o.ymax)
  h.fZaxis = axis('zaxis', 1, 0, 1)
  h.fScalefactor = 1
  h.fTsumwy = 0; h.fTsumwy2 = 0; h.fTsumwxy = 0
  h.fArray = arr
  return h
}

/** A trace as a TH1F, one bin per sample (spy.py:139-148). */
export function waveformTH1F(samples: ArrayLike<number>, o: { name: string; title: string }): RootJson {
  return th1f(samples, { name: o.name, title: o.title, xmin: 0, xmax: samples.length })
}

// ─────────────────────────────────────────────── P1 placeholder engine

/** splitmix32: seeds the placeholder's single stream. */
function splitmix32(a: number) {
  return () => {
    a |= 0; a = (a + 0x9e3779b9) | 0
    let t = a ^ (a >>> 16); t = Math.imul(t, 0x21f0aaad)
    t ^= t >>> 15; t = Math.imul(t, 0x735a2d97)
    return ((t ^= t >>> 15) >>> 0) / 4294967296
  }
}

/**
 * PLACEHOLDER (P1). Flat spectra at a fixed rate on the two detector channels
 * (0 and 1) and a trickle of noise on the others; a flat noisy trace; the
 * scenario's I0 as a constant beam. To be replaced by the physics phase.
 */
export function createPhysics(seed: number): PhysicsEngine {
  let rnd = splitmix32(seed >>> 0)
  let board: BoardView | null = null
  let scenario: Scenario = DEFAULT_SCENARIO
  let spectra: Uint32Array[] = []
  let psds: (Uint32Array | null)[] = []
  const alloc = () => {
    const n = board?.nChannels ?? 16
    const bins = board?.dpp === 'DPP-PSD' ? QLONG_BINS : ENERGY_BINS
    spectra = Array.from({ length: n }, () => new Uint32Array(bins))
    psds = Array.from({ length: n }, () => (board?.dpp === 'DPP-PSD' ? new Uint32Array(PSD_XBINS * PSD_YBINS) : null))
  }
  alloc()
  return {
    configure(s, b) {
      const realloc = !board || b.dpp !== board.dpp || b.nChannels !== board.nChannels
      scenario = s; board = b
      if (realloc) alloc()
    },
    clear() { alloc() },
    tick(env) {
      const n = board?.nChannels ?? 16
      const channels: ChannelCounters[] = []
      let bytes = 0
      for (let ch = 0; ch < n; ch++) {
        const on = board ? board.channelEnabled(ch) : true
        const rate = !on ? 0 : ch < 2 ? 500 : 0.5
        const mean = rate * env.dt_s
        const events = Math.floor(mean + rnd())
        const spec = spectra[ch]
        const nb = spec.length
        for (let k = 0; k < events; k++) {
          spec[Math.floor(rnd() * nb * 0.9)]++
          const p = psds[ch]
          if (p) p[Math.floor(rnd() * PSD_YBINS) * PSD_XBINS + Math.floor(rnd() * PSD_XBINS * 0.9)]++
        }
        bytes += events * 8
        channels.push({ offered: events, events, pileup: 0, lost: 0, saturated: 0, dead_s: 0 })
      }
      return { channels, bytes, blocksDropped: 0 }
    },
    spectrum(ch) { return spectra[ch] ?? new Uint32Array(ENERGY_BINS) },
    psd(ch) { return psds[ch] ?? null },
    waveform(ch) {
      if (!board) return null
      const len = Math.max(8, Math.min(65536, (board.chReg(0x1020, ch) || 125) * 8))
      const base = 1000
      const out = new Int16Array(len)
      for (let i = 0; i < len; i++) out[i] = base + Math.round((rnd() - 0.5) * 8)
      return out
    },
    beamSample() {
      const I = scenario.source === 'n14pg' ? scenario.beam_I0_uA : 0
      return [I, I * 0.05, I * 0.03, 0]
    },
    fwhmProbe() { return null },
    snapshot() { return null },
    restore() { /* placeholder keeps nothing */ },
  }
}
