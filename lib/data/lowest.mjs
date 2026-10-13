/**
 * The one rule for "lowest measured energy", used by every page of the data
 * explorer: /data and its guided paths (lib/data/public-summary.mjs, at build
 * time), the reaction pages and the atlas panel (lib/data/panel.ts,
 * lib/data/gap.ts), and search (lib/data/search-index.ts). Plain JavaScript
 * so that the prebuild runs it under bare node; the TypeScript pages import
 * it as it is.
 *
 * The rule (scripts/data/README.md, "Lowest measured energy"; the page's
 * "How these numbers are made" fold says it in words):
 *
 *  1. Per point, in the pipeline (scripts/data/nucdata/measured.py), which
 *     writes the result to the index as `m1` and `m2`, the lowest E_cm of a
 *     measured point at 1 and 2 standard deviations: a point counts when it
 *     is a value, not an upper or lower limit (limits are judged row by row,
 *     never by dropping the dataset); when its value is at least `sigma`
 *     standard deviations above zero; when its energy is physical: at least
 *     1 keV for charged particles, and not below the threshold of an
 *     endothermic reaction.
 *  2. Per dataset, here: it measures the reaction at an energy (a cross
 *     section, S-factor, angular distribution or its Legendre coefficients,
 *     a yield or a resonance strength); it is not flagged calculated,
 *     evaluated, derived, superseded, deleted, preliminary, a ratio, or
 *     indirect (Trojan horse, Coulomb dissociation, ANC, surrogate: from
 *     EXFOR's ANALYSIS and METHOD codes and text and from the title); it is
 *     not a single S-factor value (in EXFOR, a fit result such as S(25 keV),
 *     not a measurement at that energy). Extrapolated rows never reach the
 *     points. Frame and unit errors of EXFOR are corrected before any of
 *     this (scripts/data/corrections.yaml).
 *  3. The lowest of those, credited to every dataset that reaches it within
 *     rounding (0.5% or 0.1 keV), one per EXFOR entry, earliest first.
 *
 * The settings below are read by the pipeline too (between the rule:begin
 * and rule:end markers, as JSON): `sigma` is 1, the owner's choice (a point
 * counts when it is one standard deviation above zero); setting it to 2
 * needs no rebuild of the data, the index carries both.
 */

export const RULE = /* rule:begin */ {
  "sigma": 1,
  "sigma_choices": [1, 2],
  "charged_floor_keV": 1,
  "classes": ["sigma", "S", "dsigma", "legendre", "yield", "strength"],
  "excluded_flags": ["not-experimental", "derived", "superseded", "deleted", "preliminary", "complex", "indirect"],
  "tie_rel": 0.005,
  "tie_keV": 0.1
} /* rule:end */

/** The pipeline's flag bits (meta.json flags.bits; the index's `f`), in order. */
export const FLAG_BITS = [
  "has-extrapolated-rows",
  "digitised",
  "superseded",
  "deleted",
  "preliminary",
  "relative",
  "not-experimental",
  "derived",
  "complex",
  "cm_approx",
  "outdated-normalisation",
  "renormalised-by-compiler",
  "dependent",
  "upper-limits",
  "indirect",
  "corrected",
]

/** The pipeline's quantity classes (meta.json flags.quantity_classes; the index's `q`), in order. */
export const QUANTITY_CLASSES = [
  "sigma",
  "S",
  "dsigma",
  "legendre",
  "ddx",
  "pol",
  "yield",
  "strength",
  "width",
  "macs",
  "sacs",
  "rate",
  "ratio",
  "integral",
  "other",
]

/**
 * The EXFOR institute code of the Gran Sasso laboratory (LNGS), where LUNA
 * works: a dataset is LUNA's when it is its first institute or the institute
 * of its facility (`ACCEL,2ITYLGS`; the first institute is often the
 * university of the first author).
 */
export const LUNA_INSTITUTE = "2ITYLGS"

export const flagBit = (name) => 1 << FLAG_BITS.indexOf(name)
const EXCLUDED = RULE.excluded_flags.reduce((m, f) => m | flagBit(f), 0)
const CLASSES = new Set(RULE.classes)

/**
 * Index rows of `reactions` (indices into index.reactions): the fields the
 * pages need, by name. Energies in MeV, as in the index.
 */
