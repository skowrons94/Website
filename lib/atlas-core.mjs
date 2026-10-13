/**
 * The reaction atlas: loading and derived physics, in plain JavaScript.
 *
 * Plain JavaScript rather than TypeScript because two different runtimes read
 * it: the site at build time (through the typed facade in `lib/atlas.ts`), and
 * the prebuild scripts (`scripts/atlas-check.mjs`, `scripts/atlas-export.mjs`),
 * which run under bare `node` before Next is involved. One implementation keeps
 * the Q-values in the JSON export identical to the ones on the pages.
 *
 * Nothing here throws on incomplete content. A reaction listed in networks.yaml
 * without a file of its own is built from its id; missing optional files read
 * as empty. The one exception is a reference key defined twice with different
 * DOIs, which cannot be resolved without a person deciding which is right.
 */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import yaml from "js-yaml"

import { localize, untranslated } from "./localize.mjs"

// ATLAS_DIR in the environment points the site and the scripts at another copy
// of the directory, which is how the fallbacks are tested without touching the
// real content.
export const ATLAS_DIR = process.env.ATLAS_DIR
  ? path.resolve(process.env.ATLAS_DIR)
  : path.join(process.cwd(), "content", "atlas")

/**
 * Atlas reaction id → the evaluations whose info.json lists it in `atlas`
 * (server/evaluations/<id>/info.json). A missing or broken info.json adds
 * nothing here; `npm run check:evaluations` reports it.
 */
export function evaluationLinks(dir = path.join(process.cwd(), "server", "evaluations")) {
  const out = {}
  if (!fs.existsSync(dir)) return out
  for (const id of fs.readdirSync(dir).sort()) {
    let info
    try {
      info = JSON.parse(fs.readFileSync(path.join(dir, id, "info.json"), "utf8"))
    } catch {
      continue
    }
    for (const reaction of Array.isArray(info?.atlas) ? info.atlas : []) {
      if (typeof reaction !== "string") continue
      ;(out[reaction] ??= []).push(id)
    }
  }
  return out
}

/* -- vocabulary ------------------------------------------------------------ */

export const ENUMS = {
  kind: ["capture", "transfer", "fusion", "weak", "decay"],
  importance: ["key", "major", "minor"],
  status: ["well-known", "improving", "uncertain", "unmeasured"],
  category: ["theory", "experiment", "observation", "facility", "luna"],
}

/** Element symbols by Z. Index 0 is the neutron, which has no element. */
export const ELEMENTS = [
  "n", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne",
  "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
  "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
  "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
  "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn",
  "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
  "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb",
  "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
  "Tl", "Pb", "Bi", "Po",
]

/** Electron rest energy, MeV (CODATA 2018). */
export const ELECTRON_MASS = 0.51099895
/** Atomic mass unit, MeV. */
export const AMU = 931.49410242
/** Boltzmann constant, MeV per GK. */
export const K_T9 = 0.08617333

const SUPER_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹"
const toSuper = (s) => String(s).replace(/\d/g, (d) => SUPER_DIGITS[Number(d)])

/* -- nuclides and particles ------------------------------------------------ */

// Leptons and the photon. They carry charge but, with atomic mass excesses, no
// mass of their own in the bookkeeping (see qValue below).
const LEPTONS = {
  g: { charge: 0, display: "γ" },
  "e-": { charge: -1, display: "e⁻" },
  "e+": { charge: 1, display: "e⁺" },
  nu: { charge: 0, display: "ν" },
  nubar: { charge: 0, display: "ν̄" },
}

// Shorthands accepted in reaction strings, as nuclide codes.
const ALIASES = { p: "1H", d: "2H", t: "3H", a: "4He", alpha: "4He", n: "1n" }

/**
 * A single particle code: `14N`, `1H`, `p`, `n`, `4He`, `e-`, `g`, `nu`.
 * Returns null for anything that is not a nucleus or a known lepton.
 */
export function parseParticle(code) {
  const raw = String(code ?? "").trim()
  if (!raw) return null
  if (raw in LEPTONS) return { code: raw, lepton: true, ...LEPTONS[raw] }
  const nuclide = ALIASES[raw] ?? raw
  const match = /^(\d+)([A-Z][a-z]?)$/.exec(nuclide)
  if (match) {
    const A = Number(match[1])
    const symbol = match[2]
    const Z = symbol === "n" ? 0 : ELEMENTS.indexOf(symbol)
    if (Z < 0 || A < Z || A === 0) return null
    return nuclideFrom(A, Z)
  }
  if (nuclide === "1n") return nuclideFrom(1, 0)
  return null
}

export function nuclideFrom(A, Z) {
  const symbol = ELEMENTS[Z] ?? `Z${Z}`
  const code = Z === 0 ? "n" : `${A}${symbol}`
  return {
    code,
    lepton: false,
    A,
    Z,
    N: A - Z,
    symbol,
    charge: Z,
    display: Z === 0 ? "n" : `${toSuper(A)}${symbol}`,
  }
}

/**
 * A space-separated list with optional multiplicities: `2 1H`, `e+ nu`,
 * `4He 4He`. Unknown tokens are returned in `unknown` rather than dropped, so
 * the checker can name them.
 */
export function parseParticles(text) {
  const particles = []
  const unknown = []
  let count = 1
  for (const token of String(text ?? "").trim().split(/\s+/).filter(Boolean)) {
    if (/^\d+$/.test(token)) {
      count = Number(token)
      continue
    }
    const particle = parseParticle(token)
    if (!particle) unknown.push(token)
    else for (let i = 0; i < count; i++) particles.push(particle)
    count = 1
  }
  return { particles, unknown }
}

/** Display form of a particle list: `p`, `α`, `2p`, `e⁺ν`. */
function displayParticles(text, { light = true } = {}) {
  const { particles } = parseParticles(text)
  const groups = []
  for (const p of particles) {
    let label = p.display
    if (light && !p.lepton) {
      if (p.Z === 1 && p.A === 1) label = "p"
      else if (p.Z === 1 && p.A === 2) label = "d"
      else if (p.Z === 1 && p.A === 3) label = "t"
      else if (p.Z === 2 && p.A === 4) label = "α"
    }
    const last = groups[groups.length - 1]
    if (last && last.label === label && !p.lepton) last.n++
    else groups.push({ label, n: 1 })
  }
  return groups.map((g) => (g.n > 1 ? `${g.n}${g.label}` : g.label)).join("")
}

/* -- ids ------------------------------------------------------------------- */

// Reaction codes that are not simply "projectile letter, ejectile letter".
const SPECIAL_CODES = {
  pp: { projectile: "1H", ejectile: "e+ nu", kind: "weak" },
  pep: { projectile: "1H e-", ejectile: "nu", kind: "weak" },
  hep: { projectile: "1H", ejectile: "e+ nu", kind: "weak" },
  ec: { projectile: "e-", ejectile: "nu", kind: "weak" },
  bp: { projectile: "", ejectile: "e+ nu", kind: "decay" },
  bm: { projectile: "", ejectile: "e- nubar", kind: "decay" },
  aa: { projectile: "2 4He", ejectile: "g", kind: "fusion" },
  "3He2p": { projectile: "3He", ejectile: "2 1H", kind: "fusion" },
}

const LETTERS = { p: "1H", n: "n", d: "2H", t: "3H", a: "4He", g: "g" }

/**
 * What an id says about its reaction: `14N-pg-15O` is ¹⁴N + p → ¹⁵O + γ. Used
 * for the reactions networks.yaml lists before their file exists, so the map can
 * still draw them and the page can still say what they are.
 */
