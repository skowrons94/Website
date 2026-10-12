/**
 * The one-click sensitivity map, precomputed: for every scenario of a
 * network, each reaction's rate doubled in turn (every reaction of a light
 * network; the explorer's grouped reactions of the s-process), and the
 * response of every nucleus at the end of the burn,
 *
 *   s = ln(X_×2 / X) / ln 2      (≈ d ln X / d ln λ; +1: X doubles with λ)
 *
 * Same solver and settings as the baselines (lib/rates/run.ts). For the
 * s-process the abundances are taken after the decays of the explorer
 * (lib/rates/analysis.ts), for the stable heavy nuclei. Written to
 * public/rates/<id>.sensitivity.json, which the page loads on demand.
 */

import { decayMap, decayed } from "../../lib/rates/analysis.ts"
import { networkProvider } from "../../lib/rates/rate-provider.ts"
import { compiled, run, scenarioRequest } from "../../lib/rates/run.ts"

export const SENS_FLOOR = 1e-20

/** The sensitivity table of one network (a pure function of the network file). */
export function sensitivity(network) {
  const c = compiled(network)
  const big = network.ui.groups && network.ui.groups.length > 0
  const reactions = big ? network.ui.groups.flatMap((g) => g.reactions) : network.reactions.map((r) => r.id)
  const dmap = big ? decayMap(network, networkProvider(network)) : null
  const keep = big
    ? network.nuclei.map((n, i) => n.Z >= 26 && !dmap.branches.has(i))
    : network.nuclei.map(() => true)
  const finalOf = (res) => (dmap ? decayed(network, res.final, dmap) : res.final)
  const out = {}
  for (const s of network.scenarios) {
    const req = scenarioRequest(network, s)
    const base = finalOf(run(c, req))
    const idx = network.nuclei.map((_, i) => i).filter((i) => keep[i] && base[i] > SENS_FLOOR)
    const rows = reactions.map((id) => {
      const mod = finalOf(run(c, { ...req, scale: { [id]: 2 } }))
      return idx.map((i) => {
        const v = Math.log(Math.max(mod[i], 1e-300) / base[i]) / Math.LN2
        return Math.round(Math.max(-99, Math.min(99, v)) * 1000) / 1000
      })
    })
    out[s.id] = { nuclei: idx.map((i) => network.nuclei[i].name), reactions, s: rows }
  }
  return { network: network.id, generated: network.provenance.generated, factor: 2, scenarios: out }
}
