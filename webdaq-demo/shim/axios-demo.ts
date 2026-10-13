/**
 * Overlay alias target for `axios` (design §2.3 #5). It is the real axios —
 * reached as `axios-real`, because axios' exports map forbids deep imports —
 * except that every instance, and the default one, uses the in-page adapter
 * that sends the request to the simulated server in the worker. WebDAQ's
 * api.ts, its interceptors and its error handling stay byte-identical.
 */
import real, { AxiosError } from 'axios-real'
import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios-real'
import { request } from './transport'

function plain(x: unknown, depth = 0): unknown {
  if (ArrayBuffer.isView(x)) return Array.from(x as unknown as ArrayLike<number>)
  if (!x || typeof x !== 'object' || depth > 2 || Array.isArray(x)) return x
  const o = x as Record<string, unknown>
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (ArrayBuffer.isView(v)) o[k] = Array.from(v as unknown as ArrayLike<number>)
    else if (v && typeof v === 'object' && !Array.isArray(v)) plain(v, depth + 1)
  }
  return x
}

function parseBody(data: unknown): unknown {
  if (data === undefined || data === null || data === '') return null
  if (typeof data === 'string') { try { return JSON.parse(data) } catch { return data } }
  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    const o: Record<string, unknown> = {}
    data.forEach((v, k) => { o[k] = typeof v === 'string' ? v : `[file ${(v as File).name}]` })
    return o
  }
  return data
}

export async function demoAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const raw = String(config.url ?? '').replace(/^demo:/, '')
  const [path, qs] = raw.split('?')
  const query: Record<string, string> = {}
  if (qs) new URLSearchParams(qs).forEach((v, k) => { query[k] = v })
  for (const [k, v] of Object.entries((config.params ?? {}) as Record<string, unknown>)) {
    if (v !== undefined && v !== null) query[k] = String(v)
  }
  const method = String(config.method ?? 'get').toUpperCase()
  const res = await request({ method, path: path.startsWith('/') ? path : '/' + path, query, body: parseBody(config.data) })
  let data: unknown = plain(res.data)
  if (config.responseType === 'blob' && !(data instanceof Blob)) data = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const response: AxiosResponse = {
    data, status: res.status, statusText: String(res.status), headers: { 'content-type': 'application/json', ...(res.headers ?? {}) },
    config, request: { demo: true },
  }
  const valid = config.validateStatus ?? ((s: number) => s >= 200 && s < 300)
  if (valid(res.status)) return response
  throw new AxiosError(
    `Request failed with status code ${res.status}`,
    res.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config, response.request, response,
  )
}

real.defaults.adapter = demoAdapter as any
const wrapped: typeof real = Object.assign(Object.create(real), real)
wrapped.create = ((cfg: AxiosRequestConfig = {}) => real.create({ ...cfg, adapter: demoAdapter as any })) as typeof real.create

export default wrapped
export * from 'axios-real'
