/**
 * A one-zone reaction network, integrated implicitly: pure TypeScript, no DOM,
 * no React. The Web Worker (lib/rates/worker.ts) and the Node scripts
 * (scripts/rates/*.mjs, test:rates) run the same code.
 *
 * Inputs: a network (lib/rates/schema.ts), a rate provider (default: the
 * REACLIB fits in the network file), a scaling map {reactionId: factor}, a
 * thermodynamic history (constant T and ρ, or a time series T(t), ρ(t)) and
 * initial mass fractions. Output: abundances over time.
 *
 * The equations are pynucastro's, term for term (scripts/rates/pyna_export.py):
 *
 *   dY_k/dt = Σ_r c_kr · prefactor_r · ρ^densExp_r · (Ye) · Π Y_reactants · λ_r(T9) · e^{h_r}
 *
 * with h_r the screen5 screening of the reaction's pairs, evaluated at every
 * right-hand side as pynucastro does. The integrator is RODAS3, an L-stable,
 * stiffly accurate Rosenbrock method of order 3 (below), or MATLAB's ode23s
 * (Shampine & Reichelt 1997, SIAM J. Sci. Comput. 18, 1) on request: one
 * Jacobian and one sparse LU (lib/rates/sparse.ts) per step. At rtol 1e-4
 * RODAS3 reproduces pynucastro's own integration to ~1e-5. A network's
 * timescales span twenty decades or more (a neutron lives milliseconds in an
 * s-process burn of ten thousand years), and an L-stable method takes steps
 * set by accuracy alone however stiff the network is.
 */

import { networkProvider, type RateProvider } from "./rate-provider.ts"
import type { Network } from "./schema.ts"
import { plasmaState, screen5, screenFactors, type ScreenFactors } from "./screening.ts"
import { factor, solve, symbolic, type SparsePattern } from "./sparse.ts"

export type History =
  | { kind: "constant"; T9: number; rho: number }
  /** T9 linear and ρ log-linear in t between the points; held at the ends */
  | { kind: "series"; t_s: number[]; T9: number[]; rho: number[] }

/** The tolerances the explorer runs with (and its precomputed baselines). */
export const DEFAULT_TOLERANCES = { rtol: 1e-4, atol: 1e-26 } as const

export interface IntegrateOptions {
  /** the scaling of each reaction's rate, 1 when absent */
  scale?: Record<string, number>
  history: History
  /** initial mass fractions by nucleus name (missing ones are 0) */
  X0: Record<string, number>
  tEnd_s: number
  /** stop when this nucleus falls below `fraction` of its initial abundance */
  until?: { nucleus: string; fraction: number } | null
  /** electron screening (screen5), on by default */
  screening?: boolean
  rtol?: number
  /** absolute tolerance on Y (mol/g) */
  atol?: number
  /** how many (t, Y) samples to return, log-spaced in t (default 160) */
  maxSamples?: number
  maxSteps?: number
  provider?: RateProvider
  /** accumulate the neutron exposure ∫ n_n v_T dt (needs a nucleus "n") */
  neutronExposure?: boolean
  /** the Rosenbrock method: "rodas3" (default) or "ode23s" */
  method?: "rodas3" | "ode23s"
}

export interface IntegrateResult {
  /** sample times, s (the first is 0) */
  t: number[]
  /** Y at each sample, in network order */
  Y: Float64Array[]
  /** Y at the end */
  final: Float64Array
  tFinal: number
  stopped: "time" | "until" | "steps"
  steps: number
  rejected: number
  ms: number
  /** ∫ n_n v_T dt in cm⁻² (×10⁻²⁷ for mb⁻¹), and the largest n_n in cm⁻³ */
  exposure?: { tau_cm2: number; peak_cm3: number }
}

export interface Compiled {
  network: Network
  n: number
  nr: number
  Z: Float64Array
  A: Float64Array
  index: Map<string, number>
  /** species → row/column of the matrix */
  perm: Int32Array
  pattern: SparsePattern
  // per reaction, flattened: distinct reactants and their counts
  rStart: Int32Array
  rSpec: Int32Array
  rCount: Int32Array
  // per reaction, flattened: species whose abundance changes, and by how much
  cStart: Int32Array
  cSpec: Int32Array
  cCoef: Float64Array
  // per (reaction, distinct reactant): matrix positions of the c-entries
  jStart: Int32Array
  jPos: Int32Array
  prefactor: Float64Array
  densExp: Float64Array
  ye: Uint8Array
  /** screening pair indices of each reaction (into `pairs`) */
  sStart: Int32Array
  sPair: Int32Array
  pairs: ScreenFactors[]
}

