/**
 * Deterministic random streams (design §3.1): splitmix32 seeds xoshiro128**.
 * No Math.random anywhere in the physics.
 */

export function splitmix32(a: number): () => number {
  return () => {
    a = (a + 0x9e3779b9) | 0
    let t = a ^ (a >>> 16)
    t = Math.imul(t, 0x21f0aaad)
    t ^= t >>> 15
    t = Math.imul(t, 0x735a2d97)
    return (t ^ (t >>> 15)) >>> 0
  }
}

/** FNV-1a of a string, for naming streams. */
export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const INV32 = 1 / 4294967296

export class Rng {
  private a: number
  private b: number
  private c: number
  private d: number
  private spare = NaN

  constructor(seed: number, stream: string) {
    const sm = splitmix32((seed ^ hash32(stream)) >>> 0)
    this.a = sm(); this.b = sm(); this.c = sm(); this.d = sm()
    if ((this.a | this.b | this.c | this.d) === 0) this.a = 1
  }

  /** Raw 32-bit output of xoshiro128**. */
  u32(): number {
    const r = Math.imul(rotl(Math.imul(this.b, 5), 7), 9) >>> 0
    const t = this.b << 9
    this.c ^= this.a; this.d ^= this.b; this.b ^= this.c; this.a ^= this.d
    this.c ^= t
    this.d = rotl(this.d, 11)
    return r
  }

  /** Uniform on [0, 1). */
  next(): number {
    return this.u32() * INV32
  }

  /** Uniform on (0, 1]. */
  nextOpen(): number {
    return (this.u32() + 1) * INV32
  }

  normal(): number {
    if (this.spare === this.spare) { const s = this.spare; this.spare = NaN; return s }
    let u: number, v: number, s: number
    do {
      u = 2 * this.next() - 1
      v = 2 * this.next() - 1
      s = u * u + v * v
    } while (s >= 1 || s === 0)
    const m = Math.sqrt(-2 * Math.log(s) / s)
    this.spare = v * m
    return u * m
  }

  exp(): number {
    return -Math.log(this.nextOpen())
  }

  /** Poisson deviate; exact (multiplication) for small means, PTRS (Hörmann 1993) above 10. */
  poisson(mean: number): number {
    if (!(mean > 0)) return 0
    if (mean < 10) {
      const L = Math.exp(-mean)
      let k = 0, p = this.next()
      while (p > L) { k++; p *= this.next() }
      return k
    }
    const slam = Math.sqrt(mean), loglam = Math.log(mean)
    const b = 0.931 + 2.53 * slam, a = -0.059 + 0.02483 * b
    const invalpha = 1.1239 + 1.1328 / (b - 3.4), vr = 0.9277 - 3.6224 / (b - 2)
    for (;;) {
      const U = this.next() - 0.5, V = this.next()
      const us = 0.5 - Math.abs(U)
      const k = Math.floor((2 * a / us + b) * U + mean + 0.43)
      if (us >= 0.07 && V <= vr) return k
      if (k < 0 || (us < 0.013 && V > us)) continue
      if (Math.log(V) + Math.log(invalpha) - Math.log(a / (us * us) + b) <= -mean + k * loglam - lgamma(k + 1)) return k
    }
  }

  /** [a, b, c, d, cached normal or null]: everything needed to continue the stream. */
  state(): (number | null)[] {
    return [this.a, this.b, this.c, this.d, this.spare === this.spare ? this.spare : null]
  }

  setState(s: (number | null)[]): void {
    this.a = (s[0] as number) | 0; this.b = (s[1] as number) | 0
    this.c = (s[2] as number) | 0; this.d = (s[3] as number) | 0
    this.spare = typeof s[4] === 'number' ? s[4] : NaN
  }
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k))
}

/** log Γ(x), Lanczos (g = 7, n = 9). */
export function lgamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x)
  x -= 1
  let s = c[0]
  for (let i = 1; i < 9; i++) s += c[i] / (x + i)
  const t = x + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(s)
}

/** Walker alias table for O(1) sampling of a discrete distribution. */
export class Alias {
  readonly n: number
  private prob: Float64Array
  private alias: Int32Array

  constructor(weights: ArrayLike<number>) {
    const n = weights.length
    this.n = n
    this.prob = new Float64Array(n)
    this.alias = new Int32Array(n)
    let sum = 0
    for (let i = 0; i < n; i++) sum += weights[i]
    const scaled = new Float64Array(n)
    const small: number[] = [], large: number[] = []
    for (let i = 0; i < n; i++) {
      scaled[i] = sum > 0 ? (weights[i] * n) / sum : 1
      ;(scaled[i] < 1 ? small : large).push(i)
    }
    while (small.length && large.length) {
      const s = small.pop()!, l = large.pop()!
      this.prob[s] = scaled[s]
      this.alias[s] = l
      scaled[l] = scaled[l] + scaled[s] - 1
      ;(scaled[l] < 1 ? small : large).push(l)
    }
    for (const i of large) this.prob[i] = 1
    for (const i of small) this.prob[i] = 1
  }

  sample(r: Rng): number {
    const u = r.next() * this.n
    const i = Math.floor(u)
    return u - i < this.prob[i] ? i : this.alias[i]
  }
}
