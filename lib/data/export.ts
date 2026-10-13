/**
 * Exports of a selection of datasets: AZURE2 data files, CSV, JSON, BibTeX.
 *
 * A line-by-line port of scripts/data/nucdata/export.py (read its docstring
 * for the conventions), so a file saved from the page is the file
 * `python scripts/data/dx.py export` writes, byte for byte
 * (scripts/data-ui/test.mjs checks it). Keep the two in step.
 *
 * The datasets must come from parsePy (lib/data/pyfmt.ts), which remembers
 * which numbers were floats: Python writes 90.0 and 90 differently.
 */

import { csvRow, dumpPy, isFloat, pyFormat, pyRound, pyStr, pyStrAt } from "./pyfmt.ts"
import type { DatasetMeta, ErrComponent, FullDataset, Points, ShardEntry } from "./types.ts"

/* -- masses (nucdata/masses.py) ------------------------------------------------- */

export const AMU = 931.49410242
const ALPHA = 1 / 137.035999084

/** Standard atomic weights, Z = 1..83 (masses.STD_WEIGHT), for natural targets. */
export const STD_WEIGHT: (number | null)[] = [
  null,
  1.008,
  4.0026,
  6.94,
  9.0122,
  10.81,
  12.011,
  14.007,
  15.999,
  18.998,
  20.18,
  22.99,
  24.305,
  26.982,
  28.085,
  30.974,
  32.06,
  35.45,
  39.95,
  39.098,
  40.078,
  44.956,
  47.867,
  50.942,
  51.996,
  54.938,
  55.845,
  58.933,
  58.693,
  63.546,
  65.38,
  69.723,
  72.63,
  74.922,
  78.971,
  79.904,
  83.798,
  85.468,
  87.62,
  88.906,
  91.224,
  92.906,
  95.95,
  97.0,
  101.07,
  102.91,
  106.42,
  107.87,
  112.41,
  114.82,
  118.71,
  121.76,
  127.6,
  126.9,
  131.29,
  132.91,
  137.33,
  138.91,
  140.12,
  140.91,
  144.24,
  145.0,
  150.36,
  151.96,
  157.25,
  158.93,
  162.5,
  164.93,
  167.26,
  168.93,
  173.05,
  174.97,
  178.49,
  180.95,
  183.84,
  186.21,
  190.23,
  192.22,
  195.08,
  196.97,
  200.59,
  204.38,
  207.2,
  208.98,
]

/** AME2020 mass excess (MeV) of (A, Z), or null: the atlas' table, as the pipeline reads it. */
export type MassTable = (A: number, Z: number) => number | null

export function twoPiEta(z1: number, z2: number, muMeV: number, eCm: number): number {
  return 2 * Math.PI * ALPHA * z1 * z2 * Math.sqrt(muMeV / (2 * eCm))
}

/* -- particles (nucdata/dataset.py) ---------------------------------------------- */

const LIGHT: Record<string, [number, number]> = {
  N: [1, 0],
  P: [1, 1],
  D: [2, 1],
  T: [3, 1],
  HE3: [3, 2],
  A: [4, 2],
  G: [0, 0],
  E: [0, -1],
}
const NUC = /^(\d+)-([A-Z]+)-(\d+)(?:-([A-Z0-9/]+))?$/

/** "7-N-14" → [Z, A, isomer]; A = 0 for a natural element. */
export function nuclide(code: string): [number, number, string] | null {
  const m = NUC.exec(code.trim())
  return m ? [Number(m[1]), Number(m[3]), m[4] ?? ""] : null
}

/** [A, Z] of an SF2 projectile code: P, A, HE3, or a nuclide 6-C-12. */
export function particle(code: string): [number, number] | null {
  if (code in LIGHT) return LIGHT[code]
  const n = nuclide(code)
  return n ? [n[1], n[0]] : null
}

function massesOf(meta: DatasetMeta, model: string, table: MassTable): [number | null, number | null] {
  const p = meta.sf[0]
  const t = nuclide(p[0])
  const pr = particle(p[1])
  if (!t || !pr) return [null, null]
  const [Zt, At] = t
  const [Ap, Zp] = pr
  if (model === "integer" || At === 0) return [Ap, At || (STD_WEIGHT[Zt] as number)]
  const u = (A: number, Z: number) => {
    const d = table(A, Z)
    return d === null ? null : A + d / AMU
  }
  return [u(Ap, Zp), u(At, Zt)]
}

