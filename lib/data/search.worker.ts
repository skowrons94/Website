/// <reference lib="webworker" />
/**
 * The search page's worker: fetches public/data/exfor/index.json (1 MB
 * compressed, 8 MB of JSON), parses and summarises it per reaction off the
 * page's thread, and posts back the summaries.
 *   { type: "load", url } → { type: "ready", reactions } | { type: "error", message }
 */

import { summarise } from "./search-index.ts"
import type { DxIndex } from "./types.ts"

self.onmessage = async (ev: MessageEvent<{ type: "load"; url: string }>) => {
  if (ev.data.type !== "load") return
  try {
    const r = await fetch(ev.data.url)
    if (!r.ok) throw new Error(String(r.status))
    const index = (await r.json()) as DxIndex
    ;(self as unknown as Worker).postMessage({ type: "ready", reactions: summarise(index), snapshot: index.snapshot })
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) })
  }
}
