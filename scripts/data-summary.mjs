#!/usr/bin/env node
/**
 * Write public/data/summary.json, the few kilobytes the public data-explorer
 * page (/data) needs, from the committed EXFOR index (see
 * lib/data/public-summary.mjs for what is counted). Run before every build,
 * after the atlas export; prints a line and does nothing when the index is
 * missing.
 *
 *   node scripts/data-summary.mjs [--out public/data/summary.json]
 */

import fs from "node:fs"
import path from "node:path"

import { buildPublicSummary } from "../lib/data/public-summary.mjs"

const args = process.argv.slice(2)
const outArg = args.indexOf("--out")
const dataDir = path.join(process.cwd(), "public", "data")
const out = outArg >= 0 ? path.resolve(args[outArg + 1]) : path.join(dataDir, "summary.json")

const summary = buildPublicSummary(dataDir)
if (!summary) {
  console.log("data summary: no public/data/exfor/index.json, skipped")
} else {
  const json = JSON.stringify(summary)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, `${json}\n`)
  const rs = Object.values(summary.reactions)
  console.log(
    `data summary: ${rs.length} atlas reactions, ${rs.filter((r) => r.lowest).length} with a lowest measured energy, snapshot ${summary.snapshot.date} → ${path.relative(process.cwd(), out)} (${(json.length / 1024).toFixed(1)} kB)`,
  )
}
