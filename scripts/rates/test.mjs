#!/usr/bin/env node
/**
 * npm run test:rates — the browser's rates and solver against pynucastro.
 *
 * For every network in public/rates/ with a stored reference
 * (scripts/rates/reference/<id>.json, written by reference.py):
 *   1. λ(T9) of every reaction on a temperature grid, against pynucastro's
 *      Rate.eval: must agree to 1e-9 relative;
 *   2. the abundances after each scenario's burn, against pynucastro's own
 *      network integrated by scipy BDF (rtol 1e-10): every nucleus with a
 *      final mass fraction above 1e-12 must agree to `TOL` relative, and the
 *      burn must stop at the same time when it stops on a condition.
 * Prints the largest differences and the solver's time per run.
 */

import fs from "node:fs"
import path from "node:path"

import { compile, integrate } from "../../lib/rates/solver.ts"
import { networkProvider } from "../../lib/rates/rate-provider.ts"
import { checkNetwork } from "../../lib/rates/schema.ts"
import { requestKey, run, scenarioRequest } from "../../lib/rates/run.ts"

const ROOT = process.cwd()
const DATA = path.join(ROOT, "public", "rates")
const REF = path.join(ROOT, "scripts", "rates", "reference")
const TOL = Number(process.env.RATES_TOL ?? 2e-3)
const XMIN = 1e-12

let failures = 0
const fail = (msg) => {
  failures++
  console.error(`  FAIL ${msg}`)
}

const only = process.argv.slice(2)
const files = fs.readdirSync(REF).filter((f) => f.endsWith(".json")).sort()
for (const file of files) {
  const id = file.replace(/\.json$/, "")
  if (only.length && !only.includes(id)) continue
  const ref = JSON.parse(fs.readFileSync(path.join(REF, file), "utf8"))
  const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, `${id}.json`), "utf8")))
  const c = compile(network)
  const provider = networkProvider(network)
  console.log(`${id}: ${network.nuclei.length} nuclei, ${network.reactions.length} reactions`)

  // 1. rates
  let worstRate = 0
  for (const r of network.reactions) {
    const want = ref.lambda[r.id]
    if (!want) {
      fail(`${id}: no reference rate for ${r.id}`)
      continue
    }
    ref.T9.forEach((T9, i) => {
      const got = provider.rate(r.id, T9)
      const w = want[i]
      if (w === 0 && got === 0) return
      const d = Math.abs(got - w) / Math.max(Math.abs(w), 1e-300)
      if (w > 1e-280 && d > worstRate) worstRate = d
    })
  }
  console.log(`  rates: max relative difference ${worstRate.toExponential(2)} (${ref.T9.length} temperatures)`)
  if (worstRate > 1e-9) fail(`${id}: rates differ by ${worstRate}`)

  // 2. burns
  for (const run of ref.runs) {
    const s = network.scenarios.find((x) => x.id === run.scenario)
    const res = integrate(c, {
      history: { kind: "constant", T9: s.T9, rho: s.rho },
      X0: s.X,
      tEnd_s: s.time_s,
      until: s.until,
      screening: run.screening !== false,
      rtol: 1e-6,
      atol: 1e-26,
    })
    let worst = 0
    let worstName = ""
    network.nuclei.forEach((nuc, i) => {
      const want = run.Y[i]
      if (want * nuc.A < XMIN) return
      const d = Math.abs(res.final[i] - want) / want
      if (d > worst) {
        worst = d
        worstName = nuc.name
      }
    })
    const dt = Math.abs(res.tFinal - run.tFinal) / run.tFinal
    const tag = `${s.id}${run.screening === false ? " (no screening)" : ""}`
    console.log(
      `  ${tag.padEnd(28)} max |ΔY|/Y ${worst.toExponential(2)} (${worstName}), Δt/t ${dt.toExponential(1)}, ` +
        `${res.steps} steps, ${res.ms.toFixed(0)} ms`,
    )
    if (worst > TOL) fail(`${id} ${tag}: abundances differ by ${worst} (${worstName})`)
    if (dt > TOL) fail(`${id} ${tag}: stops at ${res.tFinal}, pynucastro at ${run.tFinal}`)
  }
}

// 3. the precomputed baselines are what the solver gives today
for (const file of fs.readdirSync(DATA).filter((f) => f.endsWith(".baseline.json")).sort()) {
  const id = file.replace(/\.baseline\.json$/, "")
  if (only.length && !only.includes(id)) continue
  const base = JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8"))
  const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, `${id}.json`), "utf8")))
  const c = compile(network)
  for (const s of network.scenarios) {
    const stored = base.runs[s.id]
    const req = scenarioRequest(network, s)
    if (!stored || stored.key !== requestKey(req)) {
      fail(`${id} ${s.id}: baseline missing or stale (npm run rates:baseline)`)
      continue
    }
    const now = run(c, req)
    const d = Math.max(...now.final.map((x, i) => (x > 1e-12 ? Math.abs(x - stored.final[i]) / x : 0)))
    if (d > 1e-5) fail(`${id} ${s.id}: baseline differs from the solver by ${d} (npm run rates:baseline)`)
  }
  console.log(`baseline ${id}: ${network.scenarios.length} scenarios checked`)
}

if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log("\nall rates and burns agree with pynucastro")
