/**
 * Electron screening, ported line for line from pynucastro's `screen5`
 * (pynucastro/screening/screen.py): weak screening after Graboske et al.
 * (1973), strong after Alastuey & Jancovici (1978) with the plasma
 * parameters of Itoh et al. (1979), blended as in Wallace, Woosley & Weaver
 * (1982), appendix. Returns ln of the enhancement factor.
 */

export interface PlasmaState {
  qlam0z: number
  taufac: number
  aa: number
}

/** pynucastro's PlasmaState from T (K), ρ, Y and Z of every nucleus. */
export function plasmaState(
  temp: number,
  dens: number,
  Y: ArrayLike<number>,
  Z: ArrayLike<number>,
  consts: { co2: number; aaFactor: number },
): PlasmaState {
  let ytot = 0
  let zy = 0
  let z2y = 0
  for (let i = 0; i < Y.length; i++) {
    const y = Y[i] > 0 ? Y[i] : 0
    ytot += y
    zy += Z[i] * y
    z2y += Z[i] * Z[i] * y
  }
  if (ytot <= 0) return { qlam0z: 0, taufac: 0, aa: 0 }
  const zbar = zy / ytot
  const z2bar = z2y / ytot
  const rr = dens * ytot
  const pp = Math.sqrt((rr / temp) * (z2bar + zbar))
  const qlam0z = (1.88e8 / temp) * pp
  const taufac = consts.co2 / Math.cbrt(temp)
  const xni = Math.cbrt(rr * zbar)
  const aa = (consts.aaFactor / temp) * xni
  return { qlam0z, taufac, aa }
}

export interface ScreenFactors {
  z1: number
  z2: number
  zs13: number
  zhat: number
  zhat2: number
  lzav: number
  aznut: number
}

export function screenFactors(z1: number, a1: number, z2: number, a2: number): ScreenFactors {
  return {
    z1,
    z2,
    zs13: Math.cbrt(z1 + z2),
    zhat: (z1 + z2) ** (5 / 3) - z1 ** (5 / 3) - z2 ** (5 / 3),
    zhat2: (z1 + z2) ** (5 / 12) - z1 ** (5 / 12) - z2 ** (5 / 12),
    lzav: z1 > 0 && z2 > 0 ? (5 / 3) * Math.log((z1 * z2) / (z1 + z2)) : 0,
    aznut: Math.cbrt((z1 * z1 * z2 * z2 * a1 * a2) / (a1 + a2)),
  }
}

/** ln(screening enhancement), pynucastro screen5. */
export function screen5(state: PlasmaState, f: ScreenFactors): number {
  const fact = Math.cbrt(2)
  const gamefx = 0.3
  const gamefs = 0.8
  const bb = f.z1 * f.z2
  if (bb === 0 || state.aa === 0) return 0
  let gamp = state.aa
  const qq0 = (fact * bb) / f.zs13
  let gamef = qq0 * gamp
  const tau12 = state.taufac * f.aznut
  let alph12 = gamef / tau12
  if (alph12 > 1.6) {
    alph12 = 1.6
    gamef = 1.6 * tau12
    gamp = (gamef * f.zs13) / (fact * bb)
  }
  const h12w = bb * state.qlam0z
  let h12 = h12w
  if (gamef > gamefx) {
    const gamp14 = gamp ** 0.25
    const cc = 0.896434 * gamp * f.zhat - 3.4474 * gamp14 * f.zhat2 - 0.5551 * (Math.log(gamp) + f.lzav) - 2.996
    const a3 = alph12 * alph12 * alph12
    const qq = 0.014 + 0.0128 * alph12
    const rr = 5.0 / 32.0 - alph12 * qq
    const ss = tau12 * rr
    const tt = -0.0098 + 0.0048 * alph12
    const uu = 0.0055 + alph12 * tt
    const vv = gamef * alph12 * uu
    h12 = cc - a3 * (ss + vv)
    const r2 = 1.0 - 0.0562 * a3
    h12 += Math.log(Math.max(0.77, r2))
    if (gamef <= gamefs) {
      const dgamma = 1.0 / (gamefs - gamefx)
      h12 = h12w * dgamma * (gamefs - gamef) + h12 * dgamma * (gamef - gamefx)
    }
  }
  return Math.max(h12, 0)
}
