/**
 * Client for the AZURE2 evaluation API.
 *
 * Opening an evaluation starts an AZURE2 process on the server and returns a
 * session id; every subsequent call is scoped to that session, so two browser
 * tabs never share (or overwrite) each other's parameters.
 *
 * The one convention worth knowing: an editable quantity is addressed by its
 * `free_index` — its slot in the model's *free* parameter vector. Fixed
 * quantities carry `free_index: null` and cannot be changed.
 */

import { browserAzrUrl, browserDownload, browserRequest } from "./browser-engine"

/**
 * Origin of the AZURE2 API, baked in at build time.
 *
 * An empty string is meaningful and must survive: in the deployed stack the
 * reverse proxy serves the API under `/api` on the same origin as the site, so
 * every path below becomes relative and no public hostname is compiled into the
 * bundle. Only an *unset* variable falls back to a local development server.
 */
export const API_BASE =
  process.env.API_BASE === undefined ? "http://localhost:5001" : process.env.API_BASE

/**
 * `API_BASE=browser` builds the static site (GitHub Pages): there is no server,
 * and AZURE2 runs in the visitor's browser (lib/browser-engine.ts).
 */
export const IN_BROWSER = API_BASE === "browser"
const ORIGIN = IN_BROWSER ? "" : API_BASE

/* -- types ----------------------------------------------------------------- */

export interface Evaluation {
  id: string
  title: string
  channels: string[]
  author: string | null
  reference: string | null
  filename: string
  entrance: string | null
  // Added with the evaluation header; optional so an older API still parses.
  doi?: string | null
  reactions?: string[]
  status?: string | null
  citation?: string | null
  summary?: string | null
  summary_it?: string | null
  /** One plain sentence on what the reaction is for (info.json `purpose`, `purpose_it`). */
  purpose?: string | null
  purpose_it?: string | null
  /** Who did the R-matrix analysis; `author` carries the same for older clients. */
  analysis?: string | null
  paper?: { authors: string; title?: string | null; journal?: string | null; year?: number | null } | null
  /** Typical timings of this evaluation's operations (a newer API). */
  timings?: Timings | null
}

/** What a channel parameter physically is; the unit travels with the value. */
export type ChannelQuantity =
  | "width" // partial width, eV
  | "anc" // bound state, fm^(-1/2)
  | "moment_m1" // magnetic dipole moment, μ_N (nuclear magnetons)
  | "moment_e2" // electric quadrupole moment, b
  | "beta" // dimensionless

export interface SchemeChannel {
  pair: number
  label: string
  L: number
  S: number
  radiation_type: string | null
  is_photon: boolean
  quantity: ChannelQuantity
  unit: string
  width: number
  initial_width: number
  fixed: boolean
  free_index: number | null
  wigner_limit: number | null
}

export interface SchemeLevel {
  jgroup: number
  level: number
  J: number
  parity: number
  jpi: string
  energy: number
  initial_energy: number
  energy_fixed: boolean
  energy_free_index: number | null
  channels: SchemeChannel[]
}

export interface SchemePair {
  /** The pair's key in the .azr file (what AZURE2's GUI calls it). */
  number: number
  engine_number?: number
  label: string
  is_photon: boolean
  is_entrance: boolean
  Z1: number
  M1: number
  Z2: number
  M2: number
  separation_energy: number
  excitation: number
  /** Unicode pair, light constituent first: "p + ¹²C". */
  label_plain?: string | null
  /** Compound-nucleus excitation energy at which the pair opens (S + E_x of the residual); null for photons. */
  threshold?: number | null
  /** Excitation-energy range of the active data entering through this pair (null if none). */
  data_ex_min?: number | null
  data_ex_max?: number | null
  /** The same range in c.m. energy. */
  data_ecm_min?: number | null
  data_ecm_max?: number | null
  channel_radius: number
}

export interface Scheme {
  pairs: SchemePair[]
  levels: SchemeLevel[]
  n_free: number
  modified: boolean
}