function charges(meta: DatasetMeta): [number, number] {
  const p = meta.sf[0]
  const t = nuclide(p[0])
  const pr = particle(p[1])
  return [pr ? pr[1] : 0, t ? t[0] : 0]
}

/* -- uncertainties ------------------------------------------------------------------ */

type Col = (number | null)[]

/** Python's `x or [None] * n`: an absent or empty column reads as n Nones. */
function orNone<T>(x: T[] | null | undefined, n: number): (T | null)[] {
  return x && x.length ? x : Array(n).fill(null)
}

/** Every point-wise error column by its EXFOR heading, under `err` or as d_stat/d_sys/d_tot. */
export function pointColumns(meta: DatasetMeta, pts: Points): Map<string, Col> {
  const out = new Map<string, Col>(Object.entries(pts.err ?? {}))
  for (const [name, where] of Object.entries(meta.err_columns ?? {})) {
    const col = (pts as unknown as Record<string, Col | undefined>)[where]
    if (where !== "err" && col !== undefined && col !== null) out.set(name, col)
  }
  return out
}

/** AZURE2 column 4, row by row, and what it is (export.point_error). */
export function pointError(meta: DatasetMeta, pts: Points, mode: "point" | "stat" | "total" = "point"): [Col, string] {
  const comps = new Map<string, ErrComponent>()
  for (const c of meta.err_components) comps.set(c.name, c)
  const n = pts.value.length
  const err = pointColumns(meta, pts)
  const base = (k: string) => k.split("#")[0]
  const pick = (kind: string) =>
    [...comps.entries()].filter(([k, c]) => c.where === "point" && c.kind === kind && err.has(k)).map(([k]) => k)
  const stat = pick("stat")
  let sys = pick("sys")
  if (sys.some((k) => base(k) === "ERR-SYS")) sys = sys.filter((k) => base(k) === "ERR-SYS")
  const total = pick("total")
  total.sort((a, b) => Number(base(a) !== "ERR-T") - Number(base(b) !== "ERR-T"))
  const first: string[][] = { point: [[...stat, ...sys], total], stat: [stat, total], total: [total, [...stat, ...sys]] }[mode]
  const out: Col = []
  const used = new Set<string>()
  for (let i = 0; i < n; i++) {
    let val: number | null = null
    for (const names of first) {
      let parts = names.map((k) => err.get(k)![i]).filter((x): x is number => x !== null && x !== undefined)
      if (parts.length) {
        if (names === total) parts = parts.slice(0, 1)
        val = Math.sqrt(parts.reduce((s, x) => s + x * x, 0))
        for (const k of names) if (err.get(k)![i] !== null && err.get(k)![i] !== undefined) used.add(k)
        break
      }
    }
    out.push(val)
  }
  const what = used.size ? `${mode}: ` + [...used].sort().join(", ") : "none given"
  return [out, what]
}

/** Common systematic components (%) in quadrature, and their names. */
export function normalisationPercent(meta: DatasetMeta): [number, string] {
  const parts: number[] = []
  const names: string[] = []
  let comps = meta.err_components.filter((c) => c.where === "common" && (c.kind === "sys" || c.kind === "total"))
  if (comps.some((c) => c.name === "ERR-SYS")) comps = comps.filter((c) => c.name === "ERR-SYS")
  for (const c of comps) {
    if (c.relative && c.value !== null && c.value !== undefined) {
      parts.push(c.value)
      names.push(`${c.name} ${pyFormat(c.value, "g")} %`)
    }
  }
  return [parts.length ? Math.sqrt(parts.reduce((s, x) => s + x * x, 0)) : 0.0, names.join(", ")]
}

/** Relative margin of a segment's energy limits beyond the energies written (export.SEGMENT_MARGIN). */
export const SEGMENT_MARGIN = 1e-5

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "" : pyFormat(v, ".6e"))
const s = pyStr

type Meta = DatasetMeta & ShardEntry

