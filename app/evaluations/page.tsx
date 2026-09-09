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
import {
  evaluationDownloadUrl,
  listEvaluations,
  type Evaluation,
} from "@/lib/api"

export default function EvaluationsPage() {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setEvaluations(await listEvaluations())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load evaluations")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading evaluations…
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" />
        <p className="mb-4 text-sm text-muted-foreground">{error}</p>
        <Button onClick={load}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-border/70 pb-8">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Running on AZURE2
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          R-matrix evaluations
        </h1>
        <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          Each of these is a published multi-level, multi-channel fit. Open one
          to see its level scheme and the data it was fitted to, then move a
          level energy or a reduced width and watch the cross section and the χ²
          respond — the calculation is the real code, run on the server. Every
          evaluation can also be downloaded as an <code className="font-mono text-[0.85em]">.azr</code>{" "}
          project and run locally.
        </p>
      </div>

      {evaluations.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <h3 className="mb-2 font-medium">No evaluations found</h3>
            <p className="text-sm text-muted-foreground">
              Add a directory containing an .azr file to the server&apos;s
              evaluations folder.
            </p>
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
                    <Link href={`/evaluations/${evaluation.id}`}>
                      Open
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="icon">
                    <a
                      href={evaluationDownloadUrl(evaluation.id)}
                      download
                      title={`Download ${evaluation.filename}`}
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
