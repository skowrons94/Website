/**
 * Typical timings (seconds) of each evaluation, shipped with the site: the
 * progress timer's estimate before the evaluation's own arrive (the server's
 * /initial, measured by `python -m app.warm`), and the only ones the
 * in-browser build has (its engine is a WebAssembly build, 2–6× slower than
 * the server, and runs one Web Worker per model: browser/README.md).
 *
 * Keys as `Timings` (lib/api.ts): open (until the model answers: on the
 * browser build, starting Python and AZURE2 too), prepare_* (the one-off
 * building of each derived model), edit (an edit once prepared: data and
 * smooth curve), extrap_edit (the extrapolations after an edit).
 *
 * Measured on a 4-core machine (server: AZURE2_PREPARE_THREADS=4; browser:
 * Chromium, localhost, so without the download), 2026-10.
 */

import type { Timings } from "./api"

export const TYPICAL_TIMINGS: Record<string, { server: Timings; browser: Timings }> = {
  "13N": {
    server: { open: 0.4, prepare_data: 0.02, prepare_fine: 0.6, prepare_extrap: 0.5, edit: 0.12, extrap_edit: 0.1 },
    browser: { open: 6.5, prepare_data: 0.1, prepare_fine: 4, prepare_extrap: 4, edit: 0.3, extrap_edit: 0.3, data: 0.2, fine: 0.45 },
  },
  "14N": {
    server: { open: 0.5, prepare_data: 0.05, prepare_fine: 1.7, prepare_extrap: 0.7, edit: 0.3, extrap_edit: 0.2 },
    browser: { open: 6, prepare_data: 0.2, prepare_fine: 6, prepare_extrap: 3, edit: 1, extrap_edit: 1, data: 0.3, fine: 0.5 },
  },
  "17F": {
    server: { open: 0.6, prepare_data: 0.3, prepare_fine: 0.8, prepare_extrap: 0.6, edit: 0.05, extrap_edit: 0.05 },
    browser: { open: 6, prepare_data: 1, prepare_fine: 3, prepare_extrap: 2, edit: 0.3, extrap_edit: 0.3, data: 0.2, fine: 0.3 },
  },
  "21Na": {
    server: { open: 0.5, prepare_data: 0.03, prepare_fine: 0.8, prepare_extrap: 0.5, edit: 0.25, extrap_edit: 0.12 },
    browser: { open: 6, prepare_data: 0.2, prepare_fine: 3, prepare_extrap: 2, edit: 1, extrap_edit: 0.6, data: 0.3, fine: 0.5 },
  },
  "23Na": {
    server: { open: 0.4, prepare_data: 0.03, prepare_fine: 0.4, prepare_extrap: 0.4, edit: 0.05, extrap_edit: 0.1 },
    browser: { open: 6, prepare_data: 0.2, prepare_fine: 2, prepare_extrap: 2, edit: 0.3, extrap_edit: 0.4, data: 0.2, fine: 0.3 },
  },
  "24Mg": {
    server: { open: 1.5, prepare_data: 2.7, prepare_fine: 2.4, prepare_extrap: 3.6, edit: 2.1, extrap_edit: 3.9 },
    browser: { open: 10, prepare_data: 2, prepare_fine: 8, prepare_extrap: 12, edit: 0.7, extrap_edit: 2.5, data: 0.3, fine: 1.2 },
  },
  "7Be": {
    server: { open: 3, prepare_data: 3.9, prepare_fine: 14, prepare_extrap: 9.3, edit: 1.8, extrap_edit: 1.8, grid: 4.2 },
    browser: { open: 11, prepare_data: 4, prepare_fine: 27, prepare_extrap: 27, edit: 0.6, extrap_edit: 1.7, grid: 15, data: 0.5, fine: 1.3 },
  },
  "8Be": {
    server: { open: 0.5, prepare_data: 0.01, prepare_fine: 0.7, prepare_extrap: 0.4, edit: 0.03, extrap_edit: 0.01 },
    browser: { open: 6, prepare_data: 0.1, prepare_fine: 2, prepare_extrap: 1, edit: 0.2, extrap_edit: 0.1, data: 0.1, fine: 0.2 },
  },
}

/** The shipped typical timings of `id` for this build (browser or server), or {} for an evaluation not listed. */
export function typicalTimings(id: string, inBrowser: boolean): Timings {
  const entry = TYPICAL_TIMINGS[id]
  return entry ? { ...(inBrowser ? entry.browser : entry.server) } : {}
}