export function parseReactionId(id) {
  const parts = String(id).split("-")
  if (parts.length !== 3) return null
  const [target, code, product] = parts
  let spec = SPECIAL_CODES[code]
  // A heavy-ion projectile is written as its nuclide, then the ejectile
  // letter: `12C-12Ca-20Ne` is ¹²C + ¹²C → ²⁰Ne + α.
  const heavy = /^(\d+[A-Z][a-z]?)([pndtag])$/.exec(code)
  if (!spec && heavy && parseParticle(heavy[1])) {
    spec = { projectile: heavy[1], ejectile: LETTERS[heavy[2]], kind: LETTERS[heavy[2]] === "g" ? "capture" : "fusion" }
  }
  if (!spec && code.length === 2 && LETTERS[code[0]] && LETTERS[code[1]]) {
    const projectile = LETTERS[code[0]]
    const ejectile = LETTERS[code[1]]
    const t = parseParticle(target)
    const pr = parseParticle(projectile)
    const kind =
      ejectile === "g"
        ? "capture"
        : t && pr && t.A <= 3 && pr.A <= 3
          ? "fusion"
          : "transfer"
    spec = { projectile, ejectile, kind }
  }
  if (!spec) return null
  return { target, product, ...spec }
}

/** `¹⁴N(p,γ)¹⁵O`, `¹³N(β⁺)¹³C`, from the parts of a reaction. */
export function buildLabel({ target, projectile, ejectile, product, kind }) {
  const t = parseParticle(target)
  const p = parseParticle(product)
  const tDisplay = t ? t.display : target
  const pDisplay = p ? p.display : product
  if (kind === "decay") {
    const beta = /e\+/.test(ejectile) ? "β⁺" : /e-/.test(ejectile) ? "β⁻" : "decay"
    return `${tDisplay}(${beta})${pDisplay}`
  }
  return `${tDisplay}(${displayParticles(projectile)},${displayParticles(ejectile)})${pDisplay}`
}

/* -- the reaction in words ----------------------------------------------- */

/** Element names by Z, as for ELEMENTS; index 0 is the neutron. */
export const ELEMENT_NAMES = {
  en: [
    "neutron", "hydrogen", "helium", "lithium", "beryllium", "boron", "carbon", "nitrogen", "oxygen", "fluorine", "neon",
    "sodium", "magnesium", "aluminium", "silicon", "phosphorus", "sulfur", "chlorine", "argon", "potassium", "calcium",
    "scandium", "titanium", "vanadium", "chromium", "manganese", "iron", "cobalt", "nickel", "copper", "zinc",
    "gallium", "germanium", "arsenic", "selenium", "bromine", "krypton", "rubidium", "strontium", "yttrium", "zirconium",
    "niobium", "molybdenum", "technetium", "ruthenium", "rhodium", "palladium", "silver", "cadmium", "indium", "tin",
    "antimony", "tellurium", "iodine", "xenon", "caesium", "barium", "lanthanum", "cerium", "praseodymium", "neodymium",
    "promethium", "samarium", "europium", "gadolinium", "terbium", "dysprosium", "holmium", "erbium", "thulium", "ytterbium",
    "lutetium", "hafnium", "tantalum", "tungsten", "rhenium", "osmium", "iridium", "platinum", "gold", "mercury",
    "thallium", "lead", "bismuth", "polonium",
  ],
  it: [
    "neutrone", "idrogeno", "elio", "litio", "berillio", "boro", "carbonio", "azoto", "ossigeno", "fluoro", "neon",
    "sodio", "magnesio", "alluminio", "silicio", "fosforo", "zolfo", "cloro", "argon", "potassio", "calcio",
    "scandio", "titanio", "vanadio", "cromo", "manganese", "ferro", "cobalto", "nichel", "rame", "zinco",
    "gallio", "germanio", "arsenico", "selenio", "bromo", "kripton", "rubidio", "stronzio", "ittrio", "zirconio",
    "niobio", "molibdeno", "tecnezio", "rutenio", "rodio", "palladio", "argento", "cadmio", "indio", "stagno",
    "antimonio", "tellurio", "iodio", "xeno", "cesio", "bario", "lantanio", "cerio", "praseodimio", "neodimio",
    "promezio", "samario", "europio", "gadolinio", "terbio", "disprosio", "olmio", "erbio", "tulio", "itterbio",
    "lutezio", "afnio", "tantalio", "tungsteno", "renio", "osmio", "iridio", "platino", "oro", "mercurio",
    "tallio", "piombo", "bismuto", "polonio",
  ],
}

/** Names of the light particles and leptons, by language. */
const PARTICLE_NAMES = {
  en: { p: "proton", d: "deuteron", t: "triton", n: "neutron", g: "gamma ray", "e-": "electron", "e+": "positron", nu: "neutrino", nubar: "antineutrino" },
  it: { p: "protone", d: "deutone", t: "tritone", n: "neutrone", g: "raggio gamma", "e-": "elettrone", "e+": "positrone", nu: "neutrino", nubar: "antineutrino" },
}

/** One particle in words: `proton`, `nitrogen‑14` (with a non-breaking hyphen). */
export function particleName(p, lang = "en") {
  const names = PARTICLE_NAMES[lang] ?? PARTICLE_NAMES.en
  if (p.lepton) return names[p.code] ?? p.code
  if (p.Z === 0) return names.n
  if (p.Z === 1 && p.A <= 3) return names[["", "p", "d", "t"][p.A]]
  const element = (ELEMENT_NAMES[lang] ?? ELEMENT_NAMES.en)[p.Z] ?? p.symbol
  return `${element}\u2011${p.A}`
}

/**
 * The reaction as a sentence a general reader can follow:
 * `nitrogen‑14 + proton → oxygen‑15 + gamma ray`, in English or Italian.
 */
export function plainEquation(reaction, lang = "en") {
  const initial = initialParticles(reaction)
  const final = [
    ...parseParticles(reaction.product).particles,
    ...parseParticles(reaction.ejectile).particles,
  ]
  if (initial.length === 0 || final.length === 0) return ""
  const words = (list) => list.map((p) => particleName(p, lang)).join(" + ")
  return `${words(initial)} → ${words(final)}`
}

/* -- dates, from git ------------------------------------------------------- */

const datesCache = new Map()

/**
 * The date (YYYY-MM-DD) of the last commit that touched each file of the
 * atlas, and of the last commit that touched any of them. Read from git once
 * per build; where git or the history is not there (a Docker build copies no
 * .git), both are empty and the callers fall back to the `reviewed:` and
 * `version:` fields of the content.
 */
export function contentDates(dir = ATLAS_DIR) {
  if (datesCache.has(dir)) return datesCache.get(dir)
  let result = { files: new Map(), latest: null }
  try {
    const out = execFileSync("git", ["log", "--format=@%cs", "--name-only", "--relative", "--", "."], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    })
    const files = new Map()
    let date = null
    let latest = null
    for (const line of out.split("\n")) {
      if (line.startsWith("@")) {
        date = line.slice(1)
        if (!latest) latest = date
      } else if (line && date && !files.has(line)) {
        files.set(line, date)
      }
    }
    result = { files, latest }
  } catch {
    // No git, or not a repository: no dates from history.
  }
  datesCache.set(dir, result)
  return result
}

/**
 * The date (YYYY-MM-DD) of the last commit that touched `file` (a path from
 * the repository root), or null without git. For pages whose text lives in
 * code, such as the s-process page.
 */
export function fileDate(file) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", file], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null
  } catch {
    return null
  }
}

/** A YAML date (which js-yaml reads as a Date) or a string, as YYYY-MM-DD. */
function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const text = String(value ?? "").trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

/* -- nuclear data ---------------------------------------------------------- */

function readTable(file) {
  const table = new Map()
  if (!fs.existsSync(file)) return table
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!/^\s*\d/.test(line)) continue
    const [A, Z, value] = line.trim().split(/\s+/)
    table.set(`${A}-${Z}`, value === "stable" ? "stable" : Number(value))
  }
  return table
}

