/**
 * One burn as the explorer asks for it, and its answer in mass fractions:
 * the message the Web Worker takes and returns, and the shape of the
 * precomputed baselines (public/rates/<id>.baseline.json). Pure; Node and the
 * worker share it.
 */

import { compile, integrate, type Compiled, type History } from "./solver.ts"
import type { Network, Scenario } from "./schema.ts"

export interface RunRequest {
  network: string
  history: History
  X0: Record<string, number>
  tEnd_s: number
  until: { nucleus: string; fraction: number } | null
  screening: boolean
  scale: Record<string, number>
  rtol?: number
  atol?: number
  /** nuclei whose abundance over time to return (all when absent) */
  track?: string[]
}

export interface RunResult {
  /** sample times, s */
  t: number[]
  /** mass fractions per sample: of `track` when given, else of every nucleus in network order */
  X: number[][]
  track?: string[]
  /** mass fractions at the end */
  final: number[]
  tFinal: number
  stopped: "time" | "until" | "steps"
  steps: number
  ms: number
  exposure?: { tau_cm2: number; peak_cm3: number }
}

/** The request a scenario makes, unmodified. */
export function scenarioRequest(network: Network, s: Scenario, screening = true): RunRequest {
  return {
    network: network.id,
    history: { kind: "constant", T9: s.T9, rho: s.rho },
    X0: s.X,
    tEnd_s: s.time_s,
    until: s.until,
    screening,
    scale: {},
    ...(network.solver?.rtol ? { rtol: network.solver.rtol } : {}),
    ...(network.ui.track ? { track: trackOf(network) } : {}),
    ...(network.solver?.atol ? { atol: network.solver.atol } : {}),
  }
}

/** A big network keeps the time series of its light nuclei and of `ui.track`. */
export function trackOf(network: Network): string[] {
  const keep = new Set(network.ui.track ?? [])
  return network.nuclei.filter((n) => n.Z < 26 || keep.has(n.name)).map((n) => n.name)
}

const round = (x: number) => (x === 0 ? 0 : Number(x.toPrecision(7)))

export function run(c: Compiled, req: RunRequest, maxSamples = 120): RunResult {
  const res = integrate(c, {
    history: req.history,
    X0: req.X0,
    tEnd_s: req.tEnd_s,
    until: req.until,
    screening: req.screening,
    scale: req.scale,
    rtol: req.rtol,
    atol: req.atol,
    maxSamples,
    neutronExposure: c.index.has("n"),
  })
  const A = c.A
  const toX = (Y: Float64Array) => Array.from(Y, (y, i) => round(Math.max(0, y * A[i])))
  const cols = req.track?.map((name) => c.index.get(name)).filter((i): i is number => i !== undefined)
  return {
    t: res.t.map(round),
    X: cols ? res.Y.map((Y) => cols.map((i) => round(Math.max(0, Y[i] * A[i])))) : res.Y.map(toX),
    ...(cols ? { track: cols.map((i) => c.network.nuclei[i].name) } : {}),
    ...(res.exposure ? { exposure: res.exposure } : {}),
    final: toX(res.final),
    tFinal: res.tFinal,
    stopped: res.stopped,
    steps: res.steps,
    ms: Math.round(res.ms),
  }
}

/** A stable key for a request (to match a precomputed baseline). */
export function requestKey(req: RunRequest): string {
  const scale = Object.entries(req.scale)
    .filter(([, v]) => v !== 1)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  return JSON.stringify([
    req.network,
    req.history,
    req.X0,
    req.tEnd_s,
    req.until,
    req.screening,
    scale,
    req.rtol ?? null,
    req.atol ?? null,
    req.track ?? null,
  ])
}

const cache = new Map<string, Compiled>()

/** compile(), once per network object. */
export function compiled(network: Network): Compiled {
  let c = cache.get(network.id)
  if (!c || c.network !== network) {
    c = compile(network)
    cache.set(network.id, c)
  }
  return c
}
