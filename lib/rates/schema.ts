/**
 * The network files of the rates explorer, public/rates/<id>.json, as written
 * by scripts/rates/pyna_export.py (its docstring is the reference). A reader
 * checks `schema_version` before trusting the rest.
 *
 * Units are CGS and named in each field or in `units`: T9 in GK, rho in
 * g cm⁻³, times in s, Q in MeV, X a mass fraction, Y = X/A in mol g⁻¹.
 */

export const SCHEMA = "skowronski.rates.network"
export const SCHEMA_VERSION = 1

export interface Nucleus {
  /** pynucastro name: p, he4, c12 */
  name: string
  Z: number
  A: number
  /** ¹²C */
  label: string
  /** atlas code: 12C */
  code: string
  /** laboratory half-life, null when stable */
  halfLife_s: number | null
  /** AME2020 atomic mass excess, MeV (pynucastro's Nucleus.dm): the Q values of the energy */
  dm_MeV?: number
}

export interface ReaclibSet {
  /** a0..a6 of λ = exp(a0 + a1/T9 + a2 T9^-1/3 + a3 T9^1/3 + a4 T9 + a5 T9^5/3 + a6 ln T9) */
  a: number[]
  /** REACLIB set label, e.g. il10 */
  set: string
  /** n non-resonant, r resonant, w weak, s spontaneous */
  flag: string
}

/** How a reaction's λ(T9) is given. Only "reaclib" is written today. */
export type RateSpec =
  | { kind: "reaclib"; sets: ReaclibSet[]; validity_T9: [number, number] }
  | { kind: "table"; T9: number[]; log10: number[]; validity_T9: [number, number] }

export interface RateSource {
  set: string
  author?: string
  title?: string
  ref?: string
  year?: string
  url?: string | null
  /** what the source is, where its title could mislead (a rate from theory) */
  note?: string
  note_it?: string
}

export interface Reaction {
  /** pynucastro rate name, e.g. N14_p_to_O15_reaclib: the id everywhere */
  id: string
  label: string
  /** the atlas page (content/atlas/reactions/<atlas>.yaml), if there is one */
  atlas: string | null
  /** index of the nucleus the reaction destroys (the heavier reactant) */
  target: number
  reactants: number[]
  products: number[]
  /** 1/n! for n identical reactants */
  prefactor: number
  /** power of ρ in the ydot term */
  densExp: number
  /** multiplied by Ye (electron captures) */
  ye: boolean
  /** screening pairs [Z1, A1, Z2, A2] */
  screen: number[][]
  Q_MeV: number
  chapter: number
  weak: boolean
  weakType: string | null
  rate: RateSpec
  sources: RateSource[]
  /**
   * other rates for this reaction the explorer can switch to: a table
   * computed from one of the site's AZURE2 evaluations
   * (scripts/rates/evaluated_rates.py), with its provenance
   */
  alternatives?: {
    id: string
    evaluation: string
    rate: RateSpec
    paper: { authors: string; title: string; journal: string; doi: string }
    fit: { journal: string; doi: string }
    method: string
  }[]
  /** a weak reaction's mean neutrino energy, MeV, and where it comes from (Network.energy.nu_sources) */
  nu?: { MeV: number; src: string }
  /** underground measurements the atlas lists (LUNA and others), by build.py */
  measured?: { facility: string; name: string; luna: boolean; year: number; refs: { short: string; doi?: string | null }[] }[]
}

export interface Scenario {
  id: string
  name: string
  name_it: string
  /** a word or two for chart labels */
  short?: string
  short_it?: string
  T9: number
  rho: number
  time_s: number
  /** stop when `nucleus` falls below `fraction` of its initial abundance */
  until: { nucleus: string; fraction: number } | null
  /** initial mass fractions, by nucleus name */
  X: Record<string, number>
  source: string
  source_it: string
  note: string | null
  note_it: string | null
  /** optional extra data a network's explorer understands (the s-process) */
  extra?: Record<string, unknown>
  /**
   * optional: conditions that change during the burn (a nova cooling as it
   * expands). T9 and rho above are then the peak values, and T(t) = T9 · T[i],
   * ρ(t) = rho · rho[i] at the times t_s (lib/rates/run.ts, historyOf).
   */
  profile?: { kind: string; tau_s: number; rho_exp: number; t_s: number[]; T: number[]; rho: number[] }
}

export interface Network {
  schema: string
  schema_version: number
  id: string
  family: string | null
  title: { en: string; it: string }
  provenance: { library: string; snapshot: string; tool: string; generated: string; reverse_rates: boolean }
  units: Record<string, string>
  nuclei: Nucleus[]
  reactions: Reaction[]
  ui: {
    key: string[] | null
    reference: string | null
    fuel: string | null
    cycle: string[] | null
    /** nuclei the abundance plot opens with */
    show?: string[] | null
    groups?: { id: string; reactions: string[] }[] | null
    /** initial abundances the explorer offers to scale */
    knobs?: string[] | null
    /** heavy nuclei whose abundance over time a big network's burns keep */
    track?: string[] | null
    /** a caveat for specialists */
    notes?: { en: string; it: string } | null
    /** rates REACLIB takes from an older source although newer data exist */
    newer?: Record<string, { en: string; it: string }> | null
    /** nuclei whose production needs physics the network lacks */
    not_modelled?: Record<string, { en: string; it: string }> | null
  }
  scenarios: Scenario[]
  /** Lodders (2021) mass fractions of these nuclei */
  solar: Record<string, number>
  screening: { method: string; co2: number; aaFactor: number; NA: number }
  /** how the energy is counted (lib/rates/energy.ts): the masses, MeV in erg, the neutrino energies' sources */
  energy?: { masses: string; MeV2erg: number; nu_sources: Record<string, { en: string; it: string }> }
  /** tolerances the explorer runs this network with, when not the defaults */
  solver?: { rtol?: number; atol?: number }
}

/** Throws unless `data` is a network file this code understands. */
export function checkNetwork(data: unknown): Network {
  const d = data as Partial<Network>
  if (!d || d.schema !== SCHEMA) throw new Error("not a rates network file")
  if (d.schema_version !== SCHEMA_VERSION) {
    throw new Error(`network schema ${d.schema_version}, expected ${SCHEMA_VERSION}`)
  }
  return d as Network
}
