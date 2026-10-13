// routes/histograms.py: the trace routes (/waveforms/1|2|probe1|probe2/<board>/<ch> and
// /waveforms/<type>/<board>/<ch>). A lazy family: the trace synthesis (sim/physics/
// traces.ts) and the DPP filters it runs are loaded the first time a trace is asked for.
import { ok, fail, type Router } from '../router'
import type { Daq } from '../../sim/state/daq'
import { emptyTH1F, waveformTH1F, type RootJson } from '../../sim/physics/api'
import { captureTraces, type TraceCapture } from '../../sim/physics/traces'

type Kind = 'wave1' | 'wave2' | 'probe1' | 'probe2'

/** The probes of a capture taken this long ago (demo seconds) still go with its trace. */
const PROBE_REUSE_S = 2

/**
 * One capture serves trace 1 or 2 and both probes: the Tuner asks for them in one
 * Promise.all, a trace first, so the probes line up with the trace drawn under them.
 * A trace request takes a fresh capture while the board is running with waveforms on;
 * after the run, the last one is shown, as the real spy keeps it.
 */
export function traceFor(d: Daq, kind: Kind, boardId: string, channel: string): RootJson {
  const b = d.board(boardId)
  const ch = parseInt(channel, 10)
  if (!d.runBoards) return emptyTH1F('No data yet — start a run')
  const idx = d.boardIndex(boardId)
  if (idx === null || !b) return emptyTH1F('This board is not part of the current run')
  const key = `${boardId}:${ch}`
  let c = d.traceCache[key]
  const live = d.running && d.waveformsOn(b) && Number.isFinite(ch) && b === d.boards[0]
  const stale = !c || d.simT - c.t > PROBE_REUSE_S
  if (live && (kind === 'wave1' || kind === 'wave2' || stale)) {
    const ctx = d.physics.traceContext?.(ch) ?? null
    if (ctx) { c = { t: d.simT, cap: captureTraces(ctx) }; d.traceCache[key] = c }
  }
  const cap: TraceCapture | undefined = c?.cap
  if (!cap) return emptyTH1F('No waveform — switch waveforms on for this board')
  const title = (label: string | null) => `${d.spectrumTitle(kind, b, ch)}${label ? ` · ${label}` : ''}`
  const name = `${kind}_b${idx}_ch${ch}`
  if (kind === 'wave1') return waveformTH1F(cap.wave1, { name, title: title(cap.labels.wave1) })
  if (kind === 'wave2') {
    return cap.wave2 ? waveformTH1F(cap.wave2, { name, title: title(cap.labels.wave2) })
      : emptyTH1F('Trace 2 needs Dual Trace (Board Configuration, bit 11)')
  }
  const p = kind === 'probe1' ? cap.probe1 : cap.probe2
  const label = kind === 'probe1' ? cap.labels.probe1 : cap.labels.probe2
  return p ? waveformTH1F(p, { name, title: title(label) })
    : emptyTH1F('Digital probes are off (Board Configuration: Enable Digital Probe)')
}

export default function traces(r: Router, d: Daq) {
  r.get('/waveforms/1/<board_id>/<channel>', (_q, p) => ok(traceFor(d, 'wave1', p.board_id, p.channel)))
  r.get('/waveforms/2/<board_id>/<channel>', (_q, p) => ok(traceFor(d, 'wave2', p.board_id, p.channel)))
  r.get('/waveforms/probe1/<board_id>/<channel>', (_q, p) => ok(traceFor(d, 'probe1', p.board_id, p.channel)))
  r.get('/waveforms/probe2/<board_id>/<channel>', (_q, p) => ok(traceFor(d, 'probe2', p.board_id, p.channel)))
  r.get('/waveforms/<waveform_type>/<board_id>/<channel>', (_q, p) => {
    const t = p.waveform_type
    if (!['wave1', 'wave2', 'probe1', 'probe2'].includes(t)) return fail(400, { error: 'Invalid waveform type. Use wave1 or wave2.' })
    const h = traceFor(d, t as Kind, p.board_id, p.channel)
    if (t === 'probe1') h.fLineColor = 416   // kGreen
    if (t === 'probe2') h.fLineColor = 632   // kRed
    return ok(h)
  })
}
