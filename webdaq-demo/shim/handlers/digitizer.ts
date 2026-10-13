// routes/digitizer.py and routes/calib.py, against the simulated DAQ.
import type { ApplySettingResult, ScanStatus } from '@webdaq/lib/api'
import { ok, fail, type Router } from '../router'
import type { Daq } from '../../sim/state/daq'
import { isOnlineSafe, safeRegisterNames, pyHex } from '../../sim/state/registers'

const body = (b: unknown): Record<string, any> => (b && typeof b === 'object' ? b as Record<string, any> : {})
/** Python int(): whole numbers only, optional sign and surrounding space. */
const pyInt = (s: string): number | null => (/^\s*[+-]?\d+\s*$/.test(s) ? parseInt(s, 10) : null)

export default function digitizer(r: Router, d: Daq) {
  const config = (id: string) => d.configFor(id)
  const changed = (id: string, key: string, value: string) => {
    const b = d.board(id)
    if (b) d.noteRegisterWrite(b, key, value)
  }

  r.get('/digitizer/boards', () => ok(d.boardsJson()))
  r.get('/digitizer/update', () => ok(0))
  r.get('/digitizer/connectivity', () => {
    const out: Record<string, { connected: boolean; ready: boolean; failed: boolean }> = {}
    for (const b of d.boards) out[String(b.id)] = { connected: true, ready: !d.running, failed: (d.boardFailures[String(b.id)] ?? 0) > 0 }
    return ok(out)
  })

  r.post('/digitizer/scan', req => d.startScan(req.body))
  r.get('/digitizer/scan', () => ok(d.scanStatus() as ScanStatus))
  r.post('/digitizer/scan/cancel', () => (d.cancelScan() ? ok(d.scanStatus()) : fail(409, { message: 'No scan is running.' })))
  r.get('/digitizer/scan/a4818', () => ok({ pids: [] }))

  // The polarity routes build the key with decimal arithmetic ("reg_" + 1080 + 100·ch),
  // so they only find channels 0–9. Kept as upstream does it.
  r.get('/digitizer/polarity/<id>/<channel>', (_q, p) => {
    const c = config(p.id)
    const ch = pyInt(p.channel)
    if (!c || ch === null) return ok(-1)
    const e = c.registers[`reg_${1080 + ch * 100}`]
    if (!e) return ok(-1)
    return ok((parseInt(e.value, 16) >>> 16) & 1)
  })
  r.get('/digitizer/polarity/<id>/<channel>/<value>', (_q, p) => {
    const v = pyInt(p.value), ch = pyInt(p.channel)
    if (v === null || ch === null || (v !== 0 && v !== 1)) return ok(-1)
    const c = config(p.id)
    const key = `reg_${1080 + ch * 100}`
    if (!c || !c.registers[key]) return ok(-1)
    const prev = parseInt(c.registers[key].value, 16) >>> 0
    c.registers[key].value = pyHex(((prev & 0xFFFEFFFF) | (v << 16)) >>> 0)
    changed(p.id, key, c.registers[key].value)
    return ok(0)
  })
  r.get('/digitizer/channel/<id>/<channel>', (_q, p) => {
    const c = config(p.id), ch = pyInt(p.channel)
    if (!c || ch === null || !c.registers.reg_8120) return ok(-1)
    return ok((parseInt(c.registers.reg_8120.value, 16) >>> ch) & 1)
  })
  r.get('/digitizer/channel/<id>/<channel>/<value>', (_q, p) => {
    const v = pyInt(p.value), ch = pyInt(p.channel)
    if (v === null || ch === null || (v !== 0 && v !== 1)) return ok(-1)
    const c = config(p.id)
    if (!c || !c.registers.reg_8120) return ok(-1)
    const prev = parseInt(c.registers.reg_8120.value, 16) >>> 0
    c.registers.reg_8120.value = pyHex(((prev & ~(1 << ch)) | (v << ch)) >>> 0)
    changed(p.id, 'reg_8120', c.registers.reg_8120.value)
    return ok(0)
  })

  // Static segments win over <setting> (Werkzeug): the router orders these first.
  r.get('/digitizer/<id>/online_registers', (_q, p) => {
    const b = d.board(p.id)
    if (!b) return fail(404, { message: 'Board not found' })
    return ok({ dpp: b.dpp, registers: safeRegisterNames(b.dpp) })
  })
  r.get('/digitizer/<id>/info', (_q, p) => {
    const b = d.board(p.id)
    return b ? ok({ ...b }) : fail(404, { message: 'Board not found' })
  })
  r.get('/digitizer/<id>/config', (_q, p) => {
    const c = config(p.id)
    return c ? ok(c) : fail(404, { message: 'Configuration not found' })
  })
  r.post('/digitizer/<id>/config', (req, p) => {
    const b = d.board(p.id)
    const c = body(req.body)
    if (!Object.keys(c).length) return fail(400, { message: 'Invalid configuration' })
    if (!b) return fail(500, { message: 'Failed to update configuration' })
    d.configs[d.boardKey(b)] = c as any
    d.noteRegisterWrite(b, '*', 'config')
    return ok({ message: 'Configuration updated successfully' })
  })
  r.get('/digitizer/<id>/registers', (_q, p) => {
    const c = config(p.id)
    if (!c || !c.registers) return fail(404, { message: 'Registers not found' })
    const out: Record<string, unknown> = {}
    for (const [k, e] of Object.entries(c.registers)) {
      const v = parseInt(e.value, 16)
      out[k] = { value_hex: e.value, value_dec: Number.isFinite(v) ? v : 0, name: e.name ?? 'No description', channel: e.channel ?? 0, address: e.address ?? 'N/A' }
    }
    return ok(out)
  })
  r.get('/digitizer/available_settings', () => ok({
    common_registers: { 'Invert Input': 1080, 'Channel Enable Mask': 8120 },
    description: 'Common digitizer register mappings',
  }))

  r.get('/digitizer/<id>/<setting>', (_q, p) => {
    const c = config(p.id)
    const e = c?.registers[`reg_${p.setting}`]
    if (!e) return ok(-1)
    const v = parseInt(e.value, 16)
    return ok(Number.isFinite(v) ? v : -1)
  })
  r.get('/digitizer/<id>/<setting>/<value>', (_q, p) => {
    const c = config(p.id)
    if (!c || !c.registers[p.setting]) return ok(-1)
    const v = pyInt(p.value)
    if (v === null) return ok(-1)
    c.registers[p.setting].value = pyHex(v)
    changed(p.id, p.setting, c.registers[p.setting].value)
    return ok(0)
  })

  r.post('/digitizer/<id>/setting/<setting>', (req, p) => {
    const b = body(req.body)
    if (!('value' in b)) return fail(400, { message: 'A value is required.' })
    const value = typeof b.value === 'number' ? (Number.isInteger(b.value) ? b.value : Math.trunc(b.value)) : pyInt(String(b.value))
    if (value === null || !Number.isFinite(value)) return fail(400, { message: `'${b.value}' is not a whole number.` })
    if (value < 0) return fail(400, { message: 'Register values cannot be negative.' })
    const online = Boolean(b.online)
    const c = config(p.id)
    if (!c || !c.registers) return fail(404, { message: 'No register configuration for this board.' })
    const reg = c.registers[p.setting]
    if (!reg) return fail(404, { message: `Board has no register '${p.setting}'.` })
    reg.value = pyHex(value)
    const result: ApplySettingResult = { saved: true, written: false, reason: '', via: '', address: reg.address ?? '', value: pyHex(value) }
    if (online) {
      const addr = parseInt(String(reg.address ?? '0'), 16)
      if (!Number.isFinite(addr)) {
        result.reason = 'This register has no usable address in the configuration.'
      } else {
        const board = d.board(p.id)
        if (!board) Object.assign(result, { written: false, reason: `No board with id ${p.id}.`, via: '' })
        else {
          const [allowed, reason] = isOnlineSafe(addr, board.dpp)
          if (!allowed) Object.assign(result, { written: false, reason, via: '' })
          else Object.assign(result, { written: true, reason: '', via: d.running ? 'run' : 'probe' })
        }
      }
    }
    // The configuration always changes; physics follows what the board holds
    // (a refused online write still applies at the next run start).
    changed(p.id, p.setting, reg.value)
    return ok(result)
  })

  // ── calib.py: calib/<name>_<id>.cal, one "offset slope" line per channel ──
  const calRows = (name: string, id: string) => {
    const b = d.board(id)
    return b && b.name === name ? d.calib[d.boardKey(b)] : undefined
  }
  r.get('/calib/get/<board_name>/<board_id>/<channel>', (_q, p) => {
    const rows = calRows(p.board_name, p.board_id)
    if (!rows) return ok({ status: 'error', message: 'Calibration file not found' })
    const ch = pyInt(p.channel)
    if (ch === null || !rows[ch < 0 ? rows.length + ch : ch]) return ok({ status: 'error', message: 'Channel not found in calibration file' })
    const [a, b] = rows[ch < 0 ? rows.length + ch : ch]
    return ok({ status: 'success', a: pyFloat(a), b: pyFloat(b) })
  })
  r.post('/calib/set/<board_name>/<board_id>/<channel>', req => {
    // calib.py takes the board and channel from the body, not from the URL.
    const x = body(req.body)
    const rows = calRows(String(x.board_name), String(x.board_id))
    if (!rows) return ok({ status: 'error', message: 'Calibration file not found' })
    const ch = pyInt(String(x.channel)), a = parseFloat(x.a), s = parseFloat(x.b)
    if (ch === null || !rows[ch] || !Number.isFinite(a) || !Number.isFinite(s)) return ok({ status: 'error', message: 'Channel not found in calibration file' })
    rows[ch] = [a, s]
    return ok({ status: 'success' })
  })
}

/** Python str(float). */
export const pyFloat = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : String(x))
