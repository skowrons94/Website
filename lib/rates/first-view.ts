/**
 * The s-process page's first view, computed where the page is built: the
 * production factors of the first site's precomputed burn and its neutron
 * numbers. The page sends these few kilobytes with its HTML, so the chart is
 * drawn before the 500 kB network file has even arrived; the explorer takes
 * over when it has. Pure (the server calls it with the files it read).
 */

import { decayMap, decayed, neutronsPerSeed } from "./analysis.ts"
import { networkProvider } from "./rate-provider.ts"
import type { RunResult } from "./run.ts"
import type { Network } from "./schema.ts"

export interface FirstViewPoint {
  name: string
  label: string
  A: number
  Z: number
  base: number
  changed: null
  sOnly: boolean
  notModelled: boolean
}

export interface SProcessFirstView {
  scenario: { id: string; name: string; name_it: string; T9: number; rho: number; time_s: number }
  sites: { id: string; short: string; short_it: string; T9: number }[]
  points: FirstViewPoint[]
  stats: { tau: number; peak: number; nc: number; tFinal: number }
}

export function sprocessFirstView(network: Network, run: RunResult, sOnly: string[]): SProcessFirstView {
  const s = network.scenarios[0]
  const map = decayMap(network, networkProvider(network))
  const X0 = network.nuclei.map((n) => s.X[n.name] ?? 0)
  const X0dec = decayed(network, X0, map)
  const dec = decayed(network, run.final, map)
  const so = new Set(sOnly)
  const nm = network.ui.not_modelled ?? {}
  const points: FirstViewPoint[] = []
  network.nuclei.forEach((n, i) => {
    if (n.Z < 26 || X0dec[i] <= 0 || map.branches.has(i)) return
    points.push({
      name: n.name,
      label: n.label,
      A: n.A,
      Z: n.Z,
      base: Number((dec[i] / X0dec[i]).toPrecision(4)),
      changed: null,
      sOnly: so.has(n.code),
      notModelled: n.name in nm,
    })
  })
  return {
    scenario: { id: s.id, name: s.name, name_it: s.name_it, T9: s.T9, rho: s.rho, time_s: s.time_s },
    sites: network.scenarios.map((x) => ({
      id: x.id,
      short: x.short ?? x.name,
      short_it: x.short_it ?? x.name_it,
      T9: x.T9,
    })),
    points,
    stats: {
      tau: (run.exposure?.tau_cm2 ?? 0) * 1e-27,
      peak: run.exposure?.peak_cm3 ?? 0,
      nc: neutronsPerSeed(network, X0, run.final),
      tFinal: run.tFinal,
    },
  }
}
