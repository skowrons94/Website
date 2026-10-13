#!/usr/bin/env node
/**
 * Build the WebDAQ demo: the real WebDAQ frontend at the commit pinned in
 * pin.json, with the overlay applied, exported as a static site.
 *
 *   node build.mjs                       → ../public/webdaq-demo, basePath /webdaq-demo
 *   DEMO_BASE_PATH=/Website/webdaq-demo node build.mjs
 *   node build.mjs --out <dir>           → elsewhere
 *   node build.mjs --fetch-only          → only fetch + verify the pinned source (.work/upstream)
 *   node build.mjs --keep                → keep .work/app (the Next build tree) afterwards
 *   WEBDAQ_SRC=/path/to/webdaq           → take the commit from a local clone instead of GitHub
 *
 * Steps: fetch the pinned frontend (and server routes, for the contract tests)
 * into .work/upstream/<commit>/; check that every upstream file the overlay
 * replaces still has the sha256 recorded in pin.json; copy the frontend into
 * .work/app, delete the route handlers, copy overlay/ and the main-thread shims;
 * bundle the worker and the trimmed JSROOT with esbuild; next build; check the
 * export; copy it out.
 */
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORK = path.join(HERE, '.work')
const pin = JSON.parse(fs.readFileSync(path.join(HERE, 'pin.json'), 'utf8'))
const args = process.argv.slice(2)
const flag = f => args.includes(f)
const opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }

const BASE = (process.env.DEMO_BASE_PATH ?? '/webdaq-demo').replace(/\/+$/, '')
if (BASE && !BASE.startsWith('/')) fail(`DEMO_BASE_PATH must start with / (got ${BASE})`)
const OUT = path.resolve(opt('--out') ?? path.join(HERE, '..', 'public', 'webdaq-demo'))
const UPSTREAM = path.join(WORK, 'upstream', pin.commit)
const APP = path.join(WORK, 'app')

function fail(msg) { console.error(`\nbuild.mjs: ${msg}`); process.exit(1) }
function log(msg) { console.log(`[webdaq-demo] ${msg}`) }
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex')
function run(cmd, argv, o = {}) { return execFileSync(cmd, argv, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28, ...o }) }

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p, base))
    else out.push(path.relative(base, p).split(path.sep).join('/'))
  }
  return out.sort()
}

// ── 1. the pinned source ────────────────────────────────────────────────────
/** .work/webdaq → the pinned tree, so tsconfig paths (@webdaq/*) need no commit in them. */
function linkCurrent() {
  const link = path.join(WORK, 'webdaq')
  fs.rmSync(link, { force: true, recursive: true })
  fs.symlinkSync(path.relative(WORK, UPSTREAM), link)
}

export function fetchUpstream() {
  const marker = path.join(UPSTREAM, '.complete')
  if (fs.existsSync(marker)) { linkCurrent(); return UPSTREAM }
  fs.rmSync(UPSTREAM, { recursive: true, force: true })
  fs.mkdirSync(UPSTREAM, { recursive: true })
  const paths = [pin.frontend, 'server/app']
  let gitDir
  if (process.env.WEBDAQ_SRC) {
    gitDir = process.env.WEBDAQ_SRC
    log(`source: ${gitDir} @ ${pin.commit}`)
  } else {
    gitDir = path.join(WORK, 'git')
    if (!fs.existsSync(gitDir)) run('git', ['init', '-q', '--bare', gitDir])
    log(`fetching ${pin.repo} @ ${pin.commit}`)
    run('git', ['-C', gitDir, 'fetch', '-q', '--depth', '1', pin.repo, pin.commit], { stdio: 'inherit' })
  }
  const tar = run('git', ['-C', gitDir, 'archive', '--format=tar', pin.commit, ...paths])
  execFileSync('tar', ['-x', '-C', UPSTREAM], { input: tar })
  fs.writeFileSync(marker, pin.commit + '\n')
  linkCurrent()
  if (!process.env.WEBDAQ_SRC) fs.rmSync(gitDir, { recursive: true, force: true })
  return UPSTREAM
}

/** sha256 of an overridden upstream path: the file, or "path sha" lines of a directory listing. */
export function overrideHash(root, rel) {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) return 'absent'
  if (fs.statSync(p).isDirectory()) {
    return sha256(walk(p).map(f => `${f} ${sha256(fs.readFileSync(path.join(p, f)))}`).join('\n'))
  }
  return sha256(fs.readFileSync(p))
}

