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
  ApiError,
  closeSession,
  getData,
  getExtrapolations,
  openEvaluation,
  resetParameters,
  setParameters,
  type DataSegment,
  type Evaluation,
  type ExtrapSegment,
  type Scheme,
} from "@/lib/api"

interface SessionState {
  sessionId: string | null
  evaluation: Evaluation | null
  scheme: Scheme | null
  data: DataSegment[] | null
  extrapolations: ExtrapSegment[] | null
  loading: boolean
  calculating: boolean
  error: string | null
  expired: boolean

  open: (id: string) => Promise<void>
  loadData: () => Promise<void>
  loadExtrapolations: () => Promise<void>
  updateParameters: (updates: Record<number, number>) => Promise<void>
  reset: () => Promise<void>
  dismissError: () => void
}

const SessionContext = createContext<SessionState | undefined>(undefined)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [scheme, setScheme] = useState<Scheme | null>(null)
  const [data, setData] = useState<DataSegment[] | null>(null)
  const [extrapolations, setExtrapolations] = useState<ExtrapSegment[] | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)

  // Read inside callbacks so they never close over a stale id.
  const sessionRef = useRef<string | null>(null)
  sessionRef.current = sessionId

  const handle = useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      setError(err.message)
      // The server dropped this session (idle timeout or eviction); the UI has
      // to offer a reopen rather than retrying against a dead id.
      if (err.sessionExpired) setExpired(true)
    } else {
      setError(err instanceof Error ? err.message : "Unexpected error")
    }
  }, [])

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

  const updateParameters = useCallback(
    async (updates: Record<number, number>) => {
      const id = sessionRef.current
      if (!id) return
      setCalculating(true)
      try {
        const result = await setParameters(id, updates)
        setScheme(result.scheme)
        setData(result.data)
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
      setScheme(result.scheme)
      setData(result.data)
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
        loading,
        calculating,
        error,
        expired,
        open,
        loadData,
        loadExtrapolations,
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
