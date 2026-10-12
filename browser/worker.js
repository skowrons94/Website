/*
 * AZURE2 in the page: a Web Worker running Pyodide, pyazr with the engine
 * compiled to WebAssembly, and the server's Flask app (see bridge.py).
 *
 * The page runs one of these per model role (lib/browser-engine.ts), named
 * by the worker's `name`:
 *
 *   azure2-data     the Flask app: sessions, the data model, serializers;
 *                   it answers "delegate" for what the others calculate
 *   azure2-fine     the plots' smooth-curve model     (bridge.role_calc)
 *   azure2-extrap   the extrapolations' model
 *   azure2-grid     the energy × angle grids' model   (started on demand)
 *
 * AZURE2 keeps state across the models of one interpreter, so one worker
 * holding two models initialised each again whenever the other had been
 * used (18 s per ⁷Be edit); one model per worker never re-initialises.
 *
 * Messages in:  { id, method, path, body }        a request to the Flask app
 *               { id, call, args, evaluation }    a bridge function (after
 *                                                 unpacking that evaluation)
 * Messages out: { id, status, contentType, text } | { id, value } | { id, error }
 *               { progress: "..." } while starting up
 *
 * Everything is loaded from this file's own directory, laid out by
 * browser/assemble.py:
 *
 *   pyodide/            Pyodide core
 *   wheels/             numpy
 *   runtime.zip         pyazr (+ _azure2 wasm), server/app, Flask, bridge.py
 *   manifest.json       the wheel file names, and a hash of each zip
 *   evaluations/<id>.zip
 *   evaluations/<id>/initial.json   scheme, data and smooth curves at the
 *                                   shipped parameters, fetched by the page
 *                                   itself before any worker starts
 *
 * The large files (Pyodide's WebAssembly and standard library, NumPy, the
 * zips) are kept in the Cache Storage under their hash, so the second and
 * third worker -- and the next visit -- do not download them again.
 */

const BASE = self.location.href.replace(/[^/]*$/, "")
const ROOT = "/home/pyodide"
const ROLE = (self.name || "azure2-data").replace(/^azure2-/, "")
const CACHE = "azure2-runtime"

let ready = null
let manifest = null
const unpacked = new Set()

function progress(text) {
  self.postMessage({ progress: text })
}

const netFetch = self.fetch.bind(self)

/**
 * A file of this build (`name` relative to this directory), from the Cache
 * Storage when it holds this version (manifest.json's hash), else from the
 * network, then kept there.
 */
async function cachedResponse(name) {
  const hash = manifest?.hashes?.[name]
  // The page starts its workers together: one downloads a file while the
  // others wait for it (a Web Lock per file), then read it from the cache.
  const locks = hash && self.caches ? self.navigator?.locks : null
  if (locks) return locks.request(`azure2:${name}:${hash}`, () => cachedResponseNow(name))
  return cachedResponseNow(name)
}

async function cachedResponseNow(name) {
  const hash = manifest?.hashes?.[name]
  const url = `${BASE}${name}${hash ? `?v=${hash}` : ""}`
  let cache = null
  try {
    cache = hash && self.caches ? await caches.open(CACHE) : null
    const hit = cache && (await cache.match(url))
    if (hit) return hit
  } catch {
    cache = null // no Cache Storage here (an insecure origin, private mode)
  }
  const response = await netFetch(url)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  if (cache) {
    try {
      // Older versions of this file go.
      for (const old of await cache.keys()) {
        if (old.url.split("?")[0] === url.split("?")[0] && old.url !== url) await cache.delete(old)
      }
      await cache.put(url, response.clone())
    } catch {
      /* full or blocked: the HTTP cache still has it */
    }
  }
  return response
}

async function fetchBytes(name) {
  return new Uint8Array(await (await cachedResponse(name)).arrayBuffer())
}

// Pyodide's own downloads (its WebAssembly, the standard library, NumPy) go
// through the Cache Storage too: the second and third worker would otherwise
// download the 8.6 MB engine again.
self.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const name = url.startsWith(BASE) ? url.slice(BASE.length).split("?")[0] : null
  if (name && manifest?.hashes?.[name]) return cachedResponse(name)
  return netFetch(input, init)
}

async function boot() {
  progress("Loading Python")
  manifest = await (await netFetch(`${BASE}manifest.json`, { cache: "no-cache" })).json()
  importScripts(`${BASE}pyodide/pyodide.js`)
  const pyodide = await loadPyodide({ indexURL: `${BASE}pyodide/` })

  progress("Loading NumPy and Flask")
  await pyodide.loadPackage(manifest.wheels.map((w) => `${BASE}wheels/${w}`))

  progress("Loading AZURE2")
  pyodide.unpackArchive(await fetchBytes("runtime.zip"), "zip", { extractDir: `${ROOT}/runtime` })
  pyodide.FS.mkdirTree(`${ROOT}/evaluations`)
  pyodide.runPython(`
import sys
sys.path.insert(0, "${ROOT}/runtime")
import bridge
if "${ROLE}" == "data":
    bridge.start("${ROOT}/evaluations", delegate=True)
else:
    bridge.role_start("${ROOT}/evaluations")
`)
  return pyodide
}

async function ensureEvaluation(pyodide, id) {
  if (unpacked.has(id)) return
  progress("Loading the evaluation")
  const bytes = await fetchBytes(`evaluations/${encodeURIComponent(id)}.zip`)
  pyodide.unpackArchive(bytes, "zip", { extractDir: `${ROOT}/evaluations/${id}` })
  unpacked.add(id)
}

async function serve({ method, path, body }) {
  ready ??= boot()
  const pyodide = await ready
  const open = path.match(/^\/api\/evaluations\/([^/]+)\/open$/)
  if (open) await ensureEvaluation(pyodide, decodeURIComponent(open[1]))
  if (open) progress("Opening the model")
  const handle = pyodide.globals.get("bridge").handle
  const result = handle(method, path, body ?? null)
  const [status, contentType, text] = result.toJs()
  result.destroy()
  return { status, contentType, text }
}

async function call({ call: name, args, evaluation }) {
  ready ??= boot()
  const pyodide = await ready
  if (evaluation) await ensureEvaluation(pyodide, evaluation)
  const fn = pyodide.globals.get("bridge")[name]
  let value = fn(...(args ?? []))
  if (value && typeof value === "object" && typeof value.toJs === "function") {
    const proxy = value
    value = proxy.toJs()
    proxy.destroy()
  }
  return value
}

// One request at a time: the engine is not re-entrant, and pyazr changes the
// working directory for every call.
let queue = Promise.resolve()

self.onmessage = (event) => {
  const { id } = event.data
  queue = queue.then(async () => {
    try {
      if (event.data.call) {
        const value = await call(event.data)
        const transfer = value instanceof Uint8Array ? [value.buffer] : []
        self.postMessage({ id, value }, transfer)
      } else self.postMessage({ id, ...(await serve(event.data)) })
    } catch (err) {
      self.postMessage({ id, error: String(err?.message ?? err) })
    }
  })
}
