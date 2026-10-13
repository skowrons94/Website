#!/usr/bin/env node
/**
 * npm run test:data-ui — the data explorer's page logic.
 *
 *   1. The exports (lib/data/export.ts) write what `dx.py export`
 *      (scripts/data/nucdata/export.py) writes, byte for byte: AZURE2 files
 *      (three option sets), CSV, JSON and BibTeX, for the fixture datasets in
 *      scripts/data-ui/fixtures (one S-factor with five final levels and
 *      extrapolated rows, a dσ/dΩ with lab angles, a pointer, a decimated set
 *      read from its gzipped full points, and a MACS).
 *   2. Python's number formatting (lib/data/pyfmt.ts) on awkward values.
 *   3. The ZIP the AZURE2 export downloads opens with Python's zipfile.
 *   4. The gap metrics (lib/data/gap.ts): limits, a hand-checked case, and
 *      the committed index for ¹⁴N(p,γ); every AZURE2 row inside its segment.
 *   5. The rule for "lowest measured" (lib/data/lowest.mjs): σ, limits,
 *      flags, ties, and /data, the atlas panel, the reaction page and search
 *      agreeing on every atlas reaction.
 */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"

import { azure2, azure2Files, bibtex, csvLong, jsonExport } from "../../lib/data/export.ts"
import { fullDataset } from "../../lib/data/dataset.ts"
import { massTable, parseAme } from "../../lib/data/masses.ts"
import { parsePy, pyFormat, pyRepr, pyRound } from "../../lib/data/pyfmt.ts"
import { zip } from "../../lib/data/zip.ts"
import {
  countsForRate,
  cumulative,
  gamowWidths,
  integrandFor,
  lowestMeasured,
  measuredRanges,
  packLanes,
  peakEnergy,
  unmeasuredShare,
  windowReach,
} from "../../lib/data/gap.ts"
import { buildAtlas } from "../../lib/atlas-core.mjs"
import { gapRows } from "../../lib/data/index-rows.ts"
import * as L from "../../lib/data/lowest.mjs"
import { buildPublicSummary } from "../../lib/data/public-summary.mjs"
import { summarise } from "../../lib/data/search-index.ts"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..")
const FIX = path.join(ROOT, "scripts/data-ui/fixtures/exfor")
let failures = 0
let checks = 0
function check(ok, what) {
  checks++
  if (!ok) {
    failures++
    console.error(`FAIL ${what}`)
  }
}
function same(a, b, what) {
  if (a === b) return check(true, what)
  // show the first difference
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  check(false, `${what}: differs at ${i}\n  ts: ${JSON.stringify(a.slice(Math.max(0, i - 40), i + 60))}\n  py: ${JSON.stringify(b.slice(Math.max(0, i - 40), i + 60))}`)
}

/* -- 1. exports ------------------------------------------------------------- */

const py = (args, input) => execFileSync("python3", args, { cwd: ROOT, encoding: "utf8", input, maxBuffer: 1 << 28 })
const expected = JSON.parse(py(["scripts/data-ui/expected.py", FIX]))
const SNAP = expected.snapshot
const table = massTable(parseAme(fs.readFileSync(path.join(ROOT, "content/atlas/nuclear-data/ame2020-mass-excess.txt"), "utf8")))
const read = async (p) => {
  let buf = fs.readFileSync(path.join(FIX, p))
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf)
  return parsePy(buf.toString("utf8"))
}
const OPTIONS = [
  { labParticle: "projectile", massModel: "ame", error: "point" },
  { labParticle: "target", massModel: "integer", error: "stat" },
  { labParticle: "projectile", massModel: "ame", error: "total" },
]
const journals = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/data/journals.json"), "utf8"))
const vendor = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/data/vendor/exfor-dictionary-subset.json"), "utf8"))
check(JSON.stringify(Object.entries(journals).sort()) === JSON.stringify(Object.entries(vendor.journals).sort()), "lib/data/journals.json = the vendored journal dictionary")