export function header(meta: Meta, extra: string[], snapshot: { date: string; commit: string }): string[] {
  const refs = meta.refs.map((r) => r.code + (r.doi ? ` doi:${r.doi}` : "")).join("; ")
  const [norm, normNames] = normalisationPercent(meta)
  const mon = meta.monitor.map((m) => m.code + (m.text ? ` (${m.text})` : "")).join("; ") || "none"
  const comps = meta.err_components
    .map(
      (c) =>
        `${s(c.name)} [${s(c.kind)}, ${s(c.where)}` +
        (c.value !== null && c.value !== undefined ? `, ${pyFormat(c.value, "g")} ${s(c.unit)}` : "") +
        "]" +
        (c.text ? ` ${c.text}` : ""),
    )
    .join("; ")
  const lines = [
    `EXFOR dataset: ${meta.id} (entry ${meta.entry}, subentry ${meta.subentry}` + (meta.pointer ? `, pointer ${meta.pointer})` : ")"),
    `EXFOR: ${meta.links.exfor}`,
    `Master file: ${meta.links.master}`,
    `Revision: entry ${s(meta.entry_updated || meta.entry_date)} (${s(meta.entry_revisions)} revisions), ` +
      `subentry ${s(meta.subentry_date)}`,
    `Reaction code: (${meta.code})`,
    `Quantity: ${s(meta.quantity_class)} (${s(meta.quantity_text || meta.quantity)}), unit ${s(meta.value_unit)}`,
    `Frame: energy given as ${s(meta.E_source)} (${s(meta.E_frame)}); angle ${s(meta.ang_frame || "n/a")}; ` +
      `value ${s(meta.value_frame || "n/a")}`,
    `Final levels (MeV): ${meta.final_levels.map((x) => pyFormat(x, "g")).join(", ") || "not specified"}`,
    `Normalisation/monitor: ${mon}`,
    `Systematic (common) uncertainty: ${pyFormat(norm, ".3g")} % (${normNames || "none given"})`,
    `Uncertainty components: ${comps || "none"}`,
    `Flags: ${meta.flags.join(", ") || "none"}`,
    ...(meta.corrections ?? []).map((c) => `Corrected here: ${c.change} (${c.problem} scripts/data/corrections.yaml)`),
    `Excluded rows: ${s(meta.nexcluded)}`,
    `Authors: ${meta.authors.join(", ")}`,
    `Title: ${s(meta.title)}`,
    `Reference: ${refs}`,
    `Data: EXFOR (IAEA/NRDC), snapshot ${snapshot.date} (exfor_master ${snapshot.commit.slice(0, 10)}), ` +
      "CC BY 4.0. Cite the original paper and N. Otuka et al., Nucl. Data Sheets 120, 272 (2014).",
  ]
  return [...lines, ...extra]
}

export interface Azure2File {
  stem: string
  dat: string
  csv: string
  segment: string
  id: string
  level: number | null
  is_diff: number
  /** rows left out of the .dat for want of an uncertainty */
  no_err: number
  /** segment column 10: 1 varied normalisation, 0 fixed */
  vary: number
}

export type Azure2Result = Azure2File | { skip: string }

export interface Azure2Options {
  labParticle?: "projectile" | "target"
  massModel?: "ame" | "integer"
  error?: "point" | "stat" | "total"
}