/** Everything about a network that does not change from run to run. */
export function compile(network: Network): Compiled {
  const n = network.nuclei.length
  const nr = network.reactions.length
  const Z = Float64Array.from(network.nuclei, (x) => x.Z)
  const A = Float64Array.from(network.nuclei, (x) => x.A)
  const index = new Map(network.nuclei.map((x, i) => [x.name, i]))

  const rS: number[] = [0]
  const rSp: number[] = []
  const rC: number[] = []
  const cS: number[] = [0]
  const cSp: number[] = []
  const cCo: number[] = []
  const entries: [number, number][] = []
  const pairKey = new Map<string, number>()
  const pairs: ScreenFactors[] = []
  const sS: number[] = [0]
  const sP: number[] = []
  for (const r of network.reactions) {
    const counts = new Map<number, number>()
    for (const j of r.reactants) counts.set(j, (counts.get(j) ?? 0) + 1)
    const change = new Map<number, number>()
    for (const j of r.reactants) change.set(j, (change.get(j) ?? 0) - 1)
    for (const k of r.products) change.set(k, (change.get(k) ?? 0) + 1)
    for (const [j, c] of counts) {
      rSp.push(j)
      rC.push(c)
    }
    rS.push(rSp.length)
    for (const [k, c] of change) {
      if (c === 0) continue
      cSp.push(k)
      cCo.push(c)
    }
    cS.push(cSp.length)
    for (const j of counts.keys()) for (const [k, c] of change) if (c !== 0) entries.push([k, j])
    for (const [z1, a1, z2, a2] of r.screen) {
      const key = `${z1},${a1},${z2},${a2}`
      let p = pairKey.get(key)
      if (p === undefined) {
        p = pairs.length
        pairs.push(screenFactors(z1, a1, z2, a2))
        pairKey.set(key, p)
      }
      sP.push(p)
    }
    sS.push(sP.length)
  }

  // Ordering: the nuclei every reaction touches (the neutron of the
  // s-process, the protons and α of a big network) go last, so the rest
  // keeps its band and the fill stays in the border.
  const degree = new Int32Array(n)
  const seen = new Set<string>()
  for (const [k, j] of entries) {
    const key = `${k},${j}`
    if (seen.has(key) || k === j) continue
    seen.add(key)
    degree[k]++
    degree[j]++
  }
  const sortedDeg = Array.from(degree).sort((a, b) => a - b)
  const median = sortedDeg[n >> 1] ?? 0
  const cut = Math.max(12, 4 * median)
  const order = Array.from({ length: n }, (_, i) => i)
  const late = order.filter((i) => degree[i] > cut).sort((a, b) => degree[a] - degree[b])
  const early = order.filter((i) => degree[i] <= cut)
  const perm = new Int32Array(n)
  ;[...early, ...late].forEach((species, pos) => (perm[species] = pos))
  const pattern = symbolic(
    n,
    entries.map(([k, j]) => [perm[k], perm[j]] as [number, number]),
  )

  const jS: number[] = [0]
  const jP: number[] = []
  for (let r = 0; r < nr; r++) {
    for (let m = rS[r]; m < rS[r + 1]; m++) {
      const j = rSp[m]
      for (let q = cS[r]; q < cS[r + 1]; q++) jP.push(pattern.find(perm[cSp[q]], perm[j]))
      jS.push(jP.length)
    }
  }

  return {
    network,
    n,
    nr,
    Z,
    A,
    index,
    perm,
    pattern,
    rStart: Int32Array.from(rS),
    rSpec: Int32Array.from(rSp),
    rCount: Int32Array.from(rC),
    cStart: Int32Array.from(cS),
    cSpec: Int32Array.from(cSp),
    cCoef: Float64Array.from(cCo),
    jStart: Int32Array.from(jS),
    jPos: Int32Array.from(jP),
    prefactor: Float64Array.from(network.reactions, (r) => r.prefactor),
    densExp: Float64Array.from(network.reactions, (r) => r.densExp),
    ye: Uint8Array.from(network.reactions, (r) => (r.ye ? 1 : 0)),
    sStart: Int32Array.from(sS),
    sPair: Int32Array.from(sP),
    pairs,
  }
}

