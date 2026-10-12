#!/usr/bin/env node
/**
 * The explorer's first view, precomputed: every scenario of every network in
 * public/rates/, burnt at its own settings by the same solver the browser
 * runs (lib/rates/solver.ts), written to public/rates/<id>.baseline.json.
 *
 *   node scripts/rates/baseline.mjs [network ids...]
 *
 * It also writes public/rates/<id>.sensitivity.json, every reaction doubled
 * in turn (scripts/rates/sensitivity.mjs), for the one-click sensitivity map.
 *
 * The page shows these at once and compares every "what if" against them;
 * they come from the browser's own code, so an unmodified rerun in the
 * browser reproduces them and a change shows only what the change did.
 */

import fs from "node:fs"
import path from "node:path"

import { compiled, requestKey, run, scenarioRequest } from "../../lib/rates/run.ts"
import { checkNetwork } from "../../lib/rates/schema.ts"
import { sensitivity } from "./sensitivity.mjs"

const DIR = path.join(process.cwd(), "public", "rates")
const only = process.argv.slice(2)

for (const file of fs.readdirSync(DIR).sort()) {
  if (!file.endsWith(".json") || file.includes(".baseline.") || file.includes(".sensitivity.")) continue
  const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")))
  if (only.length && !only.includes(network.id)) continue
  const c = compiled(network)
  const runs = {}
  for (const s of network.scenarios) {
    const req = scenarioRequest(network, s)
    const res = run(c, req)
    runs[s.id] = { key: requestKey(req), ...res }
    console.log(`${network.id} ${s.id}: ${res.steps} steps, ${res.ms} ms, stopped on ${res.stopped}`)
  }
  const out = path.join(DIR, `${network.id}.baseline.json`)
  fs.writeFileSync(out, JSON.stringify({ network: network.id, generated: network.provenance.generated, runs }))
  console.log(`  ${path.relative(process.cwd(), out)}: ${(fs.statSync(out).size / 1024).toFixed(0)} kB`)
  const t0 = Date.now()
  const sens = path.join(DIR, `${network.id}.sensitivity.json`)
  fs.writeFileSync(sens, JSON.stringify(sensitivity(network)))
  console.log(`  ${path.relative(process.cwd(), sens)}: ${(fs.statSync(sens).size / 1024).toFixed(0)} kB, ${Date.now() - t0} ms`)
}
