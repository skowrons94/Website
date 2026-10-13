/// <reference lib="webworker" />
/**
 * The Web Worker that hosts the simulated WebDAQ server.
 *
 * Messages in:  {type:'init', seed, snapshot?, scenario?, commit}
 *               {type:'req', id, req}            → {type:'res', id, res}
 *               {type:'ctl', id, cmd}            → {type:'ctl', id, result}
 * Messages out: {type:'snapshot', data}  every 5 s, and before answering a mutating request
 *               {type:'state', data}     every second (for the shell and the tour)
 */
import { Backend } from './backend'
import type { Req } from '../../shim/router'

declare const self: DedicatedWorkerGlobalScope
let backend: Backend | null = null
let dirty = false
let lastSnap = 0

function transferables(x: unknown, out: Transferable[] = [], depth = 0): Transferable[] {
  if (!x || typeof x !== 'object' || depth > 2) return out
  if (ArrayBuffer.isView(x)) { out.push((x as Float64Array).buffer); return out }
  for (const v of Object.values(x as Record<string, unknown>)) transferables(v, out, depth + 1)
  return out
}

function snapshot() {
  if (!backend) return
  self.postMessage({ type: 'snapshot', data: backend.daq.snapshot() })
  dirty = false
  lastSnap = Date.now()
}

let ready: Promise<void> | null = null

self.onmessage = async (ev: MessageEvent) => {
  const m = ev.data
  if (m.type === 'init') {
    ;(globalThis as any).__WEBDAQ_COMMIT__ = m.commit || 'unknown'
    ready = (async () => {
      try {
        backend = await Backend.create({ seed: m.seed >>> 0, scenario: m.scenario }, m.snapshot)
      } catch (e) {
        // A snapshot this build cannot read: start the demo afresh rather than not at all.
        console.error('webdaq-demo: starting afresh', e)
        backend = await Backend.create({ seed: m.seed >>> 0, scenario: m.scenario })
      }
      setInterval(() => {
        if (!backend) return
        backend.daq.advance()
        if (dirty || Date.now() - lastSnap > 5000) snapshot()
      }, 50)
      setInterval(() => backend && self.postMessage({ type: 'state', data: backend.summary() }), 1000)
    })()
    return
  }
  await ready
  if (!backend) return
  if (m.type === 'req') {
    const req = m.req as Req
    const res = await backend.handle(req)
    // A change is stored before it is acknowledged, so a reload right after any
    // click (a page navigation, a crash) finds it in sessionStorage.
    if (req.method !== 'GET' && res.status < 400) snapshot()
    self.postMessage({ type: 'res', id: m.id, res }, transferables(res.data))
    return
  }
  if (m.type === 'ctl') {
    const result = await backend.control(m.cmd)
    if (m.cmd?.type !== 'files' && m.cmd?.type !== 'state' && m.cmd?.type !== 'fwhm') snapshot()
    // File contents are transferred, not copied.
    const files = (result as { files?: { bytes: Uint8Array }[] })?.files
    self.postMessage({ type: 'ctl', id: m.id, result }, files ? files.map(f => f.bytes.buffer as ArrayBuffer) : [])
  }
}
