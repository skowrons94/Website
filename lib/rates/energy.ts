/**
 * The energy a one-zone burn releases, and what the neutrinos carry away.
 * Pure; the solver (lib/rates/solver.ts), the worker, the pages and the
 * Node scripts share it.
 *
 *   ε_gross = N_A · Σ_r flux_r · Q_r                  (erg g⁻¹ s⁻¹, Q in erg)
 *   ε_ν     = N_A · Σ_weak flux_r · ⟨E_ν⟩_r
 *   ε       = ε_gross − ε_ν                           (what stays in the gas)
 *
 * flux_r is the reaction's ydot term (mol g⁻¹ s⁻¹ of reactions, the
 * prefactor included), Q_r = Σ Δ(reactants) − Σ Δ(products) from the atomic
 * mass excesses Δ the network file carries (AME2020, pynucastro's
 * `Nucleus.dm`). Summed over the reactions this is −N_A Σ_k Ẏ_k m_k c², which
 * is how pynucastro's RateCollection.evaluate_energy_generation computes it
 * (test:rates checks the two agree to 1e-6). With atomic masses a β⁺ decay's
 * Q includes the annihilation of its positron, which stays in the gas.
 *
 * ⟨E_ν⟩ is each weak reaction's mean neutrino energy (`nu` in the network
 * file, written by scripts/rates/pyna_export.py: Bahcall 1989 for the solar
 * sources, an allowed β spectrum over the main ENSDF branches otherwise).
 *
 * In this model, not in a star: ε is the power of one gram of gas at fixed
 * (or prescribed) temperature and density. A real star would adjust its
 * temperature to keep its luminosity, so ε is not the star's luminosity.
 */

import type { Network, Reaction } from "./schema.ts"

/** 1 MeV in erg (exact, SI 2019). */
export const MEV_TO_ERG = 1.602176634e-6

/** Q of a reaction from the nuclei's mass excesses (MeV), or the file's Q_MeV when they are missing. */
export function reactionQ(network: Network, r: Reaction): number {
  const dm = (i: number) => network.nuclei[i].dm_MeV
  if ([...r.reactants, ...r.products].some((i) => typeof dm(i) !== "number")) return r.Q_MeV
  let q = 0
  for (const i of r.reactants) q += dm(i)!
  for (const i of r.products) q -= dm(i)!
  return q
}

/** Per reaction: Q (MeV) and the neutrino's mean energy (MeV, 0 for a strong reaction). */
export function energyTables(network: Network): { Q: Float64Array; nu: Float64Array; k: number } {
  return {
    Q: Float64Array.from(network.reactions, (r) => reactionQ(network, r)),
    nu: Float64Array.from(network.reactions, (r) => r.nu?.MeV ?? 0),
    k: network.screening.NA * (network.energy?.MeV2erg ?? MEV_TO_ERG),
  }
}

/** ε_gross and ε_ν (erg g⁻¹ s⁻¹) from the fluxes of every reaction. */
export function energyOfFlux(
  tables: { Q: Float64Array; nu: Float64Array; k: number },
  flux: ArrayLike<number>,
): { gross: number; nu: number } {
  let g = 0
  let v = 0
  for (let r = 0; r < flux.length; r++) {
    const f = flux[r]
    if (f === 0) continue
    g += f * tables.Q[r]
    if (tables.nu[r] !== 0) v += f * tables.nu[r]
  }
  return { gross: g * tables.k, nu: v * tables.k }
}

/** N_A Σ Y_k Δ_k in erg g⁻¹: the burnt fuel's mass defect is its drop between two compositions. */
export function massEnergy(network: Network, Y: ArrayLike<number>): number {
  let s = 0
  network.nuclei.forEach((n, i) => (s += Y[i] * (n.dm_MeV ?? 0)))
  return s * network.screening.NA * (network.energy?.MeV2erg ?? MEV_TO_ERG)
}

// -- what the explorer reports -------------------------------------------------------

/**
 * The neutrinos worth naming per network: the decays a detector sees
 * (Borexino's ⁷Be, ⁸B and CNO neutrinos; the pp ones). Counted over the burn.
 */
export const NEUTRINO_GROUPS: Record<string, { id: string; reactions: string[] }[]> = {
  pp: [
    { id: "pp", reactions: ["p_p_to_d_beta_pos_reaclib", "p_p_to_d_electron_capture_reaclib"] },
    { id: "be7", reactions: ["Be7_to_Li7_electron_capture_reaclib"] },
    { id: "b8", reactions: ["B8_to_He4_He4_beta_pos_reaclib"] },
  ],
  cno: [{ id: "cno", reactions: ["N13_to_C13_beta_pos_reaclib", "O15_to_N15_beta_pos_reaclib"] }],
}

/** Networks whose reactions make the burn's energy (in NeNa and MgAl the CNO cycle does, outside them). */
export const ENERGY_NETS = ["pp", "cno", "sprocess"]

/** The burn's fuel: what it stops on, else the network's fuel, else helium. */
export function fuelOf(network: Network, until: { nucleus: string } | null | undefined): string | null {
  const name = until?.nucleus ?? network.ui.fuel ?? "he4"
  return network.nuclei.some((n) => n.name === name) ? name : null
}

/** A burn without a stop condition is timed on its first 1% of fuel. */
export const FUEL_MARK = 0.99

/** The fraction of the fuel left when the fuel time is read: the stop condition's, else FUEL_MARK. */
export function fuelMark(until: { nucleus: string; fraction: number } | null | undefined): number {
  return until ? until.fraction : FUEL_MARK
}

/** What a burn's energy comes to (RunResult.energy). */
export interface BurnEnergy {
  /** ∫ ε dt over the burn, erg g⁻¹ (neutrinos excluded) */
  E: number
  /** ∫ ε_ν dt, erg g⁻¹ */
  Enu: number
  /** the mass defect of what burnt, N_A Σ (Y₀ − Y) Δ, erg g⁻¹ (= E + Enu up to the integration) */
  defect: number
  /** the fuel, the fraction of it left at `tFuel`, and when it got there (null: not within the burn) */
  fuel: string | null
  mark: number
  tFuel: number | null
  /** neutrinos per NEUTRINO_GROUPS id, mol g⁻¹ over the burn */
  nu: Record<string, number>
}

/** Mean power over the burn, erg g⁻¹ s⁻¹. */
export const meanPower = (e: BurnEnergy, tFinal: number) => (tFinal > 0 ? e.E / tFinal : 0)

export interface EnergyChange {
  /** changed ÷ unchanged mean power over the burn */
  power: number
  /** changed ÷ unchanged time to burn the fuel down to `mark` (null: either never got there) */
  fuel: number | null
  /** changed ÷ unchanged neutrino emission rate (count ÷ burn time) per group */
  nu: Record<string, number>
}

/** How a change moved the energy of a burn (the "What changes most" lines, the curiosities). */
export function energyChange(base: { energy?: BurnEnergy; tFinal: number }, mod: { energy?: BurnEnergy; tFinal: number }): EnergyChange | null {
  const a = base.energy
  const b = mod.energy
  if (!a || !b) return null
  const pa = meanPower(a, base.tFinal)
  const pb = meanPower(b, mod.tFinal)
  const nu: Record<string, number> = {}
  for (const id of Object.keys(a.nu)) {
    const na = a.nu[id] / base.tFinal
    const nb = (b.nu[id] ?? 0) / mod.tFinal
    if (na > 0) nu[id] = nb / na
  }
  return {
    power: pa > 0 ? pb / pa : 1,
    fuel: a.tFuel && b.tFuel ? b.tFuel / a.tFuel : null,
    nu,
  }
}
