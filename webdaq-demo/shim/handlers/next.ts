// The two Next.js route handlers a static export cannot have
// (frontend/src/app/api/server-control/route.ts and app/api/cache/route.ts).
import { ok, fail, type Router } from '../router'
import type { Daq } from '../../sim/state/daq'

const DEFAULTS: Record<string, Record<string, unknown>> = {
  'visualization-channels': { selectedBoardsChannelsPSD: [], selectedBoardsChannelsWaveform: [] },
  'wave-config': { selectedWaveform: {} },
  'working-directories': { directories: [] },
}
const MOVED = new Set(['rois', 'settings', 'histograms', 'zoom-ranges', 'zoom-range', 'histogram', 'all'])
const NOT_IN_DEMO = 'The DAQ server cannot be started or stopped from the in-browser demo: it is simulated in this page.'

export default function next(r: Router, d: Daq) {
  const moved = (t: string) => fail(410, { success: false, error: `'${t}' now lives on the DAQ server under /histograms/config. Use the helpers in lib/histogram-config.ts.` })
  r.get('/api/server-control', req => {
    const base = { running: d.server.running, currentDirectory: 'in-browser demo', testMode: true }
    if (req.query.logs === '1') {
      return ok({ ...base, log: '[demo] WebDAQ server simulated in a Web Worker inside this page (test mode).\n[demo] No hardware, no network.\n', logSize: 96, truncated: false })
    }
    return ok(base)
  })
  r.post('/api/server-control', req => {
    const action = (req.body as Record<string, unknown> | null)?.action
    if (action === 'start') return ok({ success: true })
    if (action === 'stop') return fail(409, { success: false, error: NOT_IN_DEMO })
    return fail(400, { success: false, error: 'Invalid action' })
  })
  r.get('/api/cache', req => {
    const t = req.query.type ?? ''
    if (MOVED.has(t)) return moved(t)
    if (!(t in DEFAULTS)) return fail(400, { success: false, error: 'Invalid data type' })
    return ok({ success: true, data: { ...DEFAULTS[t], ...((d.cache[t] as object) ?? {}) } })
  })
  r.post('/api/cache', req => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const t = String(b.type ?? '')
    if (!b.type || !b.data) return fail(400, { success: false, error: 'Missing type or data' })
    if (MOVED.has(t)) return moved(t)
    if (!(t in DEFAULTS)) return fail(400, { success: false, error: 'Invalid data type' })
    d.cache[t] = b.data
    return ok({ success: true })
  })
}
