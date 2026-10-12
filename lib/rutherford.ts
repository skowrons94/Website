/**
 * The Rutherford (pure Coulomb) cross section, for plotting elastic scattering
 * as a ratio to it.
 *
 * Elastic dσ/dΩ falls as 1/E² and as 1/sin⁴(θ/2); divided by the Coulomb
 * cross section, what is left is the nuclear part — interference dips and
 * resonances — on a scale near 1, which is how scattering data are usually
 * read. Everything here is in the centre-of-mass frame, which is the frame
 * AZURE2 returns for the data (energies, angles and cross sections) and for
 * the model.
 *
 * For identical particles the Mott formula replaces it: the direct and
 * exchanged amplitudes interfere, with weight (−1)^{2s}/(2s+1) for spin s
 * (spin 0 for α + α).
 */

/** e²/(4πε₀) in MeV fm. */
const E2 = 1.439964548
/** Fine-structure constant. */
const ALPHA = 1 / 137.035999
/** Atomic mass unit in MeV. */
const AMU = 931.49410242

export interface CoulombPair {
  Z1: number
  Z2: number
  /** Masses in u. */
  M1: number
  M2: number
  /** Spin of the particles, used only when they are identical. */
  spin?: number
}

/** Are the two particles the same species (Mott scattering)? */
export function identical(pair: CoulombPair): boolean {
  return pair.Z1 === pair.Z2 && Math.round(pair.M1) === Math.round(pair.M2)
}

/**
 * Coulomb dσ/dΩ in b/sr at centre-of-mass energy `energy` (MeV) and
 * centre-of-mass angle `angle` (degrees); NaN where it is not defined.
 */
export function rutherford(pair: CoulombPair, energy: number, angle: number): number {
  if (!(energy > 0) || !(angle > 0) || !(angle < 180)) return NaN
  const half = (angle * Math.PI) / 360
  const s2 = Math.sin(half) ** 2
  const c2 = Math.cos(half) ** 2
  const a = (pair.Z1 * pair.Z2 * E2) / (4 * energy) // fm
  const scale = (a * a) / 100 // fm² → b

  if (!identical(pair)) return scale / (s2 * s2)

  // Mott: Sommerfeld parameter from the reduced mass.
  const mu = ((pair.M1 * pair.M2) / (pair.M1 + pair.M2)) * AMU
  const eta = pair.Z1 * pair.Z2 * ALPHA * Math.sqrt(mu / (2 * energy))
  const s = pair.spin ?? 0
  const weight = (Math.round(2 * s) % 2 === 0 ? 1 : -1) / (2 * s + 1)
  const interference = (2 * weight * Math.cos(eta * Math.log(s2 / c2))) / (s2 * c2)
  return scale * (1 / (s2 * s2) + 1 / (c2 * c2) + interference)
}