function checkOverrides(root) {
  const bad = []
  for (const [rel, want] of Object.entries(pin.overrides)) {
    const got = overrideHash(path.join(root, pin.frontend), rel)
    if (got !== want) bad.push(`  ${rel}\n    pinned ${want}\n    now    ${got}`)
  }
  if (bad.length) {
    fail('upstream files the overlay replaces have changed at this commit:\n' + bad.join('\n') +
      '\nCompare them with overlay/, update the overlay, then the hashes in pin.json.')
  }
  log(`overlay hashes match (${Object.keys(pin.overrides).length} upstream paths)`)
}

// ── 2. JSROOT, trimmed and self-hosted ──────────────────────────────────────
function fetchJsroot() {
  const dir = path.join(WORK, 'node_modules', 'jsroot')
  const tgz = path.join(WORK, `jsroot-${pin.jsroot.version}.tgz`)
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    if (!fs.existsSync(tgz)) run('npm', ['pack', `jsroot@${pin.jsroot.version}`, '--silent', '--pack-destination', WORK])
    const got = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64')
    if (got !== pin.jsroot.integrity) fail(`jsroot ${pin.jsroot.version} tarball integrity mismatch:\n  ${got}`)
    fs.mkdirSync(dir, { recursive: true })
    execFileSync('tar', ['-xzf', tgz, '-C', dir, '--strip-components=1'])
    fs.rmSync(tgz)
  }
  return dir
}

// Node-only branches of JSROOT (jsdom, canvas, three for 3-D, zstd, mathjax) never run in the page.
const JSROOT_EXTERNAL = ['three', 'three/addons', 'canvas', 'jsdom', '@oneidentity/zstd-js', 'mathjax', 'mathjax/*',
  'xhr2', 'tmp', '@resvg/resvg-js', 'fs', 'zlib', 'path', 'url', 'crypto', 'os', 'child_process']

/**
 * Stubs for what WebDAQ never draws: three.js (3-D/lego, statically imported by the
 * 2-D painters through base3d) and jsPDF (PDF export, statically imported by draw.mjs).
 * The stubs keep every export name, so the 2-D code loads; 3-D draws nothing, PDF export rejects.
 */
const jsrootStubs = {
  name: 'jsroot-stubs',
  setup(build) {
    build.onLoad({ filter: /[\\/]jsroot[\\/]modules[\\/](three|three_addons)\.mjs$/ }, args => {
      const src = fs.readFileSync(args.path, 'utf8')
      const lists = [...src.matchAll(/^export \{([^}]*)\};?\s*$/gm)].map(m => m[1])
      const names = lists.flatMap(l => l.split(',').map(x => x.trim().split(/\s+as\s+/).pop()).filter(Boolean))
      const body = names.map(n => n === 'REVISION' ? `export const REVISION = '0';` : `export const ${n} = Inert;`).join('\n')
      // base3d builds a few THREE objects at module load (Box3D), so the stub must be
      // constructible: an inert proxy that absorbs construction, calls and property reads.
      const inert = `const h = { get: (t, p) => p === Symbol.toPrimitive ? () => 0 : p === 'prototype' ? {} : Inert, apply: () => Inert, construct: () => Inert }\n` +
        `const Inert = new Proxy(function () {}, h)\n`
      return { contents: `${inert}${body}\n`, loader: 'js' }
    })
    build.onLoad({ filter: /[\\/]jsroot[\\/]modules[\\/]base[\\/]makepdf\.mjs$/ }, () => ({
      contents: `export function makePDF() { return Promise.reject(new Error('PDF export is not part of the WebDAQ demo bundle')) }\n`, loader: 'js',
    }))
  },
}

