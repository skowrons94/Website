"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowRight, Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sci } from "@/components/sci"
import { Tex, texPlain } from "@/components/tex"
import { useDict, useLang } from "@/components/lang-provider"
import { evaluationDownloadUrl, listEvaluations, type Evaluation } from "@/lib/api"
import { localePath } from "@/lib/i18n"

/** What the page knows about an evaluation before the API answers. */
export interface CardMeta {
  id: string
  reactions: string[]
  analysis: string | null
  paper: { authors: string; journal: string | null; year: number | null } | null
  doi: string | null
  reference: string | null
  status: string | null
  filename: string | null
}

function Intro() {
  const lang = useLang()
  const t = useDict().evaluations
  return (
    <div className="border-b border-border/70 pb-8">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {t.eyebrow}
      </p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{t.title}</h1>
      {/* Who this is for comes first: a visitor after the stars is sent to the
          atlas before reading about level energies and reduced widths. */}
      <p className="mt-4 max-w-2xl text-pretty rounded-md border-l-2 border-link/60 bg-card/60 py-2 pl-4 pr-3 text-sm leading-relaxed">
        {t.specialistBefore}
        <Link href={localePath(lang, "/atlas")} className="font-medium text-link underline-offset-4 hover:underline">
          {t.specialistLink}
        </Link>
        {t.specialistAfter}
      </p>
      <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
        {t.introBefore}
        <code className="font-mono text-[0.85em]">.azr</code>
        {t.introAfter}
      </p>
    </div>
  )
}

/** `14N` → `¹⁴N`. */
const nuclide = (id: string) =>
  id.replace(/^(\d+)/, (m) => m.replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]))

/**
 * The list of evaluations, in the language of the page it is on.
 *
 * The cards are rendered from `initial` (read from the repository at build
 * time), so they are in the HTML and nothing moves when the API answers; the
 * API then adds the channels, and any evaluation it serves that this build
 * has not seen.
 */
export function EvaluationsIndex({ initial = [] }: { initial?: CardMeta[] }) {
  const lang = useLang()
  const t = useDict().evaluations
  const to = (path: string) => localePath(lang, path)
  const [live, setLive] = useState<Evaluation[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = async () => {
    setFailed(false)
    try {
      setLive(await listEvaluations())
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const byId = new Map((live ?? []).map((e) => [e.id, e]))
  const ids = [...initial.map((c) => c.id), ...(live ?? []).map((e) => e.id).filter((id) => !initial.some((c) => c.id === id))]
  const cards = ids.map((id) => {
    const known = initial.find((c) => c.id === id)
    const api = byId.get(id)
    return {
      id,
      known: Boolean(known),
      title: api?.title ?? null,
      reactions: known?.reactions.length ? known.reactions : (api?.reactions ?? []),
      analysis: known?.analysis ?? api?.analysis ?? api?.author ?? null,
      paper: known?.paper ?? (api?.paper ? { authors: api.paper.authors, journal: api.paper.journal ?? null, year: api.paper.year ?? null } : null),
      doi: known?.doi ?? api?.doi ?? null,
      status: known?.status ?? api?.status ?? null,
      filename: api?.filename ?? known?.filename ?? `${id}.azr`,
      channels: api?.channels ?? null,
    }
  })

  return (
    <div className="space-y-8">
      <Intro />

      {failed && (
        // The cards and the way onwards stay up when the calculation server is
        // down, so a visitor is not left with a bare error and nothing to do.
        <div role="alert" className="rounded-lg border border-border bg-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0">
              <h2 className="font-serif text-lg font-semibold tracking-tight">{t.serverDown}</h2>
              <p className="mt-2 max-w-2xl text-pretty leading-relaxed text-muted-foreground">{t.serverDownText}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
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
      )}

      {cards.length === 0 && live !== null ? (
        <div className="rounded-lg border border-border bg-card py-16 text-center">
          <h2 className="mb-2 font-medium">{t.noneTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.noneText}</p>
        </div>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const nucleus = card.known || !card.title ? nuclide(card.id) : texPlain(card.title)
            // The reaction is the heading (what a physicist looks for); the
            // compound nucleus, which names the evaluation, comes second.
            const [lead, ...others] = card.reactions
            const name = lead ?? nucleus
            const paper = card.paper
              ? `${card.paper.authors}${card.paper.journal ? `, ${card.paper.journal}` : ""}${card.paper.year ? ` (${card.paper.year})` : ""}`
              : card.doi
                ? `doi:${card.doi}`
                : t.unpublished
            return (
              <li
                key={card.id}
                className="group relative flex min-h-[13.5rem] flex-col rounded-lg border border-border bg-card p-5 transition-colors focus-within:border-foreground/40 hover:border-foreground/30"
              >
                <h2 className="font-serif text-[1.375rem] font-semibold leading-snug tracking-tight">
                  {/* The title link covers the whole card (after:inset-0), so
                      the card is one target without nesting the download link
                      inside another link. */}
                  <Link
                    href={to(`/evaluations/${card.id}`)}
                    aria-label={t.openAria(name)}
                    className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-link"
                  >
                    {lead ? <Sci>{lead}</Sci> : card.known || !card.title ? <Sci>{nucleus}</Sci> : <Tex math={card.title} />}
                  </Link>
                </h2>
                {others.length > 0 && (
                  <p className="mt-1 font-serif text-[1.0625rem] leading-snug text-muted-foreground">
                    <Sci>{others.join(" · ")}</Sci>
                  </p>
                )}
                {lead && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    <Sci>{t.compound(nucleus)}</Sci>
                  </p>
                )}
                <p className="mt-2 text-sm text-muted-foreground">
                  <span className="block break-words">{paper}</span>
                  {card.analysis && (
                    <span className="block">
                      {t.analysis}: {card.analysis}
                    </span>
                  )}
                </p>
                <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                  <p className="min-h-[1.5rem] min-w-0 text-xs text-muted-foreground">
                    {card.channels && (
                      <>
                        {t.channelsLabel}:{" "}
                        {card.channels.map((channel, i) => (
                          <span key={i}>
                            {i > 0 && ", "}
                            <Tex math={channel} />
                          </span>
                        ))}
                      </>
                    )}
                  </p>
                  <span className="flex shrink-0 items-center gap-1">
                    <a
                      href={evaluationDownloadUrl(card.id, card.filename)}
                      download
                      title={t.download(card.filename)}
                      aria-label={t.download(card.filename)}
                      className="relative z-10 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Download className="h-4 w-4" aria-hidden />
                    </a>
                    <ArrowRight
                      className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-link"
                      aria-hidden
                    />
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
