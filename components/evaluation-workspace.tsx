"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react"
import { InlineMath } from "react-katex"
import "katex/dist/katex.min.css"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataPlot } from "@/components/data-plot"
import { DataTable } from "@/components/data-table"
import { ExtrapPlot } from "@/components/extrap-plot"
import { LevelScheme } from "@/components/level-scheme"
import { useSession } from "@/contexts/session-context"
import { IN_BROWSER } from "@/lib/api"
import { onEngineProgress } from "@/lib/browser-engine"
import { useDict, useLang } from "@/components/lang-provider"
import { localePath } from "@/lib/i18n"

type Tab = "scheme" | "data" | "plot" | "extrap"

export default function EvaluationWorkspace() {
  const lang = useLang()
  const t = useDict().workspace
  const params = useParams<{ id: string }>()
  const id = params?.id
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
    expired,
    open,
    loadData,
    loadExtrapolations,
    updateParameters,
    reset,
  } = useSession()

  useEffect(() => {
    if (id && sessionId === null && !loading) {
      open(id)
    }
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

  if (loading || (!scheme && !error)) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">{t.starting(id ?? "")}</p>
        {IN_BROWSER && (
          <p className="max-w-sm text-center text-xs">
            {progress ? `${t.progress[progress] ?? progress}…` : t.loadingEngine} {t.inBrowser}
          </p>
        )}
      </div>
    )
  }

  if (error && !scheme) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" />
        <p className="mb-4 text-sm text-muted-foreground">{error}</p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => id && open(id)}>{t.retry}</Button>
          <Button asChild variant="outline">
            <Link href={localePath(lang, "/evaluations")}>{t.back}</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!scheme || !evaluation || !sessionId) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href={localePath(lang, "/evaluations")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t.evaluations}
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              <InlineMath math={evaluation.title} />
            </h1>
            {evaluation.reference && (
              <p className="font-mono text-xs text-muted-foreground">
                {evaluation.reference}
              </p>
            )}
          </div>
        </div>
      </div>

      {expired && (
        <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <span>{t.expired}</span>
          <Button size="sm" onClick={() => id && open(id)}>
            {t.reopen}
          </Button>
        </div>
      )}

      {error && !expired && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList>
          <TabsTrigger value="scheme">{t.tabs.scheme}</TabsTrigger>
          <TabsTrigger value="data">{t.tabs.data}</TabsTrigger>
          <TabsTrigger value="plot">{t.tabs.plot}</TabsTrigger>
          <TabsTrigger value="extrap">{t.tabs.extrap}</TabsTrigger>
        </TabsList>

        <TabsContent value="scheme" className="mt-6">
          <LevelScheme
            scheme={scheme}
            evaluation={evaluation}
            sessionId={sessionId}
          />
        </TabsContent>

        <TabsContent value="data" className="mt-6">
          {data === null ? (
            <Pending label={t.calculatingData} />
          ) : (
            <DataTable data={data} />
          )}
        </TabsContent>

        <TabsContent value="plot" className="mt-6">
          {data === null ? (
            <Pending label={t.calculatingData} />
          ) : (
            <DataPlot
              data={data}
              scheme={scheme}
              calculating={calculating}
              onParameterChange={updateParameters}
              onReset={reset}
            />
          )}
        </TabsContent>

        <TabsContent value="extrap" className="mt-6">
          {extrapolations === null ? (
            <Pending label={t.calculatingExtrap} />
          ) : (
            <ExtrapPlot
              extrapolations={extrapolations}
              data={data}
              sessionId={sessionId}
              calculating={calculating}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Pending({ label }: { label: string }) {
  return (
    <div className="flex min-h-[16rem] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}
