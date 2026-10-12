import fs from "node:fs"
import path from "node:path"

import { withoutArticle, type Lang } from "@/lib/i18n"
import type { Baseline } from "./client"
import { sprocessFirstView, type SProcessFirstView } from "./first-view"
import type { Network } from "./schema"

/**
 * The rates explorer's networks as the server sees them at build time: which
 * exist (public/rates/<id>.json), in the order of scripts/rates/networks.yaml,
 * their names, and which atlas reactions each contains (for the "Explore the
 * rates" links on the atlas pages). Server only: reads files.
 */

const DIR = path.join(process.cwd(), "public", "rates")
/** The light networks, in display order; the s-process has a page of its own. */
export const LIGHT_NETWORKS = ["pp", "cno", "nena", "mgal"]
export const SPROCESS_NETWORK = "sprocess"

let cache: Map<string, Network> | null = null

function load(): Map<string, Network> {
  if (cache) return cache
  cache = new Map()
  for (const id of [...LIGHT_NETWORKS, SPROCESS_NETWORK]) {
    const file = path.join(DIR, `${id}.json`)
    if (fs.existsSync(file)) cache.set(id, JSON.parse(fs.readFileSync(file, "utf8")) as Network)
  }
  return cache
}

export function rateTabs(lang: Lang): { id: string; title: string }[] {
  const nets = load()
  return LIGHT_NETWORKS.filter((id) => nets.has(id)).map((id) => ({
    id,
    title: withoutArticle(nets.get(id)!.title[lang]),
  }))
}

/** Where the rates explorer shows an atlas reaction: its page and anchor. */
export function ratesHrefFor(atlasId: string): string | null {
  for (const [id, n] of load()) {
    if (n.reactions.some((r) => r.atlas === atlasId)) {
      return id === SPROCESS_NETWORK ? "/atlas/rates/s-process" : `/atlas/rates#${id}`
    }
  }
  return null
}

/** The explorer's address for an atlas network family (pp, cno, nena, mgal, neutrons, s-process). */
export function ratesHrefForFamily(family: string): string | null {
  const nets = load()
  for (const [id, n] of nets) if (n.family === family && id !== SPROCESS_NETWORK) return `/atlas/rates#${id}`
  if ((family === "neutrons" || family === "s-process") && nets.has(SPROCESS_NETWORK)) return "/atlas/rates/s-process"
  return null
}

export function networkCount(): { networks: number; reactions: number } {
  const nets = [...load().values()]
  return { networks: nets.length, reactions: nets.reduce((a, n) => a + n.reactions.length, 0) }
}

export const hasSProcess = (): boolean => load().has(SPROCESS_NETWORK)

/**
 * A light network with its precomputed first view, for the page to send with
 * its HTML: the explorer then renders its first chart on the server, with no
 * request and no worker. Only for the light networks (a few kB each).
 */
export function preloadNetwork(id: string): { network: Network; baseline: Baseline | null } | null {
  const network = load().get(id)
  if (!network || id === SPROCESS_NETWORK) return null
  const file = path.join(DIR, `${id}.baseline.json`)
  const baseline = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Baseline) : null
  return { network, baseline }
}

/** The s-process page's first view (lib/rates/first-view.ts), from the files on disk. */
export function sprocessFirstViewFromDisk(sOnly: string[]): SProcessFirstView | null {
  const network = load().get(SPROCESS_NETWORK)
  const file = path.join(DIR, `${SPROCESS_NETWORK}.baseline.json`)
  if (!network || !fs.existsSync(file)) return null
  const baseline = JSON.parse(fs.readFileSync(file, "utf8")) as Baseline
  const run = baseline.runs[network.scenarios[0].id]
  return run ? sprocessFirstView(network, run, sOnly) : null
}
