/**
 * The API surface of the pinned WebDAQ frontend (design §2.4 i): every
 * `api.get|post|put|delete|request(...)` call, every call through the Grafana
 * wrapper (`grafanaFetch(path, {method})`), and every same-origin
 * `fetch('/api/…')`, found with the TypeScript compiler API.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import ts from 'typescript'

export interface SurfaceCall {
  /** File relative to frontend/src. */
  file: string
  method: string
  /** Path template, `${…}` kept as written. */
  template: string
  via: 'axios' | 'grafana' | 'fetch'
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

/** The text of a string or template argument, with `${expr}` kept; null when not static. */
function templateText(node: ts.Node, sf: ts.SourceFile): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text
    for (const span of node.templateSpans) s += '${' + span.expression.getText(sf) + '}' + span.literal.text
    return s
  }
  return null
}

function methodOption(node: ts.Node | undefined): string | null {
  if (!node || !ts.isObjectLiteralExpression(node)) return null
  for (const p of node.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText() === 'method') {
      const v = p.initializer
      if (ts.isStringLiteral(v)) return v.text.toUpperCase()
    }
  }
  return null
}

export function extractSurface(srcDir: string): SurfaceCall[] {
  const out: SurfaceCall[] = []
  for (const file of walk(srcDir).sort()) {
    const rel = path.relative(srcDir, file).split(path.sep).join('/')
    // The deleted route handlers (overlay #2) are not part of the exported app.
    if (rel.startsWith('app/api/') || rel.startsWith('api/')) continue
    const text = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const e = n.expression
        if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'api') {
          const m = e.name.text
          if (['get', 'post', 'put', 'delete'].includes(m) && n.arguments[0]) {
            const t = templateText(n.arguments[0], sf)
            if (t !== null) out.push({ file: rel, method: m.toUpperCase(), template: t, via: 'axios' })
          }
        }
        if (ts.isIdentifier(e) && e.text === 'grafanaFetch' && n.arguments[0]) {
          const t = templateText(n.arguments[0], sf)
          if (t !== null) out.push({ file: rel, method: methodOption(n.arguments[1]) ?? 'GET', template: '/grafana' + t, via: 'grafana' })
        }
        if (ts.isIdentifier(e) && e.text === 'fetch' && n.arguments[0]) {
          const t = templateText(n.arguments[0], sf)
          if (t !== null && t.startsWith('/api/')) out.push({ file: rel, method: methodOption(n.arguments[1]) ?? 'GET', template: t, via: 'fetch' })
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return out
}

/** Unique (method, template) pairs, sorted: what api-surface.json holds. */
export function surfaceTable(calls: SurfaceCall[]) {
  const seen = new Map<string, { method: string; template: string; via: string; files: string[] }>()
  for (const c of calls) {
    const k = `${c.method} ${c.template}`
    const e = seen.get(k) ?? { method: c.method, template: c.template, via: c.via, files: [] }
    if (!e.files.includes(c.file)) e.files.push(c.file)
    seen.set(k, e)
  }
  return [...seen.values()].sort((a, b) => (a.template + a.method < b.template + b.method ? -1 : 1))
}

export const surfaceHash = (table: ReturnType<typeof surfaceTable>) =>
  crypto.createHash('sha256').update(table.map(e => `${e.method} ${e.template}`).join('\n')).digest('hex')

/** A concrete request for a template: `${…}` → "0" (digits satisfy every converter); query dropped. */
export function sampleRequest(template: string): { path: string; query: Record<string, string> } {
  const [p, qs] = template.replace(/\$\{[^}]*\}/g, '0').split('?')
  const query: Record<string, string> = {}
  if (qs) new URLSearchParams(qs).forEach((v, k) => { query[k] = v })
  return { path: p, query }
}

// ── Flask routes ────────────────────────────────────────────────────────────

export interface FlaskRoute { method: string; pattern: string; loc: string }

/** Every @bp.route of the blueprints server/app/__init__.py registers. */
export function flaskRoutes(serverApp: string): FlaskRoute[] {
  const init = fs.readFileSync(path.join(serverApp, '__init__.py'), 'utf8')
  const registered = new Set([...init.matchAll(/app\.register_blueprint\((\w+)\.bp\)/g)].map(m => m[1]))
  const out: FlaskRoute[] = []
  for (const f of fs.readdirSync(path.join(serverApp, 'routes')).sort()) {
    const mod = f.replace(/\.py$/, '')
    if (!f.endsWith('.py') || !registered.has(mod)) continue
    const lines = fs.readFileSync(path.join(serverApp, 'routes', f), 'utf8').split('\n')
    lines.forEach((l, i) => {
      const m = /@bp\.route\(\s*['"]([^'"]+)['"](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?/.exec(l)
      if (!m) return
      const methods = (m[2] ?? "'GET'").replace(/['"\s]/g, '').split(',')
      for (const method of methods) out.push({ method: method.toUpperCase(), pattern: m[1], loc: `routes/${f}:${i + 1}` })
    })
  }
  return out
}

/** The Next route handlers the static export loses (overlay #2), served by the fetch shim. */
export const NEXT_ROUTES: FlaskRoute[] = [
  { method: 'GET', pattern: '/api/server-control', loc: 'app/api/server-control/route.ts' },
  { method: 'POST', pattern: '/api/server-control', loc: 'app/api/server-control/route.ts' },
  { method: 'GET', pattern: '/api/cache', loc: 'app/api/cache/route.ts' },
  { method: 'POST', pattern: '/api/cache', loc: 'app/api/cache/route.ts' },
]