export interface DataSegment {
  index: number
  key: number
  name: string
  /** Readable dataset name ("Kettner", "Elwyn (EXFOR F0012.002)"). */
  label?: string
  exfor?: string | null
  /** Where the measurement was published, when the evaluation's info.json says. */
  source?: { ref: string | null; doi: string | null }
  active: boolean
  entrance: string
  exit: string
  entrance_key: number
  exit_key: number
  /** Same species in and out: no S-factor is defined. */
  elastic?: boolean
  capture?: boolean
  /** Unicode reaction notation, e.g. "¹²C(p,γ)¹³N". */
  reaction?: string | null
  observable: string
  data_file: string
  energy_min: number
  energy_max: number
  angle_min: number
  angle_max: number
  norm: number
  vary_norm: boolean
  norm_error: number
  norm_penalty?: number | null
  n_points: number
  chi2: number | null
  chi2_sum?: number | null
  chi2_points?: number
  energies: number[] | null
  angles: number[] | null
  cross_sections: number[] | null
  cross_sections_errors: number[] | null
  sfactor: number[] | null
  sfactor_errors: number[] | null
  calculated: number[] | null
  calculated_sfactor: number[] | null
}

/**
 * The model on a fine grid for one distinct calculation (server/app/fine.py):
 * from below the lowest measurement to above the highest, resonances
 * resolved, the values at the measured energies merged in. Shared by every
 * data segment that measures it; segments the server could not match on a
 * grid have none and are drawn through their points.
 */
export interface FineCurve {
  /** The calculation: segments with the same id share the curve. */
  id: number
  /**
   * Set (c.m. MeV) on a copy for one segment whose energy shift matters: the
   * curve as that segment's data-mode values follow it, moved by −shift.
   */
  shift?: number
  /** What the grid runs along: energy (an excitation function) or c.m. angle (an angular distribution). */
  axis?: "energy" | "angle"
  /** The c.m. angles of an angular-distribution curve (axis "angle"). */
  angles?: number[]
  /** The c.m. energy of an angular distribution. */
  energy?: number | null
  energies: number[]
  calculated: (number | null)[]
  sfactor_energies: number[]
  calculated_sfactor: (number | null)[]
}

/** The fine curves as the API sends them: each curve once, and which segment it draws. */
export interface FineResponse {
  curves: FineCurve[]
  segments: { index: number; curve: number; shift?: number }[]
}

export interface ExtrapSegment {
  index: number
  key: number
  name: string
  active: boolean
  entrance: string
  exit: string
  entrance_key: number
  exit_key: number
  /** A(a,b)B, e.g. "³He(α,γ)⁷Be" (absent from an older API). */
  reaction?: string | null
  observable: string
  /** Frame of energy_min/max/step: "cm" from this API on (older ones gave lab). */
  energy_frame?: "cm" | "lab"
  energy_min: number
  energy_max: number
  energy_step: number
  energy_min_lab?: number
  energy_max_lab?: number
  angle_min: number
  angle_max: number
  angle_step: number
  is_angle_integrated: boolean
  energies: number[] | null
  angles: number[] | null
  calculated: number[] | null
  calculated_sfactor: number[] | null
  /**
   * What the curve ends in, when the server names it: the residual and its
   * state ("²³Na g.s.", "²³Na 440 keV", "all final states"), telling apart
   * the several "angle-integrated" curves of one reaction (absent from an
   * older API).
   */
  final_state?: string | null
  /** Its excitation energy (MeV). */
  exit_excitation?: number | null
  /** The reaction with its exit and state: "²²Ne(p,γ₁)²³Na → 440 keV". */
  label_plain?: string | null
  /**
   * An energy × angle grid, sent without its values (`energies` etc. empty):
   * computed on request (getExtrapolationGrid). Null for an ordinary curve.
   */
  grid?: ExtrapGridInfo | null
}

