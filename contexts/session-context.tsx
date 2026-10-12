"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  IN_BROWSER,
  ApiError,
  closeSession,
  closeSessionBeacon,
  getData,
  getExtrapolations,
  getFine,
  getInitial,
  getPublishedExtrapolations,
  getSessionStatus,
  openEvaluation,
  pingSession,
  prepareSession,
  resetParameters,
  setParameters,
  withBusyRetry,
  normaliseTimings,
  type DataSegment,
  type Evaluation,
  type ExtrapSegment,
  type FineCurve,
  type FineResponse,
  type Scheme,
  type SchemeAndData,
  type EditResult,
  type Timings,
  type SessionStatus,
} from "@/lib/api"
import { typicalTimings } from "@/lib/eval-timings"
import { useEvalDict } from "@/components/eval-dict"

/** One edit, as it can be undone and redone: the values before and after. */
interface Edit {
  before: Record<number, number>
  after: Record<number, number>
}

/**
 * Something the page waits for, as the progress timer shows it: since when
 * (performance.now()), and how long it is expected to take (seconds; null
 * when there is nothing to go on yet).
 */
export interface Activity {
  started: number
  estimate: number | null
  /** Waiting for the server's one-off preparation of the model. */
  preparing?: boolean
  /** Said under the timer (why this wait is long). */
  note?: string | null
  /**
   * Waiting for these derived models to be built first, then `after` seconds
   * of calculation: the estimate is worked out again as the server reports
   * its progress (and how many builds share its cores).
   */
  wait?: { steps: string[]; after: number }
}
export type ActivityKind = "open" | "data" | "fine" | "edit" | "extrap"

interface SessionState {
  sessionId: string | null
  evaluation: Evaluation | null
  scheme: Scheme | null
  data: DataSegment[] | null
  extrapolations: ExtrapSegment[] | null
  /** The extrapolations at the published parameters, shown faded while the reader's own are first calculated. */
  publishedExtrap: ExtrapSegment[] | null
  /** The extrapolations shown are those of the parameters before the last edit (new ones on their way). */
  extrapStale: boolean
  /** The model on a fine grid, by data-segment index; null until loaded. */
  fine: Record<number, FineCurve> | null
  fineStatus: "idle" | "loading" | "ready" | "failed"
  /**
   * The fine curves shown were calculated for the parameters before the last
   * edit (the new ones are on their way): drawn faded rather than replaced by
   * the line through the points.
   */
  fineStale: boolean
  /** The data and fine curves at the evaluation's own parameters (the "original fit"). */
  initialData: DataSegment[] | null
  initialFine: Record<number, FineCurve> | null
  /** Scheme and curves are the shipped ones, drawn before the session is open. */
  preview: boolean
  /** The server offers the newer API (initial snapshot, per-role preparation). */
  modern: boolean
  loading: boolean
  /** An edit (or the plot's data) is being calculated. */
  calculating: boolean
  /** The extrapolations are being calculated. */
  extrapCalculating: boolean
  /** What is running, for the progress timer. */
  activities: Partial<Record<ActivityKind, Activity>>
  /** The server is full: when (Date.now()) the page tries again; null otherwise. */
  retryAt: number | null
  error: string | null
  /** HTTP status of the last failure (0: the server could not be reached). */
  errorStatus: number | null
  expired: boolean
  canUndo: boolean
  canRedo: boolean
  /**
   * Change of the total χ² (all active data) attributed to each edited free
   * parameter: every edit's change is credited to the parameters it moved.
   */
  deltaChi2: Record<number, number>

  open: (id: string) => Promise<void>
  loadData: () => Promise<void>
  loadExtrapolations: () => Promise<void>
  loadFine: () => Promise<void>
  /** Build derived models ahead of need, in the background (server build only). */
  prepare: (steps: ("data" | "fine" | "extrap")[], now?: boolean) => void
  updateParameters: (updates: Record<number, number>) => void
  reset: () => void
  undo: () => void
  redo: () => void
  dismissError: () => void
}

const SessionContext = createContext<SessionState | undefined>(undefined)

/** Every free parameter's current value, by free index. */
export function currentValues(scheme: Scheme): Record<number, number> {
  const out: Record<number, number> = {}
  for (const level of scheme.levels) {
    if (level.energy_free_index !== null) out[level.energy_free_index] = level.energy
    for (const channel of level.channels) {
      if (channel.free_index !== null) out[channel.free_index] = channel.width
    }
  }
  return out
}

