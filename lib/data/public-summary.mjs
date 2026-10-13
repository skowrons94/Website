/**
 * The small summary the public data-explorer page (/data) is drawn from,
 * computed from the committed EXFOR index (public/data/exfor/index.json, 8 MB)
 * so that the page never downloads the index itself: per atlas reaction, how
 * many datasets EXFOR holds, over which years, and the lowest centre-of-mass
 * energy ever measured; and the snapshot and attribution of the data.
 *
 * Written to public/data/summary.json by scripts/data-summary.mjs before every
 * build (`npm run prebuild`), and read back by lib/data/public.ts; plain
 * JavaScript so that the prebuild runs under bare `node`.
 *
 * "Lowest energy measured" counts a dataset only when it is a measurement of
 * the reaction itself at a beam energy: a cross section, an S-factor, a
 * differential cross section, a yield or a resonance strength (its resonance
 * energy). Left out, by the index's flags (scripts/data/README.md):
 * extrapolated rows (already removed from every dataset by the pipeline),
 * `not-experimental` (calculated, evaluated, recommended), `derived` (e.g. an
 * S-factor from an ANC), `superseded`, `deleted`, `preliminary`, and
 * `upper-limits` (a dataset whose lowest row may be only a limit). Also left
 * out: a dataset of a single S-factor value (in practice S at a quoted energy,
 * from a fit: Vogl's S(25 keV) for ¹²C(p,γ)); indirect data (Trojan-horse,
 * Coulomb dissociation, ANC), by entry, from lib/data/indirect-entries.json;
 * and, for charged particles, any energy under 1 keV, which no beam has
 * reached (three EXFOR subentries give MeV values under a KEV heading:
 * C1825.002, D0468.004, O2207.006). Digitised data stay in: the experiment was
 * done at that energy, only its numbers were read off a figure.
 *
 * lib/data/indirect-entries.json is generated, not typed: `node
 * scripts/data-summary.mjs --indirect` scans the titles of the entries in the
 * atlas reactions' shards (public/data/exfor/r/, built by `dx.py build-exfor
 * --shards atlas`) for INDIRECT_PATTERN and writes the list; it is committed so
 * that the summary needs only the committed index.
 */

import fs from "node:fs"
import path from "node:path"

export const SUMMARY_SCHEMA = "dx-public-summary"
export const SUMMARY_VERSION = 1

/** Quantity classes that are a measurement of the reaction at an energy. */
export const MEASURED_CLASSES = ["sigma", "S", "dsigma", "yield", "strength"]
/** Flags that take a dataset out of "lowest energy measured". */
export const EXCLUDED_FLAGS = ["not-experimental", "derived", "superseded", "deleted", "preliminary", "upper-limits"]
/**
 * The EXFOR institute code of the Gran Sasso laboratory (LNGS), where LUNA
 * works: a dataset is LUNA's when it is its first institute or the
 * institute of its facility (`ACCEL,2ITYLGS`; the first institute is often
 * the university of the first author).
 */
export const LUNA_INSTITUTE = "2ITYLGS"

/** Titles that name an indirect method. */
export const INDIRECT_PATTERN = /trojan|\bTHM\b|asymptotic normali[sz]ation|\bANCs?\b|coulomb (dissociation|break-?up)|indirect/i
/** Charged-particle beams have not gone below this energy, keV. */
export const CHARGED_FLOOR_KEV = 1

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"))

const INDIRECT_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), "indirect-entries.json")

/** The entries whose title names an indirect method, from the shards in `shardDir`. */
export function scanIndirect(shardDir) {
  const entries = {}
  if (!fs.existsSync(shardDir)) return null
  for (const name of fs.readdirSync(shardDir).sort()) {
    if (!name.endsWith(".json")) continue
    const shard = readJson(path.join(shardDir, name))
    if (!shard.reaction?.atlas?.length) continue
    for (const [id, e] of Object.entries(shard.entries ?? {})) {
      if (INDIRECT_PATTERN.test(e.title ?? "")) entries[id] = String(e.title).replace(/\s+/g, " ").trim()
    }
  }
  return {
    about: "EXFOR entries of the atlas reactions whose title names an indirect method; written by `node scripts/data-summary.mjs --indirect` (lib/data/public-summary.mjs)",
    pattern: INDIRECT_PATTERN.source,
    entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))),
  }
}

function readIndirect() {
  try {
    return new Set(Object.keys(readJson(INDIRECT_FILE).entries ?? {}))
  } catch {
    return new Set()
  }
}

/** `MACKLIN+` → `Macklin et al.`; `Bemmerer+` → `Bemmerer et al.` */
export function authorName(raw) {
  if (!raw) return ""
  const more = raw.endsWith("+")
  let name = raw.replace(/\+$/, "").trim()
  if (name === name.toUpperCase()) name = name.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase())
  return more ? `${name} et al.` : name
}

/**
 * The summary, from the index and meta.json under `dataDir` (public/data).
 * Returns null when the index is missing (a checkout without the data).
 */
