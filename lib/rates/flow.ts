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
