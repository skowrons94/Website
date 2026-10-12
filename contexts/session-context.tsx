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
import { useDict } from "@/components/lang-provider"

interface SessionState {
  sessionId: string | null
  evaluation: Evaluation | null
  scheme: Scheme | null
  data: DataSegment[] | null
  extrapolations: ExtrapSegment[] | null
  /** The model on a fine grid, by data-segment index; null until loaded. */
  fine: Record<number, FineCurve> | null
  fineStatus: "idle" | "loading" | "ready" | "failed"
  loading: boolean
  calculating: boolean
  error: string | null
  /** HTTP status of the last failure (0: the server could not be reached). */
  errorStatus: number | null
  expired: boolean

  open: (id: string) => Promise<void>
  loadData: () => Promise<void>
  loadExtrapolations: () => Promise<void>
  loadFine: () => Promise<void>
  updateParameters: (updates: Record<number, number>) => Promise<void>
  reset: () => Promise<void>
  dismissError: () => void
}

const SessionContext = createContext<SessionState | undefined>(undefined)

export function SessionProvider({ children }: { children: ReactNode }) {
  const unexpected = useDict().workspace.unexpected
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [scheme, setScheme] = useState<Scheme | null>(null)
  const [data, setData] = useState<DataSegment[] | null>(null)
  const [extrapolations, setExtrapolations] = useState<ExtrapSegment[] | null>(
    null,
  )
  const [fine, setFineState] = useState<Record<number, FineCurve> | null>(null)
  const [fineStatus, setFineStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle")
  // Every change of parameters bumps this, so a fine grid computed for older
  // parameters is never shown with newer data.
  const version = useRef(0)
  const setFine = useCallback((list: FineCurve[] | null | undefined) => {
    if (!list) {
      setFineState(null)
      setFineStatus("idle")
      return
    }
    setFineState(Object.fromEntries(list.map((c) => [c.index, c])))
    setFineStatus("ready")
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

  const handle = useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      setError(err.message, err.status)
      // The server dropped this session (idle timeout or eviction); the UI has
      // to offer a reopen rather than retrying against a dead id.
      if (err.sessionExpired) setExpired(true)
    } else {
      setError(err instanceof Error ? err.message : unexpected)
    }
  }, [unexpected, setError])

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
        setData(null)
        setExtrapolations(null)
        version.current++
        setFine(null)
      } catch (err) {
        handle(err)
      } finally {
        setLoading(false)
      }
    },
    [handle],
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
  }, [handle])

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
  }, [handle])

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

  const updateParameters = useCallback(
    async (updates: Record<number, number>) => {
      const id = sessionRef.current
      if (!id) return
      setCalculating(true)
      try {
        const result = await setParameters(id, updates)
        version.current++
        setScheme(result.scheme)
        setData(result.data)
        setFine(result.fine)
        // Extrapolations were computed from the old parameters; drop them so the
        // extrapolation tab refetches rather than showing a stale curve.
        setExtrapolations(null)
        setError(null)
      } catch (err) {
        handle(err)
      } finally {
        setCalculating(false)
      }
    },
    [handle],
  )

  const reset = useCallback(async () => {
    const id = sessionRef.current
    if (!id) return
    setCalculating(true)
    try {
      const result = await resetParameters(id)
      version.current++
      setScheme(result.scheme)
      setData(result.data)
      setFine(result.fine)
      setExtrapolations(null)
      setError(null)
    } catch (err) {
      handle(err)
    } finally {
      setCalculating(false)
    }
  }, [handle])

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
      navigator.sendBeacon?.(
        `${API_BASE}/api/sessions/${sessionId}/close`,
        new Blob([], { type: "text/plain" }),
      )
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
        loading,
        calculating,
        error,
        errorStatus,
        expired,
        open,
        loadData,
        loadExtrapolations,
        loadFine,
        updateParameters,
        reset,
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