const all = new Map()
let azureFiles = 0
for (const name of fs.readdirSync(path.join(FIX, "r")).sort()) {
  const shard = parsePy(fs.readFileSync(path.join(FIX, "r", name), "utf8"))
  for (const ds of shard.datasets) {
    const full = await fullDataset(shard, ds, read)
    all.set(ds.meta.id, full)
    const exp = expected.datasets[ds.meta.id]
    OPTIONS.forEach((o, k) => {
      const mine = azure2(full, SNAP, table, o)
      const theirs = exp.azure2[k]
      check(mine.length === theirs.length, `${ds.meta.id} azure2[${k}]: ${mine.length} files, python ${theirs.length}`)
      mine.forEach((f, j) => {
        const t = theirs[j] ?? {}
        if ("skip" in f || "skip" in t) return same(f.skip ?? "", t.skip ?? "", `${ds.meta.id} azure2[${k}] skip`)
        azureFiles++
        same(f.stem, t.stem, `${ds.meta.id} azure2[${k}] stem`)
        same(f.dat, t.dat, `${ds.meta.id} azure2[${k}] ${f.stem}.dat`)
        same(f.csv, t.csv, `${ds.meta.id} azure2[${k}] ${f.stem}.csv`)
        same(f.segment, t.segment, `${ds.meta.id} azure2[${k}] ${f.stem} segment`)
        check(f.level === t.level && f.is_diff === t.is_diff, `${ds.meta.id} azure2[${k}] level/isDiff`)
      })
    })
    same(csvLong([full]), exp.csv, `${ds.meta.id} csv`)
    same(bibtex([full], journals), exp.bibtex, `${ds.meta.id} bibtex`)
    same(jsonExport([full], SNAP), exp.json, `${ds.meta.id} json`)
  }
}
const order = expected.all.order.map((id) => all.get(id))
same(csvLong(order), expected.all.csv, "all csv")
same(bibtex(order, journals), expected.all.bibtex, "all bibtex")
same(jsonExport(order, SNAP), expected.all.json, "all json")
check(azureFiles >= 10, `AZURE2 files compared: ${azureFiles}`)
console.log(`exports: ${all.size} datasets, ${azureFiles} AZURE2 files (3 option sets), CSV, JSON, BibTeX: byte for byte`)

/* -- 2. Python formatting --------------------------------------------------- */

const values = [0, -0, 1, 90, 0.5, 1.5, 2.5, 0.125, 0.375, 2.675, 1e-5, 1e-4, 1e16, 1e15, 123456789, 0.000123456789,
  5e-324, 1.7976931348623157e308, 6.0221e23, 0.03125, 9.9999995, 0.00049999, 1234.5, 0.0002675, 12.0, -3.25e-7, 999999.5, 0.1 + 0.2]
const specs = [".6e", ".4f", "g", ".3g", ".6g", ".6f", ".1e"]
const pyOut = JSON.parse(py(["-c", `
import json,sys
vals=json.loads(sys.stdin.read())
vals[1]=-0.0
specs=${JSON.stringify(specs)}
print(json.dumps({"fmt":[[format(v,s) for s in specs] for v in vals],"repr":[repr(float(v)) for v in vals],"round":[round(v*1000) for v in vals[:14]]}))
`], JSON.stringify(values)))
values.forEach((v, i) => {
  specs.forEach((s, j) => same(pyFormat(v, s), pyOut.fmt[i][j], `format(${v}, '${s}')`))
  same(pyRepr(v, true), pyOut.repr[i], `repr(${v})`)
})
values.slice(0, 14).forEach((v, i) => check(pyRound(v * 1000) === pyOut.round[i], `round(${v}*1000)`))

/* -- 3. the ZIP --------------------------------------------------------------- */

const { files } = azure2Files([...all.values()], SNAP, table)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dxui-"))
fs.writeFileSync(path.join(tmp, "a.zip"), zip(files, "azure2-test"))
const listed = py(["-c", `import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print("\\n".join(z.namelist())); print(z.read("azure2-test/segments.txt").decode())`, path.join(tmp, "a.zip")])
check(listed.includes("azure2-test/README.txt") && listed.includes(files.get("segments.txt").trim()), "zip opens with zipfile and holds the segments")
fs.rmSync(tmp, { recursive: true })

/* -- 4. gap metrics ------------------------------------------------------------ */

