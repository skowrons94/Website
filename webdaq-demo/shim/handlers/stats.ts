// routes/stats.py: the Stats page and stats.csv, against a Graphite-like store of simulated metrics.
import type { StatsSampling } from '@webdaq/lib/api'
import { ok, fail, type Router } from '../router'
import type { Daq } from '../../sim/state/daq'

const body = (b: unknown): Record<string, any> => (b && typeof b === 'object' ? b as Record<string, any> : {})
const MIN_MS = 100
const MAX_MS = 600000

export default function stats(r: Router, d: Daq) {
  const S = d.stats
  const sampling = (): StatsSampling => ({
    stats_interval_ms: S.stats_interval_ms, stats_first_interval_ms: S.stats_first_interval_ms,
    min_ms: MIN_MS, max_ms: MAX_MS, active_interval_ms: d.running ? S.stats_interval_ms : null,
  })
  const configInfo = () => ({
    graphite_host: S.graphite_host, graphite_port: S.graphite_port, graphite_prefix: S.graphite_prefix,
    paths_count: S.paths.length, enabled_paths_count: S.paths.filter(p => p.enabled).length,
    collecting: S.collecting, current_run: S.current_run,
  })

  r.get('/stats/graphite_config', () => ok({ graphite_host: S.graphite_host, graphite_port: S.graphite_port, graphite_prefix: S.graphite_prefix }))
  r.post('/stats/graphite_config', req => {
    const b = body(req.body)
    if (b.graphite_prefix === undefined && (!b.graphite_host || !b.graphite_port)) return fail(400, { error: 'Missing graphite_host or graphite_port' })
    if (b.graphite_host && b.graphite_port) { S.graphite_host = String(b.graphite_host); S.graphite_port = Number(b.graphite_port) }
    if (b.graphite_prefix !== undefined && b.graphite_prefix !== null) {
      const p = String(b.graphite_prefix).trim().replace(/^\.+|\.+$/g, '')
      if (p && !/^[A-Za-z0-9_\-]+(\.[A-Za-z0-9_\-]+)*$/.test(p)) return fail(400, { error: `'${b.graphite_prefix}' is not a valid Graphite path.` })
      S.graphite_prefix = p || 'demo.rates'
    }
    return ok({ message: 'Graphite configuration updated', graphite_prefix: S.graphite_prefix })
  })
  r.get('/stats/sampling', () => ok(sampling()))
  r.post('/stats/sampling', req => {
    const b = body(req.body)
    if (b.stats_interval_ms === undefined && b.stats_first_interval_ms === undefined) return fail(400, { error: 'Missing stats_interval_ms or stats_first_interval_ms' })
    const clamp = (v: unknown, name: string): number | string => {
      const n = Math.trunc(Number(v))
      if (!Number.isFinite(n)) return `${name} has to be a whole number of milliseconds.`
      return Math.max(MIN_MS, Math.min(MAX_MS, n))
    }
    for (const [k, v] of Object.entries({ stats_interval_ms: b.stats_interval_ms, stats_first_interval_ms: b.stats_first_interval_ms })) {
      if (v === undefined) continue
      const c = clamp(v, k)
      if (typeof c === 'string') return fail(400, { error: c })
      ;(S as any)[k] = c
    }
    return ok(sampling())
  })
  r.get('/stats/paths', () => ok(S.paths.map(p => ({ ...p }))))
  r.post('/stats/paths', req => {
    const b = body(req.body)
    if (!b.path) return fail(400, { error: 'Missing required field: path' })
    if (S.paths.some(p => p.path === b.path)) return fail(400, { error: 'Failed to add path or path already exists' })
    S.paths.push({ path: String(b.path), alias: String(b.alias || b.path), unit: String(b.unit || ''), enabled: true })
    return ok({ message: 'Path added successfully', path: b.path }, 201)
  })
  r.delete('/stats/paths/<path:path>', (_q, p) => {
    const i = S.paths.findIndex(x => x.path === p.path)
    if (i < 0) return fail(404, { error: 'Path not found' })
    S.paths.splice(i, 1)
    return ok({ message: 'Path removed successfully' })
  })
  r.put('/stats/paths/<path:path>', (req, p) => {
    const b = body(req.body)
    const e = S.paths.find(x => x.path === p.path)
    if (!e) return fail(404, { error: 'Path not found' })
    if (b.alias !== undefined && b.alias !== null) e.alias = String(b.alias)
    if (b.enabled !== undefined && b.enabled !== null) e.enabled = Boolean(b.enabled)
    if (b.unit !== undefined && b.unit !== null) e.unit = String(b.unit)
    return ok({ message: 'Path updated successfully' })
  })
  r.post('/stats/run/<int:run_number>/start', (_q, p) => {
    if (!d.save) return fail(400, { error: 'Cannot start stats collection when save data is disabled' })
    d.startStatsRun(Number(p.run_number))
    return ok({ message: 'Stats collection started', run_number: Number(p.run_number) })
  })
  r.post('/stats/run/stop', () => (d.stopStatsRun() ? ok({ message: 'Stats collection stopped' }) : fail(400, { error: 'Not currently collecting stats' })))
  r.get('/stats/run/status', () => ok(configInfo()))
  r.get('/stats/connection', () => ok({ reachable: true, host: S.graphite_host, port: S.graphite_port, error: '' }))
  r.get('/stats/browse', req => {
    const prefix = String(req.query.prefix ?? '').replace(/^\.+|\.+$/g, '')
    const search = String(req.query.search ?? '').trim()
    const tree = d.metricTree()
    if (search) {
      const nodes = new Map<string, boolean>()
      for (const m of tree) {
        const parts = m.split('.')
        for (let i = 1; i <= Math.min(parts.length, 3); i++) {
          const path = parts.slice(0, i).join('.')
          if (parts[i - 1].includes(search)) nodes.set(path, i === parts.length)
        }
      }
      return ok({ nodes: [...nodes].sort(([a], [b]) => a.localeCompare(b)).map(([path, is_leaf]) => ({ path, is_leaf })), prefix: '' })
    }
    const depth = prefix ? prefix.split('.').length : 0
    const nodes = new Map<string, boolean>()
    for (const m of tree) {
      if (prefix && !m.startsWith(prefix + '.')) continue
      const parts = m.split('.')
      const path = parts.slice(0, depth + 1).join('.')
      nodes.set(path, parts.length === depth + 1)
    }
    return ok({ nodes: [...nodes].sort(([a], [b]) => a.localeCompare(b)).map(([path, is_leaf]) => ({ path, is_leaf })), prefix })
  })
  r.get('/stats/metric/<path:metric>', (req, p) => ok(d.series(p.metric, req.query.from ?? '-10s', req.query.until ?? 'now')))
  r.get('/stats/metric/<path:metric>/last', (req, p) => {
    const s = d.series(p.metric, req.query.from ?? '-10s', 'now').filter(x => x[1] !== null)
    if (!s.length) return ok({ value: null, timestamp: null })
    const [t, v] = s[s.length - 1]
    return ok({ value: v, timestamp: new Date(t).toISOString().replace('Z', '').replace(/\.000$/, '') })
  })
  // The three fixed accelerator metrics (no auth on these upstream either).
  r.get('/stats/terminal_voltage', req => ok(d.series('accelerator.terminal_voltage', req.query.from ?? '-10s', req.query.until ?? 'now')))
  r.get('/stats/extraction_voltage', req => ok(d.series('accelerator.extraction_voltage', req.query.from ?? '-10s', req.query.until ?? 'now')))
  r.get('/stats/column_current', req => ok(d.series('accelerator.upcharge_current', req.query.from ?? '-10s', req.query.until ?? 'now')))
  const legacy = (metric: string, scale = 1) => (req: { query: Record<string, string> }) => {
    const q = req.query
    if (!q.board_id || !q.board_name || !q.channel) return fail(400, { error: 'Missing required parameters: board_id, board_name, or channel' })
    const s = d.series(`ancillary.rates.${q.board_name}.ch_${q.channel}.${metric}`, q.from ?? '-10s', q.until ?? 'now')
    return ok(scale === 1 ? s : s.map(([t, v]) => [t, v === null ? null : v * scale]))
  }
  r.get('/stats/board_rates', legacy('totalRate'))
  r.get('/stats/board_rates_pu', legacy('pileRate'))
  r.get('/stats/board_rates_satu', legacy('satuRate'))
  r.get('/stats/board_rates_lost', legacy('lostRate'))
  r.get('/stats/board_rates_dt', legacy('deadTime', 100))
}
