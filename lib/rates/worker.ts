/// <reference lib="webworker" />
/**
 * The rates explorer's Web Worker: holds the compiled networks and runs burns
 * off the main thread, so a slider never freezes the page. Messages:
 *
 *   { type: "network", network }            → { type: "ready", id }
 *   { type: "run", id, request: RunRequest } → { type: "result", id, result }
 *                                              { type: "error", id, message }
 *
 * A newer "run" for the same network supersedes an older one still queued:
 * the explorer only ever wants the answer to the latest slider position.
 */

import { compiled, run, type RunRequest } from "./run.ts"
import { checkNetwork, type Network } from "./schema.ts"

const networks = new Map<string, Network>()
const queue: { id: number; request: RunRequest }[] = []
let busy = false

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg)

function drain() {
  if (busy) return
  busy = true
  // let further messages arrive before choosing what to run
  setTimeout(() => {
    while (queue.length) {
      const job = queue.shift()!
      // superseded by a later request for the same network
      if (queue.some((q) => q.request.network === job.request.network)) {
        post({ type: "skipped", id: job.id })
        continue
      }
      try {
        const network = networks.get(job.request.network)
        if (!network) throw new Error(`network ${job.request.network} not loaded`)
        post({ type: "result", id: job.id, result: run(compiled(network), job.request) })
      } catch (e) {
        post({ type: "error", id: job.id, message: e instanceof Error ? e.message : String(e) })
      }
    }
    busy = false
  }, 0)
}

self.onmessage = (event: MessageEvent) => {
  const msg = event.data
  if (msg?.type === "network") {
    const network = checkNetwork(msg.network)
    networks.set(network.id, network)
    compiled(network)
    post({ type: "ready", id: network.id })
  } else if (msg?.type === "run") {
    queue.push({ id: msg.id, request: msg.request })
    drain()
  }
}
