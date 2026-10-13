// routes/current.py: a simulated TetrAMM-like beam-current module (4 channels, 10 Hz).
import type { LiveCurrentHistory } from '@webdaq/lib/api'
import { ok, fail, type Router } from '../router'
import type { Daq } from '../../sim/state/daq'

const body = (b: unknown): Record<string, any> => (b && typeof b === 'object' ? b as Record<string, any> : {})
const MAX_HISTORY_BINS = 2000
const MAX_RAW = 20000

export default function current(r: Router, d: Daq) {
  const C = d.current
  const single = () => C.module_type === 'rbd9103'
  const read = (ch: number) => {
    const v = C.latest[Math.min(ch, 3)] ?? 0
    return v < 1e-9 ? 0 : v
  }

  r.get('/current/set_ip_port/<ip>/<port>', (_q, p) => {
    C.ip = p.ip
    C.port = p.port
    return ok({ message: 'IP and port set' })
  })
  r.get('/current/get_ip', () => ok(C.ip))
  r.get('/current/get_port', () => ok(C.port))
  r.get('/current/connect', () => { C.connected = true; C.acquiring = true; return ok({ message: 'Connected' }) })
  r.get('/current/is_connected', () => ok(C.connected))
  r.get('/current/start/<run_number>', (_q, p) => {
    if (!C.connected) return ok({ message: 'TetrAMM not connected' })
    const n = parseInt(p.run_number, 10)
    if (!Number.isFinite(n)) return fail(500, { message: 'Internal Server Error' })
    return ok(d.startCurrentRecording(n))
  })
  r.post('/current/stop', () => ok(d.stopCurrentRecording()))
  r.get('/current/set/<settings>/<value>', (_q, p) => {
    if (!C.connected) return ok({ message: 'TetrAMM not connected' })
    C.misc[p.settings] = p.value
    return ok({ message: 'Setting set' })
  })
  r.get('/current/get/<settings>', (_q, p) => {
    if (!C.connected) return ok({ message: 'TetrAMM not connected' })
    return ok(C.misc[p.settings] ?? 0)
  })
  r.post('/current/reset', () => {
    C.recording = false
    C.connected = true
    C.acquiring = true
    return ok({ message: 'Device reset' })
  })
  r.get('/current/data', () => ok(read(single() ? 0 : C.charge_channel)))
  r.get('/current/collimator/1', () => ok(single() ? 0 : read(1)))
  r.get('/current/collimator/2', () => ok(single() ? 0 : read(2)))
  r.get('/current/data_array', () => {
    // The module's last 100 samples, recomputed (the beam is a pure function of demo time).
    const out: number[] = []
    const t1 = Math.floor(d.simT * 10) / 10
    for (let i = 99; i >= 0; i--) out.push(d.physics.beamSample(Math.max(0, t1 - i * 0.1))[0])
    return ok(out)
  })

  r.get('/current/history', req => {
    const q = req.query
    const num = (s: string | undefined) => (s === undefined ? undefined : Number(s))
    const maxPoints = Math.max(100, Math.min(20000, num(q.max_points) ?? 20000))
    const binsArg = num(q.bins)
    const sinceArg = num(q.since)
    if ([maxPoints, binsArg, sinceArg, num(q.seconds)].some(v => v !== undefined && !Number.isFinite(v))) {
      return fail(400, { message: 'Invalid history range' })
    }
    const bins = binsArg === undefined ? null : Math.max(10, Math.min(MAX_HISTORY_BINS, Math.trunc(binsArg)))
    const nowS = d.nowMs() / 1000
    const since = sinceArg ?? nowS - Math.max(5, Math.min(3600, num(q.seconds) ?? 30))
    // Demo time of the oldest sample the module can still have: it starts with the session.
    const tFrom = Math.max(0, d.simT - (nowS - since))
    const ch = Math.min(C.charge_channel, 3)
    const n = Math.max(0, Math.floor((d.simT - tFrom) / 0.1))
    const cap = bins ? MAX_RAW : maxPoints
    const stride = Math.max(1, Math.ceil(n / cap))
    let samples: number[][] = []
    for (let i = n; i >= 0; i -= stride) {
      const t = d.simT - i * 0.1
      if (t < 0) continue
      samples.push([d.wallAt(t) / 1000, Math.max(0, d.physics.beamSample(Math.round(t * 10) / 10)[ch])])
    }
    let binWidth: number | null = null
    if (bins && samples.length) [samples, binWidth] = binSamples(samples, samples[0][0], samples[samples.length - 1][0], bins)
    const out: LiveCurrentHistory = {
      samples, sampled_at: nowS, sample_interval_s: 0.1, channel: ch, binned: Boolean(bins),
      bin_width_s: binWidth, source: 'controller-buffer',
    }
    return ok(out)
  })

  r.get('/current/accumulated', () => ok(C.accumulated))
  r.get('/current/total_accumulated', () => ok(C.total))
  r.post('/current/reset_total_accumulated', () => { C.total = 0; return ok({ message: 'Total accumulated reset' }) })
  r.get('/current/module_type', () => ok({ module_type: C.module_type }))
  r.post('/current/module_type', req => {
    const t = body(req.body).module_type
    if (!['tetramm', 'rbd9103', 'graphite'].includes(t)) return fail(400, { error: "Invalid module type. Must be 'tetramm', 'rbd9103' or 'graphite'" })
    if (t === C.module_type) return ok({ message: 'Module type already set' })
    C.module_type = t
    C.recording = false
    if (t === 'graphite') return ok({ message: 'Switched to the monitored Graphite metric' })
    return ok({ message: `Switched to simulated ${t}` })
  })
  r.get('/current/module_settings', () => {
    if (C.module_type === 'graphite') {
      return ok({ module_type: 'graphite', metric: C.graphite_metric, scale: C.graphite_metric_scale, poll_interval_s: C.graphite_poll_interval_s, settings: {} })
    }
    if (C.module_type === 'tetramm') {
      return ok({ module_type: 'tetramm', ip: C.ip, port: C.port, charge_channel: C.charge_channel, settings: { ...C.deviceSettings } })
    }
    return ok({ module_type: 'rbd9103', port: C.rbd_port, baudrate: C.rbd_baudrate, high_speed: C.rbd_high_speed, settings: {} })
  })
  r.post('/current/module_settings', req => {
    const b = body(req.body)
    if (C.module_type === 'graphite') {
      if ('metric' in b) C.graphite_metric = String(b.metric ?? '').trim()
      if ('scale' in b) C.graphite_metric_scale = Number(b.scale)
      if ('poll_interval_s' in b) C.graphite_poll_interval_s = Math.max(0.2, Number(b.poll_interval_s))
    } else if (C.module_type === 'tetramm') {
      if ('ip' in b) C.ip = b.ip
      if ('port' in b) C.port = Number(b.port)
      if ('charge_channel' in b) C.charge_channel = Math.max(0, Math.min(3, Math.trunc(Number(b.charge_channel)) || 0))
      if (b.device_settings && typeof b.device_settings === 'object') {
        for (const [k, v] of Object.entries(b.device_settings)) if (k in C.deviceSettings) C.deviceSettings[k] = v
      }
    } else {
      if ('port' in b) C.rbd_port = String(b.port)
      if ('baudrate' in b) C.rbd_baudrate = Number(b.baudrate)
      if ('high_speed' in b) C.rbd_high_speed = Boolean(b.high_speed)
    }
    return ok({ message: 'Settings updated successfully' })
  })
  r.get('/current/graphite_config', () => ok({ graphite_host: C.graphite_host, graphite_port: C.graphite_port }))
  r.post('/current/graphite_config', req => {
    const b = body(req.body)
    if (!b.graphite_host || !b.graphite_port) return fail(400, { error: 'Missing graphite_host or graphite_port' })
    C.graphite_host = String(b.graphite_host)
    C.graphite_port = Number(b.graphite_port)
    return ok({ message: 'Graphite configuration updated' })
  })
  r.get('/current/serial_ports', () => ok({ ports: [] }))
  r.get('/current/status', () => {
    const s: Record<string, unknown> = {
      module_type: C.module_type, running: C.recording, acquiring: C.acquiring, thread_alive: C.acquiring,
      connected: C.connected, settings: C.module_type === 'tetramm' ? { ...C.deviceSettings } : {},
    }
    if (C.module_type === 'graphite') { s.metric = C.graphite_metric; s.latest_measurement = read(0) }
    if (C.module_type === 'rbd9103') { s.port_exists = true; s.port = C.rbd_port }
    return ok(s)
  })
}

/** current._bin_samples: fixed-width bins of [time, mean, min, max], empty bins dropped. */
export function binSamples(samples: number[][], start: number, end: number, bins: number): [number[][], number | null] {
  const span = end - start
  if (span <= 0 || bins <= 0) return [samples.map(([t, v]) => [t, v, v, v]), null]
  const width = span / bins
  const acc = Array.from({ length: bins }, () => ({ n: 0, ts: 0, vs: 0, lo: Infinity, hi: -Infinity }))
  for (const [t, v] of samples) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((t - start) / width)))
    const a = acc[i]
    a.n++; a.ts += t; a.vs += v; a.lo = Math.min(a.lo, v); a.hi = Math.max(a.hi, v)
  }
  return [acc.filter(a => a.n).map(a => [a.ts / a.n, a.vs / a.n, a.lo, a.hi]), width]
}