export function azure2(
  ds: FullDataset,
  snapshot: { date: string; commit: string },
  table: MassTable,
  opts: Azure2Options = {},
): Azure2Result[] {
  const labParticle = opts.labParticle ?? "projectile"
  const massModel = opts.massModel ?? "ame"
  const errorMode = opts.error ?? "point"
  const meta = ds.meta
  const pts = ds.points
  const q = meta.quantity_class
  if (!["sigma", "S", "dsigma", "pol"].includes(q) || meta.complex)
    return [{ skip: `${meta.id}: quantity '${q}' has no AZURE2 data segment; use CSV/JSON` }]
  if (q === "pol" && !meta.quantity.includes("ANA"))
    return [{ skip: `${meta.id}: only analysing powers (ANA) map to an AZURE2 segment (isDiff 7)` }]
  const [mp, mt] = massesOf(meta, massModel, table)
  if (mp === null || !mp) return [{ skip: `${meta.id}: no masses for this reaction` }]
  const [m1, m2] = labParticle === "target" ? [mt as number, mp] : [mp, mt as number]
  const n = pts.value.length
  const ecm = pts.E_cm
  const eLab = ecm.map((e) => (e === null ? null : (e * (m1 + m2)) / m2))
  const ang: Col = orNone(pts.ang, n)
  const lvl: Col = orNone(pts.E_level, n)
  const [err, errWhat] = pointError(meta, pts, errorMode)
  const [norm] = normalisationPercent(meta)
  const value = pts.value
  const convNote: string[] = []
  const factor: (number | null)[] = Array(n).fill(1.0)
  if (q === "S") {
    const [z1, z2] = charges(meta)
    const [ap, at] = massesOf(meta, "ame", table) as [number, number]
    const mu = ((ap * at) / (ap + at)) * AMU
    for (let i = 0; i < n; i++) {
      const e = ecm[i]
      factor[i] = !e || e <= 0 ? null : Math.exp(-twoPiEta(z1, z2, mu, e)) / e
    }
    convNote.push(
      "value: EXFOR gives the S-factor (MeV b); converted for AZURE2 to " +
        "sigma = S/E_cm exp(-2 pi eta), eta from E_cm and the AME2020 reduced mass; " +
        "the CSV keeps S",
    )
  }
  let isDiff: number
  if (q === "dsigma" || q === "pol") {
    isDiff = meta.ang_frame === "cm" || q === "pol" ? 4 : 1
    if (q === "pol") {
      isDiff = 7
      if (meta.ang_frame !== "cm") convNote.push("WARNING: AZURE2 isDiff 7 expects c.m. angles; EXFOR gives lab angles")
    }
    if (meta.value_frame === "cm" && isDiff === 1) convNote.push("WARNING: value in c.m. with lab angles")
  } else isDiff = 0
  const groups = new Map<number | null, number[]>()
  for (let i = 0; i < n; i++) {
    if (value[i] === null || eLab[i] === null) continue
    if (pts.limit && pts.limit.length && pts.limit[i]) continue
    const key = meta.final_levels.length > 1 ? lvl[i] : null
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(i)
  }
  if (groups.size === 0) return [{ skip: `${meta.id}: no exportable points` }]
  const author = meta.first_author.replace(/[^A-Za-z]/g, "") || "EXFOR"
  const base = `${author}-${meta.entry}${meta.subentry}` + (meta.pointer ? `-p${meta.pointer}` : "")
  const sorted = [...groups.entries()].sort((a, b) => {
    const ka = a[0] === null ? 1 : 0
    const kb = b[0] === null ? 1 : 0
    if (ka !== kb) return ka - kb
    return (a[0] || 0) - (b[0] || 0)
  })
  const out: Azure2Result[] = []
  const dStat: Col = orNone(pts.d_stat, n)
  const dSys: Col = orNone(pts.d_sys, n)
  const dTot: Col = orNone(pts.d_tot, n)
  for (const [lv, rows] of sorted) {
    const stem = base + (lv !== null ? `-${pyRound(lv * 1000)}` : "")
    const dat: string[] = []
    const written: number[] = []
    let noErr = 0
    let table2 = ""
    for (const i of rows) {
      const f = factor[i]
      if (f === null) continue
      const v = (value[i] as number) * f
      const d = err[i] === null ? null : (err[i] as number) * f
      const angle = isDiff ? ang[i] || 0.0 : 0
      if (d !== null && d > 0) {
        // AZURE2 gives a point of uncertainty 0 no weight in chi2: such rows stay in the CSV only.
        dat.push(`${pyFormat(eLab[i] as number, ".6e")} ${pyFormat(angle, ".4f")} ${pyFormat(v, ".6e")} ${pyFormat(d, ".6e")}`)
        written.push(i)
      } else noErr++
      table2 += csvRow([
        fmt(eLab[i]),
        fmt(ecm[i]),
        fmt(pts.E_lab[i]),
        ang[i] === null ? "" : pyFormat(ang[i] as number, "g"),
        fmt(pts.value[i]),
        q === "S" ? fmt(v) : "",
        fmt(dStat[i]),
        fmt(dSys[i]),
        fmt(dTot[i]),
        d ? fmt(d) : "",
        lvl[i] === null ? "" : pyFormat(lvl[i] as number, "g"),
        !pts.flag || !pts.flag.length || pts.flag[i] === null ? "" : pyFormat(pts.flag[i] as number, "g"),
      ])
    }
    if (!written.length) {
      out.push({
        skip:
          meta.id +
          (lv !== null ? ` (E_x = ${pyFormat(lv, "g")} MeV)` : "") +
          ": no point has an uncertainty, and AZURE2 would give them no weight; use the CSV/JSON",
      })
      continue
    }
    // The segment's limits bracket the energies (and angles) as the .dat file
    // writes them: AZURE2 keeps a point only if E_min <= E <= E_max.
    const es = written.map((i) => Number(pyFormat(eLab[i] as number, ".6e")))
    const eLo = Math.min(...es) * (1 - SEGMENT_MARGIN)
    const eHi = Math.max(...es) * (1 + SEGMENT_MARGIN)
    const angs = written.map((i) => ang[i]).filter((a): a is number => a !== null).map((a) => Number(pyFormat(a, ".4f")))
    const [aLo, aHi] =
      isDiff && angs.length
        ? [pyFormat(Math.max(0.0, Math.min(...angs) - 0.001), ".4f"), pyFormat(Math.min(180.0, Math.max(...angs) + 0.001), ".4f")]
        : ["0", "180"]
    const vary = norm > 0 ? 1 : 0
    const exitKey = ["sigma", "S"].includes(q) && lv === null && !meta.quantity.includes("PAR") && meta.process === "g" ? "-1" : "EXIT"
    const segment =
      `1 ENTR ${exitKey} ${pyFormat(eLo, ".6e")} ${pyFormat(eHi, ".6e")} ${aLo} ${aHi} ` +
      `${exitKey === "-1" ? 3 : isDiff} 1 ${vary} ${pyFormat(norm, ".3g")} 0 0 0 data/${stem}.dat 0 0`
    const extra = [
      `AZURE2 file: data/${stem}.dat (columns E_lab MeV, angle deg, value, uncertainty; no header)`,
      `AZURE2 E_lab: lab energy of the ${labParticle === "target" ? "EXFOR target" : "EXFOR projectile"} ` +
        `(m1 = ${pyFormat(m1, ".6f")} u moving on m2 = ${pyFormat(m2, ".6f")} u, ${massModel} masses), E_lab = E_cm (m1+m2)/m2`,
      `AZURE2 value unit: ${isDiff === 1 || isDiff === 4 ? "b/sr" : isDiff === 7 ? "" : "b"}; ` +
        `segment type isDiff ${exitKey === "-1" ? 3 : isDiff}`,
      `AZURE2 uncertainty (column 4): ${errWhat}`,
      `AZURE2 normalisation uncertainty (segment column 11): ${pyFormat(norm, ".3g")} %`,
      vary
        ? `AZURE2 normalisation: varied (segment column 10 = 1) within the ${pyFormat(norm, ".3g")} % above`
        : "AZURE2 normalisation: fixed at 1 (segment column 10 = 0): EXFOR gives no common systematic " +
          "uncertainty, and a varied normalisation without one would float freely; set it yourself",
      ...(noErr
        ? [
            `AZURE2 rows left out of the .dat: ${noErr} without an uncertainty (AZURE2 would give them ` +
              "no weight in chi2); they are below with an empty d_azure2",
          ]
        : []),
      ...convNote.map((c) => `Note: ${c}`),
    ]
    if (lv !== null) extra.push(`This file: final level E_x = ${pyFormat(lv, "g")} MeV`)
    const cols = [
      "E_lab_azure2_MeV",
      "E_cm_MeV",
      "E_lab_projectile_MeV",
      "angle_deg",
      `value_${meta.value_unit || "nodim"}`,
      "value_azure2",
      "d_stat",
      "d_sys",
      "d_tot",
      "d_azure2",
      "E_level_MeV",
      "flag",
    ]
    let csv = ""
    for (const h of header(meta, extra, snapshot)) csv += "# " + h + "\n"
    csv += csvRow(cols) + table2
    out.push({ stem, dat: dat.join("\n") + "\n", csv, segment, id: meta.id, level: lv, is_diff: isDiff, no_err: noErr, vary })
  }
  return out
}

