import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { ChartDiagram } from "@/components/atlas/chart-diagram"
import { LunaFigure } from "@/components/atlas/luna-figure"
import { STATUSES, StatusBadge } from "@/components/atlas/status-badge"
import { Container, PageHeader } from "@/components/page-header"
import { Sci } from "@/components/sci"
import { getGlossary } from "@/lib/atlas"
import { statusHint } from "@/lib/atlas-format"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const glossaryMetadata = (lang: Lang): Metadata =>
  pageMetadata(dict(lang).atlas.glossaryMeta, dict(lang).atlas.glossaryDescription, lang)

export function GlossaryPage({ lang }: { lang: Lang }) {
  const t = dict(lang).atlas
  const terms = getGlossary(lang)
  const name = new Map(terms.map((term) => [term.id, term.term]))

  return (
    <Container>
      <Link
        href={localePath(lang, "/atlas")}
        className="-mt-2.5 mb-[1.375rem] inline-flex items-center gap-1.5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.name}
      </Link>
      <PageHeader eyebrow={t.name} title={t.glossaryTitle} lead={t.glossaryLead} />

      {/* -- the terms, as an index ------------------------------------------ */}
      <nav aria-label={t.glossaryTitle} className="mb-14">
        <ul className="flex flex-wrap gap-1.5">
          {terms.map((term) => (
            <li key={term.id}>
              <a
                href={`#${term.id}`}
                className="inline-flex min-h-8 items-center rounded-md border border-border bg-card px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <Sci>{term.term}</Sci>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <dl className="divide-y divide-border/70 border-y border-border/70">
        {terms.map((term) => (
          <div key={term.id} id={term.id} className="scroll-mt-24 py-8 sm:grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-8">
            <dt>
              <span className="block font-serif text-xl font-semibold leading-snug tracking-tight">
                <Sci>{term.term}</Sci>
              </span>
              {term.also && (
                <span className="mt-1 block text-sm text-muted-foreground">
                  <Sci>{term.also}</Sci>
                </span>
              )}
            </dt>
            <dd className="mt-3 sm:mt-0">
              <p className="max-w-[42rem] text-pretty text-[1.0625rem] leading-relaxed">
                <Sci>{term.text}</Sci>
              </p>
              {term.id === "chart" && <ChartDiagram lang={lang} className="mt-5 max-w-md" />}
              {term.id === "luna" && <LunaFigure lang={lang} className="mt-5 max-w-xl" />}
              {term.id === "status" && (
                <ul className="mt-5 space-y-2.5">
                  {STATUSES.map((s) => (
                    <li key={s} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <StatusBadge status={s} lang={lang} />
                      <span className="min-w-0 flex-1 pt-0.5">{statusHint(s, lang)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {term.see.length > 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                  {t.seeAlso}:{" "}
                  {term.see.map((id, i) => (
                    <span key={id}>
                      {i > 0 && ", "}
                      <a href={`#${id}`} className="inline-flex min-h-6 items-center text-link underline-offset-4 hover:underline">
                        <Sci>{name.get(id) ?? id}</Sci>
                      </a>
                    </span>
                  ))}
                </p>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Container>
  )
}
