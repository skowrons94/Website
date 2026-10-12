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
const pending = new Map<number, { resolve: (r: RunResult | null) => void; reject: (e: Error) => void }>()
const ready = new Map<string, Promise<void>>()

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

export interface Baseline {
  network: string
  runs: Record<string, RunResult & { key: string }>
}

const files = new Map<string, Promise<{ network: Network; baseline: Baseline | null }>>()

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
  const w = getWorker()
  if (!ready.has(network.id)) {
    w.postMessage({ type: "network", network })
    ready.set(network.id, Promise.resolve())
  }
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ type: "run", id, request })
  })
}