/** Mass fractions by name → Y in network order. */
export function toY(c: Compiled, X: Record<string, number>): Float64Array {
  const Y = new Float64Array(c.n)
  for (const [name, x] of Object.entries(X)) {
    const i = c.index.get(name)
    if (i !== undefined) Y[i] = x / c.A[i]
  }
  return Y
}

/** T9 and ρ of a history at time t. */
export function stateAt(h: History, t: number): { T9: number; rho: number } {
  if (h.kind === "constant") return { T9: h.T9, rho: h.rho }
  const ts = h.t_s
  const m = ts.length
  if (t <= ts[0]) return { T9: h.T9[0], rho: h.rho[0] }
  if (t >= ts[m - 1]) return { T9: h.T9[m - 1], rho: h.rho[m - 1] }
  let lo = 0
  let hi = m - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (ts[mid] <= t) lo = mid
    else hi = mid
  }
  const f = (t - ts[lo]) / (ts[hi] - ts[lo])
  return {
    T9: h.T9[lo] + f * (h.T9[hi] - h.T9[lo]),
    rho: Math.exp(Math.log(h.rho[lo]) + f * (Math.log(h.rho[hi]) - Math.log(h.rho[lo]))),
  }
}

/**
 * The right-hand side and Jacobian of a compiled network, for one set of
 * options. Exposed for the timescale analysis and for tests.
 */
export function makeSystem(c: Compiled, opts: Pick<IntegrateOptions, "scale" | "history" | "screening" | "provider">) {
  const { n, nr, network } = c
  const provider = opts.provider ?? networkProvider(network)
  const scale = new Float64Array(nr).fill(1)
  network.reactions.forEach((r, i) => {
    const s = opts.scale?.[r.id]
    if (s !== undefined) scale[i] = s
  })
  const screening = opts.screening !== false
  const k = new Float64Array(nr) // everything but abundances and screening
  const lam = new Float64Array(nr)
  const scr = new Float64Array(c.pairs.length)
  const flux = new Float64Array(nr)
  const full = new Float64Array(nr) // k · screening · Ye
  let lastT9 = NaN
  let lastRho = NaN
  let rhoNow = 0
  let T9Now = 0

  const setState = (t: number) => {
    const { T9, rho } = stateAt(opts.history, t)
    if (T9 !== lastT9) {
      network.reactions.forEach((r, i) => (lam[i] = provider.rate(r.id, T9)))
      lastT9 = T9
      lastRho = NaN
    }
    if (rho !== lastRho) {
      for (let i = 0; i < nr; i++) k[i] = scale[i] * c.prefactor[i] * rho ** c.densExp[i] * lam[i]
      lastRho = rho
    }
    rhoNow = rho
    T9Now = T9
  }

  /** flux of every reaction at (t, Y); fills `full` */
  const fluxes = (t: number, Y: Float64Array) => {
    setState(t)
    let ye = 0
    let ay = 0
    for (let i = 0; i < n; i++) {
      ye += c.Z[i] * Y[i]
      ay += c.A[i] * Y[i]
    }
    ye = ay > 0 ? ye / ay : 0
    if (screening && c.pairs.length) {
      const st = plasmaState(T9Now * 1e9, rhoNow, Y, c.Z, network.screening)
      for (let p = 0; p < c.pairs.length; p++) scr[p] = Math.exp(screen5(st, c.pairs[p]))
    }
    for (let r = 0; r < nr; r++) {
      let f = k[r]
      if (c.ye[r]) f *= ye
      if (screening) for (let s = c.sStart[r]; s < c.sStart[r + 1]; s++) f *= scr[c.sPair[s]]
      full[r] = f
      let prod = f
      for (let m = c.rStart[r]; m < c.rStart[r + 1]; m++) {
        const y = Y[c.rSpec[m]]
        const cnt = c.rCount[m]
        prod *= cnt === 1 ? y : cnt === 2 ? y * y : y ** cnt
      }
      flux[r] = prod
    }
  }

  const rhs = (t: number, Y: Float64Array, out: Float64Array) => {
    fluxes(t, Y)
    out.fill(0)
    for (let r = 0; r < nr; r++) {
      const f = flux[r]
      if (f === 0) continue
      for (let q = c.cStart[r]; q < c.cStart[r + 1]; q++) out[c.cSpec[q]] += c.cCoef[q] * f
    }
  }

  /** adds  a · J  into `val` (the matrix pattern), at the last `fluxes` state */
  const addJacobian = (Y: Float64Array, a: number, val: Float64Array) => {
    let jIdx = 0
    for (let r = 0; r < nr; r++) {
      const f = full[r]
      for (let m = c.rStart[r]; m < c.rStart[r + 1]; m++, jIdx++) {
        if (f === 0) continue
        // ∂flux/∂Y_j = f · cnt_j · Y_j^(cnt_j − 1) · Π_{other} Y^cnt
        let d = f * c.rCount[m] * (c.rCount[m] === 1 ? 1 : Y[c.rSpec[m]] ** (c.rCount[m] - 1))
        for (let o = c.rStart[r]; o < c.rStart[r + 1]; o++) {
          if (o === m) continue
          const y = Y[c.rSpec[o]]
          const cnt = c.rCount[o]
          d *= cnt === 1 ? y : y ** cnt
        }
        if (d === 0) continue
        const q0 = c.cStart[r]
        const p0 = c.jStart[jIdx]
        const len = c.cStart[r + 1] - q0
        for (let q = 0; q < len; q++) val[c.jPos[p0 + q]] += a * c.cCoef[q0 + q] * d
      }
    }
  }

  return { rhs, fluxes, addJacobian, flux, full, lam, setState }
}

