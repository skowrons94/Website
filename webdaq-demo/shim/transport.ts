/**
 * Main-thread side of the simulated backend: starts the worker, sends requests,
 * keeps the sessionStorage snapshot, and records unmocked requests for the tests
 * (window.__webdaqDemo.misses()).
 *
 * Next may put this module into several client chunks (layout, start page,
 * WebDAQ's pages), each with its own copy; the state lives on globalThis so all
 * copies share one worker, one request table and one reset.
 */
import type { Req, Res } from './router'

export const NS = 'webdaq-demo:v1:'
const WORKER_URL = process.env.NEXT_PUBLIC_DEMO_WORKER || ''
const COMMIT = process.env.NEXT_PUBLIC_DEMO_WEBDAQ_COMMIT || ''

type Pending = { resolve: (v: any) => void; reject: (e: unknown) => void }
interface TransportState {
  worker: Worker | null
  seq: number
  pending: Map<number, Pending>
  misses: { method: string; path: string; status: number }[]
  listeners: Set<(state: any) => void>
  lastState: any
  resetting: boolean
  /** The last requests and commands, oldest first: [ms since load, what, status] (tests print it on failure). */
  log: [number, string, number | string][]
}
const G: TransportState = ((globalThis as any).__webdaqTransport ??= {
  worker: null, seq: 0, pending: new Map(), misses: [], listeners: new Set(), lastState: null, resetting: false, log: [],
})
G.log ??= []
function note(what: string, status: number | string) {
  G.log.push([Math.round(performance.now()), what, status])
  if (G.log.length > 400) G.log.splice(0, G.log.length - 400)
}

function ss(): Storage | null {
  try { return window.sessionStorage } catch { return null }
}
function readJSON(key: string): any {
  try { const v = ss()?.getItem(NS + key); return v ? JSON.parse(v) : null } catch { return null }
}
function writeJSON(key: string, v: unknown) {
  if (G.resetting) return
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
    const p = G.pending.get(m.id)
    if (!p) return
    G.pending.delete(m.id)
    p.resolve(m.type === 'res' ? m.res : m.result)
  } else if (m.type === 'snapshot') {
    writeJSON('state', m.data)
  } else if (m.type === 'state') {
    G.lastState = m.data
    G.listeners.forEach(fn => { try { fn(m.data) } catch { /* a listener must not break the transport */ } })
  }
}

export function ensureWorker(): Worker {
  if (G.worker) return G.worker
  if (!WORKER_URL) throw new Error('webdaq-demo: NEXT_PUBLIC_DEMO_WORKER is not set')
  const w = new Worker(WORKER_URL, { type: 'module' })
  w.onmessage = onMessage
  w.onerror = e => { console.error('webdaq-demo worker error', e.message) }
  w.postMessage({ type: 'init', seed: demoSeed(), snapshot: readJSON('state'), scenario: readJSON('scenario') ?? undefined, commit: COMMIT })
  G.worker = w
  return w
}

export function request(req: Req): Promise<Res & { miss?: boolean }> {
  const w = ensureWorker()
  const id = ++G.seq
  return new Promise((resolve, reject) => {
    G.pending.set(id, {
      resolve: (res: Res & { miss?: boolean }) => {
        if (res.miss) G.misses.push({ method: req.method, path: req.path, status: res.status })
        if (req.method !== 'GET' || /\/(start|stop)\b/.test(req.path)) note(`${req.method} ${req.path}`, res.status)
        resolve(res)
      },
      reject,
    })
    w.postMessage({ type: 'req', id, req })
  })
}

/** Demo-shell commands (scenario, faults, files, FWHM probe, state). */
export function control(cmd: Record<string, unknown>): Promise<any> {
  const w = ensureWorker()
  const id = ++G.seq
  if (cmd.type === 'scenario') writeJSON('scenario', { ...(readJSON('scenario') ?? {}), ...(cmd.scenario as object) })
  return new Promise((resolve, reject) => {
    G.pending.set(id, { resolve: (v: any) => { if (cmd.type !== 'state' && cmd.type !== 'fwhm') note(`ctl ${JSON.stringify(cmd)}`, v?.ok === false ? 'refused' : 'ok'); resolve(v) }, reject })
    w.postMessage({ type: 'ctl', id, cmd })
  })
}

export function onState(fn: (state: any) => void): () => void {
  G.listeners.add(fn)
  if (G.lastState) fn(G.lastState)
  return () => { G.listeners.delete(fn) }
}

/** Reset: stop the worker and clear this demo's keys (the seed is kept, design §3.1). */
export function resetDemo() {
  // No late snapshot from the old worker may land after the keys are cleared.
  G.resetting = true
  if (G.worker) { G.worker.onmessage = null; G.worker.terminate() }
  G.worker = null
  G.pending.clear()
  try {
    const s = ss()
    // Collect first: the order of a Storage's keys may change as keys are removed.
    const keys: string[] = []
    if (s) for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k) keys.push(k) }
    for (const k of keys) if (k.startsWith(NS) && k !== NS + 'seed' && k !== NS + 'lang') s!.removeItem(k)
  } catch { /* ignore */ }
}

if (typeof window !== 'undefined') {
  ;(window as any).__webdaqDemo = {
    misses: () => G.misses.slice(),
    log: () => G.log.slice(),
    control, request, onState, resetDemo,
    state: () => G.lastState,
  }
}
