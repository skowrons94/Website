"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { AlertCircle, ArrowRight, Check, Link2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tex } from "@/components/tex"
import { Sci } from "@/components/sci"
import { SessionProvider, changedValues, useSession } from "@/contexts/session-context"
import { IN_BROWSER } from "@/lib/api"
import { onEngineProgress } from "@/lib/browser-engine"
import { defaultSelection, type Quantity } from "@/lib/eval-plot"
import { useLang } from "@/components/lang-context"
import { useEvalDict } from "@/components/eval-dict"
import { localePath } from "@/lib/locale"

/*
 * The tabs' bodies are loaded on demand: the level scheme is what a visitor
 * sees first, and the plots are the bulk of the page's JavaScript. Each
 * placeholder reserves the height of what replaces it, and says what it waits for.
 */
const LevelScheme = dynamic(() => import("@/components/level-scheme").then((m) => m.LevelScheme), {
  loading: () => <Placeholder busy />,
})
const DataPlot = dynamic(() => import("@/components/data-plot").then((m) => m.DataPlot), {
  loading: () => <Placeholder busy />,
})
const ExtrapPlot = dynamic(() => import("@/components/extrap-plot").then((m) => m.ExtrapPlot), {
  loading: () => <Placeholder busy />,
})

/** "data" is the old Data tab: now the table drawer of the plot view. */
type Tab = "scheme" | "plot" | "extrap"
const TABS: Tab[] = ["scheme", "plot", "extrap"]
const QUANTITIES: Quantity[] = ["sfactor", "cross_section", "rutherford"]

/** What the URL carried when the page opened (read once, on the client). */
interface UrlState {
  tab: Tab
  table: boolean
  ds: number[] | null
  q: Quantity | null
  level: string | null
  params: Record<number, number> | null
}

function readUrl(): UrlState {
  const out: UrlState = { tab: "scheme", table: false, ds: null, q: null, level: null, params: null }
  if (typeof window === "undefined") return out
  const q = new URLSearchParams(window.location.search)
  const tab = q.get("tab")
  if (tab === "data") {
    out.tab = "plot"
    out.table = true
  } else if (tab && (TABS as string[]).includes(tab)) out.tab = tab as Tab
  const ds = q.get("ds")
  if (ds) out.ds = ds.split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 0)
  const quantity = q.get("q")
  if (quantity && (QUANTITIES as string[]).includes(quantity)) out.q = quantity as Quantity
  out.level = q.get("level")
  const p = q.get("p")
  if (p) {
    const params: Record<number, number> = {}
    for (const part of p.split(",")) {
      const [k, v] = part.split(":")
      const index = Number(k)
      const value = Number(v)
      if (Number.isInteger(index) && index >= 0 && Number.isFinite(value)) params[index] = value
    }
    if (Object.keys(params).length > 0) out.params = params
  }
  return out
}

/**
 * One evaluation, live. Owns its AZURE2 session: the provider lives here
 * rather than in the site's root layout, so no other page loads the session
 * code or the API client.
 *
 * `known` says the page was built with this evaluation's metadata, i.e. the
 * server already rendered its title and header above; an evaluation the API
 * serves but the build has not seen gets a title from the API instead.
 */
export interface WorkspaceProps {
  id: string
  known: boolean
  /** Elastic scattering only (⁸Be, ²⁴Mg): cross sections, no S-factor, no Gamow window. */
  scatteringOnly?: boolean
  /** Where the atlas places the headline reaction (T₉, label): the Gamow windows offered. */
  temperatures?: { T9: number; label: string }[]
}

export default function EvaluationWorkspace(props: WorkspaceProps) {
  return (
    <SessionProvider>
      <Workspace {...props} />
    </SessionProvider>
  )
}

