#!/usr/bin/env node
/**
 * Size report and budget check for an exported demo (design §6.4).
 *
 *   node scripts/size.mjs <exported dir>     e.g. ../public/webdaq-demo
 *
 * Every figure is gzip level 9, in kB (1000 bytes would flatter; these are KiB).
 *  - per route: parse <route>/index.html, collect every <script src> (except
 *    nomodule polyfills) and modulepreload/preload-as-script, de-duplicate, sum —
 *    the first-load JS a visitor receives, the quantity Next reports;
 *  - worker, JSROOT draw set (from demo/build-info.json), tables, tour, fflate;
 *  - demo shell: the main-thread demo code bundled on its own from the sources,
 *    plus the inline storage script.
 * Prints a Markdown table (and appends it to $GITHUB_STEP_SUMMARY when set).
 * Exits 1 if a piece is over its budget by more than the tolerance. Writes nothing else.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = path.resolve(process.argv[2] ?? path.join(HERE, '..', 'public', 'webdaq-demo'))
const budgets = JSON.parse(fs.readFileSync(path.join(HERE, 'budgets.json'), 'utf8'))
if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error(`size.mjs: no exported demo at ${OUT}`)
  process.exit(2)
}

const gzCache = new Map()
const gz = f => {
  if (!gzCache.has(f)) gzCache.set(f, zlib.gzipSync(fs.readFileSync(f), { level: 9 }).length)
  return gzCache.get(f)
}
const kB = n => n / 1024
const walk = (dir, base = dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')]) : []

const info = fs.existsSync(path.join(OUT, 'demo', 'build-info.json'))
  ? JSON.parse(fs.readFileSync(path.join(OUT, 'demo', 'build-info.json'), 'utf8')) : null
const BASE = info?.basePath ?? ''

/** URL in the HTML → file in the export. */
function fileOf(url) {
  let p = url.split('?')[0].split('#')[0]
  if (BASE && p.startsWith(BASE + '/')) p = p.slice(BASE.length)
  return path.join(OUT, p.replace(/^\//, ''))
}

function firstLoad(html) {
  const s = fs.readFileSync(html, 'utf8')
  const urls = new Set()
  for (const m of s.matchAll(/<script\b([^>]*)>/g)) {
    const attrs = m[1]
    if (/\bnomodule\b/i.test(attrs)) continue
    const src = /\bsrc="([^"]+)"/.exec(attrs)
    if (src) urls.add(src[1])
  }
  for (const m of s.matchAll(/<link\b([^>]*)>/g)) {
    const a = m[1]
    const href = /\bhref="([^"]+)"/.exec(a)
    if (href && (/rel="modulepreload"/.test(a) || (/rel="preload"/.test(a) && /as="script"/.test(a)))) urls.add(href[1])
  }
  let total = 0
  for (const u of urls) { const f = fileOf(u); if (fs.existsSync(f)) total += gz(f) }
  const inline = [...s.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(x => x.includes('webdaq-demo:v1'))
  return { total, inline: inline.reduce((n, x) => n + zlib.gzipSync(Buffer.from(x), { level: 9 }).length, 0) }
}

const rows = []
let failed = false
const tol = 1 + (budgets.tolerance_pct ?? 0) / 100
function check(name, bytes, budgetKey, note = '') {
  const budget = budgets.pieces[budgetKey]
  if (bytes === null) { rows.push([name, 'absent', budget ?? '', 'not built yet', note]); return }
  const over = budget !== undefined && kB(bytes) > budget * tol
  if (over) failed = true
  rows.push([name, kB(bytes).toFixed(1), budget ?? '', budget === undefined ? '' : over ? 'OVER' : 'ok', note])
}

