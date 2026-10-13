#!/usr/bin/env node
/**
 * The states at which test:rates checks the energy generation rate against
 * pynucastro: every scenario of every network at t = 0 and mid-burn (half
 * the burn's own length, by the browser's solver at rtol 1e-8). Written to
 * scripts/rates/reference/energy/states.json; scripts/rates/energy_reference.py
 * evaluates pynucastro's ε there and writes reference/energy/energy.json.
 *
 *   node scripts/rates/energy-states.mjs && python scripts/rates/energy_reference.py
 */

import fs from "node:fs"
import path from "node:path"

import { checkNetwork } from "../../lib/rates/schema.ts"
import { compile, integrate, stateAt, toY } from "../../lib/rates/solver.ts"
import { historyOf } from "../../lib/rates/run.ts"

const ROOT = process.cwd()
const out = {}
for (const id of ["pp", "cno", "nena", "mgal", "sprocess"]) {
  const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(ROOT, "public", "rates", `${id}.json`), "utf8")))
  const c = compile(network)
  out[id] = []
  for (const s of network.scenarios) {
    const history = historyOf(s)
    const opts = { history, X0: s.X, until: s.until, rtol: 1e-8, atol: 1e-30, maxSteps: 1e6 }
    const full = integrate(c, { ...opts, tEnd_s: s.time_s })
    const tMid = full.tFinal / 2
    const mid = integrate(c, { ...opts, tEnd_s: tMid })
    for (const [t, Y] of [
      [0, toY(c, s.X)],
      [tMid, mid.final],
    ]) {
      const { T9, rho } = stateAt(history, t)
      out[id].push({ scenario: s.id, t, T9, rho, Y: Array.from(Y, (y) => Math.max(0, y)) })
    }
  }
}
const file = path.join(ROOT, "scripts", "rates", "reference", "energy", "states.json")
fs.writeFileSync(file, JSON.stringify(out))
console.log(`${path.relative(ROOT, file)}: ${Object.values(out).flat().length} states`)