async function bundles(esbuild, publicDir) {
  fetchJsroot()
  const jsOut = path.join(publicDir, 'jsroot')
  const r1 = await esbuild.build({
    entryPoints: { jsroot: path.join(HERE, 'jsroot', 'entry.mjs') }, bundle: true, splitting: true, format: 'esm',
    minify: true, outdir: jsOut, nodePaths: [path.join(WORK, 'node_modules')], external: JSROOT_EXTERNAL,
    entryNames: '[name]-[hash]', chunkNames: 'c-[hash]', target: 'es2020', platform: 'browser', metafile: true,
    legalComments: 'none', logLevel: 'warning', plugins: [jsrootStubs],
  })
  const outs = r1.metafile.outputs
  const jsEntry = Object.entries(outs).find(([, o]) => o.entryPoint?.endsWith('jsroot/entry.mjs'))[0]
  // What drawing a spectrum, a trace or the PSD plot needs: the entry's static
  // graph plus the lazily imported painters WebDAQ's TH1F/TH2F/TCanvas draws pull in.
  const closure = (f, seen = new Set()) => {
    if (seen.has(f)) return seen
    seen.add(f)
    for (const i of outs[f].imports) if (i.kind === 'import-statement' && outs[i.path]) closure(i.path, seen)
    return seen
  }
  const PAINTERS = ['hist/TH1Painter.mjs', 'hist2d/TH1Painter.mjs', 'hist/TH2Painter.mjs', 'hist2d/TH2Painter.mjs',
    'gpad/TCanvasPainter.mjs', 'hist/TPavePainter.mjs', 'gpad/TFramePainter.mjs']
  const draw = closure(jsEntry)
  for (const [f, o] of Object.entries(outs)) {
    if (Object.keys(o.inputs).some(i => PAINTERS.some(p => i.endsWith('/modules/' + p)))) closure(f, draw)
  }
  const jsrootDraw = [...draw].map(f => path.basename(f)).sort()
  // A module worker, split: line data and each detector's response table are
  // chunks loaded after the detector choice (design §6.4).
  const r2 = await esbuild.build({
    entryPoints: { worker: path.join(HERE, 'sim', 'state', 'worker.ts') }, bundle: true, format: 'esm', splitting: true,
    minify: true, outdir: path.join(publicDir, 'demo'), entryNames: '[name]-[hash]', chunkNames: 'c-[hash]',
    target: 'es2020', platform: 'browser', metafile: true, legalComments: 'none', logLevel: 'warning',
    tsconfig: path.join(HERE, 'tsconfig.json'),
  })
  const wOuts = r2.metafile.outputs
  const wEntry = Object.entries(wOuts).find(([, o]) => o.entryPoint?.endsWith('sim/state/worker.ts'))[0]
  const workerChunks = {}
  for (const [f, o] of Object.entries(wOuts)) {
    if (!f.endsWith('.js') || f === wEntry) continue
    const m = Object.keys(o.inputs).map(i => /(?:tables\/(\w+)|data\/(lines))\.json$/.exec(i)).find(Boolean)
    workerChunks[path.basename(f)] = m ? (m[1] ?? m[2]) : 'code'
  }
  const storage = await esbuild.build({
    entryPoints: [path.join(HERE, 'shim', 'storage-shim.ts')], bundle: false, format: 'iife', minify: true,
    write: false, target: 'es2019', logLevel: 'warning',
  })
  return {
    jsrootDraw,
    jsrootFile: path.basename(jsEntry),
    workerFile: path.basename(wEntry),
    workerChunks,
    jsroot: `${BASE}/jsroot/${path.basename(jsEntry)}`,
    worker: `${BASE}/demo/${path.basename(wEntry)}`,
    storageShim: storage.outputFiles[0].text.trim(),
  }
}

// ── 3. the overlaid app ─────────────────────────────────────────────────────
function copyDir(src, dst, filter = () => true) {
  for (const f of walk(src)) {
    if (!filter(f)) continue
    const to = path.join(dst, f)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(path.join(src, f), to)
  }
}

/**
 * Small edits to upstream files, each found exactly once (the file's hash is pinned in
 * pin.json.overrides as well): less to keep in step than a whole copy in overlay/.
 */
const PATCHES = [
  {
    // #8: the dashboard's fast refresh copies the bin contents only. In the demo the
    // calibration changes with the scenario (in-beam HPGe gain), so a changed x axis
    // rebuilds the plot, without the zoom of the old axis.
    file: 'src/components/histo-dashboard.tsx',
    edits: [
      ['    const needsRebuild =\n      isFirstTime || forceRebuild || binCountChanged || roiCountChanged || logChanged',
        '    const axisChanged =\n      !!existingHist?.fXaxis && !!histogram.fXaxis &&\n      (existingHist.fXaxis.fXmin !== histogram.fXaxis.fXmin || existingHist.fXaxis.fXmax !== histogram.fXaxis.fXmax)\n' +
        '    const needsRebuild =\n      isFirstTime || forceRebuild || binCountChanged || roiCountChanged || logChanged || axisChanged'],
      ['      let preservedZoom: { xmin: number; xmax: number } | null = null\n      if (!isFirstTime) {',
        '      let preservedZoom: { xmin: number; xmax: number } | null = null\n      if (!isFirstTime && !axisChanged) {'],
    ],
  },
]

function applyPatches() {
  for (const p of PATCHES) {
    const f = path.join(APP, p.file)
    let s = fs.readFileSync(f, 'utf8')
    for (const [find, replace] of p.edits) {
      const n = s.split(find).length - 1
      if (n !== 1) fail(`patch for ${p.file}: expected the text once, found it ${n} times:\n${find}`)
      s = s.replace(find, replace)
    }
    fs.writeFileSync(f, s)
  }
}

