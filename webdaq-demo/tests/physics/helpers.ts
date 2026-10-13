/**
 * Test helpers: a BoardView over WebDAQ's test-mode register defaults
 * (server/app/utils/board_defaults.py), and the engine with its data loaded from disk.
 */
import '../../sim/physics/traces' // registers the trace synthesis (a lazy chunk in the demo)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BoardView, Dpp, Scenario } from '../../sim/physics/api'
import { DEFAULT_SCENARIO } from '../../sim/physics/api'
import { createPhysics, registerPhysicsData } from '../../sim/physics/engine'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const LINES = JSON.parse(readFileSync(join(ROOT, 'sim/data/lines.json'), 'utf8'))
export function table(kind: string) {
  return JSON.parse(readFileSync(join(ROOT, 'tables', `${kind}.json`), 'utf8'))
}

registerPhysicsData({ lines: LINES, response: { hpge: table('hpge'), bgo: table('bgo'), ej309: table('ej309') } })

// board_defaults.py:36-118, per channel (channel-0 addresses)
const PHA: Record<number, number> = {
  0x1020: 500, 0x1028: 0, 0x1034: 10, 0x1038: 100, 0x1054: 0x4, 0x1058: 6, 0x105c: 50, 0x1060: 25,
  0x1064: 12, 0x1068: 500, 0x106c: 100, 0x1070: 0, 0x1074: 100, 0x1078: 100, 0x1080: 0x400004,
  0x1084: 10, 0x1098: 0x8000, 0x10a0: 0, 0x10c4: 0x1000, 0x10d4: 0,
}
const PSD: Record<number, number> = {
  0x1020: 500, 0x1028: 0, 0x1034: 10, 0x1038: 100, 0x103c: 0, 0x1044: 0, 0x1054: 20, 0x1058: 100,
  0x105c: 10, 0x1060: 100, 0x1064: 0, 0x106c: 0, 0x1070: 10, 0x1074: 100, 0x1078: 100, 0x107c: 100,
  // invert (bit 16) set for the negative PMT pulses, as the demo seeds it (design §3.2)
  0x1080: 0x400000 | (1 << 16), 0x1084: 0, 0x1098: 0x8000, 0x10d4: 0, 0x10d8: 0,
}
const MANDATORY = (1 << 4) | (1 << 8) | (1 << 18) | (1 << 19)

export interface TestBoard extends BoardView {
  set(base: number, value: number, ch?: number): void
  setBoard(addr: number, value: number): void
}

export function makeBoard(dpp: Dpp, nChannels = 16): TestBoard {
  const per = new Map<number, number>()
  const base = dpp === 'DPP-PHA' ? PHA : PSD
  const board = new Map<number, number>([[0x8000, MANDATORY], [0x8120, (1 << nChannels) - 1]])
  const b: TestBoard = {
    dpp, nChannels, nsPerSample: 2, waveformsEnabled: false,
    chReg: (a, ch) => per.get(a + ch * 0x100) ?? base[a] ?? 0,
    reg: (a) => board.get(a) ?? 0,
    channelEnabled: (ch) => ((board.get(0x8120) ?? 0) >>> ch & 1) === 1,
    set(a, v, ch) {
      if (ch === undefined) for (let c = 0; c < nChannels; c++) per.set(a + c * 0x100, v)
      else per.set(a + ch * 0x100, v)
    },
    setBoard(a, v) { board.set(a, v) },
  }
  return b
}

/** Trapezoid "tuned" for the HPGe (design §4.1 step 6): rise 4 µs, flat 1 µs, decay 50 µs. */
export function tuneHpge(b: TestBoard): void {
  b.set(0x105c, 500)   // 4 µs
  b.set(0x1060, 125)   // 1 µs
  b.set(0x1068, 6250)  // 50 µs
  b.set(0x1064, 60)    // peaking 480 ns into the flat top
  b.set(0x1078, 700)   // peak hold-off 5.6 µs
  b.set(0x1098, 0x1999) // DC offset 10 % (positive pulses)
}

export function scenario(s: Partial<Scenario>): Scenario {
  return { ...DEFAULT_SCENARIO, ...s }
}

export function engine(seed: number, s: Partial<Scenario>, b: TestBoard) {
  const e = createPhysics(seed)
  e.configure(scenario(s), b)
  e.clear()
  return e
}

/** Run n ticks of 50 ms; returns summed counters per channel. */
export function run(e: ReturnType<typeof engine>, seconds: number, beam = 0, dt = 0.05) {
  const tot = Array.from({ length: 16 }, () => ({ offered: 0, events: 0, pileup: 0, lost: 0, saturated: 0, dead_s: 0 }))
  let bytes = 0
  const n = Math.round(seconds / dt)
  for (let i = 0; i < n; i++) {
    const r = e.tick({ t_s: i * dt, dt_s: dt, beamCurrent_uA: beam })
    bytes += r.bytes
    r.channels.forEach((c, k) => {
      const t = tot[k]
      t.offered += c.offered; t.events += c.events; t.pileup += c.pileup
      t.lost += c.lost; t.saturated += c.saturated; t.dead_s += c.dead_s
    })
  }
  return { tot, bytes }
}
