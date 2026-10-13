// Every mock route, family by family. The contract tests check this table
// against the registered Flask blueprints and the frontend's calls.
import { Router } from '../router'
import type { Daq } from '../../sim/state/daq'
import experiment from './experiment'
import digitizer from './digitizer'
import histograms from './histograms'
import current from './current'
import stats from './stats'
import data from './data'
import notifications from './notifications'
import elogGrafana from './elog'
import next from './next'

export function buildRouter(d: Daq): Router {
  const r = new Router()
  for (const family of [experiment, stats, digitizer, current, histograms, data, elogGrafana, notifications, next]) family(r, d)
  return r
}
