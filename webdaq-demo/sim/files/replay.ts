/**
 * Regenerate a run's events from what the run record keeps — seed, scenario,
 * starting registers, register/scenario timeline, demo-time span — with a fresh
 * physics engine. Nothing per event is ever stored (design §3.9). The result is
 * statistically the run that was taken (same detectors, settings, rates and
 * beam), not the same events as the live spectrum: the live engine's random
 * streams also served traces and earlier runs.
 */
import { createPhysics, physicsDataReady, type BoardView, type Scenario } from '../physics/api'
import type { BoardConfigFile } from '../state/registers'
import type { RunRecord } from '../state/daq'

export interface ReplayEvent {
  ch: number
  /** Time stamp in board ticks (2 ns for the V1730). */
  ts: number
  /** PHA: energy (15 bit). PSD: Q_short (15 bit). */
  a: number
  /** PSD: Q_long (16 bit). */
  b: number
  pu: boolean
  satu: boolean
}

export interface Replay {
  dpp: 'DPP-PHA' | 'DPP-PSD'
  boardId: number
  /** Events grouped by readout block (one block per replay step), each block time-sorted. */
  blocks: ReplayEvent[][]
  total: number
  truncated: boolean
}

export const EVENT_CAP = 50000
export const NS_PER_TICK = 2
const STEP_S = 0.25

const mix = (a: number, b: number) => {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
  return (h ^ (h >>> 15)) >>> 0
}

function view(cfg: BoardConfigFile, dpp: 'DPP-PHA' | 'DPP-PSD'): BoardView {
  const val = (a: number) => {
    const e = cfg.registers[`reg_${a.toString(16).toUpperCase().padStart(4, '0')}`]
    const v = e ? parseInt(e.value, 16) : 0
    return Number.isFinite(v) ? v >>> 0 : 0
  }
  return {
    dpp, nChannels: Number(cfg.dgtzs.NbChannels) || 16, nsPerSample: 2,
    chReg: (base, ch) => val(base + ch * 0x100), reg: val,
    channelEnabled: ch => ((val(0x8120) >>> ch) & 1) === 1,
    waveformsEnabled: (val(0x8000) & (1 << 16)) !== 0,
  }
}

/** Null when the run cannot be replayed (no register file, or its detector data not loaded). */
export function replayRun(run: RunRecord, endS: number, cap = EVENT_CAP): Replay | null {
  const cfg0 = run.demo.config
  if (!cfg0) return null
  let scenario: Scenario = { ...run.demo.scenario }
  if (!physicsDataReady(scenario.detectors)) return null
  const dpp = cfg0.registers.reg_10C4 ? 'DPP-PHA' : 'DPP-PSD'
  const cfg: BoardConfigFile = JSON.parse(JSON.stringify(cfg0))
  const engine = createPhysics(mix(run.demo.seed, run.run_number))
  try { engine.configure(scenario, view(cfg, dpp)) } catch { return null }
  engine.clear()
  const duration = Math.max(0, endS - run.demo.sim_start_s)
  const timeline = [...run.demo.timeline].sort((x, y) => x[0] - y[0])
  let ti = 0
  const blocks: ReplayEvent[][] = []
  let total = 0
  let block: ReplayEvent[] = []
  engine.eventSink = (ch, t, a, b, pu, satu) => {
    if (total >= cap) return
    block.push({ ch, ts: Math.max(0, Math.round((t * 1e9) / NS_PER_TICK)), a, b, pu, satu })
    total++
  }
  for (let t = 0; t < duration && total < cap; t += STEP_S) {
    let changed = false
    while (ti < timeline.length && timeline[ti][0] <= t) {
      const [, key, value] = timeline[ti++]
      if (key === 'scenario') { try { scenario = { ...scenario, ...JSON.parse(value) } } catch { /* ignore */ } }
      else if (cfg.registers[key]) cfg.registers[key].value = value
      changed = true
    }
    if (changed) { try { engine.configure(scenario, view(cfg, dpp)) } catch { /* keep the previous settings */ } }
    const dt = Math.min(STEP_S, duration - t)
    const beam = engine.beamSample(Math.round((run.demo.sim_start_s + t) * 10) / 10)[0]
    engine.tick({ t_s: t, dt_s: dt, beamCurrent_uA: beam })
    if (block.length) {
      block.sort((x, y) => x.ts - y.ts)
      blocks.push(block)
      block = []
    }
  }
  engine.eventSink = null
  return { dpp, boardId: Number(cfg.dgtzs.BoardNb) || 0, blocks, total, truncated: total >= cap }
}
