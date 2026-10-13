// Every mock route, family by family. The contract tests check this table
// against the registered Flask blueprints and the frontend's calls.
import { Router } from '../router'
import type { Daq } from '../../sim/state/daq'
import experiment from './experiment'
import digitizer from './digitizer'
import histograms from './histograms'
import current from './current'
import stats from './stats'
import notifications from './notifications'
import next from './next'

type Family = (r: Router, d: Daq) => void

/** Families every page polls: in the worker's first chunk. */
export function buildRouter(d: Daq): Router {
  const r = new Router()
  for (const family of [experiment, stats, digitizer, current, histograms, notifications, next] as Family[]) family(r, d)
  return r
}

/**
 * Families only some pages use (Logbook run pages; ELOG and Grafana), loaded the
 * first time a request needs them — they stay out of the worker's first chunk.
 * Their routes start with these prefixes and no core route does.
 */
export const LAZY_FAMILIES: { prefix: RegExp; load: () => Promise<{ default: Family }> }[] = [
  { prefix: /^\/data\//, load: () => import('./data') },
  { prefix: /^\/(elog|grafana)\//, load: () => import('./elog') },
  { prefix: /^\/(recovery\/|notifications\/(transports|rules|settings|status|watcher))/, load: () => import('./notify-settings') },
]
