"use client"

/**
 * The page's side of the rates worker: loads a network file and its
 * precomputed baseline, and runs burns in the worker. A request identical to
 * a precomputed one is answered from the baseline without waking the worker.
 */

import { requestKey, type RunRequest, type RunResult } from "./run.ts"
import { checkNetwork, type Network } from "./schema.ts"

const ROOT = `${process.env.BASE_PATH ?? ""}/rates`

let worker: Worker | null = null
let nextId = 1
const pending = new Map<
  number,
  { network: string; resolve: (r: RunResult | null) => void; reject: (e: Error) => void }
>()
const ready = new Set<string>()

/** Networks this big are worth a fresh worker when their run in progress goes stale. */
const BIG = 100

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data
    if (msg.type === "ready") return
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.type === "result") p.resolve(msg.result as RunResult)
    else if (msg.type === "skipped") p.resolve(null)
    else p.reject(new Error(msg.message))
  }
  return worker
}

/**
 * A run in progress cannot be stopped inside the worker, so a stale one on a
 * big network (the s-process: some 300 ms a run) is cancelled by ending the
 * worker; a new one loads the network again from the HTTP cache, off this
 * thread. Its pending requests resolve null, as superseded ones do.
 */
function cancelStale(network: Network) {
  if (!worker || network.nuclei.length < BIG) return
  const stale = [...pending.entries()].filter(([, p]) => p.network === network.id)
  if (!stale.length) return
  worker.terminate()
  worker = null
  ready.clear()
  for (const [id, p] of pending) {
    pending.delete(id)
    p.resolve(null)
  }
}

export interface Baseline {
  network: string
  runs: Record<string, RunResult & { key: string }>
}

const files = new Map<string, Promise<{ network: Network; baseline: Baseline | null }>>()

/** Seeds the cache with a network the server already sent with the page. */
export function primeNetwork(id: string, data: { network: Network; baseline: Baseline | null }) {
  if (!files.has(id)) files.set(id, Promise.resolve(data))
}

/** The network file and its baseline, fetched once. */
export function loadNetwork(id: string): Promise<{ network: Network; baseline: Baseline | null }> {
  let p = files.get(id)
  if (!p) {
    p = (async () => {
      const [n, b] = await Promise.all([
        fetch(`${ROOT}/${id}.json`).then((r) => {
          if (!r.ok) throw new Error(`${id}.json: ${r.status}`)
          return r.json()
        }),
        fetch(`${ROOT}/${id}.baseline.json`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ])
      return { network: checkNetwork(n), baseline: b as Baseline | null }
    })()
    files.set(id, p)
    p.catch(() => files.delete(id))
  }
  return p
}

/**
 * Runs `request` in the worker; resolves null when a later request for the
 * same network superseded it before it ran.
 */
export async function runBurn(
  network: Network,
  request: RunRequest,
  baseline?: Baseline | null,
): Promise<RunResult | null> {
  const key = requestKey(request)
  if (baseline) {
    for (const r of Object.values(baseline.runs)) if (r.key === key) return r
  }
  cancelStale(network)
  const w = getWorker()
  if (!ready.has(network.id)) {
    // the worker fetches and parses the file itself: no large copy on this thread
    w.postMessage({
      type: "load",
      id: network.id,
      url: new URL(`${ROOT}/${network.id}.json`, window.location.href).href,
    })
    ready.add(network.id)
  }
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { network: network.id, resolve, reject })
    w.postMessage({ type: "run", id, request })
  })
}

const sens = new Map<string, Promise<SensitivityFile | null>>()

/** The precomputed sensitivity map of a network (scripts/rates/sensitivity.mjs), fetched once, on demand. */
export interface SensitivityFile {
  network: string
  factor: number
  scenarios: Record<string, { nuclei: string[]; reactions: string[]; s: number[][] }>
}

export function loadSensitivity(id: string): Promise<SensitivityFile | null> {
  let p = sens.get(id)
  if (!p) {
    p = fetch(`${ROOT}/${id}.sensitivity.json`)
      .then((r) => (r.ok ? (r.json() as Promise<SensitivityFile>) : null))
      .catch(() => null)
    sens.set(id, p)
  }
  return p
}
