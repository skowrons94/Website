/**
 * A Werkzeug-like URL router for the simulated backend (runs in the worker,
 * and in Node for the contract tests).
 *
 * Rules use Flask syntax: `<name>` (default converter, one segment),
 * `<int:name>` (digits), `<path:name>` (one or more segments, slashes allowed).
 * Precedence follows Werkzeug's state-machine matcher: at each segment a static
 * part beats an int converter, which beats the default converter, which beats
 * a path converter. When a path matches only rules of other methods the answer
 * is 405 (with Allow), otherwise 404. The order of registration breaks ties.
 */

export interface Req {
  method: string
  /** Path without query string, e.g. /histograms/0/1 */
  path: string
  query: Record<string, string>
  body: unknown
}

export interface Res {
  status: number
  data: unknown
  headers?: Record<string, string>
}

export type Params = Record<string, string>
export type Handler = (req: Req, params: Params) => Res

type Seg = { kind: 'static'; text: string } | { kind: 'int' | 'default' | 'path'; name: string }

export interface Rule {
  method: string
  pattern: string
  segs: Seg[]
  weights: number[]
  re: RegExp
  names: string[]
  handler: Handler
  order: number
}

const WEIGHT = { static: 0, int: 50, default: 100, path: 200 } as const

export function parsePattern(pattern: string): Seg[] {
  return pattern.split('/').slice(1).map((s): Seg => {
    const m = /^<(?:(int|path|string):)?([A-Za-z_][A-Za-z0-9_]*)>$/.exec(s)
    if (!m) {
      if (s.includes('<')) throw new Error(`unsupported rule segment ${s} in ${pattern}`)
      return { kind: 'static', text: s }
    }
    const conv = m[1] === 'int' ? 'int' : m[1] === 'path' ? 'path' : 'default'
    return { kind: conv, name: m[2] }
  })
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function compileRule(method: string, pattern: string, handler: Handler, order: number): Rule {
  const segs = parsePattern(pattern)
  const names: string[] = []
  const body = segs.map(s => {
    if (s.kind === 'static') return escapeRe(s.text)
    names.push(s.name)
    // Werkzeug: IntegerConverter \d+, UnicodeConverter [^/]+, PathConverter [^/].*?
    return s.kind === 'int' ? '(\\d+)' : s.kind === 'path' ? '([^/].*?)' : '([^/]+)'
  }).join('/')
  return {
    method, pattern, segs, handler, order, names,
    weights: segs.map(s => WEIGHT[s.kind]),
    re: new RegExp(`^/${body}$`),
  }
}

function compareRules(a: Rule, b: Rule): number {
  const n = Math.min(a.weights.length, b.weights.length)
  for (let i = 0; i < n; i++) {
    if (a.weights[i] !== b.weights[i]) return a.weights[i] - b.weights[i]
    // Two static segments that differ cannot both match; order is irrelevant.
  }
  if (a.weights.length !== b.weights.length) return b.weights.length - a.weights.length
  return a.order - b.order
}

export type Match =
  | { ok: true; rule: Rule; params: Params }
  | { ok: false; status: 404 | 405; allow?: string[] }

export class Router {
  rules: Rule[] = []
  private sorted: Rule[] | null = null

  add(method: string, pattern: string, handler: Handler): this {
    this.rules.push(compileRule(method.toUpperCase(), pattern, handler, this.rules.length))
    this.sorted = null
    return this
  }

  get(p: string, h: Handler) { return this.add('GET', p, h) }
  post(p: string, h: Handler) { return this.add('POST', p, h) }
  put(p: string, h: Handler) { return this.add('PUT', p, h) }
  delete(p: string, h: Handler) { return this.add('DELETE', p, h) }

  match(method: string, path: string): Match {
    if (!this.sorted) this.sorted = [...this.rules].sort(compareRules)
    const m = method.toUpperCase()
    const allow = new Set<string>()
    for (const rule of this.sorted) {
      const r = rule.re.exec(path)
      if (!r) continue
      // HEAD is answered by GET rules, as in Werkzeug.
      if (rule.method !== m && !(m === 'HEAD' && rule.method === 'GET')) { allow.add(rule.method); continue }
      const params: Params = {}
      rule.names.forEach((name, i) => { params[name] = decodeURIComponent(r[i + 1]) })
      return { ok: true, rule, params }
    }
    if (allow.size) return { ok: false, status: 405, allow: [...allow].sort() }
    return { ok: false, status: 404 }
  }

  /** Every (method, pattern) pair, for the contract tests. */
  table(): { method: string; pattern: string }[] {
    return this.rules.map(r => ({ method: r.method, pattern: r.pattern }))
  }
}

export const ok = (data: unknown, status = 200): Res => ({ status, data })
export const fail = (status: number, data: unknown): Res => ({ status, data })