export interface ExtrapGridInfo {
  n_energies: number
  n_angles: number
  views?: ("angles" | "map")[]
  /** The representative c.m. angles the "angles" view gives. */
  angles?: number[]
}

/** One energy × angle grid as the server sends it on request. */
export type ExtrapGrid =
  | {
      index: number
      view: "angles"
      curves: { angle: number; energies: number[]; calculated: (number | null)[]; calculated_sfactor: (number | null)[] }[]
    }
  | {
      index: number
      view: "map"
      energies: number[]
      angles: number[]
      /** One row per angle, over `energies`. */
      calculated: (number | null)[][]
      calculated_sfactor: (number | null)[][]
    }

export interface OpenedSession {
  session_id: string
  evaluation: Evaluation
  scheme: Scheme
  n_data_segments: number
  n_extrapolations: number
  /** Seconds between heartbeats the server asks for (a newer API). */
  heartbeat_interval?: number
  timings?: Timings | null
  /** This visitor got a spare session (prepared, or still being prepared) (a newer API). */
  from_spare?: boolean
  /** Preparation steps already done, and the one under way. */
  prepared?: string[]
  preparing?: string | null
  /** Model builds running on the server now (this one's included). */
  builds?: number
  /** The last measured duration of each step on this server (open_cold, open_spare, prepare_<step>). */
  measured?: Timings | null
}

/** What an /open now would meet (GET /evaluations/<id>/availability, a newer server). */
export interface Availability {
  spare_ready: boolean
  spare_building: boolean
  full: boolean
  builds: number
  measured?: Timings | null
}

/** What a newer server reports of a session (/status, and the heartbeat's answer). */
export interface SessionStatus {
  prepared?: string[]
  preparing?: string | string[] | null
  /** Seconds the step under way has been running. */
  preparing_elapsed?: number | null
  /** Steps the background has still to build. */
  pending?: string[]
  from_spare?: boolean
  /** Model builds running on the server now (they share its cores). */
  builds?: number
  busy?: string[]
  modified?: boolean
  generation?: number
  fine_ready?: boolean
  /** The last measured duration of each step on this server (open_cold, open_spare, prepare_<step>). */
  measured?: Timings | null
}

export interface SchemeAndData {
  scheme: Scheme
  data: DataSegment[]
  /** Present when the server could calculate it without building its model. */
  fine?: FineResponse
}

/**
 * Typical durations (seconds) of each operation for one evaluation, as the
 * server measured them: what the progress timer's first estimate comes from.
 * Every key is optional; normaliseTimings turns the server's names
 * ("prepare.data", "extrap" after an edit) into these.
 */
export interface Timings {
  open?: number
  data?: number
  fine?: number
  edit?: number
  extrap?: number
  /** Extrapolations after an edit (the model already built). */
  extrap_edit?: number
  prepare_data?: number
  prepare_fine?: number
  prepare_extrap?: number
  [key: string]: number | undefined
}

/**
 * What a page can draw before any session exists (GET /evaluations/<id>/initial):
 * the shipped scheme and the cached curves at the published parameters.
 */
export interface InitialState {
  evaluation?: Evaluation
  scheme: Scheme
  data?: DataSegment[] | null
  fine?: FineResponse | null
  timings?: Timings | null
}

/** The server's timing names as the page uses them ("prepare.data" → prepare_data; its "extrap" is after an edit). */
export function normaliseTimings(raw: Record<string, unknown> | null | undefined): Timings {
  const out: Timings = {}
  if (!raw) return out
  // The server writes {prepare: {data, fine, extrap}, open, edit, extrap, grid}.
  let server = false
  const take = (prefix: string, value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) out[prefix] = value
    else if (value && typeof value === "object") {
      server = true
      for (const [k, v] of Object.entries(value)) take(`${prefix}_${k}`, v)
    }
  }
  for (const [key, value] of Object.entries(raw)) {
    if (key.includes(".")) server = true
    take(key.replace(/\./g, "_"), value)
  }
  if (server && out.extrap !== undefined) {
    out.extrap_edit = out.extrap_edit ?? out.extrap
    delete out.extrap
  }
  return out
}

