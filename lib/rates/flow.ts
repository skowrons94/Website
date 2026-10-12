/**
 * Where the matter goes: the path a nucleus actually follows through a
 * network at given conditions, its bottleneck, and the flow through each
 * reaction over a burn. Pure; the explorer and test:rates share it.
 */

import { makeSystem, type Compiled, type IntegrateOptions } from "./solver.ts"

export interface PathStep {
  /** the nucleus that waits */
  nucleus: number
  /** the reaction that most often ends the wait (index into network.reactions) */
  reaction: number
  /** mean life of the nucleus against every reaction that destroys it, s */
  tau: number
  /** the share of that reaction among them */
  share: number
}

/**
 * The path of the flow: from `start`, each nucleus goes on by the reaction
 * that destroys it fastest, to that reaction's heaviest product, until the
 * path closes on itself (a cycle) or reaches a nucleus nothing destroys.
 * `taus` are the per-reaction waiting times of `lifetimes()`. The lifetime of
 * a nucleus is 1/Σλ over all its reactions, so a branching is taken into
 * account: at nova temperatures ¹³N captures a proton in a fraction of a
 * second long before it decays, and the hot CNO cycle waits on ¹⁴O and ¹⁵O.
 */
export function dominantPath(c: Compiled, taus: ArrayLike<number>, start: number, maxLen = 24): PathStep[] {
  const { network } = c
  const out: PathStep[] = []
  const seen = new Set<number>()
  let i = start
  while (!seen.has(i) && out.length < maxLen) {
    seen.add(i)
    let total = 0
    let best = -1
    let bestRate = 0
    network.reactions.forEach((r, k) => {
      if (r.target !== i) return
      const rate = Number.isFinite(taus[k]) && taus[k] > 0 ? 1 / taus[k] : 0
      total += rate
      if (rate > bestRate) {
        bestRate = rate
        best = k
      }
    })
    if (best < 0 || !(total > 0)) break
    out.push({ nucleus: i, reaction: best, tau: 1 / total, share: bestRate / total })
    const next = heaviestProduct(c, best)
    if (next === undefined) break
    i = next
  }
  return out
}

/** The heaviest product of a reaction: where the flow goes on. */
export function heaviestProduct(c: Compiled, reaction: number): number | undefined {
  const { network } = c
  return [...network.reactions[reaction].products].sort(
    (a, b) => network.nuclei[b].A - network.nuclei[a].A || network.nuclei[b].Z - network.nuclei[a].Z,
  )[0]
}

/**
 * Does the path close on itself (a cycle rather than a chain)? Only when
 * the heavy product of its last step is where it started: the protons that
 * ³He + ³He gives back do not make the pp chain a cycle.
 */
export function closes(c: Compiled, path: PathStep[]): boolean {
  if (path.length < 2) return false
  return heaviestProduct(c, path[path.length - 1].reaction) === path[0].nucleus
}

/** The slowest step of a path. */
export function slowest(path: PathStep[]): PathStep | null {
  return path.reduce<PathStep | null>((a, b) => (!a || b.tau > a.tau ? b : a), null)
}

/**
 * The flow through every reaction over a burn, ∫ flux dt in mol/g, from the
 * burn's samples (trapezoids in t). `X` holds the mass fractions of every
 * nucleus at each time (a light network's full result).
 */
export function integratedFlows(
  c: Compiled,
  opts: Pick<IntegrateOptions, "scale" | "history" | "screening" | "provider">,
  t: number[],
  X: number[][],
): Float64Array {
  const sys = makeSystem(c, opts)
  const out = new Float64Array(c.nr)
  let prev: Float64Array | null = null
  for (let s = 0; s < t.length; s++) {
    const Y = new Float64Array(c.n)
    for (let i = 0; i < c.n; i++) Y[i] = X[s][i] / c.A[i]
    sys.fluxes(t[s], Y)
    const now = Float64Array.from(sys.flux)
    if (prev) {
      const dt = t[s] - t[s - 1]
      for (let r = 0; r < c.nr; r++) out[r] += 0.5 * dt * (prev[r] + now[r])
    }
    prev = now
  }
  return out
}

/**
 * The bottleneck as the page states it: the slowest step of the path that
 * actually runs during the burn. Every step is timed by its reaction's own
 * waiting time (`taus`, what the waiting-time chart shows), so the headline
 * and the chart give one number.
 *
 * - Steps slower than the burn itself do not run in it (²⁴Mg(p,γ) in the
 *   core of a 25 M☉ star, 63 Gyr against 6.7 Myr): they are returned apart,
 *   in `idle`, not named as the bottleneck. A step that burns the fuel
 *   itself (p + p) always runs: it is what sets the length of the burn.
 * - On a path that does not close, a last step whose reaction is not one of
 *   the network's cycle (`cycle`) is a leak out of it (²⁷Al(p,γ)²⁸Si in an
 *   AGB envelope), not a step of the cycle: `leak` holds it.
 */
export interface Bottleneck {
  step: PathStep | null
  /** the reaction's own waiting time, s */
  tau: number
  idle: PathStep[]
  leak: PathStep[]
}

export function bottleneck(
  path: PathStep[],
  taus: ArrayLike<number>,
  closed: boolean,
  cycle: number[] | null,
  tBurn: number,
  fuel?: number,
): Bottleneck {
  const leak: PathStep[] = []
  let steps = path
  if (!closed && cycle && cycle.length && path.length > 1 && !cycle.includes(path[path.length - 1].reaction)) {
    leak.push(path[path.length - 1])
    steps = path.slice(0, -1)
  }
  const tauOf = (p: PathStep) => taus[p.reaction]
  const runs = (p: PathStep) => p.nucleus === fuel || !(tauOf(p) > tBurn)
  const idle = steps.filter((p) => !runs(p))
  const running = steps.filter((p) => runs(p) && Number.isFinite(tauOf(p)))
  const step = running.reduce<PathStep | null>((a, b) => (!a || tauOf(b) > tauOf(a) ? b : a), null)
  return { step, tau: step ? tauOf(step) : NaN, idle, leak }
}

/**
 * Where the path starts: the first stable nucleus of the cycle that burns
 * within the burn time (the most processed fuel), so a cycle whose first
 * step does not run (²⁴Mg at 38 MK) is followed from the nucleus that does
 * (²⁵Mg).
 */
export function pathStart(
  c: Compiled,
  taus: ArrayLike<number>,
  cycle: number[],
  tBurn: number,
  fuel?: number,
): number | undefined {
  if (!cycle.length) return undefined
  const first = c.network.reactions[cycle[0]].target
  for (const k of cycle) {
    const target = c.network.reactions[k].target
    if (target === fuel) return target
    // start on a stable nucleus: one the star holds, not one made on the way
    if (c.network.nuclei[target].halfLife_s !== null) continue
    let rate = 0
    c.network.reactions.forEach((r, i) => {
      if (r.target === target && Number.isFinite(taus[i]) && taus[i] > 0) rate += 1 / taus[i]
    })
    if (rate > 0 && 1 / rate <= tBurn) return target
  }
  return first
}
