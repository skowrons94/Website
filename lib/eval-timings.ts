/**
 * Typical timings (seconds) of an evaluation: the progress timer's estimate
 * before the evaluation's own arrive (the server's /initial), and the only
 * ones the in-browser build has (its engine is a WebAssembly build, 2–6×
 * slower than the server, and runs one Web Worker per model: browser/README.md).
 *
 * They are not typed here: they live in server/evaluations/<id>/timings.json,
 * which `python -m app.warm` writes (its `server` part) and the build reads
 * through lib/evaluation-meta.ts. Its `browser` part is measured in a browser
 * (docs/ADDING-AN-EVALUATION.md); without it, it is estimated from the
 * server's by `browserEstimate`.
 *
 * Keys as `Timings` (lib/api.ts): open (until the model answers: on the
 * browser build, starting Python and AZURE2 too), prepare_* (the one-off
 * building of each derived model), edit (an edit once prepared: data and
 * smooth curve), extrap_edit (the extrapolations after an edit).
 *
 * Client-safe: no file access here.
 */

import type { Timings } from "./api"

export interface TypicalTimings {
  server: Timings
  browser: Timings
}

const KEYS = ["open", "prepare_data", "prepare_fine", "prepare_extrap", "edit", "extrap_edit", "grid", "data", "fine"] as const

/** Only the numeric timing fields of a timings.json part (drops "measured", "cpus"…). */
export function timingsOf(raw: unknown): Timings {
  const out: Record<string, number> = {}
  if (!raw || typeof raw !== "object") return out
  for (const key of KEYS) {
    const v = (raw as Record<string, unknown>)[key]
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[key] = v
  }
  return out as Timings
}

const round = (v: number) => Number(v.toPrecision(2))

/**
 * The in-browser timings, estimated from the server's: what the eight
 * evaluations measured in both places (2026-10) show — opening is starting
 * Python and AZURE2 (about 6 s) plus about twice the server's open, and the
 * calculations are about 3× slower.
 */
export function browserEstimate(server: Timings): Timings {
  const out: Record<string, number> = {}
  for (const [key, v] of Object.entries(server)) {
    if (typeof v !== "number") continue
    out[key] = round(key === "open" ? 6 + 2 * v : Math.max(0.1, 3 * v))
  }
  if (server.edit !== undefined) {
    out.data ??= round(0.1 + server.edit)
    out.fine ??= round(0.2 + server.edit)
  }
  return out as Timings
}

/** The typical timings for this build (browser or server), or {} when there are none. */
export function typicalTimings(typical: TypicalTimings | null | undefined, inBrowser: boolean): Timings {
  return typical ? { ...(inBrowser ? typical.browser : typical.server) } : {}
}