export function buildPublicSummary(dataDir = path.join(process.cwd(), "public", "data")) {
  const indexFile = path.join(dataDir, "exfor", "index.json")
  const metaFile = path.join(dataDir, "meta.json")
  if (!fs.existsSync(indexFile) || !fs.existsSync(metaFile)) return null
  const index = readJson(indexFile)
  const meta = readJson(metaFile)
  const bits = meta.flags.bits
  const classes = Object.keys(meta.flags.quantity_classes)
  const excludedMask = EXCLUDED_FLAGS.reduce((m, f) => (bits.includes(f) ? m | (1 << bits.indexOf(f)) : m), 0)
  const measured = new Set(MEASURED_CLASSES.map((c) => classes.indexOf(c)).filter((i) => i >= 0))
  const lunaIndex = index.strings.institutes.indexOf(LUNA_INSTITUTE)
  const lunaFacility = new Set()
  index.strings.facilities.forEach((f, i) => {
    if (String(f).split(",").includes(LUNA_INSTITUTE)) lunaFacility.add(i)
  })

  const indirect = readIndirect()
  const sIndex = classes.indexOf("S")
  const R = index.reactions
  const D = index.datasets
  // neutron-induced reactions have no Coulomb floor: "56Fe(n,g)"
  const charged = R.key.map((k) => !/^[^(]+\(n,/.test(k))
  // reaction index → atlas ids
  const atlasOf = new Map()
  R.key.forEach((_, i) => {
    if (R.atlas[i] && R.atlas[i].length) atlasOf.set(i, R.atlas[i])
  })
  const acc = new Map()
  for (let j = 0; j < D.id.length; j++) {
    const ri = D.r[j]
    if (!atlasOf.has(ri)) continue
    let a = acc.get(ri)
    if (!a) {
      a = { n: 0, entries: new Set(), y0: Infinity, y1: -Infinity, luna: 0, lunaEntries: new Set(), usable: 0, low: null }
      acc.set(ri, a)
    }
    const entry = String(D.id[j]).split(".")[0]
    a.n++
    a.entries.add(entry)
    const y = D.y[j]
    if (typeof y === "number") {
      a.y0 = Math.min(a.y0, y)
      a.y1 = Math.max(a.y1, y)
    }
    const isLuna = D.i[j] === lunaIndex || lunaFacility.has(D.fa[j])
    if (isLuna) {
      a.luna++
      a.lunaEntries.add(entry)
    }
    const e0 = D.e0[j]
    if (!measured.has(D.q[j]) || (D.f[j] & excludedMask) !== 0 || !(typeof e0 === "number" && e0 > 0)) continue
    if (D.q[j] === sIndex && D.n[j] === 1) continue
    if (indirect.has(entry)) continue
    if (charged[ri] && e0 * 1000 < CHARGED_FLOOR_KEV) continue
    a.usable++
    if (!a.low || e0 < a.low.e) {
      a.low = {
        e: e0,
        id: D.id[j],
        author: authorName(index.strings.authors[D.a[j]]),
        year: typeof y === "number" ? y : null,
        luna: isLuna,
      }
    }
  }

  const reactions = {}
  for (const [ri, ids] of atlasOf) {
    const a = acc.get(ri)
    for (const id of ids) {
      reactions[id] = {
        key: R.key[ri],
        slug: R.slug[ri],
        datasets: a ? a.n : 0,
        entries: a ? a.entries.size : 0,
        years: a && Number.isFinite(a.y0) ? [a.y0, a.y1] : null,
        luna: a ? a.luna : 0,
        lunaEntries: a ? a.lunaEntries.size : 0,
        measured: a ? a.usable : 0,
        // keV, centre of mass
        lowest: a?.low
          ? { keV: Number((a.low.e * 1000).toPrecision(4)), id: a.low.id, author: a.low.author, year: a.low.year, luna: a.low.luna }
          : null,
      }
    }
  }

  return {
    schema: SUMMARY_SCHEMA,
    schema_version: SUMMARY_VERSION,
    source: "public/data/exfor/index.json",
    snapshot: { date: meta.exfor.snapshot_date, commit: meta.exfor.commit },
    attribution: { en: meta.exfor.line, it: meta.exfor.line_it, citation: meta.exfor.citation, license_url: meta.exfor.license_url, repository: meta.exfor.repository },
    ensdf: { archive_date: meta.ensdf?.archive_date ?? null, citation: meta.ensdf?.citation ?? "" },
    counts: {
      datasets: meta.counts.datasets,
      entries: meta.counts.entries,
      points: meta.counts.points,
      reactions: meta.counts.reactions,
    },
    rule: {
      classes: MEASURED_CLASSES,
      excluded: EXCLUDED_FLAGS,
      single_S: "excluded",
      indirect_entries: indirect.size,
      charged_floor_keV: CHARGED_FLOOR_KEV,
    },
    reactions,
  }
}
