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

async function bundles(esbuild, publicDir) {
  fetchJsroot()
  const jsOut = path.join(publicDir, 'jsroot')
  const r1 = await esbuild.build({
    entryPoints: { jsroot: path.join(HERE, 'jsroot', 'entry.mjs') }, bundle: true, splitting: true, format: 'esm',
    minify: true, outdir: jsOut, nodePaths: [path.join(WORK, 'node_modules')], external: JSROOT_EXTERNAL,
    entryNames: '[name]-[hash]', chunkNames: 'c-[hash]', target: 'es2020', platform: 'browser', metafile: true,
    legalComments: 'none', logLevel: 'warning',
  })
  const jsEntry = Object.entries(r1.metafile.outputs).find(([, o]) => o.entryPoint)[0]
  const r2 = await esbuild.build({
    entryPoints: { worker: path.join(HERE, 'sim', 'state', 'worker.ts') }, bundle: true, format: 'iife', minify: true,
    outdir: path.join(publicDir, 'demo'), entryNames: '[name]-[hash]', target: 'es2020', platform: 'browser',
    metafile: true, legalComments: 'none', logLevel: 'warning', tsconfig: path.join(HERE, 'tsconfig.json'),
  })
  const wEntry = Object.keys(r2.metafile.outputs).find(f => f.endsWith('.js'))
  const storage = await esbuild.build({
    entryPoints: [path.join(HERE, 'shim', 'storage-shim.ts')], bundle: false, format: 'iife', minify: true,
    write: false, target: 'es2019', logLevel: 'warning',
  })
  return {
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

function prepareApp(upstream) {
  fs.rmSync(APP, { recursive: true, force: true })
  copyDir(path.join(upstream, pin.frontend), APP)
  // #2: route handlers cannot be exported; the fetch shim serves their two endpoints.
  fs.rmSync(path.join(APP, 'src', 'app', 'api'), { recursive: true, force: true })
  fs.rmSync(path.join(APP, 'src', 'api'), { recursive: true, force: true })
  copyDir(path.join(HERE, 'overlay'), APP)
  // Main-thread shims only; the worker side (router, handlers) is bundled separately.
  copyDir(path.join(HERE, 'shim'), path.join(APP, 'src', 'demo', 'shim'), f => !f.startsWith('handlers/'))
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
    const bad = [...s.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map(m => m[1]).filter(u => BASE && !u.startsWith(BASE + '/') && u !== BASE)
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
