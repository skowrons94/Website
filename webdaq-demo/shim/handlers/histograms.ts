// routes/histograms.py (spectra, traces, PSD, waveform switches, dashboard config, ROIs).
import type { HistogramConfig, ROI } from '@webdaq/lib/histogram-config'
import { ok, fail, type Router } from '../router'
import { normaliseHistogram, normaliseRoi, normaliseSettings, normaliseZoom, type Daq } from '../../sim/state/daq'
import { regValue, setRegValue } from '../../sim/state/registers'

const isObj = (b: unknown): b is Record<string, any> => !!b && typeof b === 'object' && !Array.isArray(b)
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

export default function histograms(r: Router, d: Daq) {
  const H = () => d.hist
  const find = (id: string) => H().histograms.find(h => h.id === id)
  const newHist = () => d.newId('hist_')
  const newRoi = () => d.newId('roi_')

  // ── dashboard configuration (services/histogram_config.py) ──
  r.get('/histograms/config', () => ok(clone(H())))
  r.put('/histograms/config', req => {
    if (!isObj(req.body)) return fail(400, { error: 'Expected a configuration object' })
    const raw = req.body
    d.hist = {
      version: 1, settings: normaliseSettings(raw.settings ?? {}),
      histograms: (Array.isArray(raw.histograms) ? raw.histograms : []).filter(isObj).map((h: any, i: number) => normaliseHistogram(h, i, newHist, newRoi)),
    }
    return ok(clone(d.hist))
  })
  r.put('/histograms/config/settings', req => {
    if (!isObj(req.body)) return fail(400, { error: 'Expected a settings object' })
    H().settings = normaliseSettings({ ...H().settings, ...req.body })
    return ok({ ...H().settings })
  })
  r.post('/histograms/config/histograms', req => {
    if (!isObj(req.body)) return fail(400, { error: 'Expected a histogram object' })
    if (!String(req.body.boardId ?? '').trim()) return fail(400, { error: 'A histogram needs a boardId' })
    const e = normaliseHistogram(req.body, H().histograms.length, newHist, newRoi)
    if (find(e.id)) e.id = newHist()
    H().histograms.push(e)
    return ok(clone(e) as HistogramConfig, 201)
  })
  r.put('/histograms/config/histograms/<histogram_id>', (req, p) => {
    if (!isObj(req.body)) return fail(400, { error: 'Expected a histogram object' })
    const e = find(p.histogram_id)
    if (!e) return fail(404, { error: `No histogram ${p.histogram_id}` })
    const merged = { ...e, ...req.body, id: p.histogram_id }
    if (!('rois' in req.body)) merged.rois = e.rois
    const u = normaliseHistogram(merged, e.order, newHist, newRoi)
    H().histograms[H().histograms.indexOf(e)] = u
    return ok(clone(u) as HistogramConfig)
  })
  r.delete('/histograms/config/histograms/<histogram_id>', (_q, p) => {
    const e = find(p.histogram_id)
    if (!e) return fail(404, { error: `No histogram ${p.histogram_id}` })
    H().histograms.splice(H().histograms.indexOf(e), 1)
    return ok({ message: 'Histogram removed' })
  })
  r.put('/histograms/config/order', req => {
    const order = isObj(req.body) ? req.body.order : undefined
    if (!Array.isArray(order)) return fail(400, { error: 'Expected {"order": [histogramId, ...]}' })
    const rank = new Map(order.map((v: unknown, i: number) => [String(v), i]))
    let tail = rank.size
    for (const e of H().histograms) { e.order = rank.has(e.id) ? rank.get(e.id)! : tail++ }
    H().histograms.sort((a, b) => a.order - b.order)
    H().histograms.forEach((e, i) => { e.order = i })
    return ok(clone(H().histograms) as HistogramConfig[])
  })
  r.put('/histograms/config/histograms/<histogram_id>/zoom', (req, p) => {
    const e = find(p.histogram_id)
    if (!e) return fail(404, { error: `No histogram ${p.histogram_id}` })
    e.zoom = normaliseZoom(isObj(req.body) ? req.body : null)
    return ok(clone(e) as HistogramConfig)
  })
  r.delete('/histograms/config/zoom', () => {
    for (const e of H().histograms) e.zoom = null
    return ok(clone(H().histograms) as HistogramConfig[])
  })
  r.post('/histograms/config/histograms/<histogram_id>/rois', (req, p) => {
    if (!isObj(req.body)) return fail(400, { error: 'Expected an ROI object' })
    const e = find(p.histogram_id)
    if (!e) return fail(404, { error: `No histogram ${p.histogram_id}` })
    const roi = normaliseRoi(req.body, newRoi)
    if (e.rois.some((x: ROI) => x.id === roi.id)) roi.id = newRoi()
    e.rois.push(roi)
    return ok(clone(roi) as ROI, 201)
  })
  r.put('/histograms/config/histograms/<histogram_id>/rois/<roi_id>', (req, p) => {
    if (!isObj(req.body)) return fail(400, { error: 'Expected an ROI object' })
    const e = find(p.histogram_id)
    const i = e ? e.rois.findIndex((x: ROI) => x.id === p.roi_id) : -1
    if (!e || i < 0) return fail(404, { error: `No ROI ${p.roi_id} on histogram ${p.histogram_id}` })
    e.rois[i] = normaliseRoi({ ...e.rois[i], ...req.body, id: p.roi_id }, newRoi)
    return ok(clone(e.rois[i]) as ROI)
  })
  r.delete('/histograms/config/histograms/<histogram_id>/rois/<roi_id>', (_q, p) => {
    const e = find(p.histogram_id)
    const before = e?.rois.length ?? 0
    if (e) e.rois = e.rois.filter((x: ROI) => x.id !== p.roi_id)
    if (!e || e.rois.length === before) return fail(404, { error: `No ROI ${p.roi_id} on histogram ${p.histogram_id}` })
    return ok({ message: 'ROI removed' })
  })
  r.get('/histograms/roi_integrals', req => {
    const all = ['1', 'true', 'yes'].includes(req.query.all ?? '')
    return ok({ results: d.roiIntegrals(!all, !all) })
  })
  r.post('/histograms/run/<int:run_number>/roi_snapshot', (_q, p) => {
    const run = d.runs.find(x => x.run_number === Number(p.run_number))
    const snap = d.roiSnapshot(Number(p.run_number))
    if (!run || !snap.histograms.length) return fail(404, { error: 'Nothing to record, or the run has no data directory' })
    run.demo.roi = snap
    return ok({ message: 'ROI snapshot written', path: `data/run${p.run_number}/roi.json` })
  })

  // ── spectra ──
  r.post('/histograms/rebin', req => {
    const f = Number(isObj(req.body) ? req.body.factor ?? 1 : 1)
    if (f > 0) d.rebinFactor = Math.trunc(f) || 1
    return ok({ message: 'Rebin factor set successfully' })
  })
  r.get('/histograms/<board_id>/<channel>', (_q, p) => ok(d.histogram(p.board_id, p.channel)))
  r.get('/histograms/<board_id>/<channel>/<histogram_type>', (_q, p) => ok(d.histogram(p.board_id, p.channel, p.histogram_type)))
  r.get('/histograms/<board_id>/<channel>/rebin/<int:rebin_factor>', (_q, p) =>
    ok(d.histogram(p.board_id, p.channel, undefined, d.rebinFactor > 1 ? d.rebinFactor : 1)))
  // spy_manager.get_roi_histogram: the spectrum itself (ROI styling is drawn client-side).
  r.get('/histograms/<board_id>/<channel>/<int:roi_min>/<int:roi_max>', (_q, p) => ok(d.histogram(p.board_id, p.channel)))
  r.get('/roi/<board_id>/<channel>/<int:roi_min>/<int:roi_max>', (_q, p) =>
    ok(d.integrate(d.histogram(p.board_id, p.channel), Number(p.roi_min), Number(p.roi_max))))
  r.get('/roi/<board_id>/<channel>/<int:roi_min>/<int:roi_max>/rebin/<int:rebin_factor>', (_q, p) =>
    ok(d.integrate(d.histogram(p.board_id, p.channel, undefined, Number(p.rebin_factor) || 1), Number(p.roi_min), Number(p.roi_max))))
  r.get('/psd/<board_id>/<channel>', (_q, p) => ok(d.psd(p.board_id, p.channel)))

  // ── traces: handlers/traces.ts, a lazy family (the trace synthesis is a chunk of its own) ──

  // Waveform recording is bit 16 of Board Configuration (0x8000) in the board's file.
  const setWaves = (id: string, on: boolean) => {
    const b = d.board(id)
    if (!b) return false
    const regs = d.regs(b)
    const v = regValue(regs, 0x8000)
    setRegValue(regs, 0x8000, on ? v | (1 << 16) : v & ~(1 << 16))
    d.noteRegisterWrite(b, 'reg_8000', regs.reg_8000?.value ?? '')
    return true
  }
  r.post('/waveforms/activate', () => {
    for (const b of d.boards) setWaves(String(b.id), true)
    return ok({ message: 'Waveforms activated successfully!' })
  })
  r.post('/waveforms/deactivate', () => {
    for (const b of d.boards) setWaves(String(b.id), false)
    return ok({ message: 'Waveforms deactivated successfully!' })
  })
  r.get('/waveforms/status', () => ok(d.boards.every(b => d.waveformsOn(b))))
  r.get('/waveforms/status_per_board', () => {
    const out: Record<string, boolean> = {}
    for (const b of d.boards) out[String(b.id)] = d.waveformsOn(b)
    return ok(out)
  })
  r.post('/waveforms/activate/<board_id>', (_q, p) =>
    setWaves(p.board_id, true) ? ok({ message: `Waveforms activated for board ${p.board_id}!` }) : fail(404, { error: `Board ${p.board_id} not found` }))
  r.post('/waveforms/deactivate/<board_id>', (_q, p) =>
    setWaves(p.board_id, false) ? ok({ message: `Waveforms deactivated for board ${p.board_id}!` }) : fail(404, { error: `Board ${p.board_id} not found` }))

  // ── informational ──
  r.get('/spy/status', () => ok({ running: d.running, backend: 'caendaq', caendaq_available: false, test_mode: true, root_available: false, demo: true }))
  r.get('/histograms/available_types', () => ok({
    histogram_types: [
      { type: 'energy', description: 'Energy spectrum (DPP-PHA)' },
      { type: 'qlong', description: 'Long gate charge (DPP-PSD)' },
      { type: 'qshort', description: 'Short gate charge (DPP-PSD)' },
    ],
    waveform_types: [{ type: 'wave1', description: 'Primary waveform' }, { type: 'wave2', description: 'Secondary waveform' }],
  }))
  r.get('/histograms/board/<board_id>/channels', (_q, p) => {
    const b = d.board(p.board_id)
    if (!b) return fail(404, { error: 'Board not found' })
    return ok({
      board_id: p.board_id, board_info: { ...b },
      channels: Array.from({ length: b.chan }, (_, i) => ({ channel: i, board_id: p.board_id, board_name: b.name, dpp_type: b.dpp })),
    })
  })
  r.get('/histograms/all_boards/summary', () => ok({
    boards: d.boards.map(b => ({
      id: b.id, name: b.name, channels: b.chan, dpp_type: b.dpp, link_type: b.link_type,
      available_histograms: b.dpp === 'DPP-PHA' ? ['energy'] : ['qlong', 'qshort', 'psd'], waveforms_available: true,
    })),
    total_boards: d.boards.length,
  }))
}
