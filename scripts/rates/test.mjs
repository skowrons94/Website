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
import { compiled, historyOf, providerFor, requestKey, run, scenarioRequest } from "../../lib/rates/run.ts"
import { composition, metalsMax, METALS_RANGE } from "../../lib/rates/composition.ts"
import { bottleneck, closes, dominantPath, pathStart } from "../../lib/rates/flow.ts"
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
      history: historyOf(s),
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
        history: historyOf(s),
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

// 3c. "What if" opens on a reaction whose change shows something: for every
// network and site, the default reaction (ranked by knock-on reach in the
// shipped sensitivity table) moves at least one nucleus other than its own
// target by 1% or more, in a fresh burn at ×2, ÷2 and ×5; where a change
// moves only its target the explorer has a reaction to suggest instead.
{
  const RX = await import("../../lib/rates/changes.ts")
  const { decayMap, decayed } = await import("../../lib/rates/analysis.ts")
  const { RATES_DICT } = await import("../../lib/rates/i18n.ts")
  for (const id of ["pp", "cno", "nena", "mgal", "sprocess"]) {
    if (only.length && !only.includes(id)) continue
    const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, `${id}.json`), "utf8")))
    const base = JSON.parse(fs.readFileSync(path.join(DATA, `${id}.baseline.json`), "utf8"))
    const sens = JSON.parse(fs.readFileSync(path.join(DATA, `${id}.sensitivity.json`), "utf8"))
    if (JSON.stringify(RX.rankReactions(network, sens)) !== JSON.stringify(base.suggest))
      fail(`${id}: the baseline's suggestions are stale (npm run rates:baseline)`)
    const heavy = id === "sprocess"
    const candidates = heavy ? network.ui.groups.flatMap((g) => g.reactions) : (network.ui.key ?? [])
    const c = compiled(network)
    const dmap = heavy ? decayMap(network, networkProvider(network)) : null
    const sites = heavy ? network.scenarios.slice(0, 1) : network.scenarios
    const factors = heavy ? [2] : [2, 0.5, 5]
    const picks = []
    for (const s of sites) {
      const pick = RX.defaultReaction(candidates, base.suggest?.[s.id])
      picks.push(`${s.id}: ${network.reactions.find((r) => r.id === pick)?.label}`)
      const req = scenarioRequest(network, s)
      const b = base.runs[s.id].final
      for (const f of factors) {
        const scale = { [pick]: f }
        const m = run(c, { ...req, scale }).final
        const rows = heavy
          ? RX.sprocessChangeRows(network, decayed(network, b, dmap), decayed(network, m, dmap), dmap, true)
          : RX.lightChangeRows(network, b, m)
        const split = RX.splitChanges(rows, RX.changedTargets(network, scale))
        if (split.state !== "knock") {
          const why = RX.suggestReaction(base.suggest?.[s.id], [pick])
          if (s.id === network.scenarios[0].id || !why)
            fail(`${id} ${s.id}: ${pick} ×${f} moves no other nucleus by 1% (${split.state})`)
        }
      }
    }
    console.log(`what if ${id}: opens on ${picks.join("; ")}`)
  }
  // the owner's case: ¹²C(p,γ) ×5 in the massive star moves only ¹²C; the
  // explorer says why, in both languages, and offers ¹⁴N(p,γ)
  const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, "cno.json"), "utf8")))
  const base = JSON.parse(fs.readFileSync(path.join(DATA, "cno.baseline.json"), "utf8"))
  const s = network.scenarios.find((x) => x.id === "massive-15")
  const scale = { C12_p_to_N13_reaclib: 5 }
  const m = run(compiled(network), { ...scenarioRequest(network, s), scale }).final
  const split = RX.splitChanges(RX.lightChangeRows(network, base.runs[s.id].final, m), RX.changedTargets(network, scale))
  const c12 = split.self.find((r) => r.name === "c12")
  if (split.state !== "self" || !c12 || Math.abs(1 / c12.ratio - 5) > 1) fail(`cno massive-15 ¹²C(p,γ) ×5: ${split.state}, ¹²C ${c12?.ratio}`)
  if (!split.small.length) fail("cno massive-15 ¹²C(p,γ) ×5: the changes under 1% are not listed")
  const sug = RX.suggestReaction(base.suggest[s.id], Object.keys(scale), "N14_p_to_O15_reaclib")
  if (sug?.id !== "N14_p_to_O15_reaclib" || sug.why !== "slowest") fail(`cno massive-15: suggests ${JSON.stringify(sug)}`)
  if (RX.suggestReaction(base.suggest[s.id], Object.keys(scale))?.id !== "N14_p_to_O15_reaclib") fail("cno massive-15: ¹⁴N(p,γ) is not the best-reaching reaction")
  for (const lang of ["en", "it"]) {
    const t = RATES_DICT[lang]
    const text = t.quietSelf("¹²C", t.cycleOf.cno) + t.trySuggest("slowest", "cycle").join("¹⁴N(p,γ)")
    if (!/CN/.test(text) || !text.includes("¹²C") || !text.includes("¹⁴N(p,γ)")) fail(`what if (${lang}): ${text}`)
    for (const net of ["pp", "cno", "nena", "mgal"]) if (!t.cycleOf[net]) fail(`what if (${lang}): no name for ${net}`)
  }
  console.log(`what if: cno ¹²C(p,γ) ×5 moves ¹²C ÷${(1 / c12.ratio).toFixed(1)} and ${split.small.length} nuclei by under 1%; the explorer explains and suggests ¹⁴N(p,γ)`)
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
  // bottlenecks follow the flow, branchings included; a step slower than the
  // burn is not named, nor a leak out of the cycle (lib/rates/flow.ts)
  const want = {
    pp: [["sun-core", "p_p_to_d_beta_pos_reaclib"]],
    cno: [["nova", /O1[45]_to_N1[45]_beta_pos/], ["massive-15", /./], ["sun-core", /./]],
    nena: [["nova-one", /beta_pos|p_to/], ["massive-25", /^(?!Ne20_p)/], ["agb-hbb", /./]],
    mgal: [["massive-25", /^(?!Mg24_p)/], ["agb-hbb", /^(?!Al27_p_to_Si28)/]],
  }
  for (const [id, cases] of Object.entries(want)) {
    if (only.length && !only.includes(id)) continue
    const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, `${id}.json`), "utf8")))
    const base = JSON.parse(fs.readFileSync(path.join(DATA, `${id}.baseline.json`), "utf8"))
    const c = compile(network)
    const cycle = network.ui.cycle.map((x) => network.reactions.findIndex((r) => r.id === x))
    const fuel = network.nuclei.findIndex((n) => n.name === network.ui.fuel)
    for (const [sid, re] of cases) {
      const s = network.scenarios.find((x) => x.id === sid)
      const taus = lifetimes(c, { history: { kind: "constant", T9: s.T9, rho: s.rho } }, s.X)
      const tBurn = base.runs[sid].tFinal
      const path_ = dominantPath(c, taus, pathStart(c, taus, cycle, tBurn, fuel))
      const b = bottleneck(path_, taus, closes(c, path_), cycle, tBurn, fuel)
      const rid = network.reactions[b.step.reaction].id
      console.log(
        `bottleneck ${id} ${sid}: ${network.reactions[b.step.reaction].label}, ${b.tau.toPrecision(3)} s (burn ${tBurn.toPrecision(3)} s)` +
          `${b.idle.length ? `, not running: ${b.idle.map((p) => network.reactions[p.reaction].label).join(", ")}` : ""}` +
          `${b.leak.length ? `, leak: ${b.leak.map((p) => network.reactions[p.reaction].label).join(", ")}` : ""}` +
          `${b.stall !== null ? `, piles up at ${network.nuclei[b.stall].label}` : ""}`,
      )
      // the path ends where the flow stops (r10 expert #1): in an AGB
      // envelope ²⁶Al(p,γ) takes 21 yr in a 10-yr burn, so ²⁶Al piles up and
      // ²⁷Al(p,γ)²⁸Si (267 yr) is no leak
      for (const p of b.path) if (p.nucleus !== fuel && taus[p.reaction] > tBurn) fail(`${id} ${sid}: path runs through idle ${network.reactions[p.reaction].label}`)
      for (const p of b.leak) if (taus[p.reaction] > tBurn) fail(`${id} ${sid}: leak ${network.reactions[p.reaction].label} slower than the burn`)
      if (id === "mgal" && sid === "agb-hbb") {
        if (b.leak.length) fail(`mgal agb-hbb: leak reported`)
        if (b.stall === null || network.nuclei[b.stall].name !== "al26") fail(`mgal agb-hbb: path does not end at ²⁶Al`)
      }
      if (typeof re === "string" ? rid !== re : !re.test(rid)) fail(`${id} ${sid}: bottleneck ${rid}`)
      if (b.tau > tBurn && b.step.nucleus !== fuel) fail(`${id} ${sid}: bottleneck ${rid} slower than the burn`)
      if (id === "nena" && /Na22_to/.test(rid) && sid === "nova-one") fail(`nena nova: ²²Na decay taken as bottleneck though ²²Na(p,γ) is faster`)
    }
  }
}
{
  // the novae cool as they expand (scenarios.yaml): an ONe nova keeps its
  // ²⁰Ne and ejects ²⁶Al (José & Hernanz 1998: ²⁶Al/²⁷Al 0.2–0.4; José,
  // Hernanz & Coc 1997: X(²⁶Al) 2 × 10⁻⁴–2 × 10⁻³), and most hydrogen is left
  const X = (id, sid, name) => {
    const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, `${id}.json`), "utf8")))
    const base = JSON.parse(fs.readFileSync(path.join(DATA, `${id}.baseline.json`), "utf8"))
    const i = network.nuclei.findIndex((n) => n.name === name)
    const s = network.scenarios.find((x) => x.id === sid)
    return [s.X[name], base.runs[sid].final[i]]
  }
  if (!only.length || only.includes("mgal")) {
    const [, al26] = X("mgal", "nova-one", "al26")
    const [, al27] = X("mgal", "nova-one", "al27")
    console.log(`ONe nova: X(²⁶Al) ${al26.toExponential(2)}, ²⁶Al/²⁷Al ${(al26 / al27).toFixed(3)}`)
    if (!(al26 / al27 > 1e-2 && al26 / al27 < 1)) fail(`ONe nova: ²⁶Al/²⁷Al = ${al26 / al27}, outside 10⁻² … 1`)
    if (!(al26 > 1e-4 && al26 < 3e-3)) fail(`ONe nova: X(²⁶Al) = ${al26}`)
  }
  if (!only.length || only.includes("nena")) {
    const [ne0, ne1] = X("nena", "nova-one", "ne20")
    const [h0, h1] = X("nena", "nova-one", "p")
    console.log(`ONe nova: ²⁰Ne kept ${(ne1 / ne0).toFixed(3)}, H ${h0.toFixed(3)} → ${h1.toFixed(3)}`)
    if (!(ne1 / ne0 > 0.5)) fail(`ONe nova burns ²⁰Ne: ${ne0} → ${ne1}`)
    if (!(h1 / h0 > 0.7)) fail(`ONe nova burns too much hydrogen: ${h0} → ${h1}`)
  }
  if (!only.length || only.includes("cno")) {
    const [h0, h1] = X("cno", "nova", "p")
    console.log(`CO nova: H ${h0.toFixed(3)} → ${h1.toFixed(3)}`)
    if (!(h1 / h0 > 0.7)) fail(`CO nova burns too much hydrogen: ${h0} → ${h1}`)
  }
  if (!only.length || only.includes("sprocess")) {
    // core helium burning: n_n ≈ 10⁶–10⁷ cm⁻³ (Käppeler et al. 2011; Pignatari et al. 2010)
    const base = JSON.parse(fs.readFileSync(path.join(DATA, "sprocess.baseline.json"), "utf8"))
    const peak = base.runs["massive-he-core"].exposure.peak_cm3
    console.log(`massive-star He core: peak neutron density ${peak.toExponential(2)} cm⁻³`)
    if (!(peak > 1e6 && peak < 3e7)) fail(`He core: peak neutron density ${peak} cm⁻³, outside 10⁶ … 3 × 10⁷`)
  }
}