function Workspace({ id, known, scatteringOnly = false, temperatures = [] }: WorkspaceProps) {
  const defaultQuantity: Quantity = scatteringOnly ? "cross_section" : "sfactor"
  const lang = useLang()
  const t = useEvalDict().workspace
  const initial = useRef<UrlState | null>(null)
  const [tab, setTab] = useState<Tab>("scheme")
  const [tableOpen, setTableOpen] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [quantity, setQuantity] = useState<Quantity>(defaultQuantity)
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  useEffect(() => (IN_BROWSER ? onEngineProgress(setProgress) : undefined), [])

  const {
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
    canUndo,
    canRedo,
    deltaChi2,
    open,
    loadData,
    loadExtrapolations,
    loadFine,
    updateParameters,
    reset,
    undo,
    redo,
  } = useSession()

  // The state a shared link carries, restored once.
  useEffect(() => {
    const state = readUrl()
    initial.current = state
    setTab(state.tab)
    setTableOpen(state.table)
    if (state.ds) setSelected(state.ds)
    if (state.q) setQuantity(state.q)
    if (state.level) setSelectedLevel(state.level)
    // A link to a tab (?tab=plot from a reaction page): bring the tabs, and so
    // the plot, into view rather than leave the reader at the page's top.
    if (new URLSearchParams(window.location.search).has("tab")) {
      fromUrl.current = true
      requestAnimationFrame(scrollToTabs)
    }
  }, [])
  // Once more when the workspace has drawn (fonts and the header settle).
  const fromUrl = useRef(false)
  const wasReady = useRef(false)
  useEffect(() => {
    if (!scheme || wasReady.current) return
    wasReady.current = true
    if (fromUrl.current && window.scrollY > 0) requestAnimationFrame(scrollToTabs)
  }, [scheme])

  useEffect(() => {
    if (id && sessionId === null && !loading) open(id)
    // Opening is keyed on the route; re-running on every render would spawn
    // AZURE2 processes without bound.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Parameters edited in the shared link: applied once the model is open and
  // its own data and smooth curves are in, so the published fit (the dashed
  // line), the χ² it had and the Δχ² of each change survive the reload.
  const appliedParams = useRef(false)
  useEffect(() => {
    if (!sessionId || !scheme || appliedParams.current) return
    const params = initial.current?.params
    if (!params) {
      appliedParams.current = true
      return
    }
    if (calculating) return
    if (data === null) {
      loadData()
      return
    }
    if (fineStatus === "idle") {
      loadFine()
      return
    }
    if (fineStatus === "loading") return
    appliedParams.current = true
    updateParameters(params)
  }, [sessionId, scheme, data, fineStatus, calculating, loadData, loadFine, updateParameters])

  // Each tab pulls what it needs the first time it is shown, so opening an
  // evaluation does not pay for calculations nobody looks at. The plot's
  // data also serve the extrapolations' overlay.
  useEffect(() => {
    if (!sessionId) return
    const restoring = Boolean(initial.current?.params) && !appliedParams.current
    if ((tab === "plot" || tab === "extrap") && data === null && !calculating && !restoring) loadData()
    if (tab === "extrap" && extrapolations === null && data !== null && !calculating) loadExtrapolations()
    // The smooth model curves, once the data are in (after an edit the
    // server sends them along when they are cheap; otherwise ask again).
    if (tab === "plot" && data !== null && !calculating && fineStatus === "idle" && !restoring) loadFine()
  }, [tab, sessionId, data, extrapolations, loadData, loadExtrapolations, loadFine, fineStatus, calculating])

  // The plot opens on the headline reaction, unless the link chose.
  useEffect(() => {
    if (!data || selected.length > 0) return
    // Resonance energies (c.m.) of the levels above each particle threshold.
    const resonances: number[] = []
    for (const pair of scheme?.pairs ?? []) {
      if (pair.is_photon || pair.threshold == null) continue
      for (const level of scheme?.levels ?? []) resonances.push(level.energy - pair.threshold)
    }
    // Surnames of the analysis' and the paper's authors: "J. Skowronski" → "Skowronski".
    const own = [evaluation?.analysis, evaluation?.paper?.authors]
      .flatMap((text) => (text ?? "").split(/,| and | e /))
      .map((name) => name.replace(/\bet al\.?/g, "").trim().split(/\s+/).pop() ?? "")
      .filter(Boolean)
    setSelected(defaultSelection(data, evaluation?.reactions?.[0], resonances, own))
  }, [data, evaluation, scheme, selected.length])

  // The view in the address bar (replaceState: no history entry per click).
  const viewQuery = useCallback(
    (withParams: boolean) => {
      const q = new URLSearchParams()
      if (tab !== "scheme") q.set("tab", tab)
      if (tab !== "scheme" && selected.length > 0) q.set("ds", selected.join(","))
      if (tab !== "scheme" && quantity !== defaultQuantity) q.set("q", quantity)
      if (selectedLevel) q.set("level", selectedLevel)
      if (withParams && scheme) {
        const changed = changedValues(scheme)
        const parts = Object.entries(changed).map(([k, v]) => `${k}:${Number(v.toPrecision(8))}`)
        if (parts.length > 0) q.set("p", parts.join(","))
      }
      const text = q.toString().replace(/%2C/g, ",").replace(/%3A/g, ":")
      return text ? `?${text}` : ""
    },
    [tab, selected, quantity, selectedLevel, scheme, defaultQuantity],
  )
  useEffect(() => {
    if (!initial.current) return
    const url = `${window.location.pathname}${viewQuery(false)}${window.location.hash}`
    window.history.replaceState(window.history.state, "", url)
  }, [viewQuery])

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${viewQuery(true)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt(t.copyLink, url)
    }
  }

  if (errorStatus === 404 && !scheme) return <NotFoundState id={id} heading={known ? "h2" : "h1"} />

  const ready = Boolean(scheme && evaluation && sessionId)
  const opening = !ready && !error
  const unavailable = !ready && Boolean(error)
  // A calculation that failed leaves its tab without results; offer to run it
  // again rather than spin forever under the error message.
  const failed = Boolean(error) && !calculating && !expired

  const starting = (
    <Placeholder busy>
      <p className="text-sm">{t.starting(id)}</p>
      {IN_BROWSER && (
        <p className="max-w-sm text-center text-xs">
          {progress ? `${t.progress[progress] ?? progress}…` : t.loadingEngine} {t.inBrowser}
        </p>
      )}
    </Placeholder>
  )

  const down = (
    <div className="flex min-h-[32rem] items-start justify-center pt-10">
      <div className="max-w-xl rounded-lg border border-border bg-card p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0">
            <h2 className="font-serif text-lg font-semibold tracking-tight">{t.serverDown}</h2>
            <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">{t.serverDownText}</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <Button onClick={() => open(id)}>{t.tryAgain}</Button>
              <Link href={localePath(lang, "/atlas")} className="text-link underline-offset-4 hover:underline">
                {t.atlas}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const body = (content: React.ReactNode) => (opening ? starting : unavailable ? down : content)

  const editLevel = (key: string) => {
    setSelectedLevel(key)
    setTab("plot")
    // Back to the tabs, so the plot and the opened sliders are in view.
    requestAnimationFrame(scrollToTabs)
  }

  return (
    <div className="mt-8 space-y-6">
      {!known && evaluation && (
        <header>
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
            <Tex math={evaluation.title} />
          </h1>
          {evaluation.reactions && evaluation.reactions.length > 0 && (
            <p className="mt-3 font-serif text-lg">
              <Sci>{evaluation.reactions.join(" · ")}</Sci>
            </p>
          )}
        </header>
      )}

      {expired && (
        <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <span>{t.expired}</span>
          <Button size="sm" onClick={() => open(id)}>
            {t.reopen}
          </Button>
        </div>
      )}

      {error && ready && !expired && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          {errorStatus === 0 ? t.serverDown : error}
        </div>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* Scrolls sideways rather than wrapping on a narrow phone. */}
          <div className="-mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none]">
            <TabsList className="h-auto scroll-mt-20 justify-start">
              <TabsTrigger value="scheme" className="min-h-9 whitespace-nowrap">
                {t.tabs.scheme}
              </TabsTrigger>
              <TabsTrigger value="plot" className="min-h-9 whitespace-nowrap">
                {t.tabs.plot}
              </TabsTrigger>
              <TabsTrigger value="extrap" className="min-h-9 whitespace-nowrap">
                <span className="sm:hidden">{t.tabs.extrapShort}</span>
                <span className="max-sm:hidden">{t.tabs.extrap}</span>
              </TabsTrigger>
            </TabsList>
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={copyLink} disabled={!ready}>
            {copied ? <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> : <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
            {copied ? t.copied : t.copyLink}
          </Button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {copied ? t.copied : ""}
        </p>

        <TabsContent value="scheme" className="mt-6">
          {body(
            ready && (
              <LevelScheme
                scheme={scheme!}
                evaluation={evaluation!}
                sessionId={sessionId!}
                selectedLevel={selectedLevel}
                onSelectLevel={setSelectedLevel}
                onEditLevel={editLevel}
              />
            ),
          )}
        </TabsContent>

        <TabsContent value="plot" className="mt-6">
          {body(
            data === null ? (
              <Pending label={t.calculatingData} failed={failed} onRetry={loadData} retry={t.tryAgain} />
            ) : (
              <DataPlot
                data={data}
                fine={fine}
                fineStatus={fineStatus}
                initialData={initialData}
                initialFine={initialFine}
                scheme={scheme!}
                calculating={calculating}
                selected={selected}
                onSelect={setSelected}
                quantity={quantity}
                onQuantity={setQuantity}
                onParameterChange={updateParameters}
                onReset={reset}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
                tableOpen={tableOpen}
                evaluationId={id}
                selectedLevel={selectedLevel}
                onSelectLevel={setSelectedLevel}
                deltaChi2={deltaChi2}
              />
            ),
          )}
        </TabsContent>

        <TabsContent value="extrap" className="mt-6">
          {body(
            extrapolations === null ? (
              <Pending label={t.calculatingExtrap} failed={failed} onRetry={loadExtrapolations} retry={t.tryAgain} />
            ) : (
              <ExtrapPlot
                headline={evaluation?.reactions?.[0]}
                scatteringOnly={scatteringOnly}
                temperatures={temperatures}
                extrapolations={extrapolations}
                data={data}
                pairs={scheme?.pairs ?? []}
                sessionId={sessionId!}
                calculating={calculating}
                evaluationId={id}
              />
            ),
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Scroll the tabs to just under the site header (whose height is `--header-h` when it sets it). */
function scrollToTabs() {
  const tabs = document.querySelector('[role="tablist"]')
  if (!tabs) return
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--header-h").trim()
  const css = parseFloat(raw) * (raw.endsWith("rem") ? 16 : 1)
  const header = raw && Number.isFinite(css) ? css : (document.querySelector("header")?.getBoundingClientRect().height ?? 64)
  window.scrollTo({ top: Math.max(0, tabs.getBoundingClientRect().top + window.scrollY - header - 12) })
}

/** Reserved space while something loads, so the footer does not jump. */
function Placeholder({ children, busy = false }: { children?: React.ReactNode; busy?: boolean }) {
  const t = useEvalDict().workspace
  return (
    <div
      role="status"
      className="flex min-h-[32rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 text-muted-foreground"
    >
      {busy && <Loader2 className="h-6 w-6 animate-spin" aria-hidden />}
      {children ?? (busy && <p className="text-sm">{t.loadingView}</p>)}
    </div>
  )
}

function Pending({
  label,
  failed,
  onRetry,
  retry,
}: {
  label: string
  failed: boolean
  onRetry: () => void
  retry: string
}) {
  if (failed) {
    return (
      <div className="flex min-h-[32rem] items-center justify-center">
        <Button variant="outline" onClick={onRetry}>
          {retry}
        </Button>
      </div>
    )
  }
  return (
    <Placeholder>
      <span className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {label}
      </span>
    </Placeholder>
  )
}

/** An id the API does not know: say so, and offer the way back. */
function NotFoundState({ id, heading }: { id: string; heading: "h1" | "h2" }) {
  const lang = useLang()
  const t = useEvalDict().evaluations
  const Heading = heading
  return (
    <div className="mt-8 max-w-2xl">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">404</p>
      <Heading className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{t.notFoundTitle}</Heading>
      <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground">{t.notFoundText(id)}</p>
      <Link
        href={localePath(lang, "/evaluations")}
        className="mt-6 inline-flex min-h-10 items-center gap-2 font-medium text-link underline-offset-4 hover:underline"
      >
        {t.allEvaluations}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )
}