/** Thrown for any non-2xx response, carrying the server's message and status. */
export class ApiError extends Error {
  status: number
  /** The parsed JSON body, when there was one. */
  body: Record<string, unknown> | null
  /** Seconds the server asked to wait (a 503's or 429's Retry-After). */
  retryAfter: number | null
  constructor(message: string, status: number, body: Record<string, unknown> | null = null, retryAfter: number | null = null) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
    this.retryAfter = retryAfter
  }
  /** A newer edit of the same session replaced this one on the server (latest wins): not an error. */
  get superseded() {
    return this.status === 409 && Boolean(this.body?.superseded)
  }
  /** A 409 (other than a superseded edit) means the session expired and the evaluation must be reopened. */
  get sessionExpired() {
    return this.status === 409 && !this.superseded
  }
  /**
   * The server is full (503), or this visitor is over a per-address limit
   * (429: too many models open or opened at once): either way worth
   * retrying after `retryAfter` seconds.
   */
  get busy() {
    return this.status === 503 || this.status === 429
  }
  /** The request was cancelled by the page (a newer one replaced it). */
  get aborted() {
    return this.status === -1
  }
  /** The route does not exist on this server (an older API): fall back. */
  get missing() {
    return this.status === 404 || this.status === 405
  }
}

/* -- plumbing -------------------------------------------------------------- */

/**
 * A compact payload (`?compact=1`) back to the full one: an array of one
 * repeated value is sent as `{fill, n}` (an extrapolation's angles, all 0°).
 */
export function expand<T>(value: T): T {
  if (Array.isArray(value)) return value.map(expand) as T
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>
    const keys = Object.keys(o)
    if (keys.length === 2 && "fill" in o && typeof o.n === "number") return Array(o.n).fill(o.fill) as T
    const out: Record<string, unknown> = {}
    for (const k of keys) out[k] = expand(o[k])
    return out as T
  }
  return value
}

/** The measured arrays a compact edit leaves out (the server's MEASURED_KEYS). */
const MEASURED = ["energies", "angles", "cross_sections", "cross_sections_errors", "sfactor", "sfactor_errors"] as const

/** An edit's data segments (compact: without the measurements, which never change) with the measurements put back. */
export function withMeasurements(next: DataSegment[], previous: DataSegment[] | null): DataSegment[] {
  if (!previous) return next
  const before = new Map(previous.map((s) => [s.index, s]))
  return next.map((s) => {
    const old = before.get(s.index)
    if (!old || (s as Partial<DataSegment>).energies !== undefined) return s
    const out: DataSegment = { ...s }
    for (const k of MEASURED) (out as unknown as Record<string, unknown>)[k] = old[k]
    return out
  })
}

