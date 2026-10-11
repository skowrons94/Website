"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowRight, Download, Loader2 } from "lucide-react"
import { InlineMath } from "react-katex"
import "katex/dist/katex.min.css"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useDict, useLang } from "@/components/lang-provider"
import {
  evaluationDownloadUrl,
  listEvaluations,
  type Evaluation,
} from "@/lib/api"
import { localePath } from "@/lib/i18n"

function Intro() {
  const t = useDict().evaluations
  return (
    <div className="border-b border-border/70 pb-8">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {t.eyebrow}
      </p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
        {t.title}
      </h1>
      <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
        {t.introBefore}
        <code className="font-mono text-[0.85em]">.azr</code>
        {t.introAfter}
      </p>
    </div>
  )
}

/** The list of evaluations, in the language of the page it is on. */
export function EvaluationsIndex() {
  const lang = useLang()
  const t = useDict().evaluations
  const to = (path: string) => localePath(lang, path)
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setEvaluations(await listEvaluations())
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) {
    return (
      <div className="space-y-8">
        <Intro />
        <div className="flex min-h-[12rem] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t.loading}
        </div>
      </div>
    )
  }

  if (error) {
    // The header and the way onwards stay up when the calculation server is
    // down, so a visitor is not left with a bare error and nothing to do.
    return (
      <div className="space-y-8">
        <Intro />
        <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0">
              <h2 className="font-serif text-lg font-semibold tracking-tight">
                {t.serverDown}
              </h2>
              <p className="mt-2 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
                {t.serverDownText}
              </p>
              <p className="mt-2 break-words font-mono text-xs text-muted-foreground/80">{error}</p>
              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
                <Button onClick={load}>{t.tryAgain}</Button>
                <Link href={to("/atlas")} className="text-link underline-offset-4 hover:underline">
                  {t.atlas}
                </Link>
                <Link href={to("/notes")} className="text-link underline-offset-4 hover:underline">
                  {t.notes}
                </Link>
                <Link href={to("/software#azure2")} className="text-link underline-offset-4 hover:underline">
                  {t.aboutAzure}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <Intro />

      {evaluations.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <h3 className="mb-2 font-medium">{t.noneTitle}</h3>
            <p className="text-sm text-muted-foreground">{t.noneText}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {evaluations.map((evaluation) => (
            <Card key={evaluation.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-2xl">
                  <InlineMath math={evaluation.title} />
                </CardTitle>
                <CardDescription className="space-y-1">
                  {evaluation.entrance && (
                    <span className="block">
                      <InlineMath math={evaluation.entrance} />
                    </span>
                  )}
                  {evaluation.author && (
                    <span className="block">{evaluation.author}</span>
                  )}
                  {evaluation.reference && (
                    <span className="block font-mono text-xs">
                      {evaluation.reference}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {evaluation.channels.map((channel, i) => (
                    <span
                      key={i}
                      className="rounded border px-1.5 py-0.5 text-xs"
                    >
                      <InlineMath math={channel} />
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button asChild className="flex-1">
                    <Link href={to(`/evaluations/${evaluation.id}`)}>
                      {t.open}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="icon">
                    <a
                      href={evaluationDownloadUrl(evaluation.id, evaluation.filename)}
                      download
                      title={t.download(evaluation.filename)}
                      aria-label={t.download(evaluation.filename)}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
