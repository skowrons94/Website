/// <reference lib="webworker" />
/**
 * The rates explorer's Web Worker: holds the compiled networks and runs burns
 * off the main thread, so a slider never freezes the page. Messages:
 *
 *   { type: "load", id, url }               fetches and compiles a network
 *                                           itself (no big structured clone
 *                                           on the page's thread) → { type: "ready", id }
 *   { type: "network", network }            the same, for a network in hand
 *   { type: "run", id, request: RunRequest } → { type: "result", id, result }
 *                                              { type: "skipped", id }
 *                                              { type: "error", id, message }
 *
 * A newer "run" for the same network supersedes an older one still queued:
 * the explorer only ever wants the answer to the latest slider position. A
 * run already under way cannot be interrupted here; the page terminates the
 * worker instead when a big network's run goes stale (lib/rates/client.ts).
 */

import { compiled, run, type RunRequest } from "./run.ts"
import { checkNetwork, type Network } from "./schema.ts"

const networks = new Map<string, Promise<Network>>()
const queue: { id: number; request: RunRequest }[] = []
let busy = false

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg)

function drain() {
  if (busy) return
  busy = true
  // let further messages arrive before choosing what to run
  setTimeout(async () => {
    while (queue.length) {
      const job = queue.shift()!
      // superseded by a later request for the same network
      if (queue.some((q) => q.request.network === job.request.network)) {
        post({ type: "skipped", id: job.id })
        continue
      }
      try {
        const p = networks.get(job.request.network)
        if (!p) throw new Error(`network ${job.request.network} not loaded`)
        const network = await p
        if (queue.some((q) => q.request.network === job.request.network)) {
          post({ type: "skipped", id: job.id })
          continue
        }
        post({ type: "result", id: job.id, result: run(compiled(network), job.request) })
      } catch (e) {
        post({ type: "error", id: job.id, message: e instanceof Error ? e.message : String(e) })
      }
    }
    busy = false
  }, 0)
}

function hold(id: string, p: Promise<Network>) {
  const q = p.then((n) => {
    compiled(n)
    post({ type: "ready", id: n.id })
    return n
  })
  q.catch(() => networks.delete(id))
  networks.set(id, q)
}

self.onmessage = (event: MessageEvent) => {
  const msg = event.data
  if (msg?.type === "load") {
    hold(
      msg.id,
      fetch(msg.url)
        .then((r) => {
          if (!r.ok) throw new Error(`${msg.url}: ${r.status}`)
          return r.json()
        })
        .then(checkNetwork),
    )
  } else if (msg?.type === "network") {
    const network = checkNetwork(msg.network)
    hold(network.id, Promise.resolve(network))
  } else if (msg?.type === "run") {
    queue.push({ id: msg.id, request: msg.request })
    drain()
  }
}
