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
  API_BASE,
  IN_BROWSER,
  ApiError,
  closeSession,
  getData,
  getExtrapolations,
  getFine,
  openEvaluation,
  resetParameters,
  setParameters,
  type DataSegment,
  type Evaluation,
  type ExtrapSegment,
  type FineCurve,
  type Scheme,
} from "@/lib/api"
import { useEvalDict } from "@/components/eval-dict"

/** One edit, as it can be undone and redone: the values before and after. */
interface Edit {
  before: Record<number, number>
  after: Record<number, number>
}

interface SessionState {
  sessionId: string | null
  evaluation: Evaluation | null
  scheme: Scheme | null
  data: DataSegment[] | null
  extrapolations: ExtrapSegment[] | null
  /** The model on a fine grid, by data-segment index; null until loaded. */
  fine: Record<number, FineCurve> | null
  fineStatus: "idle" | "loading" | "ready" | "failed"
  /** The data and fine curves at the evaluation's own parameters (the "original fit"). */
  initialData: DataSegment[] | null
  initialFine: Record<number, FineCurve> | null
  loading: boolean
  calculating: boolean
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
  updateParameters: (updates: Record<number, number>) => Promise<void>
  reset: () => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
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

const byIndex = (list: FineCurve[]) => Object.fromEntries(list.map((c) => [c.index, c]))

export function SessionProvider({ children }: { children: ReactNode }) {
  const unexpected = useEvalDict().workspace.unexpected
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [scheme, setScheme] = useState<Scheme | null>(null)
  const [data, setDataState] = useState<DataSegment[] | null>(null)
  const [initialData, setInitialData] = useState<DataSegment[] | null>(null)
  const [initialFine, setInitialFine] = useState<Record<number, FineCurve> | null>(null)
  const [extrapolations, setExtrapolations] = useState<ExtrapSegment[] | null>(null)
  const [fine, setFineState] = useState<Record<number, FineCurve> | null>(null)
  const [fineStatus, setFineStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle")
  const [past, setPast] = useState<Edit[]>([])
  const [deltaChi2, setDeltaChi2] = useState<Record<number, number>>({})
  const dataRef = useRef<DataSegment[] | null>(null)
  dataRef.current = data
  const [future, setFuture] = useState<Edit[]>([])
  // Every change of parameters bumps this, so a fine grid computed for older
  // parameters is never shown with newer data.
  const version = useRef(0)
  // Whether the current parameters are the evaluation's own (what the
  // "original fit" is captured from).
  const pristine = useRef(true)
  const schemeRef = useRef<Scheme | null>(null)
  schemeRef.current = scheme

  const setData = useCallback((list: DataSegment[] | null) => {
    setDataState(list)
    if (list && pristine.current) setInitialData((current) => current ?? list)
  }, [])
  const setFine = useCallback((list: FineCurve[] | null | undefined) => {
    if (!list) {
      setFineState(null)
      setFineStatus("idle")
      return
    }
    const map = byIndex(list)
    setFineState(map)
    setFineStatus("ready")
    if (pristine.current) setInitialFine((current) => current ?? map)
  }, [])
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
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

  const handle = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError) {
        setError(err.message, err.status)
        // The server dropped this session (idle timeout or eviction); the UI has
        // to offer a reopen rather than retrying against a dead id.
        if (err.sessionExpired) setExpired(true)
      } else {
        setError(err instanceof Error ? err.message : unexpected)
      }
    },
    [unexpected, setError],
  )

  const open = useCallback(
    async (id: string) => {
      setLoading(true)
      setError(null)
      setExpired(false)
      try {
        const opened = await openEvaluation(id)
        setSessionId(opened.session_id)
        sessionRef.current = opened.session_id
        setEvaluation(opened.evaluation)
        setScheme(opened.scheme)
        pristine.current = !opened.scheme.modified
        setDataState(null)
        setInitialData(null)
        setInitialFine(null)
        setExtrapolations(null)
        setPast([])
        setFuture([])
        setDeltaChi2({})
        version.current++
        setFine(null)
      } catch (err) {
        handle(err)
      } finally {
        setLoading(false)
      }
    },
    [handle, setError, setFine],
  )

  const loadData = useCallback(async () => {
    const id = sessionRef.current
    if (!id) return
    setCalculating(true)
    try {
      setData(await getData(id))
      setError(null)
    } catch (err) {
      handle(err)
    } finally {
      setCalculating(false)
    }
  }, [handle, setData, setError])

  const loadExtrapolations = useCallback(async () => {
    const id = sessionRef.current
    if (!id) return
    setCalculating(true)
    try {
      setExtrapolations(await getExtrapolations(id))
      setError(null)
    } catch (err) {
      handle(err)
    } finally {
      setCalculating(false)
    }
  }, [handle, setError])

  // Not "calculating": the curves already on screen stay usable while the
  // fine grid (whose first build can take a minute) is computed.
  const loadFine = useCallback(async () => {
    const id = sessionRef.current
    if (!id) return
    const asked = version.current
    setFineStatus("loading")
    try {
      const list = await getFine(id)
      if (asked === version.current) setFine(list)
    } catch {
      if (asked === version.current) setFineStatus("failed")
    }
  }, [setFine])

  /** Send values to the server and take its answer as the new state. */
  const apply = useCallback(
    async (updates: Record<number, number>) => {
      const id = sessionRef.current
      if (!id) return false
      setCalculating(true)
      try {
        const before = totalChi2(dataRef.current)
        const result = await setParameters(id, updates)
        version.current++
        const after = totalChi2(result.data)
        const changed = changedValues(result.scheme)
        setDeltaChi2((current) => {
          const next: Record<number, number> = {}
          for (const [k, v] of Object.entries(current)) if (Number(k) in changed) next[Number(k)] = v
          if (before !== null && after !== null) {
            for (const k of Object.keys(updates)) {
              const i = Number(k)
              if (i in changed) next[i] = (next[i] ?? 0) + (after - before)
            }
          }
          return next
        })
        pristine.current = !result.scheme.modified
        setScheme(result.scheme)
        setData(result.data)
        setFine(result.fine)
        // Extrapolations were computed from the old parameters; drop them so the
        // extrapolation tab refetches rather than showing a stale curve.
        setExtrapolations(null)
        setError(null)
        return true
      } catch (err) {
        handle(err)
        return false
      } finally {
        setCalculating(false)
      }
    },
    [handle, setData, setError, setFine],
  )

  const updateParameters = useCallback(
    async (updates: Record<number, number>) => {
      const current = schemeRef.current ? currentValues(schemeRef.current) : {}
      const before: Record<number, number> = {}
      for (const key of Object.keys(updates)) {
        const k = Number(key)
        if (current[k] !== undefined) before[k] = current[k]
      }
      if (await apply(updates)) {
        setPast((list) => [...list.slice(-49), { before, after: { ...updates } }])
        setFuture([])
      }
    },
    [apply],
  )

  const undo = useCallback(async () => {
    const last = past[past.length - 1]
    if (!last) return
    if (await apply(last.before)) {
      setPast((list) => list.slice(0, -1))
      setFuture((list) => [...list, last])
    }
  }, [apply, past])

  const redo = useCallback(async () => {
    const next = future[future.length - 1]
    if (!next) return
    if (await apply(next.after)) {
      setFuture((list) => list.slice(0, -1))
      setPast((list) => [...list, next])
    }
  }, [apply, future])

  const reset = useCallback(async () => {
    const id = sessionRef.current
    if (!id) return
    const before = schemeRef.current ? changedValues(schemeRef.current) : {}
    setCalculating(true)
    try {
      const result = await resetParameters(id)
      version.current++
      pristine.current = true
      setDeltaChi2({})
      setScheme(result.scheme)
      setData(result.data)
      setFine(result.fine)
      setExtrapolations(null)
      setError(null)
      if (Object.keys(before).length > 0) {
        // Undoable like any other edit.
        const after: Record<number, number> = {}
        const initial = currentValues(result.scheme)
        for (const k of Object.keys(before)) after[Number(k)] = initial[Number(k)]
        setPast((list) => [...list.slice(-49), { before, after }])
        setFuture([])
      }
    } catch (err) {
      handle(err)
    } finally {
      setCalculating(false)
    }
  }, [handle, setData, setError, setFine])

  // Release the server's AZURE2 process when the tab goes away. The reaper
  // would eventually collect it, but returning the slot immediately keeps the
  // instance cap meaningful.
  useEffect(() => {
    if (!sessionId) return
    const release = () => {
      // sendBeacon survives page unload where fetch may not; it is always a
      // POST, so it targets the /close alias rather than the DELETE route.
      // In the browser build the engine lives in this tab and goes with it.
      if (IN_BROWSER) return
      navigator.sendBeacon?.(`${API_BASE}/api/sessions/${sessionId}/close`, new Blob([], { type: "text/plain" }))
    }
    window.addEventListener("pagehide", release)
    return () => {
      window.removeEventListener("pagehide", release)
      closeSession(sessionId).catch(() => {
        /* best effort; the reaper is the backstop */
      })
    }
  }, [sessionId])

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        evaluation,
        scheme,
        data,
        extrapolations,
        fine,
        fineStatus,
        initialData,
        initialFine,
        loading,
        calculating,
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
