#!/usr/bin/env node
/**
 * npm run test:rates — the browser's rates and solver against pynucastro.
 *
 * For every network in public/rates/ with a stored reference
 * (scripts/rates/reference/<id>.json, written by reference.py):
 *   1. λ(T9) of every reaction on a temperature grid, against pynucastro's
 *      Rate.eval: must agree to 1e-9 relative;
 *   2. the abundances after each scenario's burn, against pynucastro's own
 *      network integrated by scipy BDF (rtol 1e-10; 1e-8 for the s-process):
 *      every nucleus with a final mass fraction above 1e-12 must agree to
 *      `TOL` relative, at rtol 1e-6 and at the explorer's own tolerance, and
 *      the burn must stop at the same time when it stops on a condition;
 *   3. the precomputed baselines and sensitivity maps must be what the solver
 *      gives today;
 *   4. physics checks: no decay of a nucleus that NUBASE2020 (the atlas'
 *      table) calls stable or longer-lived than 10⁸ years, and every
 *      half-life as NUBASE2020 has it; ²⁶Al decays with its laboratory
 *      half-life at hydrogen-burning temperatures; ΣX = 1 and X ≥ 0 at both
 *      ends of every composition slider; the bottleneck of a hot cycle sits
 *      on the slow decays, not on a nucleus that captures a proton first.
 * Prints the largest differences and the solver's time per run.
 */

import fs from "node:fs"
import path from "node:path"

import { DEFAULT_TOLERANCES, compile, integrate } from "../../lib/rates/solver.ts"
import { networkProvider } from "../../lib/rates/rate-provider.ts"
import { checkNetwork } from "../../lib/rates/schema.ts"
import { requestKey, run, scenarioRequest } from "../../lib/rates/run.ts"
import { composition, metalsMax, METALS_RANGE } from "../../lib/rates/composition.ts"
import { dominantPath, slowest } from "../../lib/rates/flow.ts"
import { lifetimes } from "../../lib/rates/solver.ts"
import { sensitivity } from "./sensitivity.mjs"

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
    // and at the tolerance the explorer runs with
    if (run.screening !== false) {
      const ui = integrate(c, {
        history: { kind: "constant", T9: s.T9, rho: s.rho },
        X0: s.X,
        tEnd_s: s.time_s,
        until: s.until,
        rtol: network.solver?.rtol ?? DEFAULT_TOLERANCES.rtol,
        atol: network.solver?.atol ?? DEFAULT_TOLERANCES.atol,
      })
      let w = 0
      network.nuclei.forEach((nuc, i) => {
        if (run.Y[i] * nuc.A >= XMIN) w = Math.max(w, Math.abs(ui.final[i] - run.Y[i]) / run.Y[i])
      })
      console.log(`  ${"  at the explorer's rtol".padEnd(28)} max |ΔY|/Y ${w.toExponential(2)}, ${ui.steps} steps, ${ui.ms.toFixed(0)} ms`)
      if (w > TOL) fail(`${id} ${tag}: at the explorer's tolerance abundances differ by ${w}`)
    }
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
    if (d > 1e-9) fail(`${id} ${s.id}: baseline differs from the solver by ${d} (npm run rates:baseline)`)
  }
  console.log(`baseline ${id}: ${network.scenarios.length} scenarios checked`)
}

// 3b. the sensitivity maps (light networks recomputed in full)
for (const id of ["pp", "cno", "nena", "mgal", "sprocess"]) {
  if (only.length && !only.includes(id)) continue
  const file = path.join(DATA, `${id}.sensitivity.json`)
  if (!fs.existsSync(file)) {
    fail(`${id}: no sensitivity map (npm run rates:baseline)`)
    continue
  }
  const stored = JSON.parse(fs.readFileSync(file, "utf8"))
  const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, `${id}.json`), "utf8")))
  if (id === "sprocess") {
    const want = network.ui.groups.flatMap((g) => g.reactions)
    for (const s of network.scenarios)
      if (JSON.stringify(stored.scenarios[s.id]?.reactions) !== JSON.stringify(want)) fail(`${id} ${s.id}: sensitivity map stale`)
  } else if (JSON.stringify(sensitivity(network)) !== JSON.stringify(stored)) fail(`${id}: sensitivity map stale (npm run rates:baseline)`)
  console.log(`sensitivity ${id}: ${Object.keys(stored.scenarios).length} scenarios checked`)
}

