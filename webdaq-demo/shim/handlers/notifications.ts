// routes/notifications.py: transports (never send), rules evaluated locally, history, recovery.
import type { AlertRule, AlertRuleType, AlertStatus, AlertEventSummary, RecoveryAction } from '@webdaq/lib/api'
import { ok, fail, type Router } from '../router'
import type { Daq, AlertRuleState } from '../../sim/state/daq'
import { NOTHING_SENT, mask, telegramSettings } from './experiment'

const body = (b: unknown): Record<string, any> => (b && typeof b === 'object' ? b as Record<string, any> : {})

const RULE_DEFAULTS: Record<AlertRule['type'], { name: string; description: string; params: Record<string, string | number | boolean> }> = {
  board_failure: { name: 'Board failure', description: 'A board sets its FAIL flag during a run.', params: {} },
  stalled_buffers: { name: 'Board stopped producing data', description: 'A board reads no new data blocks during a run, without necessarily raising the FAIL flag.', params: { seconds: 60 } },
  beam_current: { name: 'Beam current', description: 'The beam current read by the current monitor leaves its range.', params: { comparison: 'below', threshold: 1.0, seconds: 60, during_run_only: true } },
  graphite_metric: { name: 'Graphite metric', description: 'A monitored value (terminal voltage, pressure, …) leaves its range.', params: { metric: '', comparison: 'below', threshold: 0.0, seconds: 60, poll_seconds: 30, during_run_only: false } },
}
const TRANSPORTS = ['telegram', 'zulip']

class ConfigError extends Error {}

function normalise(rule: Record<string, any>, id: string): AlertRuleState {
  const kind = String(rule.type ?? '').trim() as AlertRule['type']
  if (!(kind in RULE_DEFAULTS)) throw new ConfigError(`Unknown alert type '${kind}'. Known types: ${Object.keys(RULE_DEFAULTS).join(', ')}.`)
  const def = RULE_DEFAULTS[kind]
  let transports = rule.transports ?? ['telegram']
  if (typeof transports === 'string') transports = [transports]
  const unknown = (transports as string[]).filter(t => !TRANSPORTS.includes(t))
  if (unknown.length) throw new ConfigError(`Unknown destination '${unknown[0]}'. Known: ${TRANSPORTS.join(', ')}.`)
  const given = rule.params ?? {}
  const bad = Object.keys(given).filter(k => !(k in def.params))
  if (bad.length) throw new ConfigError(`${def.name} has no setting called '${bad[0]}'. It takes: ${Object.keys(def.params).sort().join(', ') || 'no settings'}.`)
  const params: Record<string, string | number | boolean> = { ...def.params, ...given }
  if ('comparison' in params && !['below', 'above'].includes(String(params.comparison))) throw new ConfigError('Comparison must be one of below, above.')
  if ('threshold' in params) {
    const t = Number(params.threshold)
    if (!Number.isFinite(t)) throw new ConfigError('The threshold has to be a number.')
    params.threshold = t
  }
  for (const [k, min] of [['seconds', 0], ['poll_seconds', 5]] as const) {
    if (k in params) {
      const v = Math.trunc(Number(params[k]))
      if (!Number.isFinite(v)) throw new ConfigError(`'${k}' has to be a whole number of seconds.`)
      params[k] = Math.max(min, v)
    }
  }
  if ('during_run_only' in params) params.during_run_only = Boolean(params.during_run_only)
  if (kind === 'graphite_metric') {
    params.metric = String(params.metric ?? '').trim()
    if (!params.metric) throw new ConfigError('A Graphite rule needs a metric path.')
  }
  return {
    id, type: kind, name: String(rule.name || def.name).trim(), enabled: rule.enabled === undefined ? true : Boolean(rule.enabled),
    transports: [...new Set(transports as string[])], params,
  }
}