/** Every point of every dataset, one row each (export.csv_long). */
export function csvLong(datasets: FullDataset[]): string {
  let out = csvRow([
    "id",
    "reaction",
    "quantity",
    "E_frame_given",
    "E_lab_MeV",
    "E_cm_MeV",
    "angle_deg",
    "angle_frame",
    "E_level_MeV",
    "value",
    "unit",
    "limit",
    "d_stat",
    "d_sys",
    "d_tot",
    "flag",
    "doi",
  ])
  for (const ds of datasets) {
    const m = ds.meta
    const p = ds.points as unknown as Record<string, unknown[] | undefined>
    const n = ds.points.value.length
    const col = (k: string): unknown[] => orNone(p[k], n)
    const ang = col("ang")
    const lev = col("E_level")
    for (let i = 0; i < n; i++) {
      out += csvRow([
        m.id,
        m.reaction,
        m.quantity_class,
        m.E_frame,
        fmt(col("E_lab")[i] as number | null),
        fmt(col("E_cm")[i] as number | null),
        ang[i] !== null ? pyStrAt(ang, i) : "",
        m.ang_frame || "",
        lev[i] !== null ? pyStrAt(lev, i) : "",
        fmt(col("value")[i] as number | null),
        m.value_unit,
        (col("limit")[i] as string | null) || "",
        fmt(col("d_stat")[i] as number | null),
        fmt(col("d_sys")[i] as number | null),
        fmt(col("d_tot")[i] as number | null),
        col("flag")[i] === null ? "" : pyFormat(col("flag")[i] as number, "g"),
        m.doi || "",
      ])
    }
  }
  return out
}