/** The free parameters whose value differs from the evaluation's own. */
export function changedValues(scheme: Scheme): Record<number, number> {
  const out: Record<number, number> = {}
  for (const level of scheme.levels) {
    if (level.energy_free_index !== null && level.energy !== level.initial_energy)
      out[level.energy_free_index] = level.energy
    for (const channel of level.channels) {
      if (channel.free_index !== null && channel.width !== channel.initial_width) out[channel.free_index] = channel.width
    }
  }
  return out
}

/** Total χ² (Σ over active segments), as the Data table sums it. */
function totalChi2(data: DataSegment[] | null): number | null {
  if (!data) return null
  let sum = 0
  let any = false
  for (const s of data) {
    if (!s.active || s.chi2 === null) continue
    sum += s.chi2_sum ?? s.chi2 * (s.chi2_points ?? s.n_points)
    any = true
  }
  return any ? sum : null
}

/** Segment index → its curve (one object, shared by the segments that measure it). */
function byIndex(response: FineResponse): Record<number, FineCurve> {
  // An older API sent a list of per-segment curves, each with its index.
  if (Array.isArray(response))
    return Object.fromEntries((response as (FineCurve & { index: number })[]).map((c, i) => [c.index, { ...c, id: c.id ?? i }]))
  const curves = new Map(response.curves.map((c) => [c.id, c]))
  const out: Record<number, FineCurve> = {}
  for (const { index, curve, shift } of response.segments) {
    const c = curves.get(curve)
    if (!c) continue
    out[index] = shift
      ? {
          ...c,
          shift,
          energies: c.energies.map((x) => x - shift),
          sfactor_energies: c.sfactor_energies.map((x) => x - shift),
        }
      : c
  }
  return out
}

/*
 * Edits go to the server one at a time. While one is calculated, later edits
 * wait in `pending`, merged: a slider dragged across twenty positions sends
 * the position it is at when the server is free, not all twenty. Undo, redo
 * and reset are jobs of their own (never merged).
 */
type Job =
  | { kind: "params"; updates: Record<number, number>; history: "push" | "none" }
  | { kind: "undo" | "redo"; edit: Edit }
  | { kind: "reset" }

/** How long a hidden tab keeps its session before handing it back (it reopens on return). */
const HIDDEN_CLOSE_MS = 5 * 60_000
/** Heartbeat while the page is visible, unless the server asks for another interval. */
const PING_MS = 30_000

