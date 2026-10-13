import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, ChevronRight } from "lucide-react"

import { Said } from "@/components/data/said"
import { ElementSearch } from "@/components/data/element-search"
import { GapMap } from "@/components/data/gap-overview"
import { NucleusTeaser } from "@/components/data/nucleus-teaser"
import { StatusChart } from "@/components/data/status-chart"
import { getAtlas } from "@/lib/atlas"
import { compoundNuclei } from "@/lib/data/build"
import { particleName } from "@/lib/atlas-core.mjs"
import { formatDate } from "@/lib/atlas-format"
import { dataPublicDict } from "@/lib/data/i18n-public"
import {
  elementIndex,
  energy,
  gapRows,
  getSummary,
  group,
  levelTeaser,
  nuclideLabel,
  nucleusPath,
  statusChart,
} from "@/lib/data/public"
import { dict } from "@/lib/i18n"
import { localePath, type Lang } from "@/lib/locale"
import { pageMetadata } from "@/lib/metadata"
import { prefetchFor } from "@/lib/prefetch"
import { REPO } from "@/lib/repo"

/**
 * /data and /it/data: the public entry to the nuclear data explorer. A
 * promise, four words in plain language, and the ways into the data (the
 * chart of how well each reaction is known, the gap map, a nucleus from
 * inside, the element search). The stories and the guided paths are part of
 * the atlas (components/atlas/stories-paths.tsx). Everything is drawn on
 * the server from a summary of a few kB (lib/data/public.ts); the only
 * JavaScript of its own is the element search. The expert pages
 * (/data/reaction/*, /data/nucleus/*) are linked by address.
 */

export const dataExplorerMetadata = (lang: Lang): Metadata => {
  const t = dataPublicDict(lang)
  return pageMetadata(t.metaTitle, t.description, lang)
}

const H2 = "text-balance font-serif text-2xl font-semibold tracking-tight sm:text-[1.75rem]"
const LEAD = "mt-3 max-w-3xl text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground"
const SECTION = "mt-16 scroll-mt-[calc(var(--header-h,0px)+1.5rem)] border-t border-border/70 pt-10 sm:mt-20"
const LINK = "inline-flex min-h-10 items-center gap-1 text-sm text-link underline-offset-4 hover:underline"