{
  // the rates from the site's evaluations (scripts/rates/evaluated_rates.py)
  // reach the network as written, and only when asked for
  const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, "cno.json"), "utf8")))
  const ids = network.reactions.filter((r) => r.alternatives?.length).map((r) => r.id)
  if (ids.length !== 2) fail(`cno: ${ids.length} reactions with an evaluated rate, expected ¹²C(p,γ) and ¹³C(p,γ)`)
  const luna = providerFor(network, ids)
  const reaclib = providerFor(network)
  for (const id of ids) {
    const src = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "rates", "evaluated", `${id}.json`), "utf8"))
    src.T9.forEach((T9, i) => {
      const d = Math.abs(Math.log10(luna.rate(id, T9)) - src.log10[i])
      if (d > 1e-9) fail(`${id}: evaluated rate at T9 = ${T9} differs from the table by ${d} dex`)
      const r = luna.rate(id, T9) / reaclib.rate(id, T9)
      if (Math.abs(r / src.reaclib_ratio[i] - 1) > 1e-3) fail(`${id}: ratio to REACLIB ${r}, table says ${src.reaclib_ratio[i]}`)
    })
    const at = (T9) => (luna.rate(id, T9) / reaclib.rate(id, T9)).toFixed(3)
    console.log(`${id}: evaluated ÷ REACLIB ${at(0.0157)} (16 MK), ${at(0.035)} (35 MK), ${at(0.1)} (0.1 GK), ${at(0.3)} (0.3 GK)`)
  }
  const T9 = 0.035
  console.log(
    `¹²C/¹³C in CN equilibrium at 35 MK: REACLIB ${(reaclib.rate(ids[1], T9) / reaclib.rate(ids[0], T9)).toFixed(2)}, ` +
      `evaluated ${(luna.rate(ids[1], T9) / luna.rate(ids[0], T9)).toFixed(2)}`,
  )
}