export function indexRows(index, reactions) {
  const want = new Set(reactions)
  const d = index.datasets
  const S = index.strings
  const out = []
  for (let k = 0; k < d.id.length; k++) {
    if (!want.has(d.r[k])) continue
    out.push({
      id: d.id[k],
      r: d.r[k],
      q: QUANTITY_CLASSES[d.q[k]] ?? "other",
      qs: S.quantities[d.qs[k]] ?? "",
      e0: d.e0[k],
      e1: d.e1[k],
      k0: d.k0[k],
      k1: d.k1[k],
      ...measuredColumns(d, k),
      n: d.n[k],
      y: d.y[k],
      a: S.authors[d.a[k]] ?? "",
      i: S.institutes[d.i[k]] ?? "",
      fa: S.facilities[d.fa[k]] ?? "",
      f: d.f[k],
      lv: d.lv[k],
      fr: d.fr[k],
    })
  }
  return out
}

/**
 * The index's compact m1, m2 (scripts/data/nucdata/build_exfor.py
 * measured_columns): null, 0 for "the same as e0" (m2) or "as m2" (m1), or MeV.
 */
export function measuredColumns(d, k) {
  const raw2 = d.m2 ? d.m2[k] : null
  const m2 = raw2 === 0 ? d.e0[k] : raw2 ?? null
  const raw1 = d.m1 ? d.m1[k] : null
  const m1 = raw1 === 0 ? m2 : raw1 ?? null
  return { m1, m2 }
}

/** A single S-factor value: a fit result in EXFOR, shown but never counted. */
export function singleS(row) {
  return row.q === "S" && row.n <= 1
}

/** The lowest measured E_cm (MeV) of a row at `sigma` standard deviations, or null. */
export function measuredMin(row, sigma = RULE.sigma) {
  const m = sigma === 1 ? row.m1 : row.m2
  return typeof m === "number" && m > 0 ? m : null
}

/** Whether a dataset counts toward "lowest measured" and the measured ranges. */
export function countsAsMeasured(row, sigma = RULE.sigma) {
  if (!CLASSES.has(row.q)) return false
  if (row.f & EXCLUDED) return false
  if (singleS(row)) return false
  return measuredMin(row, sigma) !== null
}

export function isLuna(row) {
  return row.i === LUNA_INSTITUTE || String(row.fa ?? "").split(",").includes(LUNA_INSTITUTE)
}

const entryOf = (id) => String(id).split(".")[0]

/**
 * The lowest measured E_cm (keV) and who reached it: `id`, `a`, `y` of the
 * earliest dataset within rounding of it, `ties` all of them (one per entry,
 * earliest first), `q` its quantity class. Null when no dataset counts.
 */
export function lowestMeasured(rows, sigma = RULE.sigma) {
  const counted = rows.filter((r) => countsAsMeasured(r, sigma))
  if (!counted.length) return null
  const E = Math.min(...counted.map((r) => measuredMin(r, sigma) * 1000))
  const tol = Math.max(RULE.tie_keV, RULE.tie_rel * E)
  const near = counted
    .filter((r) => measuredMin(r, sigma) * 1000 - E <= tol)
    .sort((a, b) => (a.y ?? 9999) - (b.y ?? 9999) || a.id.localeCompare(b.id))
  const seen = new Set()
  const ties = []
  for (const r of near) {
    if (seen.has(entryOf(r.id))) continue
    seen.add(entryOf(r.id))
    ties.push({ id: r.id, a: r.a, y: r.y, q: r.q, luna: isLuna(r), E: measuredMin(r, sigma) * 1000 })
  }
  const first = ties[0]
  return { E, id: first.id, a: first.a, y: first.y, q: first.q, luna: ties.some((t) => t.luna), ties }
}

/** Union of closed intervals, sorted and merged. */
export function union(intervals) {
  const sorted = intervals.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a).sort((x, y) => x[0] - y[0])
  const out = []
  for (const [a, b] of sorted) {
    const last = out[out.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/** The measured E_cm ranges (keV) of the datasets that count: from the lowest measured point to the highest. */
export function measuredRanges(rows, sigma = RULE.sigma) {
  return union(
    rows
      .filter((r) => countsAsMeasured(r, sigma))
      .map((r) => {
        const lo = measuredMin(r, sigma) * 1000
        return [lo, Math.max(lo, (r.e1 ?? 0) * 1000)]
      }),
  )
}

/** `MACKLIN+` → `Macklin et al.`; `Bemmerer+` → `Bemmerer et al.` */
export function authorName(raw) {
  if (!raw) return ""
  const more = raw.endsWith("+")
  let name = raw.replace(/\+$/, "").trim()
  if (name === name.toUpperCase()) name = name.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase())
  return more ? `${name} et al.` : name
}
