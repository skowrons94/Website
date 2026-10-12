"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tex } from "@/components/tex"
import { Sci } from "@/components/sci"
import { SessionProvider, useSession } from "@/contexts/session-context"
import { IN_BROWSER } from "@/lib/api"
import { onEngineProgress } from "@/lib/browser-engine"
import { useDict, useLang } from "@/components/lang-provider"
import { localePath } from "@/lib/i18n"

/*
 * The tabs' bodies are loaded on demand: the level scheme is what a visitor
 * sees first, and the plots (recharts) are the bulk of the page's JavaScript.
 * Each placeholder reserves the height of what replaces it.
 */
const LevelScheme = dynamic(() => import("@/components/level-scheme").then((m) => m.LevelScheme), {
  loading: () => <Placeholder />,
})
const DataTable = dynamic(() => import("@/components/data-table").then((m) => m.DataTable), {
  loading: () => <Placeholder />,
})
const DataPlot = dynamic(() => import("@/components/data-plot").then((m) => m.DataPlot), {
  loading: () => <Placeholder />,
})
const ExtrapPlot = dynamic(() => import("@/components/extrap-plot").then((m) => m.ExtrapPlot), {
  loading: () => <Placeholder />,
})

type Tab = "scheme" | "data" | "plot" | "extrap"

/**
 * One evaluation, live. Owns its AZURE2 session: the provider lives here
 * rather than in the site's root layout, so no other page loads the session
 * code or the API client.
 *
 * `known` says the page was built with this evaluation's metadata, i.e. the
 * server already rendered its title and header above; an evaluation the API
 * serves but the build has not seen gets a title from the API instead.
 */
export default function EvaluationWorkspace({ id, known }: { id: string; known: boolean }) {
  return (
    <SessionProvider>
      <Workspace id={id} known={known} />
    </SessionProvider>
  )
}

function Workspace({ id, known }: { id: string; known: boolean }) {
  const lang = useLang()
  const t = useDict().workspace
  const [tab, setTab] = useState<Tab>("scheme")
  const [progress, setProgress] = useState<string | null>(null)
  useEffect(() => (IN_BROWSER ? onEngineProgress(setProgress) : undefined), [])

  const {
    sessionId,
    evaluation,
    scheme,
    data,
    extrapolations,
    loading,
    calculating,
    error,
    errorStatus,
    expired,
    open,
    loadData,
    loadExtrapolations,
    updateParameters,
    reset,
  } = useSession()

  useEffect(() => {
    if (id && sessionId === null && !loading) open(id)
    // Opening is keyed on the route; re-running on every render would spawn
    // AZURE2 processes without bound.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Each tab pulls what it needs the first time it is shown, so opening an
  // evaluation does not pay for calculations nobody looks at.
  useEffect(() => {
    if (!sessionId) return
    if ((tab === "data" || tab === "plot") && data === null) loadData()
    if (tab === "extrap" && extrapolations === null) loadExtrapolations()
  }, [tab, sessionId, data, extrapolations, loadData, loadExtrapolations])

  if (errorStatus === 404 && !scheme) return <NotFoundState id={id} heading={known ? "h2" : "h1"} />

  const ready = Boolean(scheme && evaluation && sessionId)
  const opening = !ready && !error
  const unavailable = !ready && Boolean(error)
  // A calculation that failed leaves its tab without results; offer to run it
  // again rather than spin forever under the error message.
  const failed = Boolean(error) && !calculating && !expired

  const starting = (
    <Placeholder>
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
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
        {/* Wraps rather than overflows: the Italian labels are wider than a
            phone at one row. */}
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="scheme" className="min-h-9">{t.tabs.scheme}</TabsTrigger>
          <TabsTrigger value="data" className="min-h-9">{t.tabs.data}</TabsTrigger>
          <TabsTrigger value="plot" className="min-h-9">{t.tabs.plot}</TabsTrigger>
          <TabsTrigger value="extrap" className="min-h-9">{t.tabs.extrap}</TabsTrigger>
        </TabsList>

        <TabsContent value="scheme" className="mt-6">
          {body(
            ready && <LevelScheme scheme={scheme!} evaluation={evaluation!} sessionId={sessionId!} />,
          )}
        </TabsContent>

        <TabsContent value="data" className="mt-6">
          {body(
            data === null ? (
              <Pending label={t.calculatingData} failed={failed} onRetry={loadData} retry={t.tryAgain} />
            ) : (
              <DataTable data={data} />
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
                scheme={scheme!}
                calculating={calculating}
                onParameterChange={updateParameters}
                onReset={reset}
              />
            ),
          )}
        </TabsContent>

        <TabsContent value="extrap" className="mt-6">
          {body(
            extrapolations === null ? (
              <Pending
                label={t.calculatingExtrap}
                failed={failed}
                onRetry={loadExtrapolations}
                retry={t.tryAgain}
              />
            ) : (
              <ExtrapPlot
                extrapolations={extrapolations}
                data={data}
                sessionId={sessionId!}
                calculating={calculating}
              />
            ),
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Reserved space while something loads, so the footer does not jump. */
function Placeholder({ children }: { children?: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex min-h-[32rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 text-muted-foreground"
    >
      {children}
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
  const t = useDict().evaluations
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