let nuclearDataCache = null

/** AME2020 mass excesses (MeV) and NUBASE2020 half-lives (s), keyed `A-Z`. */
export function loadNuclearData(dir = ATLAS_DIR) {
  if (nuclearDataCache && nuclearDataCache.dir === dir) return nuclearDataCache
  const data = path.join(dir, "nuclear-data")
  nuclearDataCache = {
    dir,
    massExcess: readTable(path.join(data, "ame2020-mass-excess.txt")),
    halfLife: readTable(path.join(data, "nubase2020-halflife.txt")),
  }
  return nuclearDataCache
}

export function massExcess(nuclide, data = loadNuclearData()) {
  if (!nuclide || nuclide.lepton) return 0
  const value = data.massExcess.get(`${nuclide.A}-${nuclide.Z}`)
  return typeof value === "number" ? value : null
}

/** Atomic mass in u, from the mass excess. */
export function atomicMass(nuclide, data = loadNuclearData()) {
  const delta = massExcess(nuclide, data)
  return delta === null ? null : nuclide.A + delta / AMU
}

/**
 * Q-value of a reaction or decay, in MeV.
 *
 * Convention: Q = Σ Δ(initial) − Σ Δ(final), with ATOMIC mass excesses (which
 * is what AME tabulates) and the leptons contributing nothing of their own.
 * Atomic masses carry Z electrons each, so the electrons are already counted:
 *
 *   - capture of an electron (⁷Be + e⁻ → ⁷Li + ν, and pep): the captured
 *     electron is one of the parent atom's, so Q = Δ(⁷Be) − Δ(⁷Li) as it stands;
 *   - β⁻ emission: the emitted electron is the daughter atom's extra one, again
 *     correct as it stands;
 *   - positron emission (β⁺ decay, p + p → d e⁺ν, hep): the daughter atom has one
 *     electron fewer and a positron has been made, so the atomic difference
 *     exceeds the kinetic energy release by 2 mₑc² = 1.022 MeV. That is exactly
 *     the energy returned when the positron annihilates with an electron of the
 *     plasma, which a star does count. We therefore quote the atomic difference
 *     (the energy deposited in the star, neutrino included), flag it with
 *     `annihilation: true`, and give the kinetic value Q − 2mₑc² beside it.
 *
 * Returns null if a mass is missing or the reaction does not balance in mass
 * number and charge (which would make any number meaningless).
 */
export function qValue(reaction, data = loadNuclearData()) {
  const initial = initialParticles(reaction)
  const final = [
    ...parseParticles(reaction.product).particles,
    ...parseParticles(reaction.ejectile).particles,
  ]
  if (!balanced(initial, final)) return null
  let q = 0
  for (const p of initial) {
    const d = massExcess(p, data)
    if (d === null) return null
    q += d
  }
  for (const p of final) {
    const d = massExcess(p, data)
    if (d === null) return null
    q -= d
  }
  const positrons = final.filter((p) => p.code === "e+").length
  const annihilation = positrons > 0
  return {
    value: q,
    annihilation,
    kinetic: annihilation ? q - 2 * ELECTRON_MASS * positrons : q,
  }
}

/**
 * The entrance channel as particles. A projectile written once where the
 * reaction needs it more than once (the triple-alpha process written as target
 * ⁴He, projectile ⁴He, product ¹²C) is repeated until mass and charge balance,
 * up to three copies; the checker warns so the file can say `2 4He` instead.
 */
export function initialParticles(reaction) {
  const target = parseParticles(reaction.target).particles
  const projectile = parseParticles(reaction.projectile).particles
  const final = [
    ...parseParticles(reaction.product).particles,
    ...parseParticles(reaction.ejectile).particles,
  ]
  const initial = [...target, ...projectile]
  if (balanced(initial, final) || projectile.length !== 1) return initial
  for (let copies = 2; copies <= 3; copies++) {
    const repeated = [...target, ...Array(copies).fill(projectile[0])]
    if (balanced(repeated, final)) return repeated
  }
  return initial
}

/** Mass number and charge conserved. */
export function balanced(initial, final) {
  const sum = (list, key) => list.reduce((s, p) => s + (p.lepton ? 0 : p[key]), 0)
  const charge = (list) => list.reduce((s, p) => s + p.charge, 0)
  return (
    initial.length > 0 &&
    final.length > 0 &&
    sum(initial, "A") === sum(final, "A") &&
    charge(initial) === charge(final)
  )
}

/* -- half-lives ------------------------------------------------------------ */

export function halfLifeSeconds(nuclide, data = loadNuclearData()) {
  if (!nuclide || nuclide.lepton) return null
  const value = data.halfLife.get(`${nuclide.A}-${nuclide.Z}`)
  return value === undefined ? null : value
}

/** Three significant figures, without trailing zeros. */
function sig(value, digits = 3) {
  return String(Number(value.toPrecision(digits)))
}

function superExponent(value) {
  const exponent = Math.floor(Math.log10(value))
  const mantissa = value / 10 ** exponent
  const exp = String(exponent).replace("-", "⁻")
  return `${sig(mantissa, 2)} × 10${toSuper(exp)}`
}

/** Unit words for half-lives, by language. Symbols (s, min, h) are the same. */
const HALF_LIFE_WORDS = {
  en: { stable: "stable", day: "d", year: "yr", million: "million yr", billion: "billion yr" },
  it: { stable: "stabile", day: "giorni", year: "anni", million: "milioni di anni", billion: "miliardi di anni" },
}

/** `1.5` → `1,5` in Italian; English keeps the point. */
export function decimal(text, lang = "en") {
  return lang === "en" ? String(text) : String(text).replace(/(\d)\.(\d)/g, "$1,$2")
}

/**
 * A half-life in the unit a person would use: `122 s`, `9.97 min`, `53.2 d`,
 * `717 000 yr`. Below a microsecond the number is given in powers of ten
 * (`8.2 × 10⁻¹⁷ s` for ⁸Be), since attoseconds mean nothing to most readers.
 * In Italian the decimal separator is a comma and the year words are Italian.
 */
export function formatHalfLife(seconds, lang = "en") {
  const words = HALF_LIFE_WORDS[lang] ?? HALF_LIFE_WORDS.en
  if (seconds === "stable") return words.stable
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return ""
  const YEAR = 365.2422 * 86400
  const d = (text) => decimal(text, lang)
  if (seconds < 1e-6) return `${d(superExponent(seconds))} s`
  if (seconds < 1e-3) return `${d(sig(seconds * 1e6))} μs`
  if (seconds < 1) return `${d(sig(seconds * 1e3))} ms`
  if (seconds < 60) return `${d(sig(seconds))} s`
  if (seconds < 3600) return `${d(sig(seconds / 60))} min`
  if (seconds < 86400) return `${d(sig(seconds / 3600))} h`
  if (seconds < YEAR) return `${d(sig(seconds / 86400))} ${words.day}`
  const years = seconds / YEAR
  if (years < 1e6) return `${d(Number(sig(years)).toLocaleString("en-GB").replace(/,/g, " "))} ${words.year}`
  if (years < 1e9) return `${d(sig(years / 1e6))} ${words.million}`
  if (years < 1e12) return `${d(sig(years / 1e9))} ${words.billion}`
  return `${d(superExponent(years))} ${words.year}`
}

/* -- Gamow window ---------------------------------------------------------- */

/**
 * Gamow peak and its width (1/e full width) for a charged-particle reaction,
 * in keV, from the standard expressions (e.g. Iliadis, Nuclear Physics of Stars):
 *
 *   E₀ = 0.1220 (Z₁² Z₂² μ T₉²)^(1/3) MeV
 *   Δ  = 0.2368 (Z₁² Z₂² μ T₉⁵)^(1/6) MeV
 *
 * with μ the reduced mass in u, here from the AME atomic masses.
 */
