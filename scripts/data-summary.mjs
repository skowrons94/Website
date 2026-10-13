#!/usr/bin/env node
/**
 * Write public/data/summary.json, the few kilobytes the public data-explorer
 * page (/data) needs, from the committed EXFOR index (see
 * lib/data/public-summary.mjs for what is counted). Run before every build,
 * after the atlas export; prints a line and does nothing when the index is
 * missing.
 *
 *   node scripts/data-summary.mjs [--out public/data/summary.json]
 *   node scripts/data-summary.mjs --indirect   # regenerate lib/data/indirect-entries.json
 *                                              # from the atlas shards (public/data/exfor/r/)
 */

import fs from "node:fs"
import path from "node:path"

import { buildPublicSummary, scanIndirect } from "../lib/data/public-summary.mjs"

const args = process.argv.slice(2)
const outArg = args.indexOf("--out")
const dataDir = path.join(process.cwd(), "public", "data")
const out = outArg >= 0 ? path.resolve(args[outArg + 1]) : path.join(dataDir, "summary.json")

if (args.includes("--indirect")) {
  const list = scanIndirect(path.join(dataDir, "exfor", "r"))
  if (!list) {
    console.error("data summary: no shards in public/data/exfor/r (dx.py build-exfor --shards atlas)")
    process.exit(1)
  }
  const file = path.join(process.cwd(), "lib", "data", "indirect-entries.json")
  fs.writeFileSync(file, `${JSON.stringify(list, null, 1)}\n`)
  console.log(`data summary: ${Object.keys(list.entries).length} indirect entries → ${path.relative(process.cwd(), file)}`)
}

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
