/**
 * The numbers of /learn/exercises, computed at build time from the same
 * inputs the rest of the site uses, so the worked solutions cannot drift
 * from the atlas and the rates explorer:
 *
 *   masses        AME2020 (content/atlas/nuclear-data), via lib/atlas-core.mjs
 *   Gamow window  the atlas' expression (gamowWindow), and the rates
 *                 explorer's closed form (mass numbers, E_G; gamow-panel.tsx)
 *   S-factor      ¹⁴N(p,γ)¹⁵O, total S(0) ≈ 1.7 keV b (the atlas entry,
 *                 Formicola et al. 2004)
 *
 * Exercise 3's numbers cannot be computed here (they are AZURE2 runs); they
 * are in THIRTEEN_N below with how they were obtained.
 *
 * scripts/seo-test.mjs ("the exercises' numbers", npm run test:seo, after a
 * build) checks them against the built page; scripts/exercises/thirteen-n.py
 * is how exercise 3's AZURE2 numbers were obtained.
 */

import { AMU, K_T9, atomicMass, gamowWindow, parseParticle } from "./atlas-core.mjs"

const ALPHA = 1 / 137.035999

/** Gamow energy E_G = 2 μc² (π α Z₁Z₂)², keV, with μ in u. */
export function gamowEnergy(z1: number, z2: number, mu: number): number {
  return 2 * mu * AMU * 1e3 * (Math.PI * ALPHA * z1 * z2) ** 2
}

/** E₀ = (E_G (kT)²/4)^(1/3) and the 1/e width Δ = 4 (E₀ kT/3)^(1/2), keV. */
export function gamowPeak(EG: number, T9: number): { E0: number; width: number; kT: number } {
  const kT = K_T9 * T9 * 1e3
  const E0 = Math.cbrt((EG * kT * kT) / 4)
  return { E0, width: 4 * Math.sqrt((E0 * kT) / 3), kT }
}

/** σ(E) = S(E)/E · exp(−√(E_G/E)), in barn, for S in keV b and E in keV. */
export function crossSection(S_keVb: number, E: number, EG: number): number {
  return (S_keVb / E) * Math.exp(-Math.sqrt(EG / E))
}

const ELEMENTARY_CHARGE = 1.602176634e-19

export interface Exercise1 {
  mu: number
  EG: number
  kT: number
  E0: number
  width: number
  /** The atlas' window at the centre of the Sun (T₉ = 0.0157), and scaled to 15 MK. */
  atlasT9: number
  atlasE0: number
  atlasWidth: number
  scaledE0: number
  scaledWidth: number
  /** What the rates explorer shows at 15 MK (mass numbers for μ): E₀ ± Δ/2. */
  explorerE0: number
  explorerHalf: number
}

export function exercise1(): Exercise1 {
  const n14 = atomicMass(parseParticle("14N"))
  const h1 = atomicMass(parseParticle("1H"))
  const mu = (n14 * h1) / (n14 + h1)
  const EG = gamowEnergy(1, 7, mu)
  const T9 = 0.015
  const { E0, width, kT } = gamowPeak(EG, T9)
  const atlasT9 = 0.0157
  const atlas = gamowWindow(1, 7, mu, atlasT9)
  const r = T9 / atlasT9
  const explorer = gamowPeak(gamowEnergy(1, 7, (14 * 1) / 15), T9)
  return {
    mu,
    EG,
    kT,
    E0,
    width,
    atlasT9,
    atlasE0: atlas.E0,
    atlasWidth: atlas.width,
    scaledE0: atlas.E0 * r ** (2 / 3),
    scaledWidth: atlas.width * r ** (5 / 6),
    explorerE0: explorer.E0,
    explorerHalf: explorer.width / 2,
  }
}

export interface Exercise2 {
  S: number
  E: number
  sigma_b: number
  sigmaPeak_b: number
  E0: number
  protonsPerSecond: number
  /** Reactions per day for a target of 10¹⁸ atoms/cm² and each efficiency. */
  perDay: { efficiency: number; rate: number }[]
  /** Reactions per year at the Gamow peak (same beam and target, 50 % efficiency). */
  peakPerYear: number
  /** Cosmic-ray muons through 100 cm² per day at the surface (≈ 1 cm⁻² min⁻¹) and underground (÷10⁶). */
  muonsSurface: number
  muonsUnderground: number
  /** The largest fraction of muon events in the signal window that keeps the surface background below the signal (50 % efficiency). */
  fractionMax: number
}

export const EX2 = {
  S_keVb: 1.7,
  E_keV: 70,
  current_A: 200e-6,
  target_per_cm2: 1e18,
  efficiencies: [0.01, 0.5],
  muonFlux_per_cm2_min: 1,
  area_cm2: 100,
  reduction: 1e6,
} as const

export function exercise2(): Exercise2 {
  const { EG, E0 } = exercise1()
  const sigma = crossSection(EX2.S_keVb, EX2.E_keV, EG)
  const sigmaPeak = crossSection(EX2.S_keVb, E0, EG)
  const pps = EX2.current_A / ELEMENTARY_CHARGE
  const perSecond = (s_b: number, eff: number) => s_b * 1e-24 * EX2.target_per_cm2 * pps * eff
  const day = 86400
  const perDay = EX2.efficiencies.map((efficiency) => ({ efficiency, rate: perSecond(sigma, efficiency) * day }))
  const muonsSurface = EX2.muonFlux_per_cm2_min * EX2.area_cm2 * 60 * 24
  const best = perDay[perDay.length - 1].rate
  return {
    S: EX2.S_keVb,
    E: EX2.E_keV,
    sigma_b: sigma,
    sigmaPeak_b: sigmaPeak,
    E0,
    protonsPerSecond: pps,
    perDay,
    peakPerYear: perSecond(sigmaPeak, 0.5) * day * 365.25,
    muonsSurface,
    muonsUnderground: muonsSurface / EX2.reduction,
    fractionMax: best / muonsSurface,
  }
}

/**
 * Exercise 3: ¹²C(p,γ)¹³N, the evaluation /evaluations/13N at its shipped
 * parameters and with the proton width of the 1/2⁺ level at E_x = 2.3682 MeV
 * changed from 34 keV to 40 keV (its free parameter 2), every other parameter
 * and normalisation as shipped. Obtained on 2026-10-13 from this site's API
 * (AZURE2 at the commit in deploy/Dockerfile.azure2): POST
 * /api/sessions/<sid>/parameters {"updates": {"2": 40000}}, χ² summed over
 * the active segments of the data payload, S-factors from the extrapolation
 * (angle-integrated capture) and the fine curve of the capture data.
 * scripts/exercises/thirteen-n.py repeats it against a running API.
 */
export const THIRTEEN_N = {
  level: { Ex_MeV: 2.3682, ER_keV: 425, gammaP_keV: 34, changedTo_keV: 40 },
  chi2: {
    all: { points: 683, before: 115756, after: 254953 },
    lunaHpge: { points: 32, before: 561, after: 9658 },
  },
  /** keV b */
  sfactor: {
    at24keV: { before: 1.359, after: 1.486 },
    peak: { before: 268.4, after: 230.2 },
    at600keV: { before: 1.44, after: 1.74 },
  },
  /** keV, full width at half maximum of the S-factor peak (fine curve). */
  fwhm: { before: 33.5, after: 39.4 },
  /** The same edit for the level energy instead: E_x + 5 keV. */
  energyShift: { by_keV: 5, chi2All: 304958 },
} as const