const D = 1 / (2 + Math.SQRT2)
const E32 = 6 + Math.SQRT2

/*
 * RODAS3 (Sandu et al. 1997, Atmos. Environ. 31, 3459; the coefficients of
 * KPP's Rosenbrock integrators): four stages, three function evaluations,
 * order 3 with an embedded order-2 estimate, L-stable and stiffly accurate.
 * K_i solves (I/(hγ) − J) K_i = F(Y + Σ a_ij K_j) + Σ (c_ij/h) K_j + hγ_i ∂F/∂t.
 */
const R3 = {
  gamma: 0.5,
  a: [[], [0], [2, 0], [2, 0, 1]] as number[][],
  c: [[], [4], [1, -1], [1, -1, -8 / 3]] as number[][],
  alpha: [0, 0, 1, 1],
  gammas: [0.5, 1.5, 0, 0],
  newF: [true, false, true, true],
  m: [2, 0, 1, 1],
  e: [0, 0, 0, 1],
}

/** Integrates a compiled network. */
export function integrate(c: Compiled, opts: IntegrateOptions): IntegrateResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now()
  const { n, pattern, perm } = c
  const rtol = opts.rtol ?? DEFAULT_TOLERANCES.rtol
  const atol = opts.atol ?? DEFAULT_TOLERANCES.atol
  const maxSteps = opts.maxSteps ?? 50000
  const sys = makeSystem(c, opts)
  const timeDependent = opts.history.kind === "series"

  let y = toY(c, opts.X0)
  const untilIdx = opts.until ? (c.index.get(opts.until.nucleus) ?? -1) : -1
  const untilTarget = untilIdx >= 0 ? y[untilIdx] * opts.until!.fraction : 0

  const val = new Float64Array(pattern.col.length)
  const work = new Float64Array(n)
  const F0 = new Float64Array(n)
  const F1 = new Float64Array(n)
  const F2 = new Float64Array(n)
  const Tt = new Float64Array(n)
  const k1 = new Float64Array(n)
  const k2 = new Float64Array(n)
  const k3 = new Float64Array(n)
  const ytmp = new Float64Array(n)
  const ynew = new Float64Array(n)
  const b = new Float64Array(n)

  const lu = (rhsVec: Float64Array, out: Float64Array) => {
    for (let i = 0; i < n; i++) b[perm[i]] = rhsVec[i]
    solve(pattern, val, b)
    for (let i = 0; i < n; i++) out[i] = b[perm[i]]
  }

  const ts: number[] = [0]
  const Ys: Float64Array[] = [y.slice()]
  let t = 0
  // neutron exposure: n_n = ρ N_A Y_n, v_T = sqrt(2kT/m_n)
  const iN = opts.neutronExposure ? (c.index.get("n") ?? -1) : -1
  const NA = c.network.screening.NA
  const nDensity = (time: number, yn: number) => {
    const { T9, rho } = stateAt(opts.history, time)
    return { n: rho * NA * Math.max(yn, 0), v: Math.sqrt((2 * 1.380649e-16 * T9 * 1e9) / 1.67492750e-24) }
  }
  let tau = 0
  let peak = iN >= 0 ? nDensity(0, y[iN]).n : 0
  const tEnd = opts.tEnd_s
  sys.rhs(t, y, F0)
  // first step: a small fraction of the fastest change, at most 1e-6 tEnd
  let h = tEnd * 1e-6
  for (let i = 0; i < n; i++) {
    const sc = atol + rtol * Math.abs(y[i])
    if (F0[i] !== 0) h = Math.min(h, (0.01 * sc) / Math.abs(F0[i]) + 1e-12 * tEnd)
  }
  h = Math.max(h, 1e-12)
  let steps = 0
  let rejected = 0
  let stopped: IntegrateResult["stopped"] = "time"
  let fresh = true // F0 is f(t, y)

  const rodas = (opts.method ?? "rodas3") === "rodas3"
  const K = rodas ? [new Float64Array(n), new Float64Array(n), new Float64Array(n), new Float64Array(n)] : []
  const Fs = new Float64Array(n)

  while (t < tEnd) {
    if (steps >= maxSteps) {
      stopped = "steps"
      break
    }
    if (t + h > tEnd) h = tEnd - t
    let err = 0
    if (rodas) {
      // F(t, y) and the Jacobian from the same fluxes
      sys.rhs(t, y, F0)
      val.fill(0)
      sys.addJacobian(y, -h * R3.gamma, val)
      for (let i = 0; i < n; i++) val[pattern.diag[i]] += 1
      factor(pattern, val, work)
      if (timeDependent) {
        const dt = Math.max(1e-7 * Math.abs(t), 1e-7 * h)
        sys.rhs(t + dt, y, Tt)
        for (let i = 0; i < n; i++) Tt[i] = (Tt[i] - F0[i]) / dt
        sys.rhs(t, y, F0)
      }
      const hg = h * R3.gamma
      for (let s = 0; s < 4; s++) {
        if (s === 0) Fs.set(F0)
        else if (R3.newF[s]) {
          for (let i = 0; i < n; i++) {
            let v = y[i]
            for (let j = 0; j < s; j++) v += R3.a[s][j] * K[j][i]
            ytmp[i] = v
          }
          sys.rhs(t + R3.alpha[s] * h, ytmp, Fs)
        }
        for (let i = 0; i < n; i++) {
          let v = Fs[i]
          for (let j = 0; j < s; j++) v += (R3.c[s][j] / h) * K[j][i]
          if (timeDependent) v += h * R3.gammas[s] * Tt[i]
          b[i] = 0
          k1[i] = hg * v
        }
        lu(k1, K[s])
      }
      for (let i = 0; i < n; i++) {
        ynew[i] = y[i] + R3.m[0] * K[0][i] + R3.m[2] * K[2][i] + R3.m[3] * K[3][i]
        const e = Math.abs(K[3][i])
        const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(ynew[i]))
        const r = e / sc
        if (r > err) err = r
      }
    } else {
    if (!fresh) sys.rhs(t, y, F0)
    fresh = true
    // Jacobian at (t, y): W = I − h d J
    sys.fluxes(t, y)
    val.fill(0)
    sys.addJacobian(y, -h * D, val)
    for (let i = 0; i < n; i++) val[pattern.diag[i]] += 1
    factor(pattern, val, work)
    if (timeDependent) {
      const dt = Math.max(1e-7 * Math.abs(t), 1e-7 * h)
      sys.rhs(t + dt, y, Tt)
      for (let i = 0; i < n; i++) Tt[i] = (Tt[i] - F0[i]) / dt
    }
    // k1 = W⁻¹ (F0 + h d T)
    for (let i = 0; i < n; i++) ytmp[i] = F0[i] + (timeDependent ? h * D * Tt[i] : 0)
    lu(ytmp, k1)
    for (let i = 0; i < n; i++) ytmp[i] = y[i] + 0.5 * h * k1[i]
    sys.rhs(t + 0.5 * h, ytmp, F1)
    for (let i = 0; i < n; i++) ytmp[i] = F1[i] - k1[i]
    lu(ytmp, k2)
    for (let i = 0; i < n; i++) {
      k2[i] += k1[i]
      ynew[i] = y[i] + h * k2[i]
    }
    sys.rhs(t + h, ynew, F2)
    for (let i = 0; i < n; i++) {
      ytmp[i] = F2[i] - E32 * (k2[i] - F1[i]) - 2 * (k1[i] - F0[i]) + (timeDependent ? h * D * Tt[i] : 0)
    }
    lu(ytmp, k3)
    // the error estimate, filtered through W⁻¹ (Shampine's device for stiff
    // components, whose raw estimate is not damped and would hold the step
    // down in quasi-equilibrium)
    for (let i = 0; i < n; i++) ytmp[i] = (h / 6) * (k1[i] - 2 * k2[i] + k3[i])
    lu(ytmp, k3)
    for (let i = 0; i < n; i++) {
      const e = Math.abs(k3[i])
      const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(ynew[i]))
      const r = e / sc
      if (r > err) err = r
    }
    }
    if (!Number.isFinite(err)) err = 1e10
    if (err > 1) {
      rejected++
      h *= Math.max(0.1, 0.8 * err ** (-1 / 3))
      fresh = !rodas
      continue
    }
    // a stop condition crossed inside the step: shorten it onto the crossing
    if (untilIdx >= 0 && ynew[untilIdx] < untilTarget && y[untilIdx] > untilTarget) {
      const a = Math.log(y[untilIdx] / untilTarget)
      const bb = Math.log(y[untilIdx] / Math.max(ynew[untilIdx], 1e-300))
      const theta = Math.min(0.999, Math.max(0.01, a / bb))
      if (Math.abs(ynew[untilIdx] / untilTarget - 1) > 1e-6 && h * theta > 1e-12 * t) {
        h *= theta
        continue
      }
    }
    if (iN >= 0) {
      const a = nDensity(t, y[iN])
      const b = nDensity(t + h, ynew[iN])
      tau += 0.5 * h * (a.n * a.v + b.n * b.v)
      if (b.n > peak) peak = b.n
    }
    t += h
    steps++
    y.set(ynew)
    if (!rodas) F0.set(F2)
    ts.push(t)
    Ys.push(y.slice())
    if (untilIdx >= 0 && y[untilIdx] <= untilTarget * (1 + 1e-6)) {
      stopped = "until"
      break
    }
    h *= Math.min(5, 0.8 * Math.max(err, 1e-10) ** (-1 / 3))
  }

  // samples, log-spaced in time
  const maxSamples = opts.maxSamples ?? 160
  let outT = ts
  let outY = Ys
  if (ts.length > maxSamples) {
    outT = [ts[0]]
    outY = [Ys[0]]
    const lo = Math.log(ts[1])
    const hi = Math.log(ts[ts.length - 1])
    let j = 1
    for (let s = 0; s < maxSamples - 1; s++) {
      const target = Math.exp(lo + ((hi - lo) * s) / (maxSamples - 2))
      while (j < ts.length - 1 && ts[j] < target) j++
      if (ts[j] !== outT[outT.length - 1]) {
        outT.push(ts[j])
        outY.push(Ys[j])
      }
    }
  }
  const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0
  return {
    t: outT,
    Y: outY,
    final: y,
    tFinal: t,
    stopped,
    steps,
    rejected,
    ms,
    ...(iN >= 0 ? { exposure: { tau_cm2: tau, peak_cm3: peak } } : {}),
  }
}

/**
 * How long a nucleus waits for each reaction that destroys it: the mean
 * lifetime τ = Y_target / (c_target · flux), i.e. 1/(ρ Y_j N_A⟨σv⟩) for a
 * two-body reaction on a partner j and 1/λ for a decay. Independent of the
 * target's own abundance (the formula is applied without it).
 */
export function lifetimes(
  c: Compiled,
  opts: Pick<IntegrateOptions, "scale" | "history" | "screening" | "provider">,
  X: Record<string, number>,
  t = 0,
): Float64Array {
  const sys = makeSystem(c, opts)
  const Y = toY(c, X)
  sys.fluxes(t, Y)
  const out = new Float64Array(c.nr)
  c.network.reactions.forEach((r, i) => {
    const target = r.target
    let rate = sys.full[i]
    for (let m = c.rStart[i]; m < c.rStart[i + 1]; m++) {
      const j = c.rSpec[m]
      const cnt = c.rCount[m]
      if (j === target) rate *= cnt * (cnt > 1 ? Y[j] ** (cnt - 1) : 1)
      else rate *= Y[j] ** cnt
    }
    out[i] = rate > 0 ? 1 / rate : Infinity
  })
  return out
}
