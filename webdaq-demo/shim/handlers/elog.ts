// routes/elog.py and routes/grafana.py: neither server exists in the demo.
// Settings are kept; anything that would reach the server explains why it cannot.
import type { ElogSettings, GrafanaSettings } from '@webdaq/lib/api'
import { ok, fail, type Router } from '../router'
import type { Daq } from '../../sim/state/daq'
import { mask } from './experiment'

const body = (b: unknown): Record<string, any> => (b && typeof b === 'object' ? b as Record<string, any> : {})

export default function elogGrafana(r: Router, d: Daq) {
  const E = d.elog
  const noElog = () => (E.url
    ? fail(502, { message: `Could not open the ELOG logbook: ${E.url} is not reachable from the in-browser demo — nothing leaves your browser.` })
    : fail(502, { message: 'No ELOG logbook is configured. Set its URL in Settings → ELOG. (The demo has no ELOG server.)' }))
  const elogSettings = (): ElogSettings => ({
    enabled: E.enabled, url: E.url, user: E.user, password: mask(E.password),
    default_attributes: { ...E.default_attributes }, configured: Boolean(E.url), available: false,
  })

  r.get('/elog/settings', () => ok({ ...elogSettings(), default_author: 'demo' }))
  r.post('/elog/settings', req => {
    const b = body(req.body)
    if (b.enabled !== undefined && b.enabled !== null) E.enabled = Boolean(b.enabled)
    if (b.url !== undefined && b.url !== null) E.url = String(b.url).trim()
    if (b.user !== undefined && b.user !== null) E.user = String(b.user)
    if (b.password) E.password = String(b.password)
    if (b.default_attributes && typeof b.default_attributes === 'object') E.default_attributes = { ...b.default_attributes }
    return ok({ message: 'ELOG settings updated', settings: elogSettings() })
  })
  r.post('/elog/test', () => ok(E.url
    ? { success: false, message: 'The in-browser demo cannot reach an ELOG server: nothing leaves your browser.' }
    : { success: false, message: 'No ELOG URL configured.' }))
  r.get('/elog/entries', req => {
    const limit = Number(req.query.limit ?? 20), offset = Number(req.query.offset ?? 0)
    if (!Number.isFinite(limit) || !Number.isFinite(offset)) return fail(400, { message: 'limit and offset must be numbers' })
    return noElog()
  })
  r.get('/elog/entries/<int:msg_id>', () => noElog())
  r.post('/elog/entries', req => {
    const b = body(req.body)
    if (!String(b.text ?? '').trim()) return fail(400, { message: 'The entry is empty.' })
    return noElog()
  })
  r.get('/elog/attributes', () => noElog())
  r.get('/elog/fields', () => noElog())
  r.get('/elog/run_draft/<int:run_number>', (_q, p) => {
    const run = d.runs.find(x => x.run_number === Number(p.run_number))
    if (!run) return fail(404, { message: `Run ${p.run_number} not found` })
    const lines = [
      `Run ${run.run_number} — SIMULATED (WebDAQ in-browser demo, not a measurement)`,
      '',
      `Start: ${run.start_time ?? '—'}`,
      `Stop: ${run.end_time ?? 'still running'}`,
      `Run type: ${run.run_type ?? '—'}`,
      `Target: ${run.target_name ?? '—'}`,
      `Terminal voltage: ${run.terminal_voltage ?? '—'} kV`,
      `Accumulated charge: ${run.accumulated_charge !== null ? run.accumulated_charge.toFixed(3) + ' µC' : '—'}`,
      `Detectors: ${run.demo.scenario.detectors}, source: ${run.demo.scenario.source}, distance ${run.demo.scenario.distance_cm} cm`,
      `Flag: ${run.flag}`,
      ...(run.notes ? ['', 'Notes:', run.notes] : []),
    ]
    return ok({
      run_number: run.run_number, text: lines.join('\n'), attributes: { Author: 'demo' },
      sources: { database: true, directory: true, metadata: true, current: run.demo.current, stats: Boolean(run.demo.stats), rois: Boolean(run.demo.roi) },
    })
  })
  r.get('/elog/runs', req => {
    const n = parseInt(req.query.limit ?? '50', 10)
    const limit = Number.isFinite(n) ? Math.max(1, Math.min(n, 500)) : 50
    return ok({
      runs: [...d.runs].sort((a, b) => b.run_number - a.run_number).slice(0, limit).map(x => ({
        run_number: x.run_number, start_time: x.start_time, end_time: x.end_time, run_type: x.run_type,
        target_name: x.target_name, accumulated_charge: x.accumulated_charge, flag: x.flag, complete: x.end_time !== null,
      })),
    })
  })
  r.get('/elog/attachment', () => noElog())

  // ── grafana.py ──
  const G = d.grafana
  const grafanaSettings = (): GrafanaSettings => ({ url: G.url, api_key: mask(G.api_key), configured: Boolean(G.url) })
  const noGrafana = () => (G.url
    ? fail(502, { error: `Grafana at ${G.url} is unreachable: the in-browser demo does not leave your browser.` })
    : fail(503, { error: 'No Grafana URL configured. Set it in Settings → Grafana. (Grafana is not connected in the demo.)' }))
  r.get('/grafana/settings', () => ok(grafanaSettings()))
  r.post('/grafana/settings', req => {
    const b = body(req.body)
    if (b.url !== undefined && b.url !== null) {
      let u = String(b.url).trim().replace(/\/+$/, '')
      if (u && !/^https?:\/\//.test(u)) u = 'http://' + u
      G.url = u
    }
    if (b.clear_api_key) G.api_key = ''
    else if (b.api_key) G.api_key = String(b.api_key)
    return ok({ message: 'Grafana settings updated', settings: grafanaSettings() })
  })
  r.post('/grafana/test', () => {
    const res = noGrafana()
    return ok({ success: false, message: (res.data as { error: string }).error })
  })
  r.get('/grafana/alert-rules', () => noGrafana())
  r.get('/grafana/alert-rules/<uid>', () => noGrafana())
  r.put('/grafana/alert-rules/<uid>', req => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return fail(400, { error: 'Expected the alert rule as a JSON object' })
    return noGrafana()
  })
}