{
  // the energy (lib/rates/energy.ts): ε against pynucastro's
  // evaluate_energy_generation at every scenario's start and mid-burn
  // (scripts/rates/energy_reference.py; pynucastro counts no neutrino losses
  // for REACLIB rates, so it is compared with ε + ε_ν), and energy
  // conservation: ∫ ε dt + ∫ ε_ν dt over each burn is the mass defect of
  // what burnt, N_A Σ (Y₀ − Y) Δ
  const { energyAt } = await import("../../lib/rates/solver.ts")
  const ref = JSON.parse(fs.readFileSync(path.join(REF, "energy", "energy.json"), "utf8"))
  for (const [id, states] of Object.entries(ref.networks)) {
    if (only.length && !only.includes(id)) continue
    const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, `${id}.json`), "utf8")))
    const c = compiled(network)
    let worst = 0
    let where = ""
    for (const st of states) {
      const e = energyAt(c, { history: { kind: "constant", T9: st.T9, rho: st.rho } }, Float64Array.from(st.Y))
      const d = Math.abs(e.gross / st.eps - 1)
      if (d > worst) {
        worst = d
        where = `${st.scenario} t = ${st.t.toPrecision(3)} s`
      }
      if (!(d <= 1e-6)) fail(`${id} ${st.scenario} t = ${st.t} s: ε ${e.gross} vs pynucastro ${st.eps}`)
    }
    console.log(`energy ${id}: ε vs pynucastro, max relative difference ${worst.toExponential(2)} (${where}; ${states.length} states)`)
    for (const s of network.scenarios) {
      const req = scenarioRequest(network, s)
      for (const rtol of [1e-6, req.rtol ?? DEFAULT_TOLERANCES.rtol]) {
        const r = run(c, { ...req, rtol })
        const e = r.energy
        const d = Math.abs((e.E + e.Enu) / e.defect - 1)
        const tol = rtol <= 1e-6 ? 5e-5 : 2e-3
        if (!(d <= tol)) fail(`${id} ${s.id} rtol ${rtol}: ∫ε dt + ∫ε_ν dt = ${e.E + e.Enu}, mass defect ${e.defect}`)
        if (rtol <= 1e-6)
          console.log(
            `  ${s.id.padEnd(18)} ∫ε dt ${e.E.toExponential(3)} erg/g, neutrinos ${((100 * e.Enu) / e.defect).toFixed(2)}%, ` +
              `(∫ε + ∫ε_ν)/defect − 1 = ${(((e.E + e.Enu) / e.defect) - 1).toExponential(1)}`,
          )
      }
      // the shipped baseline carries the same energy
      const base = JSON.parse(fs.readFileSync(path.join(DATA, `${id}.baseline.json`), "utf8")).runs[s.id]
      if (!base?.energy || !base.eps || base.eps.length !== base.t.length) fail(`${id} ${s.id}: baseline without energy (npm run rates:baseline)`)
    }
  }
  // the neutrinos take what the textbooks say: CNO 1.70 MeV of 26.73 (6.4%) once
  // the cycle runs, the pp chain's own share in the Sun 2–4%
  {
    const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, "cno.json"), "utf8")))
    const e = run(compiled(network), scenarioRequest(network, network.scenarios.find((x) => x.id === "massive-15"))).energy
    const f = e.Enu / e.defect
    if (!(f > 0.062 && f < 0.066)) fail(`cno massive-15: neutrinos carry ${f} of the energy, CNO cycle 0.064`)
    const pp = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, "pp.json"), "utf8")))
    const e2 = run(compiled(pp), scenarioRequest(pp, pp.scenarios.find((x) => x.id === "sun-core"))).energy
    const f2 = e2.Enu / e2.defect
    if (!(f2 > 0.02 && f2 < 0.045)) fail(`pp sun-core: neutrinos carry ${f2} of the energy`)
    console.log(`neutrino share: CNO cycle (15 M☉ core) ${(100 * f).toFixed(2)}%, pp chain (Sun's centre) ${(100 * f2).toFixed(2)}%`)
  }
}

