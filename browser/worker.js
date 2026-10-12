/*
 * AZURE2 in the page: a Web Worker running Pyodide, pyazr with the engine
 * compiled to WebAssembly, and the server's Flask app (see bridge.py).
 *
 * Messages in:  { id, method, path, body }
 * Messages out: { id, status, contentType, text }   or   { id, error }
 *               { progress: "..." } while starting up
 *
 * Everything is loaded from this file's own directory, laid out by
 * browser/assemble.py:
 *
 *   pyodide/            Pyodide core
 *   wheels/             numpy, mpmath, Flask and its dependencies
 *   runtime.zip         pyazr (+ _azure2 wasm), server/app, bridge.py
 *   manifest.json       the wheel file names
 *   evaluations/<id>.zip
 *   evaluations/<id>/initial.json   scheme, data and smooth curves at the
 *                                   shipped parameters, fetched by the page
 *                                   itself before this worker starts
 */

const BASE = self.location.href.replace(/[^/]*$/, "")
const ROOT = "/home/pyodide"

let ready = null
const unpacked = new Set()

function progress(text) {
  self.postMessage({ progress: text })
}

async function fetchBytes(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function boot() {
  progress("Loading Python")
  importScripts(`${BASE}pyodide/pyodide.js`)
  const pyodide = await loadPyodide({ indexURL: `${BASE}pyodide/` })
  const manifest = await (await fetch(`${BASE}manifest.json`)).json()

  progress("Loading NumPy and Flask")
  await pyodide.loadPackage(manifest.wheels.map((w) => `${BASE}wheels/${w}`))

  progress("Loading AZURE2")
  pyodide.unpackArchive(await fetchBytes(`${BASE}runtime.zip`), "zip", { extractDir: `${ROOT}/runtime` })
  pyodide.FS.mkdirTree(`${ROOT}/evaluations`)
  pyodide.runPython(`
import sys
sys.path.insert(0, "${ROOT}/runtime")
import bridge
bridge.start("${ROOT}/evaluations")
`)
  return pyodide
}

async function ensureEvaluation(pyodide, id) {
  if (unpacked.has(id)) return
  progress("Loading the evaluation")
  const bytes = await fetchBytes(`${BASE}evaluations/${encodeURIComponent(id)}.zip`)
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

// One request at a time: the engine is not re-entrant, and pyazr changes the
// working directory for every call.
let queue = Promise.resolve()

self.onmessage = (event) => {
  const { id } = event.data
  queue = queue.then(async () => {
    try {
      self.postMessage({ id, ...(await serve(event.data)) })
    } catch (err) {
      self.postMessage({ id, error: String(err?.message ?? err) })
    }
  })
}
