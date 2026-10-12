import Link from "next/link"
import { ArrowLeft, ExternalLink } from "lucide-react"

import { Sci } from "@/components/sci"
import type { EvaluationMeta } from "@/lib/evaluation-meta"
import { dict, localePath, type Lang } from "@/lib/i18n"

/** `14N` → `¹⁴N`; anything else is left as it is. */
export function nuclideOf(id: string): string {
  return id.replace(/^(\d+)/, (m) => m.replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]))
}

/** "E_c.m." with a real subscript. */
function withEcm(text: string) {
  const parts = text.split("E_c.m.")
  return parts.map((part, i) => (
    <span key={i}>
      {i > 0 && (
        <>
          <i>E</i>
          <sub>c.m.</sub>
        </>
      )}
      {part}
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
}: {
  meta: EvaluationMeta
  lang: Lang
  azure2Ref: string | null
}) {
  const t = dict(lang).evaluations
  const nuclide = nuclideOf(meta.id)
  const summary = (lang === "it" ? meta.summary_it : meta.summary) ?? meta.summary
  const parts = Object.entries(meta.observables)
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => t.observableCount(n, code))
    .join(", ")
  const doiUrl = meta.doi ? `https://doi.org/${meta.doi}` : null

  return (
    <header className="border-b border-border/70 pb-8">
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

      <div className="mt-6 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {meta.active > 0 && (
            <section>
              <h2 className="text-sm font-semibold">{t.fitted}</h2>
              <p className="mt-1 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
                {summary ?? <Sci>{t.fittedText(meta.active, meta.files, parts)}</Sci>}
              </p>
            </section>
          )}
          <details className="group max-w-2xl rounded-md border border-border/70 bg-card/60 px-4 py-2.5 text-sm">
            <summary className="cursor-pointer select-none font-semibold marker:text-muted-foreground">
              {t.howToCite}
            </summary>
            <div className="mt-2 space-y-2 leading-relaxed text-muted-foreground">
              {meta.citation ? (
                <p>{meta.citation}</p>
              ) : doiUrl ? (
                <p>
                  {t.citeWithPaper}{" "}
                  <a href={doiUrl} className="break-words text-link underline-offset-4 hover:underline">
                    doi:{meta.doi}
                  </a>
                </p>
              ) : (
                <p>{t.citeNoPaper}</p>
              )}
              <p>
                {t.citeAzure} {t.azureReference},{" "}
                <a
                  href="https://doi.org/10.1103/PhysRevC.81.045805"
                  className="break-words text-link underline-offset-4 hover:underline"
                >
                  doi:10.1103/PhysRevC.81.045805
                </a>
                .
              </p>
            </div>
          </details>
        </div>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 self-start text-sm">
          <dt className="text-muted-foreground">{t.paper}</dt>
          <dd className="min-w-0">
            {doiUrl ? (
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
          {meta.author && (
            <>
              <dt className="text-muted-foreground">{t.authors}</dt>
              <dd>{meta.author}</dd>
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
    </header>
  )
}