/** Braces, `&` and backslashes, escaped in one pass (`\` → `\textbackslash{}`, whose braces stay). */
export const bibEscape = (x: string) => x.replace(/[\\{}&]/g, (c) => (c === "\\" ? "\\textbackslash{}" : `\\${c}`))

const SUP: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-" }
const SUB: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "ₚ": "p", "ₙ": "n", "ₐ": "a", "ₑ": "e", "ₓ": "x" }
const GREEK: Record<string, string> = {
  α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", ζ: "zeta", η: "eta", θ: "theta", ι: "iota", κ: "kappa",
  λ: "lambda", μ: "mu", µ: "mu", ν: "nu", ξ: "xi", π: "pi", ρ: "rho", σ: "sigma", τ: "tau", υ: "upsilon", φ: "phi",
  χ: "chi", ψ: "psi", ω: "omega", Γ: "Gamma", Δ: "Delta", Θ: "Theta", Λ: "Lambda", Ξ: "Xi", Π: "Pi", Σ: "Sigma",
  Φ: "Phi", Ψ: "Psi", Ω: "Omega",
}

/**
 * A title for classic BibTeX (pdflatex): superscript and subscript runs and
 * Greek letters become math, `¹⁴N(p,γ)¹⁵O` → `$^{14}$N(p,$\gamma$)$^{15}$O`;
 * adjacent pieces share one `$…$` (`γ₀` → `$\gamma_{0}$`). Applied after
 * bibEscape. scripts/data/nucdata/export.py `_bib_title` does the same.
 */
export function bibTitle(x: string): string {
  const math = (body: string) => `\u0001${body}\u0002`
  const run = (map: Record<string, string>, m: string) => [...m].map((c) => map[c]).join("")
  return x
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, (m) => math(`^{${run(SUP, m)}}`))
    .replace(/[₀₁₂₃₄₅₆₇₈₉ₚₙₐₑₓ]+/g, (m) => math(`_{${run(SUB, m)}}`))
    .replace(/[α-ωΓΔΘΛΞΠΣΦΨΩµ]/g, (c) => (GREEK[c] ? math(`\\${GREEK[c]}`) : c))
    .replace(/→/g, () => math("\\rightarrow"))
    .replace(/\u0002\u0001/g, "")
    .replace(/[\u0001\u0002]/g, "$")
}

/**
 * One BibTeX entry: `@kind{key,\n  field = {value},\n…}`. Empty values are
 * left out; values are escaped (a title also gets bibTitle), except a `{ raw }` one, written as given (the
 * atlas uses it for a collaboration's name in braces).
 */
export function bibEntry(kind: string, key: string, fields: Iterable<[string, unknown]>): string {
  const body = [...fields]
    .filter(([, x]) => x)
    .map(([k, x]) => {
      if (typeof x === "object" && x !== null && "raw" in x) return `  ${k} = {${String((x as { raw: string }).raw)}}`
      const v = bibEscape(s(x))
      return `  ${k} = {${k === "title" ? bibTitle(v) : v}}`
    })
    .join(",\n")
  return `@${kind}{${key},\n${body}\n}`
}

