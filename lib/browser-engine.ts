/**
 * The evaluation API without a server: requests go to Web Workers that run
 * AZURE2 (compiled to WebAssembly) and the server's own Flask routes in
 * Pyodide. See browser/README.md.
 *
 * Used when the site is built with `API_BASE=browser` (the GitHub Pages build).
 *
 * - What the page draws first (the scheme, data and smooth curves at the
 *   published parameters, and the published extrapolations) are static files
 *   fetched directly: no worker is involved, so they come in well under a
 *   second.
 * - One worker per model role. AZURE2 keeps state across the models of one
 *   interpreter, and one worker holding the data and the smooth-curve models
 *   initialised each again whenever the other had been used (18 s per ⁷Be
 *   edit). So:
 *     data    the Flask app: sessions, the data model, every response;
 *     fine    the plots' smooth curves;
 *     extrap  the extrapolations (its model built alongside the smooth
 *             curves');
 *     grid    the energy × angle grids (only when one is asked for).
 *   The data worker answers "delegate" for what another calculates; this
 *   module then has that worker calculate it at the session's parameters
 *   (a copy kept here, edited in step with the data worker's), hands the
 *   result to the data worker and asks again. An edit's smooth curve is
 *   calculated alongside its data, not after it.
 * - Each worker is a Pyodide of its own with its model: ¹³N's three workers
 *   take about 0.7 GB in all, ⁷Be's 1.5 GB. A phone or a small machine
 *   starts the extrapolations' worker only when they are first shown.
 * - Everything is downloaded once: the role workers start when the data
 *   worker has the runtime and the evaluation, and worker.js keeps the large
 *   files (Pyodide, NumPy, the zips) in the Cache Storage.
 */

const ROOT = `${process.env.BASE_PATH ?? ""}/azure2`

export interface WorkerResponse {
  status: number
  contentType: string
  text: string
}

type Role = "data" | "fine" | "extrap" | "grid"
type Derived = Exclude<Role, "data">
type Pending = { resolve: (value: unknown) => void; reject: (e: Error) => void }

const progressListeners = new Set<(text: string) => void>()

/** Startup messages ("Loading Python", ...) while the engine is being loaded. */
export function onEngineProgress(listener: (text: string) => void): () => void {
  progressListeners.add(listener)
  return () => {
    progressListeners.delete(listener)
  }
}

/** One Web Worker (worker.js) and the requests waiting on it. */
class RoleWorker {
  private worker: Worker
  private counter = 0
  private pending = new Map<number, Pending>()

  constructor(readonly role: Role) {
    this.worker = new Worker(`${ROOT}/worker.js`, { name: `azure2-${role}` })
    this.worker.onmessage = (event: MessageEvent) => {
      const data = event.data
      if (data.progress) {
        if (role !== "data") return
        progressListeners.forEach((l) => l(data.progress))
        // The runtime and the evaluation are in the caches now.
        if (data.progress === "Opening the model") startRoles()
        return
      }
      const p = this.pending.get(data.id)
      if (!p) return
      this.pending.delete(data.id)
      if (data.error) p.reject(new Error(data.error))
      else if ("value" in data) p.resolve(data.value)
      else p.resolve({ status: data.status, contentType: data.contentType, text: data.text })
    }
    this.worker.onerror = (event) => {
      const error = new Error(`The AZURE2 engine failed (${role}): ${event.message}`)
      this.pending.forEach((p) => p.reject(error))
      this.pending.clear()
      workers.delete(role)
    }
  }

  private post<T>(message: Record<string, unknown>): Promise<T> {
    const id = ++this.counter
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.worker.postMessage({ id, ...message })
    })
  }

  request(method: string, path: string, body: string | null): Promise<WorkerResponse> {
    return this.post<WorkerResponse>({ method, path, body })
  }

  call<T>(name: string, args: unknown[], evaluation?: string): Promise<T> {
    return this.post<T>({ call: name, args, evaluation })
  }
}

const workers = new Map<Role, RoleWorker>()

