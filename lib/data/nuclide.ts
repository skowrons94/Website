/**
 * Nuclides and reaction keys as the data pipeline writes them: "14N",
 * "natC", "14N(p,g)", "12C(12C,a)", projectile and process codes p, d, t,
 * 3He, a, n, g, el, inl, x, 2p ... Pure functions, for pages and workers.
 */

export const SYMBOLS = [
  "n",
  "H",
  "He",
  "Li",
  "Be",
  "B",
  "C",
  "N",
  "O",
  "F",
  "Ne",
  "Na",
  "Mg",
  "Al",
  "Si",
  "P",
  "S",
  "Cl",
  "Ar",
  "K",
  "Ca",
  "Sc",
  "Ti",
  "V",
  "Cr",
  "Mn",
  "Fe",
  "Co",
  "Ni",
  "Cu",
  "Zn",
  "Ga",
  "Ge",
  "As",
  "Se",
  "Br",
  "Kr",
  "Rb",
  "Sr",
  "Y",
  "Zr",
  "Nb",
  "Mo",
  "Tc",
  "Ru",
  "Rh",
  "Pd",
  "Ag",
  "Cd",
  "In",
  "Sn",
  "Sb",
  "Te",
  "I",
  "Xe",
  "Cs",
  "Ba",
  "La",
  "Ce",
  "Pr",
  "Nd",
  "Pm",
  "Sm",
  "Eu",
  "Gd",
  "Tb",
  "Dy",
  "Ho",
  "Er",
  "Tm",
  "Yb",
  "Lu",
  "Hf",
  "Ta",
  "W",
  "Re",
  "Os",
  "Ir",
  "Pt",
  "Au",
  "Hg",
  "Tl",
  "Pb",
  "Bi",
  "Po",
  "At",
  "Rn",
  "Fr",
  "Ra",
  "Ac",
  "Th",
  "Pa",
  "U",
  "Np",
  "Pu",
  "Am",
  "Cm",
  "Bk",
  "Cf",
  "Es",
  "Fm",
  "Md",
  "No",
  "Lr",
  "Rf",
  "Db",
  "Sg",
  "Bh",
  "Hs",
  "Mt",
  "Ds",
  "Rg",
  "Cn",
  "Nh",
  "Fl",
  "Mc",
  "Lv",
  "Ts",
  "Og",
]

export interface Nuc {
  A: number
  Z: number
  /** "14N", "natC", "n", "p" for light particles as written */
  code: string
}

const LIGHT: Record<string, [number, number]> = { n: [1, 0], p: [1, 1], d: [2, 1], t: [3, 1], "3He": [3, 2], a: [4, 2], g: [0, 0] }

/** "14N" → {A 14, Z 7}; "natC" → A 0; light particle codes too; null otherwise. */
export function parseNuc(code: string): Nuc | null {
  if (code in LIGHT) return { A: LIGHT[code][0], Z: LIGHT[code][1], code }
  const m = /^(\d+|nat)([A-Z][a-z]?)(?:-.*)?$/.exec(code)
  if (!m) return null
  const Z = SYMBOLS.indexOf(m[2])
  if (Z < 0) return null
  return { A: m[1] === "nat" ? 0 : Number(m[1]), Z, code }
}

export function nucCode(A: number, Z: number): string {
  if (Z === 0 && A === 1) return "n"
  return `${A}${SYMBOLS[Z] ?? `Z${Z}`}`
}

export interface ReactionKey {
  key: string
  target: string
  projectile: string
  process: string
}

/** "14N(p,g)" → target, projectile, process. */
export function parseKey(key: string): ReactionKey | null {
  const m = /^([^()]+)\(([^,()]+),([^()]+)\)$/.exec(key)
  return m ? { key, target: m[1], projectile: m[2], process: m[3] } : null
}

/** The compound nucleus target + projectile ("15O" for 14N(p,g)); null for a natural target or an unknown code. */
export function compoundOf(key: string): string | null {
  const k = parseKey(key)
  if (!k) return null
  const t = parseNuc(k.target)
  const p = parseNuc(k.projectile)
  if (!t || !p || t.A === 0 || p.A === 0) return null
  return nucCode(t.A + p.A, t.Z + p.Z)
}

/** The residual nucleus for a single light ejectile ("15O" for 14N(p,g)); null otherwise. */
export function productOf(key: string): string | null {
  const k = parseKey(key)
  if (!k) return null
  const c = compoundOf(key)
  if (!c) return null
  const cn = parseNuc(c)!
  if (k.process === "el" || k.process === "inl") return k.target
  const e = parseNuc(k.process)
  if (!e) return null
  const A = cn.A - e.A
  const Z = cn.Z - e.Z
  if (A <= 0 || Z < 0 || A < Z) return null
  return nucCode(A, Z)
}

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹"
const sup = (s: string) => s.replace(/\d/g, (d) => SUP[Number(d)])

const PARTICLE: Record<string, string> = {
  p: "p",
  n: "n",
  d: "d",
  t: "t",
  a: "α",
  g: "γ",
  "3He": "³He",
  el: "el",
  inl: "inl",
  x: "x",
  tot: "tot",
  non: "non",
  abs: "abs",
  f: "f",
  sct: "sct",
}

/** "14N" → "¹⁴N", "natC" → "ⁿᵃᵗC", particle codes → p, α, γ, ³He. */
export function displayNuc(code: string): string {
  if (code in PARTICLE) return PARTICLE[code]
  const m = /^(\d+)([A-Z][a-z]?)(.*)$/.exec(code)
  if (m) return `${sup(m[1])}${m[2]}${m[3]}`
  const nat = /^nat([A-Z][a-z]?)(.*)$/.exec(code)
  if (nat) return `ⁿᵃᵗ${nat[1]}${nat[2]}`
  return code
    .split("+")
    .map((tok) => {
      const t = /^(\d*)([A-Za-z0-9]+)$/.exec(tok)
      return t && t[2] in PARTICLE ? `${t[1]}${PARTICLE[t[2]]}` : tok
    })
    .join("+")
}

/** "14N(p,g)" → "¹⁴N(p,γ)¹⁵O" (the product when it is one nucleus). */
export function reactionLabel(key: string, withProduct = true): string {
  const k = parseKey(key)
  if (!k) return key
  const base = `${displayNuc(k.target)}(${displayNuc(k.projectile)},${displayNuc(k.process)})`
  if (!withProduct) return base
  const prod = productOf(key)
  return prod && k.process !== "el" && k.process !== "inl" ? `${base}${displayNuc(prod)}` : base
}

/**
 * An evaluation's reaction label ("³He(α,γ)⁷Be", "¹²C(p,p)¹²C") as the
 * pipeline's key ("3He(a,g)", "12C(p,el)").
 */
export function keyFromLabel(label: string): string | null {
  const SUPMAP: Record<string, string> = Object.fromEntries([...SUP].map((c, i) => [c, String(i)]))
  const plain = label.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => SUPMAP[c]).replace(/\s+/g, "")
  const m = /^(\d+[A-Z][a-z]?)\(([^,]+),([^)]+)\)(.*)$/.exec(plain)
  if (!m) return null
  const part = (x: string) => (x === "α" ? "a" : x === "γ" ? "g" : x)
  const target = m[1]
  const projectile = part(m[2])
  let process = part(m[3])
  if (process === projectile && (m[4] === target || m[4] === "")) process = "el"
  return `${target}(${projectile},${process})`
}
