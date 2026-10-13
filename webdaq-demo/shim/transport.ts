/**
 * Main-thread side of the simulated backend: starts the worker, sends requests,
 * keeps the sessionStorage snapshot, and records unmocked requests for the tests
 * (window.__webdaqDemo.misses()).
 */
import type { Req, Res } from './router'

export const NS = 'webdaq-demo:v1:'
const WORKER_URL = process.env.NEXT_PUBLIC_DEMO_WORKER || ''
const COMMIT = process.env.NEXT_PUBLIC_DEMO_WEBDAQ_COMMIT || ''

type Pending = { resolve: (v: any) => void; reject: (e: unknown) => void }
let worker: Worker | null = null
let seq = 0
const pending = new Map<number, Pending>()
const misses: { method: string; path: string; status: number }[] = []
const listeners = new Set<(state: any) => void>()
let lastState: any = null

function ss(): Storage | null {
  try { return window.sessionStorage } catch { return null }
}
function readJSON(key: string): any {
  try { const v = ss()?.getItem(NS + key); return v ? JSON.parse(v) : null } catch { return null }
}
function writeJSON(key: string, v: unknown) {
  try { ss()?.setItem(NS + key, JSON.stringify(v)) } catch { /* quota or blocked: the demo goes on without persistence */ }
}

/** The session's seed: ?seed= if given, otherwise drawn once and kept for the tab. */
export function demoSeed(): number {
  let seed: number | null = null
  try {
    const q = new URLSearchParams(window.location.search).get('seed')
    if (q && /^\d+$/.test(q)) seed = Number(q) >>> 0
  } catch { /* no location */ }
  const stored = readJSON('seed')
  if (seed === null && typeof stored === 'number') seed = stored
  if (seed === null) seed = (Math.random() * 2 ** 32) >>> 0
  if (stored !== seed) {
    // A different seed is a different demo: do not restore another seed's state.
    if (stored !== null) try { ss()?.removeItem(NS + 'state') } catch { /* ignore */ }
    writeJSON('seed', seed)
  }
  return seed
}

function onMessage(ev: MessageEvent) {
  const m = ev.data
  if (m.type === 'res' || m.type === 'ctl') {
    const p = pending.get(m.id)
    if (!p) return
    pending.delete(m.id)
    p.resolve(m.type === 'res' ? m.res : m.result)
  } else if (m.type === 'snapshot') {
    writeJSON('state', m.data)
  } else if (m.type === 'state') {
    lastState = m.data
    listeners.forEach(fn => { try { fn(m.data) } catch { /* a listener must not break the transport */ } })
  }
}

export function ensureWorker(): Worker {
  if (worker) return worker
  if (!WORKER_URL) throw new Error('webdaq-demo: NEXT_PUBLIC_DEMO_WORKER is not set')
  worker = new Worker(WORKER_URL, { type: 'module' })
  worker.onmessage = onMessage
  worker.onerror = e => { console.error('webdaq-demo worker error', e.message) }
  worker.postMessage({ type: 'init', seed: demoSeed(), snapshot: readJSON('state'), scenario: readJSON('scenario') ?? undefined, commit: COMMIT })
  return worker
}

export function request(req: Req): Promise<Res & { miss?: boolean }> {
  const w = ensureWorker()
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: (res: Res & { miss?: boolean }) => {
        if (res.miss) misses.push({ method: req.method, path: req.path, status: res.status })
        resolve(res)
      },
      reject,
    })
    w.postMessage({ type: 'req', id, req })
  })
}

/** Demo-shell commands (scenario, faults, FWHM probe, state). */
export function control(cmd: Record<string, unknown>): Promise<any> {
  const w = ensureWorker()
  const id = ++seq
  if (cmd.type === 'scenario') writeJSON('scenario', { ...(readJSON('scenario') ?? {}), ...(cmd.scenario as object) })
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ type: 'ctl', id, cmd })
  })
}

export function onState(fn: (state: any) => void): () => void {
  listeners.add(fn)
  if (lastState) fn(lastState)
  return () => { listeners.delete(fn) }
}

/** Reset: stop the worker and clear this demo's keys (the seed is kept, design §3.1). */
export function resetDemo() {
  worker?.terminate()
  worker = null
  pending.clear()
  try {
    const s = ss()
    if (s) for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i)
      if (k && k.startsWith(NS) && k !== NS + 'seed') s.removeItem(k)
    }
  } catch { /* ignore */ }
}

if (typeof window !== 'undefined') {
  ;(window as any).__webdaqDemo = {
    misses: () => misses.slice(),
    control, request, onState, resetDemo,
    state: () => lastState,
  }
}