/** Seconds from a Retry-After header (delta-seconds or an HTTP date), else null. */
function retryAfterOf(value: string | null, body: Record<string, unknown> | null): number | null {
  const fromBody = Number(body?.retry_after)
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody
  if (!value) return null
  const n = Number(value)
  if (Number.isFinite(n)) return Math.max(0, n)
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, (at - Date.now()) / 1000) : null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (IN_BROWSER) {
    let r: Awaited<ReturnType<typeof browserRequest>>
    try {
      r = await browserRequest(init?.method ?? "GET", path, (init?.body as string) ?? null)
    } catch (err) {
      throw new ApiError(err instanceof Error ? err.message : String(err), 0)
    }
    if (r.status >= 400) {
      let message = `Request failed (${r.status})`
      let body: Record<string, unknown> | null = null
      try {
        body = JSON.parse(r.text)
        message = (body?.error as string) ?? message
      } catch {
        /* keep the status-based message */
      }
      throw new ApiError(message, r.status, body)
    }
    return JSON.parse(r.text) as T
  }

  let response: Response
  try {
    // A JSON content type only with a body: a bodiless GET or POST stays a
    // "simple" cross-origin request (no preflight), so a route an older API
    // lacks answers a plain 404 rather than failing its preflight.
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) },
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new ApiError("aborted", -1)
    // Status 0 = unreachable. The message never names the API's address: in a
    // development build that is http://localhost:…, which means nothing to a
    // visitor (the pages show their own friendly copy for this case anyway).
    throw new ApiError("The evaluation server could not be reached.", 0)
  }

  if (!response.ok) {
    let message =
      response.status === 502 || response.status === 503 || response.status === 504 || response.status === 429
        ? "The evaluation server is not available right now. Please try again in a minute."
        : `Request failed (${response.status})`
    let body: Record<string, unknown> | null = null
    try {
      body = await response.json()
      if (body?.error) message = body.error as string
    } catch {
      /* keep the status-based message */
    }
    throw new ApiError(message, response.status, body, retryAfterOf(response.headers.get("Retry-After"), body))
  }

  try {
    return (await response.json()) as T
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new ApiError("aborted", -1)
    throw err
  }
}

/**
 * Optional routes of a newer API, remembered once a server has answered 404
 * for them, so the page stops asking (and falls back to what it did before).
 */
const ABSENT_KEY = "azure2-api-absent"
const absent = new Set<string>(
  (() => {
    // Remembered for the tab's visit, so each page does not ask (and 404) again.
    try {
      return JSON.parse(sessionStorage.getItem(ABSENT_KEY) ?? "[]") as string[]
    } catch {
      return []
    }
  })(),
)
async function optional<T>(feature: string, call: () => Promise<T>): Promise<T | null> {
  if (absent.has(feature)) return null
  try {
    return await call()
  } catch (err) {
    // A route the server has (`code` set, e.g. an initial snapshot "not
    // prepared" yet) is asked again next time; only a missing route is remembered.
    if (err instanceof ApiError && err.missing && !err.body?.code) {
      absent.add(feature)
      try {
        sessionStorage.setItem(ABSENT_KEY, JSON.stringify([...absent]))
      } catch {
        /* storage blocked: ask again next page */
      }
      return null
    }
    throw err
  }
}
/** Whether this server is known to lack an optional route. */
export function lacks(feature: "initial" | "ping" | "grid"): boolean {
  return absent.has(feature)
}

/* -- evaluations ----------------------------------------------------------- */

export function listEvaluations(): Promise<Evaluation[]> {
  return request<Evaluation[]>("/api/evaluations")
}

export function getEvaluation(id: string): Promise<Evaluation> {
  return request<Evaluation>(`/api/evaluations/${encodeURIComponent(id)}`)
}

/**
 * The shipped scheme and cached curves of an evaluation, without a session
 * (null from an API that does not offer it): drawn while the session opens.
 */
export function getInitial(id: string, signal?: AbortSignal): Promise<InitialState | null> {
  return optional("initial", () => request<InitialState>(`/api/evaluations/${encodeURIComponent(id)}/initial`, { signal }))
}

/*
 * One token per page view, sent with every /open: leaving the page releases
 * every session opened under it with one beacon -- including one whose /open
 * was still on its way, which no session id could name yet. A page restored
 * from the back/forward cache takes a new token (its old sessions are gone).
 */
const newToken = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
let clientToken = ""
function pageToken(): string {
  if (clientToken || typeof window === "undefined") return clientToken
  clientToken = newToken()
  window.addEventListener("pagehide", () => {
    navigator.sendBeacon?.(`${API_BASE}/api/clients/${clientToken}/close`, new Blob([], { type: "text/plain" }))
  })
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) clientToken = newToken()
  })
  return clientToken
}

/** Whether a prepared copy of the model is waiting on the server, and its live timings (null: an older server, or the browser build). */
export function getAvailability(id: string): Promise<Availability | null> {
  if (IN_BROWSER) return Promise.resolve(null)
  return optional("availability", () => request<Availability>(`/api/evaluations/${encodeURIComponent(id)}/availability`))
}

