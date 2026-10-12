/**
 * Initial compositions under the reader's changes, pure (the explorer, the
 * baselines and test:rates share it).
 *
 * Metals (Z > 2) scaled by f: the hydrogen and helium are rescaled together
 * so the mass fractions still add up, X_light → X_light (1 − f Z)/(1 − Z)
 * with Z the scenario's metal fraction; f is capped so that hydrogen and
 * helium keep at least MIN_LIGHT of the mass (a nova envelope that is half
 * white-dwarf matter cannot take twice its metals). Single nuclei scaled
 * (the ¹³C of a pocket): ⁴He takes up the difference when it can, else
 * every nucleus that is not scaled is rescaled in proportion.
 */

import type { Network, Scenario } from "./schema.ts"

export const METALS_RANGE: [number, number] = [0.01, 10]
/** the least mass fraction hydrogen and helium keep when the metals are raised */
export const MIN_LIGHT = 0.1

export interface CompositionChange {
  /** scale of the metals (Z > 2) */
  metals: number
  /** scale of single initial abundances, by nucleus name */
  knobs: Record<string, number>
}

const isMetal = (network: Network, name: string) => (network.nuclei.find((n) => n.name === name)?.Z ?? 0) > 2

/** The scenario's metal mass fraction (Z > 2) among the network's nuclei. */
export function metalFraction(network: Network, s: Scenario): number {
  let z = 0
  for (const [k, v] of Object.entries(s.X)) if (isMetal(network, k)) z += v
  return z
}

/** The largest metal factor this scenario allows (≤ METALS_RANGE[1]). */
export function metalsMax(network: Network, s: Scenario): number {
  const z = metalFraction(network, s)
  const total = Object.values(s.X).reduce((a, b) => a + b, 0)
  if (!(z > 0)) return METALS_RANGE[1]
  return Math.min(METALS_RANGE[1], Number(((total - MIN_LIGHT) / z).toPrecision(2)))
}

export function composition(network: Network, s: Scenario, c: CompositionChange): Record<string, number> {
  const knobs = Object.entries(c.knobs).filter(([, v]) => v !== 1)
  if (c.metals === 1 && !knobs.length) return s.X
  const X: Record<string, number> = { ...s.X }
  const total = Object.values(s.X).reduce((a, b) => a + b, 0)
  if (c.metals !== 1) {
    const f = Math.min(Math.max(c.metals, METALS_RANGE[0]), metalsMax(network, s))
    const z = metalFraction(network, s)
    const light = total - z
    const g = light > 0 ? (total - f * z) / light : 1
    for (const k of Object.keys(X)) X[k] *= isMetal(network, k) ? f : g
  }
  if (knobs.length) {
    let delta = 0
    for (const [k, f] of knobs) {
      if (!X[k]) continue
      delta += X[k] * (1 - f)
      X[k] *= f
    }
    if ((X.he4 ?? 0) + delta >= 0 && !c.knobs.he4) X.he4 = (X.he4 ?? 0) + delta
    else {
      const free = Object.keys(X).filter((k) => !(k in c.knobs))
      const sum = free.reduce((a, k) => a + X[k], 0)
      const g = sum > 0 ? (sum + delta) / sum : 1
      for (const k of free) X[k] = Math.max(0, X[k] * g)
    }
  }
  // the scenario's own total (1 to rounding), exactly
  const now = Object.values(X).reduce((a, b) => a + b, 0)
  if (now > 0) for (const k of Object.keys(X)) X[k] *= total / now
  return X
}
