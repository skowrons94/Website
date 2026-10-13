import "@/components/math-styles"
import type { Metadata } from "next"
import Link from "next/link"
import katex from "katex"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { ChartDiagram } from "@/components/atlas/chart-diagram"
import { LunaFigure } from "@/components/atlas/luna-figure"
import { STATUSES, StatusBadge } from "@/components/atlas/status-badge"
import { Container, PageHeader } from "@/components/page-header"
import { ReportLinks } from "@/components/report-links"
import { Sci } from "@/components/sci"
import { getGlossary } from "@/lib/atlas"
import { statusHint } from "@/lib/atlas-format"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"
import { PageLd } from "@/components/json-ld"
import { ExercisesPointer } from "@/components/pages/exercises"

export const glossaryMetadata = (lang: Lang): Metadata =>
  pageMetadata(dict(lang).atlas.glossaryMeta, dict(lang).atlas.glossaryDescription, lang)

export function GlossaryPage({ lang }: { lang: Lang }) {
  const t = dict(lang).atlas
  const terms = getGlossary(lang)
  const name = new Map(terms.map((term) => [term.id, term.term]))
  const report = dict(lang).report

  return (
    <Container>
      {/* --- find --- */}
      <PageLd lang={lang} trail={[{ name: dict(lang).nav.glossary, path: "/glossary" }]} />
      <Link
        href={localePath(lang, "/atlas")}
        className="-mt-2.5 mb-[1.375rem] inline-flex items-center gap-1.5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.name}
      </Link>
      <PageHeader eyebrow={t.name} title={t.glossaryTitle} lead={t.glossaryLead} />
      {/* --- find --- */}
      <ExercisesPointer lang={lang} />

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
          <div key={term.id} id={term.id} className="scroll-mt-24 py-8 min-[40em]:grid min-[40em]:grid-cols-[13rem_minmax(0,1fr)] min-[40em]:gap-8">
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
            <dd className="mt-3 min-w-0 min-[40em]:mt-0">
              <p className="max-w-[42rem] text-pretty text-[1.0625rem] leading-relaxed">
                <Sci>{term.text}</Sci>
              </p>
              {term.id === "chart" && <ChartDiagram lang={lang} className="mt-5 max-w-md" />}
              {term.id === "luna" && <LunaFigure lang={lang} className="mt-5 max-w-xl" />}
              {term.id === "macs" && <MacsFormula lang={lang} />}
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
              {term.page && (
                <p className="mt-4">
                  <Link
                    href={localePath(lang, term.page)}
                    className="group inline-flex min-h-8 items-center gap-1.5 text-[0.95rem] font-medium text-link underline-offset-4 hover:underline"
                  >
                    {t.glossaryPage}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </p>
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
              {/* --- r11 site --- */}
              <ReportLinks
                path={`${localePath(lang, "/glossary")}#${term.id}`}
                section={`${t.glossaryTitle}: ${term.term}`}
                strings={{ ...report, found: "" }}
                className="mt-4 text-xs text-muted-foreground"
              />
            </dd>
          </div>
        ))}
      </dl>
    </Container>
  )
}

/** The definition of the MACS, typeset by KaTeX on the server. */
function MacsFormula({ lang }: { lang: Lang }) {
  const html = katex.renderToString(
    String.raw`\langle\sigma\rangle_{kT} = \frac{2}{\sqrt{\pi}}\,\frac{1}{(kT)^2}\int_0^\infty \sigma(E)\,E\,e^{-E/kT}\,\mathrm{d}E`,
    { displayMode: true, output: "html", throwOnError: false },
  )
  const it = lang === "it"
  return (
    <figure className="mt-5 max-w-[42rem]">
      <div className="overflow-x-auto rounded-md border border-border/70 bg-card px-4 py-1 text-[0.95rem]" dangerouslySetInnerHTML={{ __html: html }} />
      <figcaption className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {it
          ? "σ(E) è la sezione d'urto all'energia E del neutrone (nel centro di massa), kT l'energia termica."
          : "σ(E) is the cross section at neutron energy E (centre of mass), kT the thermal energy."}
      </figcaption>
    </figure>
  )
}
