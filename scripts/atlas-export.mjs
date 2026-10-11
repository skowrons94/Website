#!/usr/bin/env node
/**
 * Write the whole atlas as one JSON file, public/atlas/data.json, which the
 * site links to and serves as a static file. Run before every build, after the
 * check; derived numbers (Q-values, Gamow windows, half-lives) come from the
 * same code the pages use.
 *
 *   node scripts/atlas-export.mjs [--out path/to/data.json]
 */

import fs from "node:fs"
import path from "node:path"

import { buildAtlas, exportAtlas, readRaw } from "../lib/atlas-core.mjs"

const args = process.argv.slice(2)
const outArg = args.indexOf("--out")
const out = outArg >= 0 ? path.resolve(args[outArg + 1]) : path.join(process.cwd(), "public", "atlas", "data.json")

const atlas = buildAtlas(readRaw())
const json = JSON.stringify(exportAtlas(atlas), null, 1)

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${json}\n`)
console.log(
  `atlas export: ${atlas.reactions.length} reactions, ${Object.keys(atlas.references).length} references → ${path.relative(process.cwd(), out)} (${(json.length / 1024).toFixed(0)} kB)`,
)