export default function notifications(r: Router, d: Daq) {
  const zulip = () => ({
    enabled: d.zulip.enabled, site: d.zulip.site, bot_email: d.zulip.bot_email, api_key: mask(d.zulip.api_key),
    stream: d.zulip.stream, topic: d.zulip.topic, configured: Boolean(d.zulip.site && d.zulip.bot_email && d.zulip.api_key && d.zulip.stream),
  })
  const ready = () => ({ telegram: false, zulip: false })   // the demo never delivers
  const status = (): AlertStatus => ({
    watching: d.watching, notify_recovery: d.notifyRecovery, transports_ready: ready(), rejected_rules: [], load_error: '',
    rules: d.rules.map(rule => {
      const subjects: AlertStatus['rules'][number]['subjects'] = {}
      for (const [k, s] of Object.entries(d.alertState)) {
        if (k.startsWith(rule.id + ':')) subjects[k.slice(rule.id.length + 1)] = { latched: s.latched, value: s.value, last_fired: s.last_fired }
      }
      return {
        id: rule.id, alerting: Object.values(subjects).some(s => s.latched), unmeasured: false,
        unmeasured_for: null, deliverable: false, transports_not_ready: [...rule.transports], subjects,
      }
    }),
  })
  const summary = (): AlertEventSummary => {
    const unseen = d.events.filter(e => !e.seen)
    return {
      unseen: unseen.length, total: d.events.length, latest: d.events[0] ? { ...d.events[0] } : null,
      undelivered: unseen.filter(e => Object.keys(e.deliveries).length && !Object.values(e.deliveries).some(Boolean)).length,
    }
  }

  r.get('/notifications/transports', () => ok({ telegram: telegramSettings(d), zulip: zulip() }))
  r.post('/notifications/transports/telegram', req => {
    const b = body(req.body)
    if (b.enabled !== undefined && b.enabled !== null) d.telegram.enabled = Boolean(b.enabled)
    if (b.clear_bot_token) d.telegram.bot_token = ''
    else if (b.bot_token) d.telegram.bot_token = String(b.bot_token)
    if (b.chat_id !== undefined && b.chat_id !== null) d.telegram.chat_id = String(b.chat_id)
    return ok({ message: 'Telegram settings updated', settings: telegramSettings(d) })
  })
  r.post('/notifications/transports/zulip', req => {
    const b = body(req.body)
    if (b.enabled !== undefined && b.enabled !== null) d.zulip.enabled = Boolean(b.enabled)
    for (const k of ['site', 'bot_email', 'stream', 'topic'] as const) if (b[k] !== undefined && b[k] !== null) d.zulip[k] = String(b[k])
    if (b.clear_api_key) d.zulip.api_key = ''
    else if (b.api_key) d.zulip.api_key = String(b.api_key)
    return ok({ message: 'Zulip settings updated', settings: zulip() })
  })
  r.post('/notifications/transports/<transport>/test', (_q, p) => {
    if (p.transport === 'telegram' || p.transport === 'zulip') return ok(NOTHING_SENT)
    return fail(400, { success: false, message: `Unknown transport '${p.transport}'` })
  })
  r.get('/notifications/rules', () => ok({
    rules: d.rules.map(x => ({ ...x, params: { ...x.params } })) as AlertRule[],
    types: Object.entries(RULE_DEFAULTS).map(([type, v]) => ({ type, name: v.name, description: v.description, params: { ...v.params } })) as AlertRuleType[],
    status: status(),
  }))
  const ruleBody = (b: unknown): { error: ReturnType<typeof fail> } | { rule: Record<string, any> } => {
    if (b === null || b === undefined) return { rule: {} }
    if (typeof b !== 'object' || Array.isArray(b)) return { error: fail(400, { error: 'Expected the rule as a JSON object' }) }
    const x = b as Record<string, any>
    if (x.params != null && (typeof x.params !== 'object' || Array.isArray(x.params))) return { error: fail(400, { error: "'params' has to be a JSON object" }) }
    if (x.transports != null && !Array.isArray(x.transports) && typeof x.transports !== 'string') return { error: fail(400, { error: "'transports' has to be a list" }) }
    return { rule: x }
  }
  r.post('/notifications/rules', req => {
    const b = ruleBody(req.body)
    if ('error' in b) return b.error
    try {
      const rule = normalise(b.rule, d.newId('r'))
      d.rules.push(rule)
      return ok({ message: 'Alert rule added', rule: { ...rule } }, 201)
    } catch (e) {
      if (e instanceof ConfigError) return fail(400, { error: e.message })
      throw e
    }
  })
  r.put('/notifications/rules/<rule_id>', (req, p) => {
    const b = ruleBody(req.body)
    if ('error' in b) return b.error
    const ch = b.rule
    const i = d.rules.findIndex(x => x.id === p.rule_id)
    if (i < 0) return fail(400, { error: `No alert rule with id '${p.rule_id}'.` })
    try {
      const merged: Record<string, any> = { ...d.rules[i] }
      for (const [k, v] of Object.entries(ch)) if (k !== 'id') merged[k] = v
      if ('params' in ch) merged.params = { ...d.rules[i].params, ...(ch.params ?? {}) }
      const rule = normalise(merged, p.rule_id)
      d.rules[i] = rule
      for (const k of Object.keys(d.alertState)) if (k.startsWith(p.rule_id + ':')) delete d.alertState[k]
      return ok({ message: 'Alert rule updated', rule: { ...rule } })
    } catch (e) {
      if (e instanceof ConfigError) return fail(400, { error: e.message })
      throw e
    }
  })
  r.delete('/notifications/rules/<rule_id>', (_q, p) => {
    const before = d.rules.length
    d.rules = d.rules.filter(x => x.id !== p.rule_id)
    if (d.rules.length === before) return fail(404, { error: `No alert rule with id '${p.rule_id}'.` })
    for (const k of Object.keys(d.alertState)) if (k.startsWith(p.rule_id + ':')) delete d.alertState[k]
    return ok({ message: 'Alert rule deleted' })
  })
  r.post('/notifications/settings', req => {
    const b = body(req.body)
    if ('notify_recovery' in b) d.notifyRecovery = Boolean(b.notify_recovery)
    return ok({ message: 'Notification settings updated', status: status() })
  })
  r.get('/notifications/status', () => ok(status()))
  r.get('/notifications/events', req => {
    const limit = parseInt(req.query.limit ?? '100', 10)
    if (!Number.isFinite(limit)) return fail(400, { error: 'limit has to be a number' })
    const kind = req.query.kind ?? ''
    const unseenOnly = ['1', 'true', 'yes'].includes(req.query.unseen ?? '')
    const events = d.events.filter(e => (!kind || e.kind === kind) && (!unseenOnly || !e.seen)).slice(0, Math.max(1, Math.min(limit, 500)))
    return ok({ events: events.map(e => ({ ...e })), summary: summary() })
  })
  r.get('/notifications/events/summary', () => ok(summary()))
  r.post('/notifications/events/seen', req => {
    const ids = body(req.body).ids
    if (ids !== undefined && (!Array.isArray(ids) || !ids.every((i: unknown) => typeof i === 'string'))) return fail(400, { error: 'ids has to be a list of event ids' })
    let marked = 0
    for (const e of d.events) if (!e.seen && (!ids || ids.includes(e.id))) { e.seen = true; marked++ }
    return ok({ marked, summary: summary() })
  })
  r.delete('/notifications/events', () => {
    const removed = d.events.length
    d.events = []
    return ok({ removed })
  })
  r.post('/notifications/watcher', req => {
    const action = String(body(req.body).action ?? 'start').toLowerCase()
    if (action !== 'start' && action !== 'stop') return fail(400, { error: "action has to be 'start' or 'stop'" })
    d.watching = action === 'start'
    return ok({ message: `Alert watcher ${action}ed`, status: status() })
  })

  // ── services/recovery.py ──
  const actions = (): RecoveryAction[] => {
    const running = d.running
    const specs: [string, string, string, boolean, boolean, string][] = [
      ['boards', 'Reopen the boards', 'Close and reopen every digitizer connection. Use after a link glitch or when a board reads as disconnected.', false,
        d.boards.length > 0, d.boards.length ? `${d.boards.length} board${d.boards.length > 1 ? 's' : ''} connected.` : 'No boards configured.'],
      ['acquisition', 'Reset the acquisition', 'Stop whatever the acquisition is doing and bring the boards back to idle. Use after a failed or wedged run.', false,
        !running, running ? 'A run is in progress.' : 'Idle.'],
      ['current', 'Reconnect the current monitor', 'Re-open the beam-current monitor. Use when the current reads as disconnected or stops updating.', true,
        d.current.connected, d.current.connected ? 'Connected (simulated module).' : 'Disconnected.'],
      ['stats', 'Restart the statistics', 'Start writing stats.csv for the current run again. Use when the metrics stopped being recorded mid-run.', true,
        !running || d.stats.collecting || !d.save, d.stats.collecting ? `Recording run ${d.stats.current_run}.` : 'Not recording.'],
      ['graphite', 'Re-check Graphite', 'Test the Graphite server and clear the "unavailable" state that an outage leaves behind.', true,
        true, 'The simulated metric store answers.'],
    ]
    return specs.map(([name, label, description, whileRunning, okState, detail]) => ({
      name, label, description, ok: okState, detail,
      enabled: whileRunning || !running, blocked_reason: whileRunning || !running ? '' : 'Not while a run is in progress.',
    }))
  }
  r.get('/recovery/actions', () => ok({ actions: actions() }))
  r.post('/recovery/actions/<name>', (_q, p) => {
    const a = actions().find(x => x.name === p.name)
    if (!a) return fail(400, { success: false, message: `Unknown recovery action '${p.name}'.` })
    if (!a.enabled) return fail(400, { success: false, message: `'${a.label}' is not available while a run is in progress.` })
    let message = `${a.label}: done.`
    if (p.name === 'acquisition') { d.resetAcquisition(); message = 'The acquisition is idle.' }
    if (p.name === 'current') { d.current.connected = true; d.current.acquiring = true; message = 'The current monitor is reading again.' }
    if (p.name === 'stats' && d.running && d.save) { d.startStatsRun(d.runNumber); message = `Recording stats.csv for run ${d.runNumber} again.` }
    if (p.name === 'boards') message = d.boards.length ? 'All boards reopened.' : 'No boards configured.'
    if (p.name === 'graphite') message = 'The metric store answers.'
    d.logEvent({ kind: 'info', title: `Recovery: ${a.label}`, lines: [message], rule_id: '', rule_type: 'recovery', subject: p.name })
    return ok({ success: true, message })
  })
}