function worker(role: Role): RoleWorker {
  let w = workers.get(role)
  if (!w) {
    w = new RoleWorker(role)
    workers.set(role, w)
  }
  return w
}

/* -- a role's calculation, the latest parameters winning ----------------------- */

interface Result {
  key: string
  bytes: Uint8Array
}

/**
 * One role's calculation for one session. Asked while one runs, it waits for
 * that one and then makes a single calculation at the newest parameters
 * asked for, which every waiter gets (each hands it over with the parameters
 * it was made at; the data worker keeps it only if they are still current).
 */
class RoleCalc {
  last: Result | null = null
  private running: Promise<Result> | null = null
  private runningKey: string | null = null
  private queued: { key: string; waiters: Pending[] } | null = null

  constructor(
    private role: Derived,
    private evaluation: string,
  ) {}

  get(params: number[]): Promise<Result> {
    const key = JSON.stringify(params)
    if (this.last?.key === key) return Promise.resolve(this.last)
    if (this.running && this.runningKey === key) return this.running
    if (this.running) {
      return new Promise<Result>((resolve, reject) => {
        const waiters = this.queued?.waiters ?? []
        waiters.push({ resolve: resolve as (v: unknown) => void, reject })
        this.queued = { key, waiters }
      })
    }
    return this.start(key)
  }

  private start(key: string): Promise<Result> {
    this.runningKey = key
    const run = worker(this.role)
      .call<Uint8Array>("role_calc", [this.role, this.evaluation, key], this.evaluation)
      .then((bytes) => (this.last = { key, bytes }))
    this.running = run
    const next = () => {
      this.running = null
      this.runningKey = null
      const q = this.queued
      this.queued = null
      if (q)
        this.start(q.key).then(
          (r) => q.waiters.forEach((w) => w.resolve(r)),
          (e) => q.waiters.forEach((w) => w.reject(e)),
        )
    }
    run.then(next, next)
    return run
  }
}

/* -- sessions: a copy of each one's parameters ----------------------------------- */

interface Session {
  evaluation: string
  /** The free-parameter vector, as the data worker holds it. */
  params: number[]
  initial: number[]
  seq: number | null
  calcs: Partial<Record<Derived, RoleCalc>>
}

const sessions = new Map<string, Session>()

function calc(session: Session, role: Derived): RoleCalc {
  return (session.calcs[role] ??= new RoleCalc(role, session.evaluation))
}

/** Apply an edit to the copy as the server's Session.begin_edit does: all or nothing, a stale seq dropped. */
function mirror(session: Session, body: string | null, reset: boolean) {
  let parsed: { updates?: Record<string, unknown>; seq?: unknown } = {}
  try {
    parsed = body ? JSON.parse(body) : {}
  } catch {
    return
  }
  const seq = typeof parsed.seq === "number" && Number.isInteger(parsed.seq) ? parsed.seq : null
  if (seq !== null && session.seq !== null && seq < session.seq) return
  if (reset) session.params = session.initial.slice()
  else {
    const next = session.params.slice()
    for (const [k, v] of Object.entries(parsed.updates ?? {})) {
      const i = Number(k)
      const value = typeof v === "string" ? Number(v) : v
      if (!Number.isInteger(i) || i < 0 || i >= next.length || typeof value !== "number" || !Number.isFinite(value)) return
      next[i] = value
    }
    session.params = next
  }
  if (seq !== null) session.seq = seq
}

/* -- preparing the other roles ---------------------------------------------------- */

/**
 * Whether to start the extrapolations' worker before it is asked for: each
 * worker costs 150–500 MB (⁷Be's three: about 1.5 GB in all), so a phone or
 * a small machine starts it only when the extrapolations are first shown.
 */
function roomy(): boolean {
  if (typeof navigator === "undefined") return false
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches
  return !coarse && (memory === undefined || memory >= 8)
}

let opening: string | null = null

/**
 * Start the smooth curves' and the extrapolations' workers and build their
 * models, side by side (each is one thread: on a machine with a few cores
 * they do not slow each other down, and the extrapolations are then ready
 * about when the curves are).
 */