export function gamowWindow(z1, z2, mu, T9) {
  const e0 = 0.122 * Math.cbrt(z1 * z1 * z2 * z2 * mu * T9 * T9)
  const width = 0.2368 * Math.pow(z1 * z1 * z2 * z2 * mu * T9 ** 5, 1 / 6)
  return { E0: e0 * 1e3, width: width * 1e3 }
}

/**
 * The window of an endothermic reaction (Q < 0). Below the threshold E_th = −Q
 * the channel is closed, so a Gamow window that reaches below it is
 * meaningless. The integrand of the rate, exp(−E/kT − b/√E) with
 * b = 31.29 Z₁Z₂√μ keV^½ (the Boltzmann factor times the Coulomb penetration,
 * 2πη = b/√E), is evaluated above threshold only: its maximum is at
 * max(E₀, E_th), and the window runs between the energies at which it has
 * fallen by 1/e, cut at E_th. When the ordinary window lies wholly above the
 * threshold it is returned unchanged.
 *
 * Returns `{ E0, width, lo, hi, threshold, limited }` in keV; `limited` is true
 * when the threshold cuts the window. No phase-space factor of the exit
 * channel is included, so the result is the energy range the stellar plasma
 * supplies above threshold, not the full rate integrand.
 */
export function thresholdWindow(z1, z2, mu, T9, threshold) {
  const w = gamowWindow(z1, z2, mu, T9)
  const lo0 = w.E0 - w.width / 2
  const hi0 = w.E0 + w.width / 2
  if (!(threshold > 0) || lo0 >= threshold) {
    return { ...w, lo: lo0, hi: hi0, threshold: threshold > 0 ? threshold : null, limited: false }
  }
  const kT = K_T9 * T9 * 1e3
  const b = 31.29 * z1 * z2 * Math.sqrt(mu)
  const f = (E) => -E / kT - b / Math.sqrt(E)
  const peak = Math.max(w.E0, threshold)
  const target = f(peak) - 1
  const solve = (a, c) => {
    // f(a) >= target > f(c) or the reverse; bisection on the sign change.
    let fa = f(a) - target
    for (let i = 0; i < 100; i++) {
      const m = (a + c) / 2
      const fm = f(m) - target
      if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm } else c = m
    }
    return (a + c) / 2
  }
  let far = peak + w.width
  while (f(far) > target) far += w.width
  const hi = solve(peak, far)
  const lo = w.E0 > threshold && f(threshold) < target ? solve(w.E0, threshold) : threshold
  return { E0: peak, width: hi - lo, lo, hi, threshold, limited: true }
}

/** Why a reaction has no Gamow window, by case and language. */
export const WINDOW_NOTES = {
  "triple-alpha": {
    en: "Three helium nuclei do not meet at once. Two of them form ⁸Be, which lives about 10⁻¹⁶ s; a third captures on it through the 7.65 MeV Hoyle state of ¹²C before it falls apart. The rate is set by the energies and widths of these two resonances, not by a Gamow window.",
    it: "Tre nuclei di elio non si incontrano mai contemporaneamente. Due di essi formano l'⁸Be, che vive circa 10⁻¹⁶ s; un terzo viene catturato prima che si spezzi, attraverso lo stato di Hoyle del ¹²C a 7,65 MeV. Il tasso di reazione è fissato dalle energie e dalle larghezze di queste due risonanze, non da una finestra di Gamow.",
  },
  "electron-capture": {
    en: "An electron capture: there is no Coulomb barrier to cross, and the rate depends on the density of electrons at the nucleus, which in a star differs from that in a neutral atom.",
    it: "Una cattura elettronica: non c'è una barriera coulombiana da attraversare, e il tasso dipende dalla densità di elettroni sul nucleo, che in una stella è diversa da quella in un atomo neutro.",
  },
  neutron: {
    en: "A neutron feels no Coulomb barrier, so there is no Gamow window: the relevant energies are those of the thermal distribution itself, around kT.",
    it: "Un neutrone non risente della barriera coulombiana, quindi non c'è una finestra di Gamow: le energie rilevanti sono quelle della distribuzione termica stessa, intorno a kT.",
  },
}

/**
 * Which energy window applies to a reaction, and why not when none does.
 * Returns `{ pair, note, noteKey }`; `pair` is the two nuclei of the entrance
 * channel when a Gamow window makes sense, `noteKey` the case of WINDOW_NOTES
 * otherwise, and `note` its text in `lang`.
 */
export function entranceChannel(reaction, lang = "en") {
  const particles = initialParticles(reaction)
  const nuclei = particles.filter((p) => !p.lepton)
  const captured = particles.some((p) => p.code === "e-")
  const why = (noteKey) => ({ pair: null, noteKey, note: WINDOW_NOTES[noteKey][lang] ?? WINDOW_NOTES[noteKey].en })
  if (reaction.kind === "decay" && !captured) {
    return { pair: null, note: null, noteKey: null }
  }
  if (nuclei.length === 3 && nuclei.every((p) => p.Z === 2 && p.A === 4)) return why("triple-alpha")
  if (nuclei.length === 1 && captured) return why("electron-capture")
  if (nuclei.length === 2 && nuclei.some((p) => p.Z === 0)) return why("neutron")
  if (nuclei.length === 2) return { pair: nuclei, note: null, noteKey: null }
  return { pair: null, note: null, noteKey: null }
}

/* -- YAML ------------------------------------------------------------------ */

function readYamlFile(file) {
  return yaml.load(fs.readFileSync(file, "utf8"))
}

function listYaml(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort()
}

/**
 * Every file of the atlas as parsed YAML, with parse errors collected rather
 * than thrown. The checker reports them; the loader skips the broken file.
 */
export function readRaw(dir = ATLAS_DIR) {
  const errors = []
  const read = (rel, fallback) => {
    const file = path.join(dir, rel)
    if (!fs.existsSync(file)) return { data: fallback, missing: true }
    try {
      return { data: readYamlFile(file) ?? fallback, missing: false }
    } catch (error) {
      errors.push({ file: rel, message: `YAML does not parse: ${error.message.split("\n")[0]}` })
      return { data: fallback, missing: false, broken: true }
    }
  }

  const networks = read("networks.yaml", {})
  const facilities = read("facilities.yaml", {})
  const methods = read("methods.yaml", {})
  const timeline = read("timeline.yaml", null)
  const meta = read("atlas.yaml", {})
  const glossary = read("glossary.yaml", {})
  // --- lit --- the open questions (/atlas/open-questions)
  const debates = read("debates.yaml", {})

  const reactions = listYaml(path.join(dir, "reactions")).map((name) => {
    const r = read(path.join("reactions", name), null)
    return { file: `reactions/${name}`, name: name.replace(/\.ya?ml$/, ""), data: r.data, broken: r.broken }
  })
  const references = listYaml(path.join(dir, "references")).map((name) => {
    const r = read(path.join("references", name), {})
    return { file: `references/${name}`, data: r.data, broken: r.broken }
  })

  return {
    dir,
    errors,
    networks: networks.data,
    facilities: facilities.data,
    methods: methods.data,
    timeline: timeline.data,
    timelineMissing: timeline.missing,
    meta: meta.data,
    glossary: glossary.data,
    debates: debates.data,
    reactions,
    references,
  }
}

/** DOIs compare case-insensitively and without a resolver prefix. */
export function normaliseDoi(doi) {
  return String(doi ?? "")
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .toLowerCase()
}

/**
 * Merge every references/*.yaml into one map. A key repeated with the same DOI
 * is fine (two topic files can share a review); with a different DOI it is an
 * error, returned in `conflicts`.
 */
