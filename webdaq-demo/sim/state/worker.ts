/// <reference lib="webworker" />
/**
 * The Web Worker that hosts the simulated WebDAQ server.
 *
 * Messages in:  {type:'init', seed, snapshot?, scenario?, commit}
 *               {type:'req', id, req}            → {type:'res', id, res}
 *               {type:'ctl', id, cmd}            → {type:'ctl', id, result}
 * Messages out: {type:'snapshot', data}  every 5 s and after a mutating request
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

self.onmessage = (ev: MessageEvent) => {
  const m = ev.data
  if (m.type === 'init') {
    ;(globalThis as any).__WEBDAQ_COMMIT__ = m.commit || 'unknown'
    backend = new Backend({ seed: m.seed >>> 0, scenario: m.scenario })
    if (m.snapshot) backend.daq.restore(m.snapshot)
    setInterval(() => {
      if (!backend) return
      backend.daq.advance()
      if (dirty || Date.now() - lastSnap > 5000) snapshot()
    }, 50)
    setInterval(() => backend && self.postMessage({ type: 'state', data: backend.summary() }), 1000)
    return
  }
  if (!backend) return
  if (m.type === 'req') {
    const req = m.req as Req
    const res = backend.handle(req)
    if (req.method !== 'GET' && res.status < 400) dirty = true
    self.postMessage({ type: 'res', id: m.id, res }, transferables(res.data))
    return
  }
  if (m.type === 'ctl') {
    const result = backend.control(m.cmd)
    dirty = true
    self.postMessage({ type: 'ctl', id: m.id, result })
  }
}