export function openEvaluation(id: string): Promise<OpenedSession> {
  const token = IN_BROWSER ? "" : pageToken()
  return request<OpenedSession>(
    `/api/evaluations/${encodeURIComponent(id)}/open${token ? `?client=${token}` : ""}`,
    { method: "POST" },
  )
}

/** URL of the evaluation's .azr file, for a direct browser download. */
export function evaluationDownloadUrl(id: string, filename: string): string {
  if (IN_BROWSER) return browserAzrUrl(id, filename)
  return `${API_BASE}/api/evaluations/${encodeURIComponent(id)}/download`
}

/**
 * Props for a link that downloads a file the API generates. On the server
 * build it is a plain link; in the browser build the file is produced by the
 * engine in the page and saved from there.
 */
export function downloadLink(url: string, filename: string) {
  if (!IN_BROWSER) return { href: url, download: filename }
  return {
    href: url,
    download: filename,
    onClick: (event: { preventDefault: () => void }) => {
      event.preventDefault()
      browserDownload(url, filename).catch((err) => alert(String(err?.message ?? err)))
    },
  }
}

/* -- session --------------------------------------------------------------- */

export function getScheme(sessionId: string): Promise<Scheme> {
  return request<Scheme>(`/api/sessions/${sessionId}/scheme`)
}

export function getData(sessionId: string): Promise<DataSegment[]> {
  return request<DataSegment[]>(`/api/sessions/${sessionId}/data`)
}

export function getFine(sessionId: string): Promise<FineResponse> {
  return request<FineResponse>(`/api/sessions/${sessionId}/fine`)
}

/**
 * Have the server build the session's derived models (the plots' extended
 * grid, the extrapolations') now, so the first edit does not wait for them.
 * Fire and forget: it may take a while and answers nothing the page shows.
 */
export function prepareSession(sessionId: string, steps?: ("data" | "fine" | "extrap")[]): Promise<{ prepared: string[] }> {
  return request<{ prepared: string[] }>(`/api/sessions/${sessionId}/prepare`, {
    method: "POST",
    body: JSON.stringify(steps ? { steps } : {}),
  })
}

export function getExtrapolations(sessionId: string): Promise<ExtrapSegment[]> {
  return request<ExtrapSegment[]>(`/api/sessions/${sessionId}/extrapolations?compact=1`).then(expand)
}

/**
 * The extrapolations at the published parameters, without a session (null
 * from an API that does not store them): shown faded while a reader's own,
 * after an edit, are calculated.
 */
export async function getPublishedExtrapolations(id: string): Promise<ExtrapSegment[] | null> {
  const stored = await optional("published-extrap", () =>
    request<{ extrapolations: ExtrapSegment[] }>(`/api/evaluations/${encodeURIComponent(id)}/initial/extrapolations`),
  ).catch(() => null)
  return stored?.extrapolations ? expand(stored.extrapolations) : null
}

/**
 * One energy × angle extrapolation grid, computed on demand (null from an API
 * that sends grids in full with the other extrapolations). `angles` asks for
 * a few c.m. angles only.
 */
export function getExtrapolationGrid(sessionId: string, index: number, view: "angles" | "map"): Promise<ExtrapGrid | null> {
  return optional("grid", () =>
    request<ExtrapGrid>(`/api/sessions/${sessionId}/extrapolations/${index}/grid?view=${view}&compact=1`).then(expand),
  )
}

/** The answer to an edit, or word that a newer edit replaced it on the server. */
export type EditResult = (SchemeAndData & { superseded?: false }) | { superseded: true }

/**
 * Apply parameter edits, keyed by free index, and get the recalculated curves
 * back in the same response — one round trip, so concurrent edits cannot
 * interleave into a stale plot. `seq` numbers the page's edits so a server
 * that keeps only the latest can drop older ones; such a dropped edit comes
 * back `{ superseded: true }` (a 409 marked so, or a 200 with that status).
 */