export function mergeReferences(files) {
  const merged = {}
  const origin = {}
  const conflicts = []
  for (const { file, data } of files) {
    if (!data || typeof data !== "object") continue
    for (const [key, entry] of Object.entries(data)) {
      if (!entry || typeof entry !== "object") continue
      if (key in merged) {
        if (normaliseDoi(merged[key].doi) !== normaliseDoi(entry.doi)) {
          conflicts.push({
            key,
            files: [origin[key], file],
            dois: [merged[key].doi ?? "(none)", entry.doi ?? "(none)"],
          })
        }
        continue
      }
      merged[key] = { key, ...entry }
      origin[key] = file
    }
  }
  return { references: merged, origin, conflicts }
}

/* -- the derived database -------------------------------------------------- */

const asArray = (value) => (Array.isArray(value) ? value : value == null || value === "" ? [] : [value])
const asText = (value) => (value == null ? "" : String(value).trim())

/** First sentence, for one-line tooltips. */
export function firstSentence(text) {
  const clean = asText(text).replace(/\s+/g, " ")
  const match = /^(.+?[.!?])(\s|$)/.exec(clean)
  return match ? match[1] : clean
}

function normaliseTimeline(raw, lang = "en") {
  const list = Array.isArray(raw) ? raw : asArray(raw?.events)
  return list
    .filter((e) => e && typeof e === "object")
    .map((original, i) => {
      // The anchor is made from the English title, so /atlas/timeline#… and
      // /it/atlas/timeline#… point at the same event.
      const e = localize(original, lang)
      const categories = [...asArray(e.category), ...asArray(e.categories)].map(String)
      const luna = e.luna === true || categories.includes("luna")
      if (luna && !categories.includes("luna")) categories.push("luna")
      const year = Number.parseInt(String(e.year ?? e.date ?? ""), 10)
      const month = Number.parseInt(String(e.month ?? ""), 10)
      return {
        // A stable anchor for /atlas/timeline#…, from the year and the title.
        id:
          asText(e.id) ||
          `${year || "event"}-${asText(original.title)
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .split("-")
            .slice(0, 6)
            .join("-")}`,
        year: Number.isFinite(year) ? year : null,
        month: month >= 1 && month <= 12 ? month : null,
        url: e.url ? String(e.url) : null,
        title: asText(e.title),
        text: asText(e.text ?? e.summary ?? e.description),
        categories,
        luna,
        reactions: asArray(e.reactions).map(String),
        refs: asArray(e.refs ?? e.references).map(String),
        facility: e.facility ? String(e.facility) : null,
        // One of the few events shown first, under "Highlights".
        highlight: e.highlight === true,
        _i: i,
      }
    })
    .sort(
      (a, b) =>
        (a.year ?? 1e9) - (b.year ?? 1e9) || (a.month ?? 0) - (b.month ?? 0) || a._i - b._i,
    )
    .map(({ _i, ...e }, i, all) =>
      // Two events of one year with the same opening words keep distinct anchors.
      all.findIndex((x) => x.id === e.id) === i ? e : { ...e, id: `${e.id}-${i}` },
    )
}

/**
 * The whole atlas, resolved: networks with their temperatures, every reaction
 * listed anywhere (file or not) with its Q-value, Gamow windows and half-life,
 * the merged bibliography, facilities, methods and timeline.
 *
 * `strict` (the default) throws on a reference key with two DOIs; the checker
 * passes `strict: false` and reports it instead.
 *
 * `lang` picks the language of the text: each field's `*_<lang>` translation
 * where the file has one, the English otherwise (see `localize.mjs`). Ids,
 * anchors and every number are the same in all languages.
 */
