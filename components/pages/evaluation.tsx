import type { Metadata } from "next"
import Link from "next/link"

import { EvaluationHeader, nuclideOf as nuclide } from "@/components/evaluation-header"
import EvaluationWorkspace from "@/components/evaluation-workspace"
import { Sci } from "@/components/sci"
import { getAtlas } from "@/lib/atlas"
import { azure2Ref, evaluationIds, evaluationMeta } from "@/lib/evaluation-meta"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

/**
 * Every evaluation directory that holds a .azr file, so a static build has a
 * page for each. On the server build a new evaluation is still served on
 * demand without rebuilding the site (it renders without the header, which
 * is read from the repository at build time).
 */
export function evaluationParams() {
  return evaluationIds().map((id) => ({ id }))
}

export function evaluationMetadata(id: string, lang: Lang): Metadata {
  const t = dict(lang).evaluations
  return pageMetadata(t.pageTitle(nuclide(id)), t.pageDescription(nuclide(id)), lang)
}

export function EvaluationPage({ id, lang }: { id: string; lang: Lang }) {
  const t = dict(lang).evaluations
  // The atlas entries that point at this evaluation (rmatrix: in their file),
  // so the way back to the physics is as short as the way in.
  const reactions = getAtlas(lang).reactions.filter((r) => r.rmatrix.includes(id))
  const meta = evaluationMeta(id)

  return (
    <>
      {meta.known && <EvaluationHeader meta={meta} lang={lang} azure2Ref={azure2Ref()} />}
      <EvaluationWorkspace id={id} known={meta.known} />
      {reactions.length > 0 && (
        <aside className="mt-16 border-t border-border/70 pt-8 text-sm">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t.inAtlas}
          </h2>
          <p className="max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            {t.inAtlasText}
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {reactions.map((r) => (
              <li key={r.id}>
                <Link
                  href={localePath(lang, `/atlas/${r.id}`)}
                  className="inline-flex min-h-10 items-center rounded-md border border-border bg-card px-3 py-1.5 font-serif text-[0.95rem] font-semibold transition-colors hover:border-foreground/30 hover:text-link"
                >
                  <Sci>{r.label}</Sci>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </>
  )
}