/** One BibTeX entry per EXFOR entry, the dataset ids in `note` (export.bibtex). */
export function bibtex(datasets: FullDataset[], journals: Record<string, string>): string {
  const seen = new Map<string, { meta: Meta; ids: string[] }>()
  for (const ds of datasets) {
    const key = ds.meta.entry
    if (seen.has(key)) {
      seen.get(key)!.ids.push(ds.meta.id)
      continue
    }
    seen.set(key, { meta: ds.meta, ids: [ds.meta.id] })
  }
  const out: string[] = []
  for (const [key, v] of seen) {
    const m = v.meta
    const ref = m.refs.length ? m.refs[0] : { code: "", type: "" }
    const parts = ref.code.split(",").map((x) => x.trim())
    const fields = new Map<string, unknown>([
      ["author", m.authors.join(" and ")],
      ["title", m.title],
      ["year", s(m.year || "")],
    ])
    let kind = "misc"
    if (ref.type === "J" && parts.length >= 5) {
      kind = "article"
      fields.set("journal", journals[parts[1]] ?? parts[1])
      fields.set("volume", parts[2])
      const rest = parts.slice(3, -1).filter((x) => !x.startsWith("("))
      if (rest.length) fields.set("pages", rest[0])
    } else fields.set("howpublished", ref.code ?? "")
    if (m.doi) fields.set("doi", m.doi)
    fields.set("note", `EXFOR ${v.ids.join(", ")} (${m.links.exfor})`)
    const cite = m.first_author.replace(/[^A-Za-z]/g, "") + s(m.year || "") + "_" + key
    out.push(bibEntry(kind, cite, fields))
  }
  return out.join("\n\n") + "\n"
}

/** The JSON export (`--format json`): {"schema": "dx-export", "snapshot", "datasets"}. */
export function jsonExport(datasets: FullDataset[], snapshot: { date: string; commit: string }): string {
  return dumpPy({ schema: "dx-export", snapshot: { date: snapshot.date, commit: snapshot.commit }, datasets })
}

export const AZURE2_README =
  "Stub <segmentsData> lines for AZURE2 (segments.txt). Replace ENTR and EXIT with the\n" +
  "entrance and exit pair keys of your .azr file (EXIT -1 marks a total-capture segment\n" +
  "already), check the energy and angle ranges, and paste the lines between\n" +
  "<segmentsData> and </segmentsData>. Columns: active, entrance, exit, E_min, E_max\n" +
  "(lab, as in the file), angle min, max, data type (0 angle-integrated, 1 dσ/dΩ lab,\n" +
  "3 total capture, 4 dσ/dΩ c.m., 7 analysing power), norm, vary norm,\n" +
  "normalisation uncertainty (%), energy shift, its uncertainty, vary shift, file, 0 0.\n" +
  "Every data file has a .csv beside it with all columns and the EXFOR header.\n" +
  "E_min and E_max bracket the file's energies by a relative 1e-5 (and the angles by\n" +
  "0.001 deg), so AZURE2 keeps every point. The normalisation varies only where EXFOR\n" +
  "gives a common systematic uncertainty; without one it is fixed at 1 (vary 0).\n" +
  "Rows without an uncertainty are left out of the .dat files (AZURE2 gives them no\n" +
  "weight) and kept in the .csv files; a file with none is skipped.\n\n"

/** The files write_azure2 writes, by path: data/<stem>.dat, data/<stem>.csv, segments.txt, README.txt. */
export function azure2Files(
  datasets: FullDataset[],
  snapshot: { date: string; commit: string },
  table: MassTable,
  opts: Azure2Options = {},
): { files: Map<string, string>; count: number } {
  const files = new Map<string, string>()
  const segs: string[] = []
  const readme: string[] = []
  let count = 0
  for (const ds of datasets) {
    for (const f of azure2(ds, snapshot, table, opts)) {
      if ("skip" in f) {
        readme.push("skipped: " + f.skip)
        continue
      }
      files.set(`data/${f.stem}.dat`, f.dat)
      files.set(`data/${f.stem}.csv`, f.csv)
      segs.push(f.segment)
      readme.push(
        `segment ${segs.length}: data/${f.stem}.dat  (${f.id}` +
          (f.level !== null ? `, E_x = ${pyFormat(f.level, "g")} MeV` : "") +
          ")" +
          (f.vary ? "" : "  normalisation fixed") +
          (f.no_err ? `  ${f.no_err} rows without uncertainty left out` : ""),
      )
      count++
    }
  }
  files.set("segments.txt", segs.join("\n") + "\n")
  files.set("README.txt", AZURE2_README + readme.join("\n") + "\n")
  return { files, count }
}

/** Whether a value read with parsePy was a float: re-exported for callers that format single values. */
export { isFloat }