export function buildAtlas(raw = readRaw(), { strict = true, lang = "en" } = {}) {
  const data = loadNuclearData(raw.dir)
  const links = evaluationLinks()
  const { references, conflicts } = mergeReferences(raw.references)
  if (strict && conflicts.length > 0) {
    const c = conflicts[0]
    throw new Error(
      `atlas: reference "${c.key}" has two different DOIs (${c.dois.join(" vs ")}) in ${c.files.join(" and ")}`,
    )
  }

  const L = (value) => localize(value, lang)
  const dates = contentDates(raw.dir)
  const families = asArray(L(raw.networks?.families)).map((f) => ({
    id: String(f.id),
    name: asText(f.name) || String(f.id),
    summary: asText(f.summary),
    // A family with a page of its own (`page: /atlas/s-process`) is linked
    // there instead of to the map; `map: false` keeps its reactions off the
    // map, whose chart stops at the light nuclei; `see` names other families
    // whose pages are worth a link from this one.
    page: asText(f.page) || null,
    onMap: f.map !== false,
    see: asArray(f.see).map(String),
    networks: [],
  }))
  const networks = asArray(L(raw.networks?.networks)).map((n) => ({
    id: String(n.id),
    family: String(n.family ?? ""),
    name: asText(n.name) || String(n.id),
    summary: asText(n.summary),
    temperatures: asArray(n.temperatures)
      .filter((t) => t && Number.isFinite(Number(t.T9)))
      .map((t) => ({
        label: asText(t.label),
        T9: Number(t.T9),
        // Optional: the reactions of the network this temperature applies to
        // (the ¹³C pocket is where ¹³C(α,n) burns, not ²²Ne(α,n)).
        ...(t.reactions ? { reactions: asArray(t.reactions).map(String) } : {}),
      })),
    reactions: asArray(n.reactions).map(String),
  }))
  for (const n of networks) families.find((f) => f.id === n.family)?.networks.push(n.id)

  // Every id in display order: networks first, then files no network lists.
  const files = new Map()
  const originals = new Map()
  for (const r of raw.reactions) {
    if (!r.data || typeof r.data !== "object") continue
    files.set(String(r.data.id ?? r.name), L(r.data))
    originals.set(String(r.data.id ?? r.name), r.data)
  }
  const ids = []
  for (const n of networks) for (const id of n.reactions) if (!ids.includes(id)) ids.push(id)
  for (const id of files.keys()) if (!ids.includes(id)) ids.push(id)

  const facilityList = asArray(L(raw.facilities?.facilities)).filter((f) => f && f.id)
  const methodList = asArray(L(raw.methods?.methods)).filter((m) => m && m.id)

  const reactions = ids.map((id) => {
    const file = files.get(id)
    const original = originals.get(id)
    const fromId = parseReactionId(id) ?? {}
    const base = {
      target: asText(file?.target ?? fromId.target),
      projectile: asText(file?.projectile ?? fromId.projectile),
      ejectile: asText(file?.ejectile ?? fromId.ejectile),
      product: asText(file?.product ?? fromId.product),
      kind: asText(file?.kind ?? fromId.kind) || "capture",
    }
    const label = asText(file?.label) || buildLabel(base)

    const fileName = raw.reactions.find((x) => String(x.data?.id ?? x.name) === id)?.file
    const updated = (fileName && dates.files.get(fileName)) || isoDate(original?.reviewed)

    const memberOf = networks.filter((n) => n.reactions.includes(id)).map((n) => n.id)
    for (const n of asArray(file?.networks).map(String)) if (!memberOf.includes(n)) memberOf.push(n)
    const familyIds = [...new Set(memberOf.map((n) => networks.find((x) => x.id === n)?.family).filter(Boolean))]

    const target = parseParticle(base.target)
    const product = parseParticle(base.product)

    const q = qValue(base, data)

    // Gamow windows at every temperature of every network the reaction is in,
    // without repeating a temperature two networks share.
    const channel = entranceChannel(base, lang)
    const gamow = []
    if (channel.pair) {
      const [a, b] = channel.pair
      const ma = atomicMass(a, data)
      const mb = atomicMass(b, data)
      if (ma !== null && mb !== null) {
        const mu = (ma * mb) / (ma + mb)
        const seen = new Set()
        for (const nid of memberOf) {
          const network = networks.find((n) => n.id === nid)
          for (const t of network?.temperatures ?? []) {
            if (t.reactions && !t.reactions.includes(id)) continue
            const key = `${t.T9}|${t.label}`
            if (seen.has(key)) continue
            seen.add(key)
            // An endothermic channel opens only above its threshold, −Q.
            const threshold = q && q.value < 0 ? -q.value * 1e3 : null
            const w = thresholdWindow(a.Z, b.Z, mu, t.T9, threshold)
            const entry = { network: nid, label: t.label, T9: t.T9, E0: w.E0, width: w.width }
            if (w.limited) Object.assign(entry, { lo: w.lo, hi: w.hi, threshold: w.threshold, thresholdLimited: true })
            gamow.push(entry)
          }
        }
      }
    }
    // Thermal energies for the neutron-induced case, where kT is what matters.
    const thermal = []
    if (channel.noteKey === "neutron") {
      const seen = new Set()
      for (const nid of memberOf) {
        for (const t of networks.find((n) => n.id === nid)?.temperatures ?? []) {
          if (t.reactions && !t.reactions.includes(id)) continue
          if (seen.has(t.T9)) continue
          seen.add(t.T9)
          thermal.push({ network: nid, label: t.label, T9: t.T9, kT: K_T9 * t.T9 * 1e3 })
        }
      }
    }

    const halfLife = (nuclide) => {
      const s = halfLifeSeconds(nuclide, data)
      if (s === null) return null
      return { seconds: s === "stable" ? null : s, stable: s === "stable", text: formatHalfLife(s, lang) }
    }

    const measurements = asArray(file?.measurements)
      .filter((m) => m && typeof m === "object")
      .map((m, i) => ({
        year: Number.parseInt(String(m.year ?? ""), 10) || null,
        facility: m.facility && m.facility !== "other" ? String(m.facility) : null,
        lab: asText(m.lab),
        method: m.method ? String(m.method) : null,
        energy: asText(m.energy),
        note: asText(m.note),
        refs: asArray(m.refs).map(String),
        lowestKeV: typeof m.lowest_keV === "number" && m.lowest_keV > 0 ? m.lowest_keV : null,
        _i: i,
      }))
      .sort((a, b) => (a.year ?? 1e9) - (b.year ?? 1e9) || a._i - b._i)
      .map(({ _i, ...m }) => ({
        ...m,
        luna: m.refs.some((k) => references[k]?.luna === true),
      }))

    const evaluations = asArray(file?.evaluations).map(String)
    const cited = []
    for (const m of measurements) for (const k of m.refs) if (!cited.includes(k)) cited.push(k)
    for (const k of evaluations) if (!cited.includes(k)) cited.push(k)
    for (const k of asArray(file?.refs ?? file?.references).map(String)) if (!cited.includes(k)) cited.push(k)
    // --- lit --- "Did you know?": short striking facts, each with its sources
    const facts = asArray(file?.facts)
      .filter((f) => f && typeof f === "object" && asText(f.text))
      .map((f) => ({ text: asText(f.text), refs: asArray(f.refs).map(String) }))
    for (const f of facts) for (const k of f.refs) if (!cited.includes(k)) cited.push(k)

    const lunaRefs = cited.filter((k) => references[k]?.luna === true)
    const lunaYears = [
      ...new Set(measurements.filter((m) => m.luna && m.year).map((m) => m.year)),
    ].sort((a, b) => a - b)

    return {
      id,
      hasFile: Boolean(file),
      label,
      plain: plainEquation(base, lang),
      updated: updated ?? null,
      kind: base.kind,
      target: base.target,
      projectile: base.projectile,
      ejectile: base.ejectile,
      product: base.product,
      from: target && !target.lepton ? { code: target.code, A: target.A, Z: target.Z, N: target.N } : null,
      to: product && !product.lepton ? { code: product.code, A: product.A, Z: product.Z, N: product.N } : null,
      networks: memberOf,
      families: familyIds,
      importance: asText(file?.importance) || (base.kind === "decay" ? "minor" : "major"),
      summary: asText(file?.summary),
      role: asText(file?.role),
      details: asText(file?.details),
      status: asText(file?.status) || null,
      statusNote: asText(file?.status_note),
      // A plain sentence for the facts box when status_note is technical; the
      // note itself then moves to the specialist part of the page.
      statusPlain: asText(file?.status_plain),
      // Other names a reader may search for (optional; for the site search).
      keywords: asArray(file?.keywords).map(asText).filter(Boolean),
      methods: asArray(file?.methods).map(String),
      measurements,
      evaluations,
      // Interactive R-matrix evaluations on this site (server/evaluations/<id>):
      // `rmatrix:` in the reaction's file, and every evaluation whose info.json
      // lists this reaction in `atlas` (docs/ADDING-AN-EVALUATION.md).
      rmatrix: [...new Set([...asArray(file?.rmatrix).map(String), ...(links[id] ?? [])])],
      openQuestions: asArray(file?.open_questions).map(asText).filter(Boolean),
      facts,
      related: asArray(file?.related).map(String),
      q,
      gamow,
      thermal,
      windowNote: channel.note,
      // The parent's laboratory half-life: decays, and electron capture on a
      // nucleus that also decays on its own (⁷Be), but not pep.
      // ... and the radioactive target of a neutron capture (an s-process
      // branch point such as ⁸⁵Kr or ¹⁵¹Sm), where it decides the branching.
      halfLife: base.kind === "decay" || base.projectile === "e-" ||
        (base.projectile === "n" && target && typeof halfLifeSeconds(target, data) === "number" && halfLifeSeconds(target, data) < 1e15)
        ? halfLife(target)
        : null,
      productHalfLife: product && !product.lepton ? halfLife(product) : null,
      references: cited,
      luna: lunaRefs.length > 0,
      lunaYears,
      // The specialist fields still in English on a page in another language,
      // so the page can say so: details, measurements (their notes),
      // openQuestions.
      untranslated: lang === "en" || !original
        ? []
        : [
            untranslated(original, "details", lang) && "details",
            asArray(original.measurements).some((m) => untranslated(m, "note", lang)) && "measurements",
            untranslated(original, "open_questions", lang) && "openQuestions",
          ].filter(Boolean),
    }
  })

  return {
    families,
    networks,
    reactions,
    references,
    facilities: facilityList.map((f) => ({ ...f, id: String(f.id), name: asText(f.name) || String(f.id) })),
    methods: methodList.map((m) => ({ ...m, id: String(m.id), name: asText(m.name) || String(m.id) })),
    timeline: normaliseTimeline(raw.timeline, lang),
    timelinePresent: !raw.timelineMissing,
    meta: normaliseMeta(raw.meta, dates, lang),
    glossary: normaliseGlossary(raw.glossary, lang),
    debates: normaliseDebates(raw.debates, lang),
    conflicts,
  }
}

/**
 * About the atlas as a whole (content/atlas/atlas.yaml): author, licence, and
 * the version, which is the date of the last change to any file of the atlas
 * when git can tell, and the file's own `version:` otherwise.
 */
function normaliseMeta(raw, dates, lang = "en") {
  const m = localize(raw && typeof raw === "object" ? raw : {}, lang)
  const fallback = isoDate(m.version)
  const version = dates.latest && (!fallback || dates.latest > fallback) ? dates.latest : fallback
  return {
    title: asText(m.title) || "Reaction atlas",
    author: asText(m.author),
    url: asText(m.url),
    licence: asText(m.licence),
    licenceUrl: asText(m.licence_url),
    version: version ?? null,
    versionFromGit: Boolean(dates.latest && version === dates.latest),
  }
}

