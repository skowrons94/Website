// routes/notifications.py, the part every page polls: the alert history (the bell, the activity log).
// Rules, transports, the watcher and recovery are in notify-settings.ts, loaded when a page asks.
import type { AlertEventSummary } from '@webdaq/lib/api'
import { ok, fail, type Router } from '../router'
import type { Daq } from '../../sim/state/daq'

const body = (b: unknown): Record<string, any> => (b && typeof b === 'object' ? b as Record<string, any> : {})

export default function notifications(r: Router, d: Daq) {
  const summary = (): AlertEventSummary => {
    const unseen = d.events.filter(e => !e.seen)
    return {
      unseen: unseen.length, total: d.events.length, latest: d.events[0] ? { ...d.events[0] } : null,
      undelivered: unseen.filter(e => Object.keys(e.deliveries).length && !Object.values(e.deliveries).some(Boolean)).length,
    }
  }

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
}