function prepareApp(upstream) {
  fs.rmSync(APP, { recursive: true, force: true })
  copyDir(path.join(upstream, pin.frontend), APP)
  // #2: route handlers cannot be exported; the fetch shim serves their two endpoints.
  fs.rmSync(path.join(APP, 'src', 'app', 'api'), { recursive: true, force: true })
  fs.rmSync(path.join(APP, 'src', 'api'), { recursive: true, force: true })
  copyDir(path.join(HERE, 'overlay'), APP)
  // Main-thread shims only; the worker side (router, handlers) is bundled separately.
  copyDir(path.join(HERE, 'shim'), path.join(APP, 'src', 'demo', 'shim'), f => !f.startsWith('handlers/'))
  copyDir(path.join(HERE, 'shell'), path.join(APP, 'src', 'demo', 'shell'))
  copyDir(path.join(HERE, 'tour'), path.join(APP, 'src', 'demo', 'tour'))
  applyPatches()
}

// ── 4. checks on the export ─────────────────────────────────────────────────
function checkExport(out) {
  const files = walk(out)
  const offending = []
  for (const f of files) {
    if (!/\.(html|js|mjs|txt|json|css)$/.test(f)) continue
    const s = fs.readFileSync(path.join(out, f), 'utf8')
    // JSROOT itself keeps root.cern in documentation links and a file-remap
    // table, never fetched by WebDAQ's calls; what must not exist is any load
    // of JSROOT from root.cern, nor any reference outside the JSROOT bundle.
    if (f.startsWith('jsroot/') ? /root\.cern\/js\/latest/.test(s) : /root\.cern/.test(s)) offending.push(f)
  }
  if (offending.length) fail(`the export still references root.cern:\n  ${offending.join('\n  ')}`)
  const pages = files.filter(f => f.endsWith('index.html'))
  const logbook = pages.filter(f => /^logbook\/\d+\/index\.html$/.test(f))
  for (const p of pages) {
    const s = fs.readFileSync(path.join(out, p), 'utf8')
    // Assets only: links out to the hosting site (the banner's "Back to the site") leave the base on purpose.
    const bad = [...s.matchAll(/<(?:script|img|link)\b[^>]*?\s(?:src|href)="(\/[^"]*)"/g)].map(m => m[1]).filter(u => BASE && !u.startsWith(BASE + '/') && u !== BASE)
    if (bad.length) fail(`${p} has asset URLs outside the base path ${BASE}: ${bad.slice(0, 3).join(', ')}`)
  }
  log(`export: ${pages.length} pages (${logbook.length} logbook run pages), ${files.length} files, no root.cern, every URL under ${BASE || '/'}`)
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now()
  const upstream = fetchUpstream()
  checkOverrides(upstream)
  if (flag('--fetch-only')) return
  const esbuild = await import('esbuild')
  prepareApp(upstream)
  const b = await bundles(esbuild, path.join(APP, 'public'))
  fs.writeFileSync(path.join(APP, 'src', 'demo', 'generated.ts'),
    `// Generated by build.mjs — do not edit.\nexport const STORAGE_SHIM_JS = ${JSON.stringify(b.storageShim)}\n`)
  log(`worker ${b.worker}, jsroot ${b.jsroot}`)
  // A few hundred bytes the size script and the shell read: what was built from what.
  fs.writeFileSync(path.join(APP, 'public', 'demo', 'build-info.json'), JSON.stringify({
    webdaq: { repo: pin.repo, commit: pin.commit }, jsroot: { version: pin.jsroot.version, entry: b.jsrootFile, draw: b.jsrootDraw },
    worker: b.workerFile, workerChunks: b.workerChunks, basePath: BASE,
  }) + '\n')
  const env = {
    ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_IGNORE_INCORRECT_LOCKFILE: '1', DEMO_BASE_PATH: BASE,
    NEXT_PUBLIC_DEMO_WORKER: b.worker, NEXT_PUBLIC_DEMO_JSROOT: b.jsroot, NEXT_PUBLIC_DEMO_WEBDAQ_COMMIT: pin.commit,
  }
  log(`next build (basePath ${BASE || '/'})`)
  execFileSync(process.execPath, [path.join(HERE, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], { cwd: APP, env, stdio: 'inherit' })
  const exported = path.join(APP, 'out')
  checkExport(exported)
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.cpSync(exported, OUT, { recursive: true })
  if (!flag('--keep')) fs.rmSync(APP, { recursive: true, force: true })
  log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${OUT}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => fail(e?.stack ?? String(e)))
}