/** The glossary (content/atlas/glossary.yaml), in file order. */
function normaliseGlossary(raw, lang = "en") {
  const list = Array.isArray(raw) ? raw : asArray(raw?.terms)
  return list
    .filter((t) => t && typeof t === "object" && t.id)
    .map((original) => {
      const t = localize(original, lang)
      return {
        id: String(t.id),
        term: asText(t.term) || String(t.id),
        also: asText(t.also),
        text: asText(t.text),
        see: asArray(t.see).map(String),
        // Other names a reader may search for (optional; for the site search).
        keywords: asArray(t.keywords).map(asText).filter(Boolean),
        // A page of the atlas that explains the term at length.
        page: asText(t.page) || null,
      }
    })
}

// --- lit ---
/** The open questions (content/atlas/debates.yaml), in file order. */
function normaliseDebates(raw, lang = "en") {
  const list = Array.isArray(raw) ? raw : asArray(raw?.questions)
  return list
    .filter((q) => q && typeof q === "object" && q.id)
    .map((original) => {
      const q = localize(original, lang)
      const positions = asArray(q.positions)
        .filter((p) => p && typeof p === "object")
        .map((p) => ({ who: asText(p.who), text: asText(p.text), refs: asArray(p.refs).map(String) }))
      const refs = []
      for (const p of positions) for (const k of p.refs) if (!refs.includes(k)) refs.push(k)
      for (const k of asArray(q.refs).map(String)) if (!refs.includes(k)) refs.push(k)
      return {
        id: String(q.id),
        title: asText(q.title) || String(q.id),
        status: asText(q.status) === "converging" ? "converging" : "open",
        summary: asText(q.summary),
        positions,
        settle: asText(q.settle),
        reactions: asArray(q.reactions).map(String),
        curiosity: asText(q.curiosity) || null,
        // Every reference the question cites, positions first.
        refs,
      }
    })
}

/**
 * The single JSON dump of the database, as published at /atlas/data.json.
 * Derived quantities are included so that a reader of the file gets the same
 * numbers as the pages, with the conventions spelled out.
 */
export function exportAtlas(atlas = buildAtlas()) {
  const meta = { ...(atlas.meta ?? {}) }
  if (!meta.url && process.env.SITE_URL) meta.url = `${process.env.SITE_URL.replace(/\/$/, "")}${process.env.BASE_PATH ?? ""}/atlas`
  return {
    title: meta.title || "Reaction atlas",
    author: meta.author || undefined,
    url: meta.url || undefined,
    version: meta.version ?? undefined,
    licence: meta.licence ? { name: meta.licence, url: meta.licenceUrl || undefined } : undefined,
    cite: meta.author
      ? `${meta.author}, ${meta.title || "Reaction atlas"}${meta.version ? `, version ${meta.version}` : ""}${meta.url ? `, ${meta.url}` : ""}.`
      : undefined,
    generated: new Date().toISOString(),
    conventions: {
      energies: "keV, centre of mass, unless a field says otherwise; Q-values in MeV",
      qValue:
        "Q = Σ Δ(initial) − Σ Δ(final) with AME2020 atomic mass excesses. Where a positron is emitted, Q includes the 2 mₑc² released when it annihilates (annihilation: true); kinetic = Q − 2 mₑc².",
      gamow:
        "E0 = 0.1220 (Z1² Z2² μ T9²)^(1/3) MeV, width = 0.2368 (Z1² Z2² μ T9⁵)^(1/6) MeV, μ in u from AME2020; values in keV. For an endothermic reaction (Q < 0) whose window would reach below the threshold −Q, the window is threshold-limited (thresholdLimited: true): it runs from lo = max(threshold, lower 1/e point) to hi, the energy above the maximum at which exp(−E/kT − 2πη) has fallen by 1/e; E0 is then that maximum and width = hi − lo.",
      halfLife: "NUBASE2020, seconds (null for stable nuclides).",
    },
    families: atlas.families,
    networks: atlas.networks,
    reactions: atlas.reactions.map(({ untranslated, plain, ...r }) => r),
    references: atlas.references,
    facilities: atlas.facilities,
    methods: atlas.methods,
    timeline: atlas.timeline,
  }
}

/* -- the chart of nuclides ------------------------------------------------- */

/**
 * The cells of the map: every nuclide in the region the networks need that
 * lives at least a millisecond (enough to show the valley of stability and its
 * near neighbours), plus every nuclide a reaction touches, however short-lived
 * (⁸Be). Stability comes from NUBASE.
 */
export function chartCells(atlas, data = loadNuclearData(), lang = "en") {
  const touched = new Map()
  // Families drawn elsewhere (`map: false`, the s-process from iron to lead)
  // do not stretch the chart.
  const offMap = new Set((atlas.families ?? []).filter((f) => f.onMap === false).map((f) => f.id))
  for (const r of atlas.reactions) {
    if (r.families.length > 0 && r.families.every((f) => offMap.has(f))) continue
    for (const end of [r.from, r.to]) if (end) touched.set(`${end.A}-${end.Z}`, end)
  }
  let maxZ = 0
  let maxN = 0
  for (const n of touched.values()) {
    maxZ = Math.max(maxZ, n.Z)
    maxN = Math.max(maxN, n.N)
  }
  // A margin of neighbours beyond the heaviest nuclide used, so the last
  // process does not sit against the edge of the chart.
  maxZ += 1
  maxN += 2
  const cells = []
  for (let Z = 0; Z <= maxZ; Z++) {
    for (let N = 0; N <= maxN; N++) {
      const A = Z + N
      if (A === 0) continue
      const key = `${A}-${Z}`
      const t = data.halfLife.get(key)
      const inNetwork = touched.has(key)
      if (!inNetwork && (t === undefined || (t !== "stable" && t < 1e-3))) continue
      const nuclide = nuclideFrom(A, Z)
      cells.push({
        code: nuclide.code,
        A,
        Z,
        N,
        symbol: nuclide.symbol,
        stable: t === "stable",
        inNetwork,
        halfLife: t === undefined ? "" : formatHalfLife(t, lang),
      })
    }
  }
  return { cells, maxZ, maxN }
}

/* -- the s-process path ----------------------------------------------------- */

const YEAR_SECONDS = 365.2422 * 86400

/**
 * Nuclei where the s-process path forks because capture and β decay compete
 * (Käppeler et al. 2011, Rev. Mod. Phys. 83, 157, Sect. IV). Both arms are
 * drawn from these; everywhere else the lab half-life decides alone.
 * ⁵⁹Fe opens the way to ⁶⁰Fe in massive stars; ¹⁵²Eu feeds the s-only ¹⁵²Gd;
 * ¹⁶³Dy, stable in the laboratory, decays in the star (below). ¹⁷¹Tm: Guerrero
 * et al. 2020, PRL 125, 142701.
 */
export const S_BRANCH_POINTS = [
  "59Fe", "60Co", "63Ni", "79Se", "85Kr", "86Rb", "95Zr", "134Cs", "147Nd", "147Pm", "148Pm",
  "151Sm", "152Eu", "154Eu", "155Eu", "163Dy", "170Tm", "171Tm", "176Lu", "185W", "186Re", "204Tl",
]

/**
 * Decays that happen only in the star. Fully ionised ¹⁶³Dy, stable as a
 * neutral atom, β⁻-decays to a bound electron state of ¹⁶³Ho in days (Jung et
 * al. 1992, PRL 69, 2164; Takahashi and Yokoi 1987); ¹⁶³Ho then captures and
 * ¹⁶⁴Ho decays to the s-only ¹⁶⁴Er (Käppeler 2011, Sect. IV).
 */
export const S_STELLAR_DECAYS = { "163Dy": "163Ho" }

/**
 * Short-lived nuclei on the path that decay both ways, β⁻ and electron
 * capture: the electron-capture share (NUBASE2020). Both arms are drawn; an
 * arm that carries less than a tenth of the decays is marked `minor` and does
 * not count for the s-only / r-only bookkeeping (¹²⁸I feeds ¹²⁸Te a little,
 * which stays r-only).
 */
