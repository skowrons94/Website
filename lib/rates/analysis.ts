/**
 * What the s-process explorer reads off a burn: abundances after the
 * short-lived nuclei have decayed, production factors, neutrons captured per
 * seed, and Maxwellian-averaged cross sections. Pure.
 */

import type { RateProvider } from "./rate-provider.ts"
import type { Network } from "./schema.ts"

/** Default: decay everything with t½ under 10⁸ years (¹⁷⁶Lu, ¹⁸⁷Re, ¹⁴⁷Sm stay). */
export const DECAY_LIMIT_S = 3.15576e15

export interface DecayMap {
  /** for each nucleus that decays: its branches [product indices, fraction] */
  branches: Map<number, { products: number[]; fraction: number }[]>
}

/** The decays of a network (single-reactant reactions), with branchings by λ. */
export function decayMap(network: Network, provider: RateProvider, limit_s = DECAY_LIMIT_S): DecayMap {
  const byTarget = new Map<number, { products: number[]; lam: number }[]>()
  for (const r of network.reactions) {
    if (r.reactants.length !== 1) continue
    const n = network.nuclei[r.reactants[0]]
    if (n.halfLife_s === null || n.halfLife_s > limit_s) continue
    const lam = provider.rate(r.id, 0.1)
    const list = byTarget.get(r.reactants[0]) ?? []
    list.push({ products: r.products, lam })
    byTarget.set(r.reactants[0], list)
  }
  const branches = new Map<number, { products: number[]; fraction: number }[]>()
  for (const [i, list] of byTarget) {
    const total = list.reduce((a, b) => a + b.lam, 0)
    branches.set(
      i,
      list.map((b) => ({ products: b.products, fraction: total > 0 ? b.lam / total : 1 / list.length })),
    )
  }
  return { branches }
}

/** Mass fractions after the decays of `map`, followed to the end of each chain. */
export function decayed(network: Network, X: ArrayLike<number>, map: DecayMap): number[] {
  const A = network.nuclei.map((n) => n.A)
  const Y = Array.from(X, (x, i) => x / A[i])
  for (let pass = 0; pass < 40; pass++) {
    let moved = false
    for (const [i, list] of map.branches) {
      const y = Y[i]
      if (!(y > 0)) continue
      Y[i] = 0
      moved = true
      for (const b of list) for (const p of b.products) Y[p] += y * b.fraction
    }
    if (!moved) break
  }
  return Y.map((y, i) => y * A[i])
}

/** Neutrons captured per heavy seed nucleus (Z ≥ zmin): Σ A ΔY / Σ Y₀. */
export function neutronsPerSeed(network: Network, X0: ArrayLike<number>, X: ArrayLike<number>, zmin = 26): number {
  let gained = 0
  let seeds = 0
  network.nuclei.forEach((n, i) => {
    if (n.Z < zmin) return
    gained += X[i] - X0[i]
    seeds += X0[i] / n.A
  })
  return seeds > 0 ? gained / seeds : 0
}

/**
 * Maxwellian-averaged cross section of a neutron capture, mb:
 * σ = N_A⟨σv⟩ / (N_A v_T), v_T = sqrt(2kT/μ).
 */
export function macs(network: Network, provider: RateProvider, reactionId: string, T9: number): number | null {
  const r = network.reactions.find((x) => x.id === reactionId)
  if (!r || r.reactants.length !== 2) return null
  const [a, b] = r.reactants.map((i) => network.nuclei[i])
  if (a.Z !== 0 && b.Z !== 0) return null
  const u = 1.6605390666e-24
  const mu = ((a.A * b.A) / (a.A + b.A)) * u
  const vT = Math.sqrt((2 * 1.380649e-16 * T9 * 1e9) / mu)
  return (provider.rate(reactionId, T9) / (network.screening.NA * vT)) * 1e27
}
