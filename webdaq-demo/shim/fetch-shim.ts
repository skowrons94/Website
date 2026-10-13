/**
 * Same-origin fetch('/api/server-control' | '/api/cache') — Next route handlers
 * upstream, which a static export cannot have — answered by the simulated server.
 * Everything else passes through untouched.
 */
import { request } from './transport'

const MATCH = /^\/api\/(server-control|cache)(\/|$|\?)/

export function installFetchShim() {
  if (typeof window === 'undefined' || (window as any).__webdaqFetchShim) return
  ;(window as any).__webdaqFetchShim = true
  const realFetch = window.fetch.bind(window)
  const base = process.env.NEXT_PUBLIC_DEMO_BASE_PATH || ''
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL
    try {
      url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href)
    } catch { return realFetch(input, init) }
    const path = url.origin === window.location.origin && base && url.pathname.startsWith(base + '/api/')
      ? url.pathname.slice(base.length) : url.pathname
    if (url.origin !== window.location.origin || !MATCH.test(path)) return realFetch(input, init)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    let body: unknown = null
    const rawBody = init?.body ?? null
    if (typeof rawBody === 'string') { try { body = JSON.parse(rawBody) } catch { body = rawBody } }
    const query: Record<string, string> = {}
    url.searchParams.forEach((v, k) => { query[k] = v })
    const res = await request({ method, path, query, body })
    return new Response(JSON.stringify(res.data), { status: res.status, headers: { 'content-type': 'application/json' } })
  }
}