export async function setParameters(
  sessionId: string,
  updates: Record<number, number>,
  options: { seq?: number; signal?: AbortSignal; measured?: DataSegment[] | null } = {},
): Promise<EditResult> {
  // Compact when the page has the measurements already: an edit's answer
  // then carries only what was calculated (⁷Be: 351 → 188 kB, 92 → 38 kB gzip).
  const compact = options.measured ? "?compact=1" : ""
  try {
    const result = await request<SchemeAndData & { status?: string; superseded?: boolean }>(`/api/sessions/${sessionId}/parameters${compact}`, {
      method: "POST",
      body: JSON.stringify(options.seq === undefined ? { updates } : { updates, seq: options.seq }),
      signal: options.signal,
    })
    if (result.status === "superseded" || result.superseded === true || !result.scheme) return { superseded: true }
    return complete(result as SchemeAndData, options.measured ?? null)
  } catch (err) {
    if (err instanceof ApiError && err.superseded) return { superseded: true }
    throw err
  }
}

function complete(result: SchemeAndData, measured: DataSegment[] | null): SchemeAndData {
  if (!measured) return result
  const full = expand(result)
  return { ...full, data: withMeasurements(full.data, measured) }
}

export async function resetParameters(sessionId: string, signal?: AbortSignal, measured: DataSegment[] | null = null): Promise<SchemeAndData> {
  const result = await request<SchemeAndData>(`/api/sessions/${sessionId}/reset${measured ? "?compact=1" : ""}`, {
    method: "POST",
    signal,
  })
  return complete(result, measured)
}

/**
 * Tell the server this session is still looked at (false: this API has no
 * heartbeat; it then keeps sessions by their last request, as before).
 */
export async function pingSession(sessionId: string): Promise<SessionStatus | null> {
  return optional("ping", () => request<SessionStatus>(`/api/sessions/${sessionId}/ping`, { method: "POST" }))
}

/** What a newer server says of a session's preparation (null from an older one). */
export function getSessionStatus(sessionId: string): Promise<SessionStatus | null> {
  return optional("status", () => request<SessionStatus>(`/api/sessions/${sessionId}/status`))
}

/** Release a session from a page that is going away (survives unload). */
export function closeSessionBeacon(sessionId: string): void {
  if (IN_BROWSER) return
  navigator.sendBeacon?.(`${API_BASE}/api/sessions/${sessionId}/close`, new Blob([], { type: "text/plain" }))
}

/**
 * Run `call`, and while the server answers 503 (full) wait as it asks
 * (Retry-After, else a growing pause) and try again, telling `onWait` how long.
 */
export async function withBusyRetry<T>(
  call: () => Promise<T>,
  onWait: (seconds: number | null) => void,
  { attempts = 8, signal }: { attempts?: number; signal?: AbortSignal } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await call()
      onWait(null)
      return result
    } catch (err) {
      if (!(err instanceof ApiError && err.busy) || attempt >= attempts - 1 || signal?.aborted) {
        onWait(null)
        throw err
      }
      const seconds = Math.min(60, Math.max(2, err.retryAfter ?? 5 * 2 ** Math.min(attempt, 3)))
      onWait(seconds)
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
    }
  }
}

export function closeSession(sessionId: string): Promise<{ closed: boolean }> {
  return request<{ closed: boolean }>(`/api/sessions/${sessionId}`, {
    method: "DELETE",
  })
}

export function schemeExportUrl(sessionId: string): string {
  return `${ORIGIN}/api/sessions/${sessionId}/scheme/export.txt`
}

export function extrapolationsCsvUrl(
  sessionId: string,
  segments?: number[],
): string {
  const query =
    segments && segments.length > 0 ? `?segments=${segments.join(",")}` : ""
  return `${ORIGIN}/api/sessions/${sessionId}/extrapolations/download.csv${query}`
}