{
  // the curiosities (lib/rates/curiosities.ts): every sentence is the one a
  // fresh run of the solver gives (×2 against the unchanged burn, after the
  // decays for the s-process), within its rounding; no headline that is a
  // self-cell by construction, no excluded nucleus, short hooks, the caveat
  const cur = await import("../../lib/rates/curiosities.ts")
  const { energyChange } = await import("../../lib/rates/energy.ts")
  const { decayMap, decayed } = await import("../../lib/rates/analysis.ts")
  const shown = []
  const nets = new Map()
  const cardsFile = path.join(DATA, "cards", "cards.json")
  const cards = fs.existsSync(cardsFile) ? JSON.parse(fs.readFileSync(cardsFile, "utf8")) : null
  if (!cards) fail("curiosities: no social cards (node scripts/rates/curiosity-cards.mjs)")
  let n = 0
  for (const spec of cur.CURIOSITIES) {
    if (only.length && !only.includes(spec.net)) continue
    if (!nets.has(spec.net)) {
      const network = checkNetwork(JSON.parse(fs.readFileSync(path.join(DATA, `${spec.net}.json`), "utf8")))
      nets.set(spec.net, {
        network,
        c: compiled(network),
        sens: JSON.parse(fs.readFileSync(path.join(DATA, `${spec.net}.sensitivity.json`), "utf8")),
        base: JSON.parse(fs.readFileSync(path.join(DATA, `${spec.net}.baseline.json`), "utf8")),
        dmap: spec.net === "sprocess" ? decayMap(network, networkProvider(network)) : null,
      })
    }
    const { network, c, sens, base, dmap } = nets.get(spec.net)
    const s = network.scenarios.find((x) => x.id === spec.site)
    const reaction = network.reactions.find((r) => r.id === spec.reaction)
    if (!s || !reaction) {
      fail(`curiosity ${spec.id}: no scenario or reaction`)
      continue
    }
    const req = scenarioRequest(network, s)
    const fin = (res) => (dmap ? decayed(network, res.final, dmap) : res.final)
    const R0 = run(c, req)
    const R2 = run(c, { ...req, scale: { [spec.reaction]: 2 } })
    const X0 = fin(R0)
    const X2 = fin(R2)
    // the same table, one row, from these two fresh burns: every number of the
    // card (main, knock-on, energy) then comes out of the same functions
    const ch = energyChange(R0, R2)
    const names = network.nuclei.map((x) => x.name).filter((_, i) => X0[i] > 1e-20)
    const lg = (x) => Math.log(Math.max(x, 1e-300)) / Math.LN2
    const solvedSens = {
      scenarios: {
        [spec.site]: {
          nuclei: names,
          reactions: [spec.reaction],
          s: [names.map((name) => { const i = network.nuclei.findIndex((x) => x.name === name); return lg(X2[i] / X0[i]) })],
          energy: [lg(ch.power)],
          fuel: [ch.fuel === null ? null : lg(ch.fuel)],
          nu: Object.fromEntries(Object.entries(ch.nu).map(([g, v]) => [g, [lg(v)]])),
        },
      },
    }
    if (dmap) solvedSens.scenarios[spec.site].nuclei = names.filter((name) => sens.scenarios[spec.site].nuclei.includes(name))
    if (dmap) solvedSens.scenarios[spec.site].s = [solvedSens.scenarios[spec.site].nuclei.map((name) => { const i = network.nuclei.findIndex((x) => x.name === name); return lg(X2[i] / X0[i]) })]
    const solved = cur.curiosityRatio(spec, solvedSens)
    const shipped = cur.curiosityRatio(spec, sens)
    const ctxShipped = cur.curiosityContext(spec, sens, network, base)
    const ctxSolved = cur.curiosityContext(spec, solvedSens, network, base)
    for (const lang of ["en", "it"]) {
      const a = cur.curiosityText(spec, shipped, lang, ctxShipped)
      const b = cur.curiosityText(spec, solved, lang, ctxSolved)
      if (a.sentence !== b.sentence) fail(`curiosity ${spec.id} (${lang}): table says "${a.amount} (${a.percent})", the solver "${b.amount} (${b.percent})"`)
      if (a.knockLine !== b.knockLine) fail(`curiosity ${spec.id} (${lang}): knock-on "${a.knockLine}", the solver "${b.knockLine}"`)
      if (a.energyLine !== b.energyLine) fail(`curiosity ${spec.id} (${lang}): energy "${a.energyLine}", the solver "${b.energyLine}"`)
      if (!/One-zone model|Modello a zona singola/.test(a.caveat) || !/Real stars adjust|Una stella vera si riassesta/.test(a.caveat)) fail(`curiosity ${spec.id}: caveat`)
      if ((spec.kind === "energy" || spec.kind === "neutrino" || a.energyLine) && !/a real star would adjust its temperature to keep its luminosity|una stella vera regolerebbe la temperatura per mantenere la sua luminosità/.test(a.caveat))
        fail(`curiosity ${spec.id} (${lang}): energy without its caveat`)
      if (cards && cards[`${spec.id}.${lang}`] !== cur.cardText(a))
        fail(`curiosity ${spec.id} (${lang}): its social card is stale (node scripts/rates/curiosity-cards.mjs)`)
      if (a.hook.split(/\s+/).length > 15) fail(`curiosity ${spec.id} (${lang}): hook longer than 15 words`)
      for (const txt of [a.percent, a.knockLine ?? "", a.energyLine ?? "", a.sentence])
        if (/[0-9][.,][0-9]{2,}%|[0-9]{3,}%|×[0-9]{3,}|×[0-9][.,][0-9]{2,}/.test(txt)) fail(`curiosity ${spec.id}: "${txt}" has more than two figures`)
      if (lang === "en") shown.push(`${spec.id}: ${[a.percent, a.knockLine, a.energyLine].filter(Boolean).join(" ")}`)
    }
    if (Math.abs(solved / shipped - 1) > 0.01) fail(`curiosity ${spec.id}: solver ${solved} vs table ${shipped}`)
    if (ctxShipped.knock) {
      const k = ctxShipped.knock
      const own = [...reaction.reactants, ...reaction.products].map((i) => network.nuclei[i].label)
      if (own.includes(k.label) || Math.abs(k.ratio - 1) < 0.05) fail(`curiosity ${spec.id}: knock-on ${k.label} is the reaction's own or under 5%`)
    }
    const self = network.nuclei[reaction.target]?.name === spec.nucleus
    const sv = cur.sensOf(sens, spec.site, spec.reaction, spec.nucleus)
    if (self && !spec.per && Math.abs(sv + 1) < 0.05) fail(`curiosity ${spec.id}: ${spec.nucleus} just halves with its own rate (a self-cell)`)
    if (cur.NEVER_HEADLINE.includes(spec.nucleus)) fail(`curiosity ${spec.id}: ${spec.nucleus} is excluded`)
    if ((spec.kind === "energy" || spec.kind === "neutrino") && !cur.ENERGY_NETS.includes(spec.net)) fail(`curiosity ${spec.id}: energy of a network that does not make it`)
    if (spec.net === "nena" && spec.site === "nova-one" && spec.reaction === "Na23_p_to_Mg24_reaclib") fail(`curiosity ${spec.id}: the ONe-nova ²³Na(p,γ) edge case`)
    n++
  }
  const ids = cur.CURIOSITIES.map((x) => x.id)
  if (new Set(ids).size !== ids.length) fail("curiosities: duplicate ids")
  console.log(`curiosities: ${n} sentences, knock-on and energy lines match the solver within rounding (EN, IT)`)
  for (const l of shown) console.log(`  ${l}`)
}

if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log("\nall rates and burns agree with pynucastro")