export function SessionProvider({ children }: { children: ReactNode }) {
  const evalDict = useEvalDict()
  const unexpected = evalDict.workspace.unexpected
  const r9 = evalDict.r9
  // When the reader's current wait for the plot began (an edit, then its
  // smooth curve): one clock for both.
  const curveClock = useRef<number | null>(null)
  const burstEnd = useRef(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [scheme, setScheme] = useState<Scheme | null>(null)
  const [data, setDataState] = useState<DataSegment[] | null>(null)
  const [initialData, setInitialData] = useState<DataSegment[] | null>(null)
  const [initialFine, setInitialFine] = useState<Record<number, FineCurve> | null>(null)
  const [extrapolations, setExtrapolations] = useState<ExtrapSegment[] | null>(null)
  const [publishedExtrap, setPublishedExtrap] = useState<ExtrapSegment[] | null>(null)
  const [extrapStale, setExtrapStale] = useState(false)
  const [fine, setFineState] = useState<Record<number, FineCurve> | null>(null)
  const [fineStatus, setFineStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle")
  const [fineStale, setFineStale] = useState(false)
  const [preview, setPreview] = useState(false)
  const [modern, setModern] = useState(false)
  const [past, setPast] = useState<Edit[]>([])
  const [deltaChi2, setDeltaChi2] = useState<Record<number, number>>({})
  const dataRef = useRef<DataSegment[] | null>(null)
  dataRef.current = data
  const fineRef = useRef<Record<number, FineCurve> | null>(null)
  fineRef.current = fine
  const [future, setFuture] = useState<Edit[]>([])
  // Every change of parameters bumps this, so a fine grid or extrapolations
  // computed for older parameters are never shown with newer data.
  const version = useRef(0)
  // Whether the current parameters are the evaluation's own (what the
  // "original fit" is captured from).
  const pristine = useRef(true)
  const schemeRef = useRef<Scheme | null>(null)
  schemeRef.current = scheme
  const evaluationId = useRef<string | null>(null)

  const setData = useCallback((list: DataSegment[] | null) => {
    setDataState(list)
    dataRef.current = list
    if (list && pristine.current) setInitialData((current) => current ?? list)
  }, [])
  const setFine = useCallback((response: FineResponse | null | undefined, keep = false) => {
    if (!response) {
      // After an edit the curves already drawn stay up, faded, until the new
      // ones arrive; on a new session there is nothing to keep.
      if (!keep) setFineState(null)
      setFineStale(keep)
      setFineStatus("idle")
      return
    }
    const map = byIndex(response)
    setFineState(map)
    fineRef.current = map
    setFineStale(false)
    setFineStatus("ready")
    if (pristine.current) setInitialFine((current) => current ?? map)
  }, [])
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [extrapCalculating, setExtrapCalculating] = useState(false)
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const onBusy = useCallback((seconds: number | null) => setRetryAt(seconds === null ? null : Date.now() + seconds * 1000), [])
  const [error, setErrorText] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [expired, setExpired] = useState(false)
  const setError = useCallback((message: string | null, status: number | null = null) => {
    setErrorText(message)
    setErrorStatus(message === null ? null : status)
  }, [])

  // Read inside callbacks so they never close over a stale id.
  const sessionRef = useRef<string | null>(null)
  sessionRef.current = sessionId
  /** Handed back to the server while the tab was hidden: reopened on the next need. */
  const dormant = useRef(false)
  const heartbeat = useRef(PING_MS)

  /* -- the progress timer's clock ------------------------------------------- */

  // Typical durations: shipped with the site, then the server's, then what
  // this visit measured.
  const typical = useRef<Timings>({})
  const measured = useRef<Record<string, number>>({})
  const [activities, setActivities] = useState<Partial<Record<ActivityKind, Activity>>>({})
  const activitiesRef = useRef(activities)
  activitiesRef.current = activities
  // When the background preparations were sent (null: not running).
  const preparing = useRef<{ edit: number | null; extrap: number | null }>({ edit: null, extrap: null })
  /**
   * The session's preparation as last reported: steps still to build, the
   * one under way and for how long (at `at`), and how many builds share the
   * server's cores. The browser build has no report: its workers build the
   * data and smooth-curve models side by side from `at` (the opening).
   */
  const prep = useRef<{ pending: string[]; preparing: string | null; elapsed: number; builds: number; at: number; spare: boolean }>({
    pending: [],
    preparing: null,
    elapsed: 0,
    builds: 1,
    at: 0,
    spare: false,
  })
  /** Seconds until `step` (data, fine, extrap) is built, from the typical timings and the last report. */
  const prepLeft = useCallback((step: string) => {
    const p = prep.current
    if (!p.pending.includes(step)) return 0
    const since = (performance.now() - p.at) / 1000
    const cost = (s: string) => typical.current[`prepare_${s}`] ?? 0
    if (IN_BROWSER) {
      // Each model in a worker of its own, all built from the opening on.
      return Math.max(0, cost(step) - since)
    }
    // One after the other, in this order; the cores shared with other builds.
    let left = 0
    for (const s of ["data", "fine", "extrap"]) {
      if (!p.pending.includes(s)) continue
      left += s === p.preparing ? Math.max(cost(s) * 0.2, cost(s) - p.elapsed - since) : cost(s)
      if (s === step) break
    }
    return left * Math.max(1, Math.min(4, p.builds))
  }, [])
  const begin = useCallback(
    (kind: ActivityKind, key: string = kind, extra = 0, flag = false, options: { since?: number; wait?: string[]; note?: string | null } = {}) => {
      const base = measured.current[key] ?? typical.current[key] ?? null
      const now = performance.now()
      const previous = activitiesRef.current[kind]
      // One clock per thing the reader waits for: kept across a queue of
      // edits, and from an edit to its smooth curve.
      const started = previous?.started ?? options.since ?? now
      const elapsed = (now - started) / 1000
      const estimate = base === null && extra === 0 ? null : elapsed + (base ?? 0) + extra
      const activity: Activity = {
        started,
        estimate: previous?.estimate != null && estimate !== null ? Math.max(previous.estimate, estimate) : estimate,
        preparing: flag,
        note: options.note ?? null,
        wait: options.wait && flag ? { steps: options.wait, after: base ?? 0 } : undefined,
      }
      activitiesRef.current = { ...activitiesRef.current, [kind]: activity }
      setActivities((current) => ({ ...current, [kind]: activity }))
      return now
    },
    [],
  )
  /** Work the estimates out again (new timings, or the server's progress report). */
  const reestimate = useCallback(() => {
    setActivities((current) => {
      let changed = false
      const next = { ...current }
      for (const [kind, a] of Object.entries(current) as [ActivityKind, Activity][]) {
        if (!a) continue
        const elapsed = (performance.now() - a.started) / 1000
        let estimate = a.estimate
        if (a.wait) {
          const left = Math.max(0, ...a.wait.steps.map(prepLeft))
          estimate = elapsed + left + a.wait.after
        } else if (estimate === null) {
          const base = measured.current[kind] ?? typical.current[kind] ?? null
          if (base !== null) estimate = Math.max(elapsed + 1, base)
        }
        if (estimate !== a.estimate) {
          // Once the models it waited for are built, it is an ordinary calculation.
          const still = Boolean(a.wait) && estimate !== null && estimate - elapsed > a.wait!.after + 0.05
          next[kind] = { ...a, estimate, wait: still ? a.wait : undefined, preparing: still ? a.preparing : false }
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [prepLeft])
  /** Take a report of the server's preparation (/open, /status, the heartbeat). */
  const takeStatus = useCallback(
    (status: (SessionStatus & { prepared?: string[] }) | null | undefined) => {
      if (!status) return
      const pending = status.pending ?? ["data", "fine", "extrap"].filter((s) => !(status.prepared ?? []).includes(s))
      const preparing = typeof status.preparing === "string" ? status.preparing : null
      prep.current = {
        pending,
        preparing,
        elapsed: status.preparing_elapsed ?? 0,
        builds: Math.max(1, status.builds ?? 1),
        at: performance.now(),
        spare: Boolean(status.from_spare),
      }
      reestimate()
    },
    [reestimate],
  )
  const finish = useCallback((kind: ActivityKind, key: string = kind, started?: number, ok = true) => {
    if (ok && started !== undefined) measured.current[key] = (performance.now() - started) / 1000
    if (activitiesRef.current[kind]) {
      const next = { ...activitiesRef.current }
      delete next[kind]
      activitiesRef.current = next
    }
    setActivities((current) => {
      if (!(kind in current)) return current
      const next = { ...current }
      delete next[kind]
      return next
    })
  }, [])
  /** Seconds left of a preparation sent at `since`, by its typical duration. */
  const remaining = useCallback((since: number | null, key: string) => {
    if (since === null) return 0
    const total = typical.current[key]
    return total ? Math.max(0, total - (performance.now() - since) / 1000) : 0
  }, [])

  /* -- errors --------------------------------------------------------------- */

  const handle = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.aborted) return
        setError(err.message, err.status)
        // The server dropped this session (idle timeout or eviction) and it
        // could not be reopened quietly: the UI offers a reopen.
        if (err.sessionExpired) setExpired(true)
      } else {
        setError(err instanceof Error ? err.message : unexpected)
      }
    },
    [unexpected, setError],
  )

  /* -- opening ---------------------------------------------------------------- */

  // The shipped scheme and cached curves, drawn while AZURE2 starts (a newer
  // API only). Everything in it is at the published parameters, which is
  // also where every new session starts.
  const takeInitial = useCallback(
    (id: string) => {
      getInitial(id)
        .then((initial) => {
          if (!initial || evaluationId.current !== id) return
          setModern(true)
          // The server's own timings replace the shipped ones; the browser
          // build keeps its own (the stored ones are the server's).
          if (!IN_BROWSER)
            typical.current = {
              ...typical.current,
              ...normaliseTimings(initial.evaluation?.timings),
              ...normaliseTimings(initial.timings),
            }
          reestimate()
          // Only while what is on screen is still the published fit.
          if (schemeRef.current?.modified) return
          if (!schemeRef.current) {
            setScheme(initial.scheme)
            schemeRef.current = initial.scheme
            if (initial.evaluation) setEvaluation((current) => current ?? initial.evaluation!)
            if (!sessionRef.current) setPreview(true)
          }
          if (initial.data && !dataRef.current) setData(initial.data)
          if (initial.fine && !fineRef.current) setFine(initial.fine)
        })
        .catch(() => {
          /* the session's own answers follow anyway */
        })
    },
    [setData, setFine, reestimate],
  )

  const open = useCallback(
    async (id: string) => {
      const first = evaluationId.current !== id
      evaluationId.current = id
      setLoading(true)
      setError(null)
      setExpired(false)
      // The shipped typical timings, so the clock has an estimate at once.
      if (first) {
        typical.current = typicalTimings(id, IN_BROWSER)
        measured.current = {}
        setPublishedExtrap(null)
      }
      if (first) takeInitial(id)
      const started = begin("open")
      let ok = false
      try {
        const opened = await withBusyRetry(() => openEvaluation(id), onBusy)
        ok = true
        if (!IN_BROWSER)
          typical.current = { ...typical.current, ...normaliseTimings(opened.evaluation.timings), ...normaliseTimings(opened.timings) }
        // What is left to prepare: the first edit's estimate (a spare, or not).
        if (IN_BROWSER) takeStatus({ pending: ["data", "fine", "extrap"], builds: 1 })
        else if (opened.prepared !== undefined) takeStatus(opened)
        else prep.current = { ...prep.current, pending: [], at: performance.now() }
        if (opened.heartbeat_interval) heartbeat.current = opened.heartbeat_interval * 1000
        // Curves already drawn from the shipped snapshot are the session's own
        // (same parameters): kept rather than asked for again.
        const keep = first && !opened.scheme.modified && !(schemeRef.current?.modified ?? false)
        dormant.current = false
        setSessionId(opened.session_id)
        sessionRef.current = opened.session_id
        setEvaluation(opened.evaluation)
        setScheme(opened.scheme)
        schemeRef.current = opened.scheme
        setPreview(false)
        pristine.current = !opened.scheme.modified
        if (!keep) {
          setDataState(null)
          dataRef.current = null
          setInitialData(null)
          setInitialFine(null)
          version.current++
          setFine(null)
          fineRef.current = null
        }
        setExtrapolations(null)
        setExtrapStale(false)
        setPast([])
        setFuture([])
        setDeltaChi2({})
      } catch (err) {
        handle(err)
      } finally {
        finish("open", "open", started, ok)
        setLoading(false)
      }
    },
    [handle, setError, setFine, takeInitial, begin, finish, onBusy, takeStatus],
  )

  /* -- the plot's and the extrapolations' curves -------------------------------- */

  const loadData = useCallback(async () => {
    const id = sessionRef.current
    if (!id) return
    setCalculating(true)
    const started = begin("data")
    let ok = false
    try {
      setData(await withBusyRetry(() => getData(id), onBusy))
      setError(null)
      ok = true
    } catch (err) {
      handle(err)
    } finally {
      finish("data", "data", started, ok)
      setCalculating(false)
    }
  }, [handle, setData, setError, begin, finish, onBusy])

  const loadExtrapolations = useCallback(async () => {
    const id = sessionRef.current
    if (!id) return
    const asked = version.current
    const key = pristine.current ? "extrap" : "extrap_edit"
    setExtrapCalculating(true)
    // The published ones, to show faded meanwhile (a static file: no session).
    if (!pristine.current && evaluationId.current) {
      const evaluationAsked = evaluationId.current
      getPublishedExtrapolations(evaluationAsked)
        .then((list) => {
          if (list && evaluationId.current === evaluationAsked) setPublishedExtrap((current) => current ?? list)
        })
        .catch(() => undefined)
    }
    const wait = Math.max(prepLeft("extrap"), remaining(preparing.current.extrap, "prepare_extrap"))
    const started = begin("extrap", key, wait, wait > 0, { wait: ["extrap"] })
    let ok = false
    try {
      const list = await withBusyRetry(() => getExtrapolations(id), onBusy)
      if (asked === version.current) {
        setExtrapolations(list)
        setExtrapStale(false)
        ok = true
      }
      setError(null)
    } catch (err) {
      handle(err)
    } finally {
      finish("extrap", key, started, ok && wait === 0)
      setExtrapCalculating(false)
    }
  }, [handle, setError, begin, finish, onBusy, remaining, prepLeft])

  // Not "calculating": the curves already on screen stay usable while the
  // fine grid (whose first build can take a minute) is computed.
  const loadFine = useCallback(async () => {
    const id = sessionRef.current
    if (!id) return
    const asked = version.current
    setFineStatus("loading")
    // After an edit, the smooth curve is part of the same wait: its clock
    // goes on from the edit's.
    const recent = curveClock.current !== null && (activitiesRef.current.edit || performance.now() - burstEnd.current < 3000)
    const since = recent ? curveClock.current! : undefined
    const wait = prepLeft("fine")
    const after = measured.current.fine ?? typical.current.fine ?? (typical.current.edit ?? 0) * 0.6
    const started = begin("fine", "fine", wait + (measured.current.fine === undefined && typical.current.fine === undefined ? after : 0), wait > 0, {
      since,
      wait: ["fine"],
      note: wait > 0 && !prep.current.spare ? r9.noSpare : null,
    })
    let ok = false
    try {
      const response = await withBusyRetry(() => getFine(id), onBusy)
      if (asked === version.current) {
        setFine(response)
        ok = true
      }
    } catch {
      if (asked === version.current) setFineStatus("failed")
    } finally {
      if (asked === version.current) curveClock.current = null
      finish("fine", "fine", started, ok && wait === 0)
    }
  }, [setFine, begin, finish, onBusy, prepLeft, r9])

  /* -- a session the server let go of ------------------------------------------- */

  const prepared = useRef(new Set<string>())
  /**
   * Reopen a session the server let go of (evicted, or handed back while the
   * tab was hidden), quietly, and put the reader's changes back on it.
   */
  const reviving = useRef<Promise<boolean> | null>(null)
  const revive = useCallback(async (): Promise<boolean> => {
    if (reviving.current) return reviving.current
    const id = evaluationId.current
    if (!id) return false
    const run = (async () => {
      try {
        const opened = await withBusyRetry(() => openEvaluation(id), onBusy)
        const changed = schemeRef.current ? changedValues(schemeRef.current) : {}
        sessionRef.current = opened.session_id
        dormant.current = false
        prepared.current.clear()
        if (Object.keys(changed).length > 0) {
          const result = await setParameters(opened.session_id, changed)
          if (!result.superseded) {
            setScheme(result.scheme)
            schemeRef.current = result.scheme
            setData(result.data)
            if (result.fine) setFine(result.fine)
          }
        }
        setSessionId(opened.session_id)
        setExpired(false)
        return true
      } catch {
        return false
      } finally {
        reviving.current = null
      }
    })()
    reviving.current = run
    return run
  }, [onBusy, setData, setFine])

  /* -- edits: one in flight, the latest waiting ------------------------------------ */

  const queue = useRef<{ inflight: AbortController | null; pending: Job[] }>({ inflight: null, pending: [] })
  const editsDone = useRef(0)
  const seq = useRef(0)

  /** Take a server's answer to an edit as the new state. */
  const take = useCallback(
    (result: SchemeAndData, moved: number[]) => {
      const before = totalChi2(dataRef.current)
      version.current++
      const after = totalChi2(result.data)
      const changed = changedValues(result.scheme)
      setDeltaChi2((current) => {
        const next: Record<number, number> = {}
        for (const [k, v] of Object.entries(current)) if (Number(k) in changed) next[Number(k)] = v
        if (before !== null && after !== null) {
          for (const i of moved) if (i in changed) next[i] = (next[i] ?? 0) + (after - before)
        }
        return next
      })
      pristine.current = !result.scheme.modified
      setScheme(result.scheme)
      schemeRef.current = result.scheme
      setData(result.data)
      setFine(result.fine, true)
      if (result.fine) curveClock.current = null
      // Extrapolations were computed from the old parameters: kept on screen,
      // faded, and fetched again when their tab is shown.
      setExtrapStale(true)
      setError(null)
    },
    [setData, setError, setFine],
  )

  const pump = useCallback(async () => {
    const q = queue.current
    if (q.inflight || q.pending.length === 0) return
    if (dormant.current && !(await revive())) return
    // Not open yet: the edit goes out once the session is (effect below).
    if (!sessionRef.current || q.inflight) return
    const id = sessionRef.current
    const job = q.pending.shift()!
    const controller = new AbortController()
    q.inflight = controller
    const n = ++seq.current
    setCalculating(true)
    // The first edit may wait for the model's one-off preparation: the data
    // model (and on an older server, which holds the session while it
    // prepares, the smooth curves' too).
    // The reader waits for the smooth curve too (one clock): the estimate
    // covers its model's preparation as well.
    const first = editsDone.current === 0
    const waitSteps = ["data", "fine"]
    const wait = first
      ? Math.max(
          ...waitSteps.map(prepLeft),
          remaining(preparing.current.edit, "prepare_data") + remaining(preparing.current.edit, "prepare_fine"),
        )
      : 0
    // One clock from the first edit of a burst to the last answer.
    const jobStart = performance.now()
    if (!activitiesRef.current.edit && !activitiesRef.current.fine) curveClock.current = jobStart
    const started = begin("edit", "edit", wait, wait > 0, {
      since: curveClock.current ?? undefined,
      wait: waitSteps,
      note: wait > 0 && !prep.current.spare ? r9.noSpare : null,
    })
    const values = schemeRef.current ? currentValues(schemeRef.current) : {}
    const updates =
      job.kind === "params" ? job.updates : job.kind === "undo" ? job.edit.before : job.kind === "redo" ? job.edit.after : null
    let ok = false
    try {
      const send = (session: string): Promise<EditResult> =>
        updates === null
          ? resetParameters(session, controller.signal, dataRef.current)
          : setParameters(session, updates, { seq: n, signal: controller.signal, measured: dataRef.current })
      const answer = await withBusyRetry(() => send(id), onBusy, { signal: controller.signal }).catch(async (err) => {
        // The server let the session go: reopen it with the changes so far, then send this edit again.
        if (err instanceof ApiError && err.sessionExpired && (await revive())) return send(sessionRef.current!)
        throw err
      })
      if (controller.signal.aborted) return
      if ("superseded" in answer && answer.superseded) {
        // A newer edit replaced it on the server: its values go with the next one.
        if (job.kind === "params") {
          const next = q.pending[0]
          if (next && next.kind === "params") next.updates = { ...job.updates, ...next.updates }
          else q.pending.unshift(job)
        }
        return
      }
      const result = answer as SchemeAndData
      const shipped = currentValues(result.scheme)
      const moved =
        updates === null ? Object.keys(values).filter((k) => values[Number(k)] !== shipped[Number(k)]).map(Number) : Object.keys(updates).map(Number)
      take(result, moved)
      if (updates === null) setDeltaChi2({})
      ok = true
      editsDone.current++
      if (job.kind === "params" && job.history === "push") {
        const before: Record<number, number> = {}
        for (const k of Object.keys(job.updates)) if (values[Number(k)] !== undefined) before[Number(k)] = values[Number(k)]
        setPast((list) => [...list.slice(-49), { before, after: { ...job.updates } }])
        setFuture([])
      } else if (job.kind === "undo") {
        setPast((list) => list.slice(0, -1))
        setFuture((list) => [...list, job.edit])
      } else if (job.kind === "redo") {
        setFuture((list) => list.slice(0, -1))
        setPast((list) => [...list, job.edit])
      } else if (job.kind === "reset" && moved.length > 0) {
        // Undoable like any other edit.
        const before: Record<number, number> = {}
        const after: Record<number, number> = {}
        for (const k of moved) {
          before[k] = values[k]
          after[k] = shipped[k]
        }
        setPast((list) => [...list.slice(-49), { before, after }])
        setFuture([])
      }
    } catch (err) {
      handle(err)
      curveClock.current = null
    } finally {
      if (ok && wait === 0) measured.current.edit = (performance.now() - jobStart) / 1000
      if (q.inflight === controller) q.inflight = null
      if (q.pending.length > 0) void pump()
      else {
        // The burst is answered; its clock goes on only into the smooth curve.
        burstEnd.current = performance.now()
        finish("edit", "edit", started, false)
        setCalculating(false)
      }
      void started
    }
  }, [begin, finish, handle, onBusy, revive, take, remaining, prepLeft, r9])

  const enqueue = useCallback(
    (job: Job) => {
      const q = queue.current
      const last = q.pending[q.pending.length - 1]
      if (job.kind === "params" && last?.kind === "params" && last.history === job.history) {
        last.updates = { ...last.updates, ...job.updates }
      } else if (job.kind === "reset") {
        q.pending = [job]
      } else q.pending.push(job)
      setCalculating(true)
      void pump()
    },
    [pump],
  )

  const updateParameters = useCallback(
    (updates: Record<number, number>) => enqueue({ kind: "params", updates, history: "push" }),
    [enqueue],
  )
  const undo = useCallback(() => {
    const last = past[past.length - 1]
    if (last) enqueue({ kind: "undo", edit: last })
  }, [enqueue, past])
  const redo = useCallback(() => {
    const next = future[future.length - 1]
    if (next) enqueue({ kind: "redo", edit: next })
  }, [enqueue, future])
  const reset = useCallback(() => enqueue({ kind: "reset" }), [enqueue])

  // An edit made before the session opened goes out once it is.
  useEffect(() => {
    if (sessionId && queue.current.pending.length > 0) void pump()
  }, [sessionId, pump])

  /* -- preparation -------------------------------------------------------------- */

  // Have the server build what a later edit will need while the reader looks
  // at the cached curves. Not in the browser build: there one worker answers
  // every request in turn, and a preparation under way would hold up the
  // first edit.
  // The edit's models first: the extrapolations' model is asked for once
  // they are built (two builds at once share the server's cores, and the
  // smooth curve of a first edit waited twice as long), unless the reader
  // is looking at the extrapolations (`now`).
  const editReady = useRef<{ id: string; done: Promise<unknown> } | null>(null)
  const deferred = useRef(new Set<string>())
  const prepare = useCallback(function prepare(steps: ("data" | "fine" | "extrap")[], now = false) {
    const id = sessionRef.current
    if (!id || IN_BROWSER) return
    const key = `${id}:${steps.join(",")}`
    if (prepared.current.has(key)) return
    const slot = steps.includes("extrap") ? "extrap" : "edit"
    const before = slot === "extrap" && !now && editReady.current?.id === id ? editReady.current.done : null
    if (before && !now) {
      // Asked again with `now` if the reader turns to the extrapolations meanwhile.
      if (!deferred.current.has(key)) {
        deferred.current.add(key)
        void before.then(() => prepare(steps, true))
      }
      return
    }
    prepared.current.add(key)
    preparing.current[slot] = performance.now()
    const done = prepareSession(id, steps)
      .catch(() => {
        /* best effort: an edit builds what it needs anyway */
      })
      .finally(() => {
        if (sessionRef.current === id) preparing.current[slot] = null
      })
    if (slot === "edit") editReady.current = { id, done }
  }, [])

  /* -- the session's lifetime ---------------------------------------------------- */

  // Release the server's AZURE2 process when the tab goes away, and when it
  // has been hidden for a while (reopened, with the changes, on return). A
  // heartbeat tells a newer server the page is still looked at.
  useEffect(() => {
    if (!sessionId || IN_BROWSER) return
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null
    let pinging = true
    const ping = () => {
      if (!pinging || document.visibilityState !== "visible" || dormant.current) return
      pingSession(sessionId)
        .then((status) => {
          if (!status) pinging = false
          else takeStatus(status)
        })
        .catch((err) => {
          // Let go of by the server (its heartbeat timed out while the tab
          // was hidden, say): reopened at once, with the changes.
          if (err instanceof ApiError && err.sessionExpired && sessionRef.current === sessionId) {
            dormant.current = true
            void revive()
          }
        })
    }
    ping()
    const beat = setInterval(ping, heartbeat.current)
    const release = () => closeSessionBeacon(sessionId)
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenTimer = setTimeout(() => {
          if (queue.current.inflight) return
          dormant.current = true
          release()
        }, HIDDEN_CLOSE_MS)
      } else {
        if (hiddenTimer) clearTimeout(hiddenTimer)
        hiddenTimer = null
        if (dormant.current) void revive()
        else ping()
      }
    }
    window.addEventListener("pagehide", release)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearInterval(beat)
      if (hiddenTimer) clearTimeout(hiddenTimer)
      window.removeEventListener("pagehide", release)
      document.removeEventListener("visibilitychange", onVisibility)
      closeSession(sessionId).catch(() => {
        /* best effort; the reaper is the backstop */
      })
    }
  }, [sessionId, revive, takeStatus])

  // While the reader waits on the server's preparation, ask how it goes
  // every 2 s: the estimate follows the step under way and how many builds
  // share the cores (a second visitor without a spare waits for more).
  const waitingOnPrep = Object.values(activities).some((a) => a?.wait)
  useEffect(() => {
    if (!sessionId || IN_BROWSER || !waitingOnPrep) return
    let stop = false
    const poll = () =>
      getSessionStatus(sessionId)
        .then((status) => {
          if (!stop) takeStatus(status)
        })
        .catch(() => undefined)
    void poll()
    const timer = setInterval(poll, 2000)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [sessionId, waitingOnPrep, takeStatus])
  // In the browser build there is no report: the estimate is worked out
  // again from the typical timings every few seconds.
  useEffect(() => {
    if (!IN_BROWSER || !waitingOnPrep) return
    const timer = setInterval(reestimate, 3000)
    return () => clearInterval(timer)
  }, [waitingOnPrep, reestimate])

  // Leaving the page: cancel an edit still on its way.
  useEffect(() => () => queue.current.inflight?.abort(), [])

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        evaluation,
        scheme,
        data,
        extrapolations,
        publishedExtrap,
        extrapStale,
        fine,
        fineStatus,
        fineStale,
        initialData,
        initialFine,
        preview,
        modern,
        loading,
        calculating,
        extrapCalculating,
        activities,
        retryAt,
        error,
        errorStatus,
        expired,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        deltaChi2,
        open,
        loadData,
        loadExtrapolations,
        loadFine,
        prepare,
        updateParameters,
        reset,
        undo,
        redo,
        dismissError: () => setError(null),
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const context = useContext(SessionContext)
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider")
  }
  return context
}
