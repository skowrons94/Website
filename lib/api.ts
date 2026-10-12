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
  /** Who did the R-matrix analysis; `author` carries the same for older clients. */
  analysis?: string | null
  paper?: { authors: string; title?: string | null; journal?: string | null; year?: number | null } | null
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
 * The model on a fine energy grid for one data segment (server/app/fine.py),
 * with the values at the measured energies merged in. Segments the server
 * could not match on a grid are absent and are drawn through their points.
 */
export interface FineCurve {
  index: number
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

export interface ExtrapSegment {
  index: number
  key: number
  name: string
  active: boolean
  entrance: string
  exit: string
  entrance_key: number
  exit_key: number
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
}

export interface OpenedSession {
  session_id: string
  evaluation: Evaluation
  scheme: Scheme
  n_data_segments: number
  n_extrapolations: number
}

export interface SchemeAndData {
  scheme: Scheme
  data: DataSegment[]
  /** Present when the server could calculate it without building its model. */
  fine?: FineCurve[]
}

/** Thrown for any non-2xx response, carrying the server's message and status. */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
  /** A 409 means the session expired and the evaluation must be reopened. */
  get sessionExpired() {
    return this.status === 409
  }
}

/* -- plumbing -------------------------------------------------------------- */

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
      try {
        message = JSON.parse(r.text)?.error ?? message
      } catch {
        /* keep the status-based message */
      }
      throw new ApiError(message, r.status)
    }
    return JSON.parse(r.text) as T
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    })
  } catch {
    // Status 0 = unreachable. The message never names the API's address: in a
    // development build that is http://localhost:…, which means nothing to a
    // visitor (the pages show their own friendly copy for this case anyway).
    throw new ApiError("The evaluation server could not be reached.", 0)
  }

  if (!response.ok) {
    let message =
      response.status === 502 || response.status === 503 || response.status === 504
        ? "The evaluation server is not available right now. Please try again in a minute."
        : `Request failed (${response.status})`
    try {
      const body = await response.json()
      if (body?.error) message = body.error
    } catch {
      /* keep the status-based message */
    }
    throw new ApiError(message, response.status)
  }

  return response.json() as Promise<T>
}

/* -- evaluations ----------------------------------------------------------- */

export function listEvaluations(): Promise<Evaluation[]> {
  return request<Evaluation[]>("/api/evaluations")
}

export function getEvaluation(id: string): Promise<Evaluation> {
  return request<Evaluation>(`/api/evaluations/${encodeURIComponent(id)}`)
}

export function openEvaluation(id: string): Promise<OpenedSession> {
  return request<OpenedSession>(
    `/api/evaluations/${encodeURIComponent(id)}/open`,
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

export function getFine(sessionId: string): Promise<FineCurve[]> {
  return request<FineCurve[]>(`/api/sessions/${sessionId}/fine`)
}

export function getExtrapolations(sessionId: string): Promise<ExtrapSegment[]> {
  return request<ExtrapSegment[]>(`/api/sessions/${sessionId}/extrapolations`)
}

/**
 * Apply parameter edits, keyed by free index, and get the recalculated curves
 * back in the same response — one round trip, so concurrent edits cannot
 * interleave into a stale plot.
 */
export function setParameters(
  sessionId: string,
  updates: Record<number, number>,
): Promise<SchemeAndData> {
  return request<SchemeAndData>(`/api/sessions/${sessionId}/parameters`, {
    method: "POST",
    body: JSON.stringify({ updates }),
  })
}

export function resetParameters(sessionId: string): Promise<SchemeAndData> {
  return request<SchemeAndData>(`/api/sessions/${sessionId}/reset`, {
    method: "POST",
  })
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