export const S_DUAL_DECAYS = { "64Cu": 0.615, "128I": 0.069, "152Eu": 0.721, "164Ho": 0.6 }

/**
 * Stable nuclei the rule would call r-only that the literature does not:
 * ¹²³Sb, missed only because the rule draws no branchings at A = 121 and 122
 * (the ¹²¹Sn isomer, ¹²²Sb), where part of the s-process flow can pass
 * (Schanz, Rupp and Käppeler 1991, KfK-4953); it is absent from the r-only
 * lists of Käppeler et al. 2011. Left unclassified, and named in the caption.
 */
export const S_NOT_R_ONLY = ["123Sb"]

/**
 * The s-process path on the chart of nuclides, from ⁵⁶Fe to the Pb–Bi cycle,
 * built from NUBASE2020 half-lives and AME2020 masses alone, with a deliberately
 * simple rule: a nucleus that lives longer than a year (or is stable) captures
 * a neutron; one that lives less decays, by β⁻ where the masses allow it and by
 * electron capture otherwise. At the branch points above it does both. The
 * path ends at ²¹⁰Po, whose α decay returns to ²⁰⁶Pb.
 *
 * A stable nucleus is "s-only" when the path reaches it and a stable (or
 * primordial, t½ > 10¹⁶ s) isobar of lower Z shields it from the β⁻ decays
 * that follow the r-process; "r-only" when the path misses it and a stable
 * isobar of higher Z exists (it is on the neutron-rich side of the valley).
 * A stable nucleus missed on the proton-rich side is a p-nucleus.
 *
 * Returns { nodes, edges, cells, sOnly, rOnly, branch, zMin, zMax, nMin, nMax }:
 * cells are every nuclide in the region that is stable, primordial or on the
 * path; edges are { from, to, kind: "n" | "beta-" | "ec" | "alpha", minor?,
 * stellar? }.
 */
export function sProcessPath(data = loadNuclearData(), lang = "en") {
  const key = (A, Z) => `${A}-${Z}`
  const t = (A, Z) => data.halfLife.get(key(A, Z))
  const long = (A, Z) => {
    const v = t(A, Z)
    return v === "stable" || (typeof v === "number" && v > 1e16)
  }
  const delta = (A, Z) => {
    const v = data.massExcess.get(key(A, Z))
    return typeof v === "number" ? v : null
  }
  const code = (A, Z) => `${A}${ELEMENTS[Z]}`
  const branch = new Set(S_BRANCH_POINTS)

  const nodes = new Map()
  const edges = []
  const queue = [[56, 26]]
  const seen = new Set()
  const add = (from, A, Z, kind, extra = {}) => {
    edges.push({ from, to: code(A, Z), kind, ...extra })
    if (!seen.has(key(A, Z))) queue.push([A, Z])
  }
  while (queue.length > 0) {
    const [A, Z] = queue.shift()
    if (seen.has(key(A, Z))) continue
    seen.add(key(A, Z))
    const v = t(A, Z)
    if (v === undefined) continue
    const c = code(A, Z)
    nodes.set(c, { A, Z, N: A - Z, code: c })
    if (A === 210 && Z === 84) {
      add(c, 206, 82, "alpha")
      continue
    }
    const isBranch = branch.has(c)
    const captures = long(A, Z) || (typeof v === "number" && v >= YEAR_SECONDS)
    // A branch point decays even when it is long-lived in the laboratory
    // (¹⁷⁶Lu, whose decay in a star runs through a short-lived isomer).
    const decays = isBranch || (!long(A, Z) && !captures)
    if ((captures || isBranch) && t(A + 1, Z) !== undefined) add(c, A + 1, Z, "n")
    if (decays) {
      const d0 = delta(A, Z)
      const up = delta(A, Z + 1)
      const down = delta(A, Z - 1)
      const betaOk = d0 !== null && up !== null && d0 > up && Z + 1 < ELEMENTS.length
      const ecOk = d0 !== null && down !== null && d0 > down
      const stellar = S_STELLAR_DECAYS[c]
      const ecShare = S_DUAL_DECAYS[c]
      if (stellar) add(c, A, Z + 1, "beta-", { stellar: true })
      else if (ecShare !== undefined && betaOk && ecOk) {
        add(c, A, Z + 1, "beta-", 1 - ecShare < 0.1 ? { minor: true } : {})
        add(c, A, Z - 1, "ec", ecShare < 0.1 ? { minor: true } : {})
      } else if (betaOk) add(c, A, Z + 1, "beta-")
      else if (ecOk) add(c, A, Z - 1, "ec")
    }
  }

  // Nuclei reached along major arms only: the s-only / r-only bookkeeping
  // ignores what a minor decay arm alone feeds.
  const main = new Set([code(56, 26)])
  for (let grew = true; grew; ) {
    grew = false
    for (const e of edges) {
      if (!e.minor && main.has(e.from) && !main.has(e.to)) {
        main.add(e.to)
        grew = true
      }
    }
  }

  const zMin = 26
  const zMax = 83
  const stableAt = new Map() // A -> [Z...] stable or primordial
  for (const [k, v] of data.halfLife) {
    const [A, Z] = k.split("-").map(Number)
    if (Z < zMin - 1 || Z > zMax + 1) continue
    if (v === "stable" || (typeof v === "number" && v > 1e16)) {
      if (!stableAt.has(A)) stableAt.set(A, [])
      stableAt.get(A).push(Z)
    }
  }
  const cells = []
  const sOnly = []
  const rOnly = []
  let nMin = Infinity
  let nMax = -Infinity
  for (const [k, v] of data.halfLife) {
    const [A, Z] = k.split("-").map(Number)
    if (Z < zMin || Z > zMax) continue
    const c = code(A, Z)
    const onPath = nodes.has(c)
    const stable = v === "stable"
    const primordial = typeof v === "number" && v > 1e16
    if (!stable && !primordial && !onPath) continue
    const isobars = stableAt.get(A) ?? []
    const onMain = main.has(c)
    let role = null
    // Below A ≈ 70 other processes (explosive burning, the weak s-process's
    // own seeds) blur the s/r bookkeeping; the classification starts at ⁷⁰Ge.
    if ((stable || primordial) && A >= 70) {
      const lower = isobars.some((z) => z < Z)
      const higher = isobars.some((z) => z > Z)
      if (onMain && lower) role = "s-only"
      else if (!onMain && higher && !lower) role = S_NOT_R_ONLY.includes(c) ? null : "r-only"
      else if (!onMain) role = "p"
    }
    if (role === "s-only") sOnly.push(c)
    if (role === "r-only") rOnly.push(c)
    nMin = Math.min(nMin, A - Z)
    nMax = Math.max(nMax, A - Z)
    cells.push({
      code: c,
      A,
      Z,
      N: A - Z,
      symbol: ELEMENTS[Z],
      stable,
      primordial,
      onPath,
      branch: branch.has(c),
      role,
      seconds: stable ? null : v,
      halfLife: stable ? "" : formatHalfLife(v, lang),
    })
  }
  // ²¹⁰Po (Z = 84) closes the cycle; it is drawn above bismuth.
  for (const n of nodes.values()) {
    if (n.Z > zMax && !cells.some((c) => c.code === n.code)) {
      const v = t(n.A, n.Z)
      cells.push({ code: n.code, A: n.A, Z: n.Z, N: n.N, symbol: ELEMENTS[n.Z], stable: false, primordial: false, onPath: true, branch: false, role: null, seconds: v, halfLife: formatHalfLife(v, lang) })
    }
  }
  return { nodes: [...nodes.values()], edges, cells, sOnly, rOnly, branch: S_BRANCH_POINTS, zMin, zMax: zMax + 1, nMin, nMax }
}
