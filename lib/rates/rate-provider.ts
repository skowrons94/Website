/**
 * Where a reaction's λ(T9) comes from, behind one interface.
 *
 * The solver asks a RateProvider for N_A^{n-1}⟨σv⟩ (s⁻¹ for a decay) of a
 * reaction at a temperature and nothing else, so a REACLIB fit, a table
 * computed by a server, or a rate from an AZURE2 evaluation can stand in for
 * one another: wrap the new source in a provider, or `override` one reaction.
 * Screening, densities and abundances are the solver's business, not the
 * provider's.
 */

import type { Network, RateSpec, ReaclibSet } from "./schema.ts"

export interface RateProvider {
  /** N_A^{n−1}⟨σv⟩ of `reactionId` at T9 (GK), unscreened. */
  rate(reactionId: string, T9: number): number
  /** The temperatures (GK) the rate is meant for, if known. */
  validity?(reactionId: string): [number, number] | null
}

/** A REACLIB fit: Σ over sets of exp(a0 + a1/T9 + … + a6 ln T9). */
export function reaclibRate(sets: ReaclibSet[], T9: number): number {
  const t13 = Math.cbrt(T9)
  const lnT = Math.log(T9)
  let sum = 0
  for (const { a } of sets) {
    sum += Math.exp(a[0] + a[1] / T9 + a[2] / t13 + a[3] * t13 + a[4] * T9 + a[5] * T9 * t13 * t13 + a[6] * lnT)
  }
  return sum
}

/** A tabulated rate: linear interpolation of log10 λ in log T9, clamped at the ends. */
export function tableRate(T9s: number[], log10: number[], T9: number): number {
  const n = T9s.length
  if (T9 <= T9s[0]) return 10 ** log10[0]
  if (T9 >= T9s[n - 1]) return 10 ** log10[n - 1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (T9s[mid] <= T9) lo = mid
    else hi = mid
  }
  const f = Math.log(T9 / T9s[lo]) / Math.log(T9s[hi] / T9s[lo])
  return 10 ** (log10[lo] + f * (log10[hi] - log10[lo]))
}

export function evalSpec(spec: RateSpec, T9: number): number {
  return spec.kind === "reaclib" ? reaclibRate(spec.sets, T9) : tableRate(spec.T9, spec.log10, T9)
}

/** The rates the network file itself carries. */
export function networkProvider(network: Network): RateProvider {
  const byId = new Map(network.reactions.map((r) => [r.id, r]))
  return {
    rate(id, T9) {
      const r = byId.get(id)
      if (!r) throw new Error(`no reaction ${id}`)
      return evalSpec(r.rate, T9)
    },
    validity(id) {
      return byId.get(id)?.rate.validity_T9 ?? null
    },
  }
}

/** `base`, with some reactions taken from elsewhere (a table, an evaluation). */
export function overrideProvider(base: RateProvider, overrides: Record<string, (T9: number) => number>): RateProvider {
  return {
    rate: (id, T9) => (overrides[id] ? overrides[id](T9) : base.rate(id, T9)),
    validity: (id) => (overrides[id] ? null : (base.validity?.(id) ?? null)),
  }
}