const near = (a, b, tol, what) => check(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`)
// 14N + p at T9 = 0.015 (the Sun): E0 ≈ 27 keV
const mu14 = (14.003074 * 1.007825) / (14.003074 + 1.007825)
const sun = integrandFor(1, 7, mu14, 0.015)
const E0 = 0.122 * Math.cbrt(49 * mu14 * 0.015 * 0.015) * 1000
near(peakEnergy(sun), E0, 0.03 * E0, "peak of exp(−E/kT − b/√E) = E₀ (Clayton)")
check(unmeasuredShare(sun, []) === 1, "no data: everything unmeasured")
near(unmeasuredShare(sun, [[0, 1e6]]), 0, 1e-9, "all energies measured: nothing unmeasured")
const below = unmeasuredShare(sun, [[E0, 1e6]])
check(below > 0.35 && below < 0.6, `data from E₀ up: about half unmeasured (${below})`)
near(unmeasuredShare(sun, [[1, 20], [20, 1e6]]) , unmeasuredShare(sun, [[1, 1e6]]), 1e-9, "touching ranges merge")
const c = cumulative(sun)
near(c.F[c.F.length - 1], 1, 1e-12, "cumulative ends at 1")
// threshold: nothing below it
const endo = integrandFor(1, 7, mu14, 0.5, 3000)
check(peakEnergy(endo) >= 3000 && unmeasuredShare(endo, [[0, 3000]]) === 1, "endothermic: no rate below threshold")
// neutron, σ ∝ 1/v: f = √E exp(−E/kT); measured below kT/2 holds erf-like share
const n30 = integrandFor(0, 79, 196, 30 / 86.17333)
near(peakEnergy(n30), 15, 0.2, "neutron: √E exp(−E/kT) peaks at kT/2")
const shareN = unmeasuredShare(n30, [[0, 30]])
near(shareN, 1 - 0.4276, 0.005, "neutron: share above kT = 1 − P(3/2, 1)")
near(gamowWidths(70, 27, 13), 43 / 13, 1e-12, "Gamow widths")
const lanes = packLanes([[0, 1], [1.5, 2], [0.5, 1.7], [2.1, 3]], 0.2)
check(JSON.stringify(lanes) === JSON.stringify([0, 0, 1, 1]), `lane packing ${lanes}`)

/* -- 4b. the AZURE2 segments keep every point ------------------------------------ */
// AZURE2 keeps a point only if E_min <= E <= E_max (ESegment::IsInSegment) and gives
// an uncertainty of 0 no weight: every .dat row must sit inside its segment's limits
// and carry an uncertainty; a segment without a common systematic is not varied.
let rowsChecked = 0
for (const o of OPTIONS)
  for (const full of all.values())
    for (const f of azure2(full, SNAP, table, o)) {
      if ("skip" in f) continue
      const seg = f.segment.split(" ")
      const [eLo, eHi, aLo, aHi] = [Number(seg[3]), Number(seg[4]), Number(seg[5]), Number(seg[6])]
      for (const line of f.dat.trim().split("\n")) {
        const [E, ang, , d] = line.split(" ").map(Number)
        rowsChecked++
        check(E >= eLo && E <= eHi, `${f.stem}: E ${E} inside [${eLo}, ${eHi}]`)
        check(!f.is_diff || (ang >= aLo && ang <= aHi), `${f.stem}: angle ${ang} inside [${aLo}, ${aHi}]`)
        check(d > 0, `${f.stem}: uncertainty ${d} > 0 in the .dat`)
      }
      const norm = Number(seg[10])
      check(seg[9] === (norm > 0 ? "1" : "0"), `${f.stem}: vary norm ${seg[9]} with ${norm} %`)
    }
check(rowsChecked > 100, `segment rows checked: ${rowsChecked}`)

const index = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/exfor/index.json"), "utf8"))
// a single S value (S(300 keV) of ¹²C(α,γ)) is shown but never counted
const c12 = gapRows(index, [index.reactions.key.indexOf("12C(a,g)")])
const lowC = lowestMeasured(c12)
check(lowC && lowC.E > 600, `12C(a,g): single S(300) values are not the lowest measurement (${lowC?.E} keV)`)

// the committed index: ¹⁴N(p,γ)
const r = index.reactions.key.indexOf("14N(p,g)")
const rows = gapRows(index, [r])
check(rows.length === 126, `14N(p,g) rows: ${rows.length}`)
const low = lowestMeasured(rows)
check(low && low.E > 60 && low.E < 75, `14N(p,g) lowest measured E_cm ${low?.E} keV (LUNA, ~70 keV)`)
check(rows.every((x) => !countsForRate(x) || !(x.f & 64)), "calculated sets never count")
const share = unmeasuredShare(sun, measuredRanges(rows))
check(share > 0.95, `14N(p,g) in the Sun: almost all of the rate integrand unmeasured (${share})`)

/* -- 5. one rule for "lowest measured" (lib/data/lowest.mjs) ------------------------ */

const base = { id: "X0001.002", q: "sigma", qs: "", e0: 0.05, e1: 1, k0: null, k1: null, n: 5, y: 2000, a: "A+", i: "", fa: "", f: 0, lv: 0, fr: 0 }
// the significance: a dataset whose lowest point is 1σ but not 2σ above zero
const weak = { ...base, m1: 0.05, m2: 0.08 }
check(L.measuredMin(weak, 2) === 0.08 && L.measuredMin(weak, 1) === 0.05, "m2 at 2σ, m1 at 1σ")
check(L.lowestMeasured([weak], 2).E === 80 && L.lowestMeasured([weak], 1).E === 50, "the rule's σ picks the column")
check(L.RULE.sigma === 1, "the owner's choice: 1σ above zero")
// per-point limits: a dataset with limits still counts by its other points (m2 set by the pipeline)
check(L.countsAsMeasured({ ...base, f: L.flagBit("upper-limits"), m1: 0.1, m2: 0.1 }), "a dataset with some limits still counts")
check(!L.countsAsMeasured({ ...base, f: L.flagBit("upper-limits"), m1: null, m2: null }), "a dataset of limits only does not")
for (const fl of ["not-experimental", "derived", "superseded", "indirect", "deleted"])
  check(!L.countsAsMeasured({ ...base, f: L.flagBit(fl), m1: 0.05, m2: 0.05 }), `${fl} never counts`)
check(L.countsAsMeasured({ ...base, f: L.flagBit("corrected"), m1: 0.05, m2: 0.05 }), "a corrected dataset counts")
check(!L.countsAsMeasured({ ...base, q: "S", n: 1, m1: 0.05, m2: 0.05 }), "a single S value never counts")
check(!L.countsAsMeasured({ ...base, q: "ratio", m1: 0.05, m2: 0.05 }), "a ratio never counts")
// ties: within 0.5 %, earliest first, one per entry
const tie = L.lowestMeasured([
  { ...base, id: "C2582.002", y: 2020, q: "strength", m1: 0.149, m2: 0.149 },
  { ...base, id: "D4330.002", y: 2015, q: "strength", m1: 0.1494, m2: 0.1494, i: "2ITYLGS" },
  { ...base, id: "D4330.003", y: 2015, q: "strength", m1: 0.1494, m2: 0.1494 },
  { ...base, id: "O9999.002", y: 2010, q: "strength", m1: 0.16, m2: 0.16 },
])
check(tie.E === 149 && tie.id === "D4330.002" && tie.ties.map((t) => t.id).join() === "D4330.002,C2582.002" && tie.luna, `ties: ${JSON.stringify(tie)}`)
// the pipeline and the pages read the same settings and flag names
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/meta.json"), "utf8"))
check(JSON.stringify(meta.flags.bits) === JSON.stringify(L.FLAG_BITS), "flag bits: lowest.mjs = meta.json")
check(JSON.stringify(Object.keys(meta.flags.quantity_classes)) === JSON.stringify(L.QUANTITY_CLASSES), "quantity classes: lowest.mjs = meta.json")
const pyRule = JSON.parse(py(["-c", "import json,sys; sys.path.insert(0,'scripts/data'); from nucdata import measured; print(json.dumps(measured.RULE))"]))
check(JSON.stringify(pyRule) === JSON.stringify(L.RULE), "the pipeline reads lowest.mjs's settings")

// /data (summary), the atlas panel, the reaction page and search agree, for every atlas reaction
const summary = buildPublicSummary(path.join(ROOT, "public/data"))
const search = summarise(index)
let agreed = 0
for (const [id, s] of Object.entries(summary.reactions)) {
  const rs = index.reactions.atlas.map((a, r) => (a.includes(id) ? r : -1)).filter((r) => r >= 0)
  const atlasLow = lowestMeasured(gapRows(index, rs)) // lib/data/panel.ts atlasPanel
  const slug = index.reactions.slug.indexOf(s.slug)
  const pageLow = lowestMeasured(gapRows(index, [slug])) // lib/data/panel.ts slugPanel (/data/reaction/<slug>)
  const searchLow = search[slug].lowest
  const keV = (x) => (x === null || x === undefined ? null : Number(x.toPrecision(4)))
  const want = s.lowest ? s.lowest.keV : null
  const ok =
    keV(atlasLow?.E) === want && keV(pageLow?.E) === want && keV(searchLow) === want && (atlasLow?.id ?? null) === (s.lowest?.id ?? null)
  check(ok, `${id}: /data ${want}, atlas panel ${keV(atlasLow?.E)}, reaction page ${keV(pageLow?.E)}, search ${keV(searchLow)}`)
  if (ok) agreed++
}
check(agreed >= 60, `atlas reactions that agree: ${agreed}`)
// the pages compute it with these functions only (no second copy of the rule)
for (const f of ["lib/data/panel.ts", "lib/data/build.ts", "components/data/generic-reaction.tsx"]) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8")
  check(/lowestMeasured\(/.test(src) && !/function lowestMeasured|countsForRate\(r: GapRow\): boolean \{/.test(src), `${f} uses the shared rule`)
}
// before→after of the expert review (r15): what the rule gives on the committed index
const expect = {
  "15N(p,g)": [72.8, "O2205.002"], // not 123 eV (C1825.002, KEV/MEV)
  "19F(p,a)": [170, "O2278.007"], // not 749 eV (O2207.006)
  "3He(d,p)": [5.01, "A0228.002"], // not 3.0 keV (Trojan horse)
  "17O(p,a)": [64.5, "O2313.002"], // c.m.
  "7Li(p,a)": [10.14, "A1291.005"], // not 8.8 keV (Trojan horse, O2211)
  "13C(a,n)": [233, "O2548.002.1"], // c.m.
  "12C(12C,n)": [3100, "C2168.002"], // above the 2.6 MeV threshold
  "3He(3He,2p)": [16.99, "A0379.002"], // Bonetti 1999 counts (one row is a limit)
  "22Ne(p,g)": [149, "D4330.002"], // credited to the earliest
  "14N(p,g)": [70.08, "O1458.002.A"],
  "22Ne(a,n)": [693, "O0967.002"], // E_lab 819 keV, the 830 keV resonance: below it only upper limits (corrections.yaml)
}
for (const [key, [E, id]] of Object.entries(expect)) {
  const s = Object.values(summary.reactions).find((x) => x.key === key)
  check(s?.lowest?.keV === E && s.lowest.id === id, `${key}: lowest ${s?.lowest?.keV} ${s?.lowest?.id}, expected ${E} ${id}`)
}

// where the lowest point sits against the window (lib/data/gap.ts windowReach):
// the top quarter of the window is only its upper edge
check(windowReach(100, 100, 200) === "inside", "reach: at the bottom of the window")
check(windowReach(50, 100, 200) === "inside", "reach: below the window")
check(windowReach(175, 100, 200) === "inside", "reach: at three quarters")
check(windowReach(176, 100, 200) === "edge", "reach: in the top quarter")
check(windowReach(200, 100, 200) === "edge", "reach: at the top")
check(windowReach(201, 100, 200) === "above", "reach: above")
{
  // the /data gap rows (lib/data/public.ts gapRow): the atlas's first window, the summary's lowest point
  const atlas = buildAtlas()
  const reach = (id) => {
    const r = atlas.reactions.find((x) => x.id === id)
    const w = r.gamow[0]
    const [lo, hi] = w.thresholdLimited && w.lo !== undefined ? [w.lo, w.hi] : [Math.max(w.E0 - w.width / 2, 0.01), w.E0 + w.width / 2]
    return windowReach(summary.reactions[id].lowest.keV, lo, hi)
  }
  // 693 keV c.m. against a 478–710 keV window: the 830 keV (lab) resonance, not the window
  check(reach("22Ne-an-25Mg") === "edge", `22Ne(a,n): ${reach("22Ne-an-25Mg")}, expected edge`)
  check(reach("13C-an-16O") === "above", `13C(a,n): ${reach("13C-an-16O")}, expected above`)
  check(reach("12C-12Ca-20Ne") === "inside", `12C(12C,a): ${reach("12C-12Ca-20Ne")}, expected inside`)
  check(reach("18O-ag-22Ne") === "inside", `18O(a,g): ${reach("18O-ag-22Ne")}, expected inside`)
}

console.log(`test:data-ui: ${checks - failures}/${checks} checks passed`)
if (failures) process.exit(1)
