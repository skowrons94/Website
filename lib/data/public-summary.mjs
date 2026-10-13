/**
 * The small summary the public data-explorer page (/data) is drawn from,
 * computed from the committed EXFOR index (public/data/exfor/index.json, 8 MB)
 * so that the page never downloads the index itself: per atlas reaction, how
 * many datasets EXFOR holds, over which years, and the lowest centre-of-mass
 * energy measured; and the snapshot and attribution of the data.
 *
 * Written to public/data/summary.json by scripts/data-summary.mjs before every
 * build (`npm run prebuild`), and read back by lib/data/public.ts; plain
 * JavaScript so that the prebuild runs under bare `node`.
 *
 * "Lowest measured" is the rule of lib/data/lowest.mjs, the same one the
 * reaction pages, the atlas panel and search use, applied to the index rows
 * of every index reaction of the atlas reaction.
 */

import fs from "node:fs"
import path from "node:path"

import { LUNA_INSTITUTE, RULE, authorName, countsAsMeasured, indexRows, isLuna, lowestMeasured } from "./lowest.mjs"

export { authorName, LUNA_INSTITUTE }

export const SUMMARY_SCHEMA = "dx-public-summary"
export const SUMMARY_VERSION = 2

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"))

/** keV, rounded as the summary stores it. */
const kev = (E) => Number(E.toPrecision(4))

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
  const R = index.reactions

  // atlas id → its index reactions (usually one)
  const byAtlas = new Map()
  R.key.forEach((_, ri) => {
    for (const id of R.atlas[ri] ?? []) byAtlas.set(id, [...(byAtlas.get(id) ?? []), ri])
  })

  const reactions = {}
  for (const [id, ris] of byAtlas) {
    const rows = indexRows(index, ris)
    const main = ris.slice().sort((a, b) => R.n[b] - R.n[a])[0]
    const entries = new Set(rows.map((r) => r.id.split(".")[0]))
    const years = rows.map((r) => r.y).filter((y) => typeof y === "number")
    const luna = rows.filter(isLuna)
    const low = lowestMeasured(rows)
    reactions[id] = {
      key: R.key[main],
      slug: R.slug[main],
      datasets: rows.length,
      entries: entries.size,
      years: years.length ? [Math.min(...years), Math.max(...years)] : null,
      luna: luna.length,
      lunaEntries: new Set(luna.map((r) => r.id.split(".")[0])).size,
      measured: rows.filter((r) => countsAsMeasured(r)).length,
      // keV, centre of mass
      lowest: low
        ? {
            keV: kev(low.E),
            id: low.id,
            author: authorName(low.a),
            year: low.y ?? null,
            luna: low.luna,
            q: low.q,
            ties: low.ties.map((t) => ({ id: t.id, author: authorName(t.a), year: t.y ?? null, luna: t.luna })),
          }
        : null,
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
    rule: RULE,
    reactions,
  }
}
