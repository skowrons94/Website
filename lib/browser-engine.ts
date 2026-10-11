/**
 * The evaluation API without a server: requests go to a Web Worker that runs
 * AZURE2 (compiled to WebAssembly) and the server's own Flask routes in
 * Pyodide. See browser/README.md.
 *
 * Used when the site is built with `API_BASE=browser` (the GitHub Pages build).
 * The worker starts on the first request that needs the engine; the list of
 * evaluations is a static file and never starts it.
 */

const ROOT = `${process.env.BASE_PATH ?? ""}/azure2`

export interface WorkerResponse {
  status: number
  contentType: string
  text: string
}

type Pending = { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }

let worker: Worker | null = null
let counter = 0
const pending = new Map<number, Pending>()
const progressListeners = new Set<(text: string) => void>()

/** Startup messages ("Loading Python", ...) while the engine is being loaded. */
export function onEngineProgress(listener: (text: string) => void): () => void {
  progressListeners.add(listener)
  return () => {
    progressListeners.delete(listener)
  }
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(`${ROOT}/worker.js`)
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data
    if (data.progress) {
      progressListeners.forEach((l) => l(data.progress))
      return
    }
    const p = pending.get(data.id)
    if (!p) return
    pending.delete(data.id)
    if (data.error) p.reject(new Error(data.error))
    else p.resolve({ status: data.status, contentType: data.contentType, text: data.text })
  }
  worker.onerror = (event) => {
    const error = new Error(`The AZURE2 engine failed to start: ${event.message}`)
    pending.forEach((p) => p.reject(error))
    pending.clear()
    worker = null
  }
  return worker
}

let index: Promise<{ id: string }[]> | null = null

async function evaluationIndex() {
  index ??= fetch(`${ROOT}/evaluations/index.json`).then((r) => {
    if (!r.ok) throw new Error(`evaluation list: HTTP ${r.status}`)
    return r.json()
  })
  return index
}

const json = (status: number, body: unknown): WorkerResponse => ({
  status,
  contentType: "application/json",
  text: JSON.stringify(body),
})

/** One API request, answered in the page. */
export async function browserRequest(
  method: string,
  path: string,
  body?: string | null,
): Promise<WorkerResponse> {
  // The list and the metadata come from the static index, so browsing the
  // evaluations costs nothing until one is opened.
  if (method === "GET" && path === "/api/evaluations") return json(200, await evaluationIndex())
  const one = path.match(/^\/api\/evaluations\/([^/]+)$/)
  if (method === "GET" && one) {
    const found = (await evaluationIndex()).find((e) => e.id === decodeURIComponent(one[1]))
    return found ? json(200, found) : json(404, { error: "no such evaluation" })
  }

  const id = ++counter
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, method, path, body: body ?? null })
  })
}

/** URL of an evaluation's .azr file, which the static build ships as is. */
export function browserAzrUrl(id: string, filename: string): string {
  return `${ROOT}/evaluations/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`
}

/** Save a generated file (CSV, level scheme) the worker produced. */
export async function browserDownload(path: string, filename: string) {
  const response = await browserRequest("GET", path)
  if (response.status >= 400) throw new Error(response.text)
  const url = URL.createObjectURL(new Blob([response.text], { type: response.contentType }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
