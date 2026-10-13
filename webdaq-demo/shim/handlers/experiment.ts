// routes/experiment.py and routes/auth.py, against the simulated DAQ.
import type { BoardDiagnostics, BoardInfoResponse, SyncSettings } from '@webdaq/lib/api'
import { ok, fail, type Router } from '../router'
import type { Daq } from '../../sim/state/daq'
import { regValue, START_MODE_NAMES } from '../../sim/state/registers'

const body = (b: unknown): Record<string, any> => (b && typeof b === 'object' ? b as Record<string, any> : {})

export function runRow(r: Daq['runs'][number]) {
  return {
    run_number: r.run_number, start_time: r.start_time, end_time: r.end_time, notes: r.notes,
    target_name: r.target_name, terminal_voltage: r.terminal_voltage, probe_voltage: r.probe_voltage,
    run_type: r.run_type, accumulated_charge: r.accumulated_charge, user_id: r.user_id, flag: r.flag,
  }
}

export default function experiment(r: Router, d: Daq) {
  // ── auth.py: any name and password work in the demo ──
  r.post('/register', () => ok({ message: 'User created successfully' }, 201))
  r.post('/login', req => {
    const b = body(req.body)
    if (!b.username) return fail(401, { message: 'Invalid credentials' })
    return ok({ token: 'demo' })
  })
  r.get('/protected', () => ok({ logged_in_as: 1 }))

  // ── run control ──
  r.post('/experiment/start_run', () => d.startRun())
  r.post('/experiment/stop_run', () => d.stopRun())

  r.post('/experiment/add_note', req => {
    const b = body(req.body)
    const run = d.runs.find(x => x.run_number === Number(b.run_number))
    if (!run) return fail(404, { message: 'Run not found' })
    run.notes = b.note
    return ok({ message: 'Note added successfully' })
  })
  r.post('/experiment/add_run_metadata', req => {
    const b = body(req.body)
    const run = d.runs.find(x => x.run_number === Number(b.run_number))
    if (!run) return fail(404, { message: 'Run not found' })
    run.target_name = b.target_name ?? null
    run.terminal_voltage = b.terminal_voltage ?? null
    run.probe_voltage = b.probe_voltage ?? null
    run.run_type = b.run_type ?? null
    return ok({ message: 'Run metadata added successfully' })
  })
  r.get('/experiment/get_run_metadata/<run_number>', (_q, p) => {
    const run = d.runs.find(x => String(x.run_number) === p.run_number)
    if (!run) return fail(404, { message: 'Run not found' })
    return ok({ ...runRow(run), board_info: run.board_info, software_versions: run.software_versions, sync_mode: run.sync_mode })
  })
  r.get('/experiment/get_run_metadata', () =>
    ok([...d.runs].sort((a, b) => b.run_number - a.run_number).map(runRow)))
  r.post('/experiment/update_run_flag', req => {
    const b = body(req.body)
    if (!b.run_number || !b.flag) return fail(400, { message: 'Missing run_number or flag' })
    if (!['good', 'unknown', 'bad'].includes(b.flag)) return fail(400, { message: 'Invalid flag value. Must be good, unknown, or bad' })
    const run = d.runs.find(x => x.run_number === Number(b.run_number))
    if (!run) return fail(404, { message: 'Run not found' })
    run.flag = b.flag
    return ok({ message: 'Flag updated successfully', flag: b.flag })
  })
  r.post('/experiment/update_run_notes', req => {
    const b = body(req.body)
    if (!b.run_number) return fail(400, { message: 'Missing run_number' })
    const run = d.runs.find(x => x.run_number === Number(b.run_number))
    if (!run) return fail(404, { message: 'Run not found' })
    run.notes = b.notes ?? ''
    return ok({ message: 'Notes updated successfully', notes: run.notes })
  })

  // ── boards ──
  r.post('/experiment/add_board', req => d.addBoard(req.body))
  r.post('/experiment/remove_board', req => {
    const id = String(body(req.body).id)
    if (d.running && d.runBoards?.includes(id)) return fail(404, { message: 'Failed to remove board' })
    return d.removeBoard(id) ? ok(d.boardsJson()) : fail(404, { message: 'Failed to remove board' })
  })
  r.get('/experiment/get_board_configuration', () => ok(d.boardsJson()))

  r.get('/experiment/get_sync_settings', () => {
    const chain = d.boards.map(b => {
      const regs = d.regs(b)
      const control = regValue(regs, 0x8100), fpio = regValue(regs, 0x811C), trg = regValue(regs, 0x8110)
      const mode = control & 3
      return {
        board_id: b.id, name: b.name, start_mode: mode, start_mode_name: START_MODE_NAMES[mode] ?? 'unknown',
        synchronised: mode !== 0, clock_source: (control >> 6) & 1, acquisition_control: control,
        trg_out_mode: (fpio >> 16) & 3, front_panel_io_control: fpio, sw_trigger_to_trg_out: (trg >>> 31) & 1,
        ext_trigger_to_trg_out: (trg >>> 30) & 1, trg_out_mask: trg, role: 'independent' as const, problems: [] as string[],
      }
    })
    const synced = chain.filter(c => c.synchronised)
    if (!synced.length) {
      const out: SyncSettings = { mode: 'independent', chain, synchronised_count: 0, applicable: d.boards.length > 1, register: 'reg_8100', master_board_id: null, master_from: 'none' }
      return ok(out)
    }
    // One board on its own is its own master and the last board of the chain.
    const master = synced.find(c => String(c.board_id) === '0') ?? synced[0]
    const order = [master, ...synced.filter(c => c !== master)]
    order.forEach((e, pos) => {
      const isMaster = e === master, isLast = e === order[order.length - 1]
      const problems: string[] = []
      if (isMaster && e.start_mode !== 2) problems.push(`the master is in ${e.start_mode_name} mode, so the software trigger that starts the chain will not start this board — use 'On first trigger'`)
      if (!isLast && e.trg_out_mode !== 0) problems.push('TRG-OUT is not set to carry the trigger, so nothing reaches the next board')
      if (isMaster) { if (!isLast && !e.sw_trigger_to_trg_out) problems.push('the software trigger is not routed to TRG-OUT, so the boards after this one will never start') }
      else if (!isLast && !e.ext_trigger_to_trg_out) problems.push('TRG-IN is not routed to TRG-OUT, so boards after this one will not start')
      Object.assign(e, {
        role: isMaster ? 'master' : 'slave', problems, chain_position: pos,
        needs: { start_mode_first_trigger: isMaster, trg_out_trigger: !isLast, sw_trigger_to_trg_out: isMaster && !isLast, ext_trigger_to_trg_out: !isMaster && !isLast },
      })
    })
    const out: SyncSettings = {
      mode: 'daisy-chain', chain: chain as SyncSettings['chain'], synchronised_count: synced.length, applicable: d.boards.length > 1,
      register: 'reg_8100', master_board_id: master.board_id, master_from: d.running ? 'board register id' : 'configured id',
    }
    return ok(out)
  })

  r.get('/experiment/board_info', () => {
    const out: BoardInfoResponse = {
      boards: (d.runBoards ? d.boards.filter(b => d.runBoards!.includes(String(b.id))).map(b => d.boardInfo(b)) : []) as unknown as BoardInfoResponse['boards'],
      software: d.softwareVersions() as unknown as BoardInfoResponse['software'],
      sync_mode: d.syncMode(),
      running: d.running,
    }
    return ok(out)
  })

  // ── acquisition flags ──
  r.post('/experiment/set_save_data', req => { d.save = Boolean(body(req.body).value); return ok(d.save) })
  r.post('/experiment/set_limit_data_size', req => { d.limitSize = Boolean(body(req.body).value); return ok(d.limitSize) })
  r.post('/experiment/set_data_size_limit', req => { d.fileSizeLimit = Number(body(req.body).value) || 0; return ok(d.fileSizeLimit) })
  r.get('/experiment/get_save_data', () => ok(d.save))
  r.get('/experiment/get_limit_data_size', () => ok(d.limitSize))
  r.get('/experiment/get_data_size_limit', () => ok(d.fileSizeLimit))
  r.get('/experiment/get_run_number', () => ok(d.runNumber))
  r.post('/experiment/set_run_number', req => {
    const v = Math.trunc(Number(body(req.body).value))
    if (!d.running && Number.isFinite(v)) d.runNumber = Math.max(1, Math.min(31, v))
    return ok(d.runNumber)
  })
  r.get('/experiment/check_run_directory', () => ok(d.checkRunDirectory()))
  r.get('/experiment/get_run_status', () => ok(d.running))
  r.get('/experiment/get_start_time', () => ok(d.startTime))
  r.get('/experiment/file_bandwidth', () => ok(d.running && d.rates ? d.rates.write_rate / (1024 * 1024) : 0))

  r.get('/experiment/stats', () => {
    if (!d.running || !d.runBoards) return ok([])
    const b = d.boards.find(x => d.runBoards!.includes(String(x.id)))
    if (!b) return ok([])
    const fails = d.boardFailures[String(b.id)] ?? 0
    return ok([{
      name: b.name, board_id: b.id, write_rate: d.rates?.write_rate ?? 0, board_failures: fails, failed: fails > 0,
      channels: Array.from({ length: b.chan }, (_, c) => {
        const x = d.rates?.channels[c]
        return { board: b.id, channel: c, event_rate: x?.event_rate ?? 0, pileup_rate: x?.pileup_rate ?? 0, lost_rate: x?.lost_rate ?? 0, satu_rate: x?.satu_rate ?? 0 }
      }),
    }])
  })

  r.get('/experiment/board_diagnostics', () => {
    const boards: BoardDiagnostics['boards'] = {}
    if (d.running) for (const [id, c] of Object.entries(d.diag)) boards[id] = { ...c, failed: c.board_failures > 0 }
    const out: BoardDiagnostics = {
      running: d.running, boards,
      fail_meaning: 'Bit 26 of the aggregate header (BOARD FAIL): the board reports an internal fault — PLL unlock, over-temperature or ADC power-down. In the demo a failure only happens when you inject one from the scenario panel.',
    }
    return ok(out)
  })

  r.post('/experiment/reset', () => ok(d.resetAcquisition() ? 0 : -1))

  r.get('/experiment/get_board_status', () => {
    const out: Record<string, { failed: boolean; failures: number; last_value: number }> = {}
    if (d.running) for (const b of d.boards) {
      const n = d.boardFailures[String(b.id)] ?? 0
      out[String(b.id)] = { failed: n > 0, failures: n, last_value: n }
    }
    return ok(out)
  })

  r.post('/experiment/refresh_board_connections', () => {
    if (d.running) return fail(400, { message: 'Cannot refresh board connections while DAQ is running' })
    if (!d.boards.length) return fail(404, { message: 'No boards configured' })
    return ok({ message: `Successfully refreshed all ${d.boards.length} board connections`, refreshed: d.boards.length })
  })

  r.get('/experiment/get_auto_restart', () => ok({
    enabled: d.autoRestart.enabled, delay: d.autoRestart.delay, pending: d.autoRestart.pending, last_restart_info: d.autoRestart.last,
  }))
  r.post('/experiment/set_auto_restart', req => {
    const b = body(req.body)
    d.autoRestart.enabled = Boolean(b.enabled ?? false)
    const delay = b.delay ?? 30
    if (delay) d.autoRestart.delay = Math.max(1, Math.trunc(Number(delay)) || 30)
    return ok({ message: `Auto-restart ${d.autoRestart.enabled ? 'enabled' : 'disabled'}`, enabled: d.autoRestart.enabled, delay: d.autoRestart.delay })
  })
  r.get('/experiment/get_restart_status', () => ok({ pending: d.autoRestart.pending, last_restart_info: d.autoRestart.last }))

  // ── legacy Telegram endpoints (same transport as /notifications) ──
  r.get('/experiment/get_telegram_settings', () => ok(telegramSettings(d)))
  r.post('/experiment/set_telegram_settings', req => {
    const b = body(req.body)
    if (b.enabled !== undefined && b.enabled !== null) d.telegram.enabled = Boolean(b.enabled)
    if (b.bot_token) d.telegram.bot_token = String(b.bot_token)
    if (b.chat_id !== undefined && b.chat_id !== null) d.telegram.chat_id = String(b.chat_id)
    return ok({ message: 'Telegram settings updated', settings: telegramSettings(d) })
  })
  r.post('/experiment/test_telegram', () => fail(400, NOTHING_SENT))
}

export const NOTHING_SENT = { success: false, message: 'Nothing was sent: this is the in-browser demo, and no message leaves your browser.' }

export const mask = (s: string) => (s ? '*'.repeat(s.length) : '')

export function telegramSettings(d: Daq) {
  return { enabled: d.telegram.enabled, bot_token: mask(d.telegram.bot_token), chat_id: d.telegram.chat_id, configured: Boolean(d.telegram.bot_token && d.telegram.chat_id) }
}
