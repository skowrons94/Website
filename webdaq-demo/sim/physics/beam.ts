/**
 * Simulated beam current and charge (design §3.7), a port of WebDAQ's
 * server/app/utils/mock_current.py to the simulated beam:
 *
 *   I(t) = I0·e^{−t/900 s}·(1 + 0.03 sin(t/120 s)) + 0.25 sin 2t + 0.10 sin 7.3t + N(0, 0.05)
 *
 * plus trips exactly as mock_current.py:89-90: when int(t/37) % 11 == 10 and
 * t % 37 < 2 s (2 s out of every 407 s) the current drops to 15 %. Channels: target,
 * collimator 1 and 2 (10 % and 2 % fractions plus noise), idle (mock_current.py:96-103). The noise is a hash of the 0.1 s sample
 * index, so a reading depends only on t and the seed (deterministic, order-free).
 */

import { hash32, splitmix32 } from './rng'

export const TRIP_FRACTION = 0.15

function gauss(seed: number, k: number): number {
  const s = splitmix32((seed ^ Math.imul(k | 0, 0x9e3779b1) ^ hash32('beam')) >>> 0)
  const u = (s() + 1) / 4294967297, v = s() / 4294967296
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function tripping(t: number, forcedUntil = -1): boolean {
  return (Math.floor(t / 37) % 11 === 10 && t % 37 < 2) || t < forcedUntil
}

/** Target current in µA at simulated time t (s). Zero when I0 is zero. */
export function beamCurrent(t: number, I0: number, seed: number, forcedTripUntil = -1): number {
  if (!(I0 > 0)) return 0
  let I = I0 * Math.exp(-t / 900) * (1 + 0.03 * Math.sin(t / 120))
    + 0.25 * Math.sin(2 * t) + 0.1 * Math.sin(7.3 * t) + 0.05 * gauss(seed, Math.floor(t * 10))
  if (tripping(t, forcedTripUntil)) I *= TRIP_FRACTION
  return Math.max(0, I)
}

/** [target, collimator 1, collimator 2, idle], µA. */
export function beamSample(t: number, I0: number, seed: number, forcedTripUntil = -1): [number, number, number, number] {
  const I = beamCurrent(t, I0, seed, forcedTripUntil)
  if (!(I0 > 0)) return [0, 0, 0, 0]
  const k = Math.floor(t * 10)
  return [
    I,
    I * 0.1 + 0.01 * gauss(seed + 1, k),
    I * 0.02 + 0.005 * gauss(seed + 2, k),
    Math.max(0.001 + 0.0005 * gauss(seed + 3, k), 0),
  ]
}

/**
 * Charge in µC from sampled currents (µA) at a fixed period, as mock_current.py
 * accumulates it: Q += I·Δt.
 */
export function integrateCharge(samples: ArrayLike<number>, dt_s: number): number {
  let q = 0
  for (let i = 0; i < samples.length; i++) q += samples[i] * dt_s
  return q
}