function startRoles() {
  const evaluation = opening
  if (!evaluation) return
  for (const role of roomy() ? (["fine", "extrap"] as const) : (["fine"] as const))
    worker(role)
      .call("role_prepare", [role, evaluation], evaluation)
      .catch(() => {
        /* best effort: a calculation builds its model when it is asked for */
      })
}

/* -- requests ------------------------------------------------------------------------ */

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

/** A static file of the build, as the API would answer (404 "not_prepared" when absent). */
async function staticJson(path: string): Promise<WorkerResponse> {
  const r = await fetch(`${ROOT}/${path}`)
  if (!r.ok) return json(404, { error: "not prepared", code: "not_prepared" })
  return { status: 200, contentType: "application/json", text: await r.text() }
}

/** Ask the data worker; when it delegates, have that role's worker calculate, hand the result over and ask again. */
async function viaData(sid: string | null, method: string, path: string, body: string | null): Promise<WorkerResponse> {
  const data = worker("data")
  for (let attempt = 0; ; attempt++) {
    const response = await data.request(method, path, body)
    const session = sid ? sessions.get(sid) : undefined
    if (response.status !== 500 || !session || attempt >= 4) return response
    let role: Derived | null = null
    try {
      const parsed = JSON.parse(response.text)
      if (parsed.code === "delegate") role = parsed.role
    } catch {
      /* an ordinary error */
    }
    if (!role) return response
    const result = await calc(session, role).get(session.params)
    await data.call("inject", [sid, role, result.key, result.bytes])
  }
}

/** One API request, answered in the page. */
export async function browserRequest(method: string, path: string, body?: string | null): Promise<WorkerResponse> {
  const route = path.split("?")[0]
  // The list and the metadata come from the static index, so browsing the
  // evaluations costs nothing until one is opened.
  if (method === "GET" && route === "/api/evaluations") return json(200, await evaluationIndex())
  const one = route.match(/^\/api\/evaluations\/([^/]+)$/)
  if (method === "GET" && one) {
    const found = (await evaluationIndex()).find((e) => e.id === decodeURIComponent(one[1]))
    return found ? json(200, found) : json(404, { error: "no such evaluation" })
  }
  // Drawn before any worker starts: static files of the build.
  const initial = route.match(/^\/api\/evaluations\/([^/]+)\/initial(\/extrapolations)?$/)
  if (method === "GET" && initial) {
    const id = encodeURIComponent(decodeURIComponent(initial[1]))
    return staticJson(`evaluations/${id}/${initial[2] ? "extrapolations.json" : "initial.json"}`)
  }

  const open = route.match(/^\/api\/evaluations\/([^/]+)\/open$/)
  if (open) {
    const evaluation = decodeURIComponent(open[1])
    opening = evaluation
    const data = worker("data")
    const response = await data.request(method, path, body ?? null)
    if (response.status === 201) {
      const sid = JSON.parse(response.text).session_id as string
      const params = JSON.parse(await data.call<string>("session_params", [sid])) as number[]
      sessions.set(sid, { evaluation, params, initial: params.slice(), seq: null, calcs: {} })
      // The data model for edits, built while the reader looks at the curves.
      void data.request("POST", `/api/sessions/${sid}/prepare`, JSON.stringify({ steps: ["data"] }))
    }
    return response
  }

  const scoped = route.match(/^\/api\/sessions\/([^/]+)(\/.*)?$/)
  const sid = scoped ? scoped[1] : null
  const session = sid ? sessions.get(sid) : undefined
  const tail = scoped?.[2] ?? ""
  if (session && method === "POST" && (tail === "/parameters" || tail === "/reset")) {
    mirror(session, body ?? null, tail === "/reset")
    // The edit's smooth curve, calculated alongside its data.
    if (JSON.stringify(session.params) !== JSON.stringify(session.initial))
      calc(session, "fine")
        .get(session.params)
        .catch(() => undefined)
  }
  const response = await viaData(sid, method, path, body ?? null)
  if (sid && (method === "DELETE" || tail === "/close")) sessions.delete(sid)
  return response
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
