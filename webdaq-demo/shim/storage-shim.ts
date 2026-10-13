/**
 * Inline <script> (built to an IIFE by build.mjs, injected first in <head>):
 * WebDAQ's localStorage goes to a sessionStorage namespace, so Reset clears it
 * and nothing lands in the site's own storage. `theme` passes through so the
 * demo follows the site's light or dark choice (design §3.9). It also seeds the
 * auth token WebDAQ's pages check for: there is no login in the demo.
 */
(function () {
  const NS = 'webdaq-demo:v1:ls:'
  const PASS: Record<string, true> = { theme: true }
  let ss: Storage | null = null
  let real: Storage | null = null
  try { ss = window.sessionStorage } catch { ss = null }
  try { real = window.localStorage } catch { real = null }
  const mem = new Map<string, string>()
  const get = (k: string): string | null => {
    try { return ss ? ss.getItem(NS + k) : mem.get(k) ?? null } catch { return mem.get(k) ?? null }
  }
  const set = (k: string, v: string) => {
    try { if (ss) { ss.setItem(NS + k, v); return } } catch { /* fall through */ }
    mem.set(k, v)
  }
  const del = (k: string) => { try { ss?.removeItem(NS + k) } catch { /* ignore */ } mem.delete(k) }
  const keys = (): string[] => {
    const out = new Set<string>(mem.keys())
    try {
      if (ss) for (let i = 0; i < ss.length; i++) { const k = ss.key(i); if (k && k.startsWith(NS)) out.add(k.slice(NS.length)) }
    } catch { /* ignore */ }
    return [...out]
  }
  const shim: Storage = {
    getItem(k: string) { k = String(k); if (PASS[k]) { try { return real ? real.getItem(k) : null } catch { return null } } return get(k) },
    setItem(k: string, v: string) { k = String(k); if (PASS[k]) { try { real?.setItem(k, String(v)) } catch { /* ignore */ } return } set(k, String(v)) },
    removeItem(k: string) { k = String(k); if (PASS[k]) { try { real?.removeItem(k) } catch { /* ignore */ } return } del(k) },
    clear() { for (const k of keys()) del(k) },
    key(i: number) { return keys()[i] ?? null },
    get length() { return keys().length },
  }
  try {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => shim })
  } catch {
    // WebKit may refuse; WebDAQ's own keys (authToken and the rest) then stay in the real
    // localStorage, which Reset does not clear (resetDemo clears sessionStorage only); /privacy says so.
    ;(window as any).__webdaqStorageFallback = true
  }
  try { if (!window.localStorage.getItem('authToken')) window.localStorage.setItem('authToken', 'demo') } catch { /* ignore */ }
})()