export function DataExplorerPage({ lang }: { lang: Lang }) {
  const t = dataPublicDict(lang)
  const to = (p: string) => localePath(lang, p)
  const summary = getSummary()
  const atlas = getAtlas(lang)
  const chart = statusChart(lang)
  const gaps = gapRows(lang)
  const elements = elementIndex(lang)
  const teaser = levelTeaser("15O", "14N-pg-15O")
  const withStatus = chart.arrows.length + chart.offChart.length
  const snapshot = summary.snapshot.date ? formatDate(summary.snapshot.date, lang) : ""
  const ensdfDate = summary.ensdf.archive_date ? formatDate(summary.ensdf.archive_date, lang) : ""

  // Nuclei worth opening: what the key reactions make, where a nucleus page
  // exists (compound nuclei with ENSDF levels, as dataNucleusParams builds).
  const pages = compoundNuclei(lang)
  const nuclei = [
    ...new Map(
      atlas.reactions
        .filter((r) => r.importance === "key" && r.kind !== "decay" && r.to && pages.has(r.to.code))
        .map((r) => [r.to!.code, r.to!] as const),
    ).values(),
  ].sort((a, b) => a.Z - b.Z || a.A - b.A)

  const cards = [
    { href: "#known", title: t.jumps.known, text: t.cards.known(String(withStatus)) },
    { href: "#gap", title: t.jumps.gap, text: t.cards.gap(String(gaps.length)) },
    { href: "#nucleus", title: t.jumps.nucleus, text: t.cards.nucleus },
  ]

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 [overflow-wrap:anywhere] sm:px-8 sm:py-14 xl:max-w-7xl">
      {/* -- the promise, and the search --------------------------------- */}
      <header className="grid gap-10 border-b border-border/70 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:gap-14">
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.name}</p>
          <h1 className="text-balance font-serif text-[2rem] font-semibold leading-[1.15] tracking-tight sm:text-[2.6rem]">
            {t.promise}
          </h1>
          <p className={LEAD}>
            {t.lead(group(summary.counts.datasets, lang), group(summary.counts.entries, lang), String(atlas.reactions.length))}
          </p>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            {lang === "it" ? summary.attribution.it : summary.attribution.en} · {t.ensdfLine(ensdfDate)}{" "}
            <a href="#sources" className="text-link underline-offset-2 hover:underline">
              {t.sourcesTitle}
            </a>
          </p>
        </div>
        <section id="search" aria-labelledby="search-heading" className="scroll-mt-[calc(var(--header-h,0px)+1.5rem)] rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 id="search-heading" className="font-serif text-xl font-semibold tracking-tight">
            {t.searchTitle}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.searchLead}</p>
          <div className="mt-4">
            <ElementSearch
              elements={elements}
              lang={lang}
              examples={lang === "it" ? ["sodio", "azoto", "Fe"] : ["sodium", "nitrogen", "Fe"]}
              strings={{
                label: t.searchLabel,
                placeholder: t.searchPlaceholder,
                examples: t.searchExamples,
                none: t.searchNone("{q}"),
                isotopes: t.searchIsotopes,
                reactions: t.searchReactions,
                noReactions: t.searchNoReactions,
                file: t.searchFile,
                rates: t.searchRates,
                data: t.searchData,
                results: t.searchResults(2).replace("2", "{n}"),
                resultsOne: t.searchResults(1),
                measurementsAria: t.measurementsAria("{r}"),
              }}
            />
          </div>
        </section>
      </header>

      {/* -- the ways in ------------------------------------------------- */}
      <nav aria-label={t.jump} className="mt-10">
        <ul className="grid gap-3 sm:grid-cols-3">
          {cards.map((c) => (
            <li key={c.href}>
              <a
                href={c.href}
                className="group flex h-full flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/30"
              >
                <span className="font-serif text-[1.05rem] font-semibold leading-snug tracking-tight group-hover:text-link">{c.title}</span>
                <span className="mt-1.5 flex-1 text-pretty text-sm leading-relaxed text-muted-foreground">{c.text}</span>
                <ArrowRight className="mt-3 h-4 w-4 rotate-90 text-muted-foreground transition-transform group-hover:translate-y-0.5" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* -- four words -------------------------------------------------- */}
      <section aria-labelledby="words-heading" className="mt-14">
        <h2 id="words-heading" className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {t.wordsTitle}
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {t.words.map((w) => (
            <div key={w.term} className="border-l-2 border-border pl-4">
              <dt className="font-serif text-lg font-semibold">{w.term}</dt>
              <dd className="mt-1 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">{w.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* -- how well do we know it? ------------------------------------- */}
      <section id="known" aria-labelledby="known-heading" className={SECTION}>
        <h2 id="known-heading" className={H2}>
          {t.knownTitle}
        </h2>
        <p className={LEAD}>{t.knownLead}</p>
        <div className="mt-8">
          <StatusChart data={chart} lang={lang} />
        </div>
      </section>

      {/* -- the gap ------------------------------------------------------ */}
      <section id="gap" aria-labelledby="gap-heading" className={SECTION}>
        <h2 id="gap-heading" className={H2}>
          {t.gapTitle}
        </h2>
        <p className={LEAD}>{t.gapLead}</p>
        <div className="mt-8">
          <GapMap rows={gaps} lang={lang} />
        </div>
      </section>

      {/* -- inside the nucleus ------------------------------------------- */}
      {teaser && (
        <section id="nucleus" aria-labelledby="nucleus-heading" className={SECTION}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
            <div>
              <h2 id="nucleus-heading" className={H2}>
                {t.nucleusTitle}
              </h2>
              <p className={LEAD}>{t.nucleusLead}</p>
              <p className="mt-4 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
                {t.nucleusCaption(`${(lang === "it" ? teaser.sp.toFixed(3).replace(".", ",") : teaser.sp.toFixed(3))} MeV`, energy(teaser.E0keV, lang))}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={to(nucleusPath(teaser.nuclide))}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  {t.nucleusOpen}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href={to("/evaluations")} className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent">
                  {dict(lang).footer.evaluations}
                </Link>
              </div>
              {nuclei.length > 0 && (
                <div className="mt-8">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t.nucleusOthers}</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {nuclei
                      .filter((n) => n.code !== teaser.nuclide)
                      .map((n) => (
                        <li key={n.code}>
                          <Link
                            href={to(nucleusPath(n.code))}
                            className="inline-flex min-h-10 items-center rounded-md border border-border bg-card px-3 font-serif font-semibold transition-colors hover:border-foreground/30 hover:text-link"
                          >
                            <Said label={nuclideLabel(n.A, n.Z)} plain={particleName(n, lang) as string} />
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
            <figure className="rounded-xl border border-border bg-card p-4 sm:p-6">
              <NucleusTeaser data={teaser} lang={lang} />
            </figure>
          </div>
        </section>
      )}

      {/* -- the stories and the guided paths moved to the atlas (r18); the
          anchors stay so that old links to /data#stories and /data#paths land
          on a pointer. */}
      <p className="mt-16 border-t border-border/70 pt-8 text-sm text-muted-foreground">
        <span id="stories" className="scroll-mt-[calc(var(--header-h,0px)+1.5rem)]" />
        <span id="paths" className="scroll-mt-[calc(var(--header-h,0px)+1.5rem)]" />
        {t.movedToAtlas}{" "}
        <Link href={to("/atlas#stories")} prefetch={prefetchFor("/atlas")} className="text-link underline-offset-4 hover:underline">
          {t.movedToAtlasLink}
        </Link>
      </p>

      {/* -- where the data come from ------------------------------------- */}
      <section id="sources" aria-labelledby="sources-heading" className="mt-16 scroll-mt-24 rounded-lg border border-border p-5 sm:p-6">
        <h2 id="sources-heading" className="font-serif text-lg font-semibold tracking-tight">
          {t.sourcesTitle}
        </h2>
        <ul className="mt-3 space-y-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          <li>
            {lang === "it" ? summary.attribution.it : summary.attribution.en}.{" "}
            <a href={summary.attribution.repository} className="text-link underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
              IAEA-NDS/exfor_master
            </a>
            {" · "}
            <a href={summary.attribution.license_url} className="text-link underline-offset-2 hover:underline" target="_blank" rel="license noreferrer">
              CC BY 4.0
            </a>
          </li>
          <li>{t.ensdfLine(ensdfDate)}</li>
        </ul>
        <details className="group mt-4 rounded-md border border-border/80">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
            {t.physicists}
          </summary>
          <div className="space-y-2 px-3 pb-4 pt-1 text-xs leading-relaxed text-muted-foreground">
            <p>
              {t.physicistsSnapshot(summary.snapshot.commit.slice(0, 12))} {snapshot}.
            </p>
            <p>
              {t.physicistsCite}: {summary.attribution.citation}; {t.citeEach}
            </p>
            <p>{summary.ensdf.citation}</p>
            <p>{t.gapRule}</p>
            <p>
              <a href={`${REPO}/blob/main/scripts/data/README.md`} className="text-link underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                {t.physicistsPipeline}
              </a>
            </p>
          </div>
        </details>
      </section>
    </div>
  )
}