// ── routes ──
const pages = walk(OUT).filter(f => f.endsWith('index.html') && !/^logbook\/\d+\//.test(f))
const logbookRun = walk(OUT).find(f => /^logbook\/\d+\/index\.html$/.test(f))
if (logbookRun) pages.push(logbookRun)
let shellInline = 0
for (const p of pages.sort()) {
  const route = '/' + p.replace(/index\.html$/, '')
  const fl = firstLoad(path.join(OUT, p))
  shellInline = Math.max(shellInline, fl.inline)
  const key = route === '/' ? 'start_page_first_load' : route === '/dashboard/' ? 'heaviest_route_dashboard' : 'any_other_route'
  check(`route ${route.replace(/^\/logbook\/\d+\/$/, '/logbook/[run_number]/')}`, fl.total + fl.inline, key)
}

// ── demo shell (main-thread demo code, bundled alone from the sources) ──
try {
  const esbuild = await import('esbuild')
  const entries = ['shim/boot.tsx', 'shim/axios-demo.ts', 'shim/load-jsroot.ts', 'shell/Shell.tsx']
    .filter(f => fs.existsSync(path.join(HERE, f)))
  // Split like the app: what loads on demand (drawers, Italian strings, zip) is not counted.
  const r = await esbuild.build({
    entryPoints: entries.map(f => path.join(HERE, f)), bundle: true, splitting: true, minify: true, write: false,
    format: 'esm', platform: 'browser', target: 'es2020', logLevel: 'silent', outdir: path.join(HERE, '.work', 'size-tmp'), metafile: true,
    external: ['react', 'react/*', 'react-dom', 'axios-real', 'next', 'next/*', '*.css'],
    define: { 'process.env.NEXT_PUBLIC_DEMO_WORKER': '""', 'process.env.NEXT_PUBLIC_DEMO_JSROOT': '""', 'process.env.NEXT_PUBLIC_DEMO_WEBDAQ_COMMIT': '""', 'process.env.NEXT_PUBLIC_DEMO_BASE_PATH': '""' },
    tsconfig: path.join(HERE, 'tsconfig.json'),
  })
  const outs = r.metafile.outputs
  const keep = new Set()
  const walkOut = f => { if (keep.has(f)) return; keep.add(f); for (const i of outs[f].imports) if (i.kind === 'import-statement' && outs[i.path]) walkOut(i.path) }
  for (const [f, o] of Object.entries(outs)) if (o.entryPoint && entries.includes(o.entryPoint)) walkOut(f)
  const bytes = r.outputFiles.filter(f => [...keep].some(k => f.path.endsWith(k.replace(/^.*\.work\//, '')))).reduce((n, f) => n + zlib.gzipSync(Buffer.from(f.contents), { level: 9 }).length, 0) + shellInline
  check('demo shell + adapter + shims', bytes, 'demo_shell_every_route', entries.join(', ') + ' + inline storage shim')
} catch (e) {
  rows.push(['demo shell + adapter + shims', 'error', budgets.pieces.demo_shell_every_route, 'FAIL', String(e?.message ?? e).slice(0, 80)])
  failed = true
}

// ── worker, JSROOT, tables, tour, fflate ──
const demoFiles = walk(path.join(OUT, 'demo'))
const worker = info?.worker ? path.join(OUT, 'demo', info.worker) : null
const wChunks = Object.entries(info?.workerChunks ?? {})
// The worker's first load: its entry and the chunks it imports statically. Chunks it
// imports dynamically (handler families for some pages, data tables) are reported apart.
const staticGraph = (file, seen = new Set()) => {
  if (seen.has(file) || !fs.existsSync(file)) return seen
  seen.add(file)
  const src = fs.readFileSync(file, 'utf8')
  for (const m of src.matchAll(/(?:\bfrom|\bimport)\s*["'](\.\/[^"']+)["']/g)) staticGraph(path.join(path.dirname(file), m[1]), seen)
  return seen
}
const wFirst = worker ? staticGraph(worker) : new Set()
check('worker first load (DAQ state + physics)', worker && fs.existsSync(worker) ? [...wFirst].reduce((n, f) => n + gz(f), 0) : null, 'worker')
const lazyCode = wChunks.filter(([f, k]) => k === 'code' && !wFirst.has(path.join(OUT, 'demo', f)))
if (lazyCode.length) rows.push(['worker, lazy chunks (Logbook + run files, ELOG/Grafana, notification settings)', kB(lazyCode.reduce((n, [f]) => n + gz(path.join(OUT, 'demo', f)), 0)).toFixed(1), '', '', 'loaded when a page needs them'])
const jsDraw = info?.jsroot?.draw ?? []
const jsTotal = walk(path.join(OUT, 'jsroot')).reduce((n, f) => n + gz(path.join(OUT, 'jsroot', f)), 0)
check('JSROOT draw set (entry + TH1/TH2/TCanvas painters)', jsDraw.length ? jsDraw.reduce((n, f) => n + gz(path.join(OUT, 'jsroot', f)), 0) : null,
  'jsroot_draw', `all JSROOT chunks on disk: ${kB(jsTotal).toFixed(0)} kB, loaded on demand`)
const tableGroups = new Map()
const linesChunk = wChunks.find(([, k]) => k === 'lines')
const linesGz = linesChunk ? gz(path.join(OUT, 'demo', linesChunk[0])) : 0
for (const [f, k] of wChunks) if (k !== 'code' && k !== 'lines') tableGroups.set(`${k} (+ lines.json)`, gz(path.join(OUT, 'demo', f)) + linesGz)
if (!tableGroups.size && linesChunk) tableGroups.set('lines.json', linesGz)
if (!tableGroups.size) check('response tables per detector', null, 'tables_per_detector', 'or embedded in the worker')
for (const [k, n] of tableGroups) check(`response tables: ${k}`, n, 'tables_per_detector')
const allJs = walk(OUT).filter(f => f.endsWith('.js') && !f.startsWith('jsroot/'))
const findMarker = m => allJs.filter(f => fs.readFileSync(path.join(OUT, f), 'utf8').includes(m))
const tour = findMarker('__webdaqTourBundle')
check('tour (UI + strings)', tour.length ? tour.reduce((n, f) => n + gz(path.join(OUT, f)), 0) : null, 'tour')
const zip = [...new Set([...findMarker('__webdaqZip'), ...findMarker('extra field too long')])]
check('fflate (zip, on demand)', zip.length ? zip.reduce((n, f) => n + gz(path.join(OUT, f)), 0) : null, 'fflate')

// ── report ──
const files = walk(OUT)
const disk = files.reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0)
const table = [
  `### WebDAQ demo size (${BASE || '/'}, gzip -9, kB)`, '',
  '| Piece | Size | Budget | Status | Note |', '|---|---:|---:|---|---|',
  ...rows.map(r => `| ${r.join(' | ')} |`), '',
  `Export on disk: ${(disk / 1e6).toFixed(2)} MB in ${files.length} files.` + (info ? ` WebDAQ ${info.webdaq.commit.slice(0, 7)}, JSROOT ${info.jsroot.version}.` : ''),
].join('\n')
console.log(table)
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, table + '\n')
if (failed) { console.error('\nsize.mjs: over budget'); process.exit(1) }
