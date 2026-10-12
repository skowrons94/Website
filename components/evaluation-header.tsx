import Link from "next/link"
import { ArrowLeft, ExternalLink } from "lucide-react"

import { EvaluationSiteUrl as SiteUrl } from "@/components/evaluation-site-url"
import { Sci } from "@/components/sci"
import type { EvaluationMeta } from "@/lib/evaluation-meta"
import { dict, localePath, type Lang } from "@/lib/i18n"

/** `14N` → `¹⁴N`; anything else is left as it is. */
export function nuclideOf(id: string): string {
  return id.replace(/^(\d+)/, (m) => m.replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]))
}

/** "E_c.m." with a real subscript; `sci` sets nuclide notation in the rest. */
function withEcm(text: string, sci = false) {
  const parts = text.split("E_c.m.")
  return parts.map((part, i) => (
    <span key={i}>
      {i > 0 && (
        <>
          <i>E</i>
          <sub>c.m.</sub>
        </>
      )}
      {sci ? <Sci>{part}</Sci> : part}
    </span>
  ))
}

/**
 * The evaluation's header, rendered on the server from the repository: what
 * it is, what it fits, where it was published and how to cite it. Being in the
 * HTML it costs no layout shift when the workspace below comes alive.
 */
export function EvaluationHeader({
  meta,
  lang,
  azure2Ref,
  licence,
  part = "top",
}: {
  /** "top": title, reactions and the paper, above the workspace; "about": the
   *  details (what was fitted, energies, engine, how to cite), below it, so the
   *  level scheme and the plot start near the top of the page. */
  part?: "top" | "about"
  meta: EvaluationMeta
  lang: Lang
  azure2Ref: string | null
  /** The site's content licence (the atlas', content/atlas/atlas.yaml). */
  licence?: { name: string; url: string | null } | null
}) {
  const t = dict(lang).evaluations
  const nuclide = nuclideOf(meta.id)
  const summary = (lang === "it" ? meta.summary_it : meta.summary) ?? meta.summary
  const parts = Object.entries(meta.observables)
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => t.observableCount(n, code))
    .join(", ")
  const doiUrl = meta.doi ? `https://doi.org/${meta.doi}` : null
  const paperRef = meta.paper ? (
    <>
      {meta.paper.authors}
      {meta.paper.title && (
        <>
          , “{withEcm(meta.paper.title, true)}”
        </>
      )}
      {meta.paper.journal && `, ${meta.paper.journal}`}
      {meta.paper.year && ` (${meta.paper.year})`}
      {doiUrl && (
        <>
          ,{" "}
          <a href={doiUrl} className="break-words text-link underline-offset-4 hover:underline">
            doi:{meta.doi}
          </a>
        </>
      )}
      .
    </>
  ) : doiUrl ? (
    <a href={doiUrl} className="break-words text-link underline-offset-4 hover:underline">
      doi:{meta.doi}
    </a>
  ) : null

  if (part === "about") {
    return (
      <section id="about" aria-labelledby="about-title" className="mt-16 scroll-mt-24 border-t border-border/70 pt-8">
        <h2 id="about-title" className="font-serif text-xl font-semibold tracking-tight">{t.aboutEvaluation}</h2>
      <div className="mt-5 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {meta.active > 0 && (
            <section>
              <h2 className="text-sm font-semibold">{t.fitted}</h2>
              <p className="mt-1 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
                {summary ?? <Sci>{t.fittedText(meta.active, meta.files, parts)}</Sci>}
              </p>
            </section>
          )}
          <details id="cite" className="group max-w-2xl scroll-mt-24 rounded-md border border-border/70 bg-card/60 px-4 py-2.5 text-sm">
            <summary className="cursor-pointer select-none font-semibold marker:text-muted-foreground">
              {t.howToCite}
            </summary>
            <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground">
              <p>{meta.citation ? null : paperRef ? t.citeWithPaper : t.citeNoPaper}</p>
              <ol className="list-decimal space-y-2 pl-5 marker:text-muted-foreground">
                {meta.citation ? (
                  <li className="text-foreground">{meta.citation}</li>
                ) : (
                  paperRef && <li className="text-foreground">{paperRef}</li>
                )}
                <li className="text-foreground">
                  R. E. Azuma <i>et al.</i>, “AZURE: An R-matrix code for nuclear astrophysics”, Phys. Rev. C{" "}
                  <b>81</b>, 045805 (2010),{" "}
                  <a
                    href="https://doi.org/10.1103/PhysRevC.81.045805"
                    className="break-words text-link underline-offset-4 hover:underline"
                  >
                    doi:10.1103/PhysRevC.81.045805
                  </a>
                  .
                </li>
                <li className="text-foreground">
                  E. Uberseder and R. J. deBoer, <i>AZURE2 User Manual</i>, version 1.0 (2015).
                </li>
                <li className="text-foreground">
                  {meta.analysis ? `${meta.analysis}, ` : ""}
                  <i>
                    <Sci>{t.pageTitle(nuclide)}</Sci>
                  </i>
                  {meta.version && `, ${t.citeVersion} ${meta.version}`},{" "}
                  <SiteUrl path={`/evaluations/${meta.id}`} lang={lang} />.
                </li>
              </ol>
              <p className="text-xs">{paperRef || meta.citation ? t.citeWhat : t.citeWhatNoPaper}</p>
              {licence && (
                <p className="text-xs">
                  {t.licence(licence.name)}{" "}
                  {licence.url && (
                    <a href={licence.url} rel="license noreferrer" className="text-link underline-offset-4 hover:underline">
                      {licence.url.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </p>
              )}
            </div>
          </details>
        </div>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 self-start text-sm">
          <dt className="text-muted-foreground">{t.paper}</dt>
          <dd className="min-w-0">
            {meta.paper ? (
              <>
                <span className="block">
                  {meta.paper.authors}
                  {meta.paper.journal && `, ${meta.paper.journal}`}
                  {meta.paper.year && ` (${meta.paper.year})`}
                </span>
                {doiUrl && (
                  <a
                    href={doiUrl}
                    className="inline-flex items-center gap-1 break-all text-link underline-offset-4 hover:underline"
                  >
                    doi:{meta.doi}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  </a>
                )}
              </>
            ) : doiUrl ? (
              <a
                href={doiUrl}
                className="inline-flex items-center gap-1 break-all text-link underline-offset-4 hover:underline"
              >
                doi:{meta.doi}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </a>
            ) : meta.status === "unpublished" ? (
              t.unpublished
            ) : (
              (meta.reference ?? t.noReference)
            )}
          </dd>
          {meta.analysis && (
            <>
              <dt className="text-muted-foreground">{t.analysis}</dt>
              <dd>{meta.analysis}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{t.energies}</dt>
          <dd className="text-pretty leading-relaxed">{withEcm(t.energiesText)}</dd>
          {azure2Ref && (
            <>
              <dt className="text-muted-foreground">{t.engine}</dt>
              <dd>
                {t.engineText}{" "}
                <a
                  href={`https://github.com/rdeboer1/AZURE2/commit/${azure2Ref}`}
                  className="font-mono text-[0.85em] text-link underline-offset-4 hover:underline"
                >
                  {azure2Ref.slice(0, 7)}
                </a>
              </dd>
            </>
          )}
        </dl>
      </div>
      </section>
    )
  }

  return (
    <header className="pb-2">
      <Link
        href={localePath(lang, "/evaluations")}
        className="-ml-1 mb-5 inline-flex min-h-10 items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.allEvaluations}
      </Link>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {t.headerEyebrow}
      </p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
        <Sci>{t.pageTitle(nuclide)}</Sci>
      </h1>

      {meta.reactions.length > 0 && (
        <div className="mt-4">
          <h2 className="sr-only">{t.reactionsFitted}</h2>
          <ul className="flex flex-wrap gap-2" aria-label={t.reactionsFitted}>
            {meta.reactions.map((r) => (
              <li
                key={r}
                className="rounded-md border border-border bg-card px-2.5 py-1 font-serif text-[1.0625rem] font-semibold"
              >
                <Sci>{r}</Sci>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 max-w-3xl text-sm max-lg:hidden">
        <PaperLine meta={meta} lang={lang} />
      </div>
    </header>
  )
}

/**
 * The paper, the analysis and the way to the details, in one line: under the
 * title from lg, inside "What am I looking at?" below it.
 */
export function PaperLine({ meta, lang }: { meta: EvaluationMeta; lang: Lang }) {
  const t = dict(lang).evaluations
  const doiUrl = meta.doi ? `https://doi.org/${meta.doi}` : null
  return (
    <p className="text-pretty leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
      {meta.paper ? (
        <>
          {meta.paper.authors}
          {meta.paper.journal && `, ${meta.paper.journal}`}
          {meta.paper.year && ` (${meta.paper.year})`}
          {doiUrl && (
            <>
              {" · "}
              <a href={doiUrl} className="break-words text-link underline-offset-4 hover:underline">
                doi:{meta.doi}
              </a>
            </>
          )}
        </>
      ) : doiUrl ? (
        <a href={doiUrl} className="break-words text-link underline-offset-4 hover:underline">
          doi:{meta.doi}
        </a>
      ) : (
        t.unpublished
      )}
      {meta.analysis && <> · {t.analysis}: {meta.analysis}</>}
      {" · "}
      <a href="#about" className="text-link underline-offset-4 hover:underline" title={t.aboutEvaluationHint}>
        {t.aboutEvaluation}
      </a>
    </p>
  )
}