// 4. physics
const YR = 3.15576e7
const nubase = new Map()
for (const line of fs.readFileSync(path.join(ROOT, "content", "atlas", "nuclear-data", "nubase2020-halflife.txt"), "utf8").split("\n")) {
  const f = line.trim().split(/\s+/)
  if (f.length >= 3 && /^\d+$/.test(f[0])) nubase.set(`${f[0]}-${f[1]}`, f[2] === "stable" ? Infinity : Number(f[2]))
}
for (const id of ["pp", "cno", "nena", "mgal", "sprocess"]) {
  if (only.length && !only.includes(id)) continue
  const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, `${id}.json`), "utf8")))
  let decays = 0
  for (const n of network.nuclei) {
    const t = nubase.get(`${n.A}-${n.Z}`)
    if (t === undefined) continue
    const want = Number.isFinite(t) ? t : null
    if (want !== n.halfLife_s && Math.abs((n.halfLife_s ?? 0) / (want ?? 1) - 1) > 1e-9)
      fail(`${id}: half-life of ${n.name} is ${n.halfLife_s}, NUBASE2020 ${want}`)
  }
  for (const r of network.reactions) {
    if (r.reactants.length !== 1) continue
    decays++
    const n = network.nuclei[r.reactants[0]]
    const t = nubase.get(`${n.A}-${n.Z}`)
    if (t === undefined || !(t <= 1e8 * YR)) fail(`${id}: ${r.id} decays ${n.name}, which NUBASE2020 gives as ${t === Infinity ? "stable" : `${t} s`}`)
  }
  // ΣX = 1 at the ends of every slider
  for (const s of network.scenarios) {
    const sum0 = Object.values(s.X).reduce((a, b) => a + b, 0)
    const cases = [
      { metals: METALS_RANGE[0], knobs: {} },
      { metals: metalsMax(network, s), knobs: {} },
      { metals: 50, knobs: {} },
      ...(network.ui.knobs ?? []).flatMap((k) => [{ metals: 1, knobs: { [k]: 0.1 } }, { metals: 1, knobs: { [k]: 10 } }]),
      { metals: 1, knobs: Object.fromEntries((network.ui.knobs ?? []).map((k) => [k, 10])) },
    ]
    for (const cs of cases) {
      const X = composition(network, s, cs)
      const sum = Object.values(X).reduce((a, b) => a + b, 0)
      const neg = Object.entries(X).find(([, v]) => v < 0)
      // the network's nuclei keep the scenario's total (1 less the nuclei a
      // network does not hold, which stay inert and unchanged)
      if (Math.abs(sum - sum0) > 1e-12 || sum > 1 + 1e-6 || neg)
        fail(`${id} ${s.id} ${JSON.stringify(cs)}: ΣX = ${sum}${neg ? `, X(${neg[0]}) < 0` : ""}`)
    }
  }
  console.log(`physics ${id}: ${decays} decays and every half-life checked against NUBASE2020; ΣX conserved (${network.scenarios.map((s) => Object.values(s.X).reduce((a, b) => a + b, 0).toFixed(4)).join(", ")}; the rest inert) at every slider end`)
}
{
  // ²⁶Al: the ground state decays with its laboratory half-life (7.17 × 10⁵ yr)
  const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, "mgal.json"), "utf8")))
  const provider = networkProvider(network)
  const lab = Math.LN2 / nubase.get("26-13")
  for (const T9 of [0.005, 0.015, 0.038, 0.08]) {
    const lam = provider.rate("Al26_to_Mg26_beta_pos_reaclib", T9)
    if (!(lam >= lab * (1 - 1e-9))) fail(`²⁶Al decays at ${lam} s⁻¹ at T9 = ${T9}, the laboratory rate is ${lab}`)
  }
  const s = network.scenarios.find((x) => x.id === "massive-25")
  const c = compile(network)
  const taus = lifetimes(c, { history: { kind: "constant", T9: s.T9, rho: s.rho } }, s.X)
  const k = network.reactions.findIndex((r) => r.id === "Al26_to_Mg26_beta_pos_reaclib")
  const yr = taus[k] / YR
  console.log(`²⁶Al mean life at ${s.id}: ${yr.toExponential(3)} yr (t½/ln 2 = ${(nubase.get("26-13") / Math.LN2 / YR).toExponential(3)})`)
  if (Math.abs(taus[k] * lab - 1) > 0.01) fail(`²⁶Al waits ${yr} yr at ${s.id}`)
}
{
  // bottlenecks follow the flow, branchings included
  const want = { pp: ["sun-core", "p_p_to_d_beta_pos_reaclib"], cno: ["nova", /O1[45]_to_N1[45]_beta_pos/], nena: ["nova-one", /beta_pos/] }
  for (const [id, [sid, re]] of Object.entries(want)) {
    if (only.length && !only.includes(id)) continue
    const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, `${id}.json`), "utf8")))
    const c = compile(network)
    const s = network.scenarios.find((x) => x.id === sid)
    const taus = lifetimes(c, { history: { kind: "constant", T9: s.T9, rho: s.rho } }, s.X)
    const start = network.reactions.find((r) => r.id === network.ui.cycle[0]).target
    const path_ = dominantPath(c, taus, start)
    const b = slowest(path_)
    const rid = network.reactions[b.reaction].id
    console.log(`bottleneck ${id} ${sid}: ${network.reactions[b.reaction].label}, ${b.tau.toPrecision(3)} s, path ${path_.map((p) => network.nuclei[p.nucleus].name).join(" → ")}`)
    if (typeof re === "string" ? rid !== re : !re.test(rid)) fail(`${id} ${sid}: bottleneck ${rid}`)
    if (id === "nena" && /Na22_to/.test(rid)) fail(`nena nova: ²²Na decay taken as bottleneck though ²²Na(p,γ) is faster`)
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log("\nall rates and burns agree with pynucastro")
