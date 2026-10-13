import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Breadcrumbs } from "@/components/breadcrumbs"
import { GapAxis, GapLegend, GapRowView } from "@/components/data/gap-map"
import { GuidedPath } from "@/components/data/guided-path"
import { Sci } from "@/components/sci"
import { dataPublicDict } from "@/lib/data/i18n-public"
import { guidedPath, PATH_IDS, type GuidedPathData, type PathId, type PathStep } from "@/lib/data/paths"
import { dict } from "@/lib/i18n"
import { localePath, type Lang } from "@/lib/locale"
import { pageMetadata } from "@/lib/metadata"
import { cn } from "@/lib/utils"

/**
 * /data/path/<id>: a guided path of at most five steps (four and "What we
 * still don't know", with a share card), each linking to the real page it is
 * about. The words and numbers are lib/data/paths.ts; the stepping is
 * components/data/guided-path.tsx.
 */

export const dataPathIds = () => PATH_IDS.map((id) => ({ id }))

export function dataPathMetadata(id: string, lang: Lang): Metadata {
  if (!(PATH_IDS as readonly string[]).includes(id)) return {}
  const p = guidedPath(id as PathId, lang)
  return pageMetadata(p.title, p.teaser, lang)
}

function StepBody({ step, lang, caveat }: { step: PathStep; lang: Lang; caveat: string | null }) {
  const to = (p: string) => localePath(lang, p)
  return (
    <div>
      <p className="max-w-2xl text-pretty text-[1.0625rem] leading-relaxed sm:text-lg">
        <Sci>{step.text}</Sci>
      </p>
      {step.curiosity && caveat && <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">{caveat}</p>}
      {step.gap && step.gap.length > 0 && (
        <div className="mt-6 rounded-lg border border-border/80 bg-background/60 p-4">
          <GapLegend lang={lang} />
          <GapAxis lang={lang} className="mt-4" />
          <ul className="mt-1 divide-y divide-border/70">
            {step.gap.map((row) => (
              <li key={row.id} className="py-3">
                <GapRowView row={row} lang={lang} compact />
              </li>
            ))}
          </ul>
        </div>
      )}
      {step.links.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-3">
          {step.links.map((l, k) => (
            <li key={l.href}>
              <Link
                href={to(l.href)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors",
                  k === 0
                    ? "border border-foreground/80 hover:bg-accent"
                    : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span>
                  <Sci>{l.label}</Sci>
                </span>
                {k === 0 && <ArrowRight className="h-4 w-4" aria-hidden />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Final({ path, lang }: { path: GuidedPathData; lang: Lang }) {
  const t = dataPublicDict(lang)
  return (
    <div>
      <ul className="max-w-2xl space-y-3">
        {path.unknown.map((u) => (
          <li key={u} className="flex gap-3 text-pretty text-[1.0625rem] leading-relaxed">
            <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
            <span>
              <Sci>{u}</Sci>
            </span>
          </li>
        ))}
      </ul>
      {/* the share card: the sentence, its caveat, the address */}
      <figure className="mt-8 overflow-hidden rounded-xl border border-border bg-secondary/50">
        <div className="border-b border-border/70 px-5 py-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {t.shareTitle}
        </div>
        <blockquote className="px-5 pt-5 font-serif text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
          <Sci>{path.share}</Sci>
        </blockquote>
        {path.caveat && path.id !== "sun-shines-slowly" && (
          <figcaption className="px-5 pt-3 text-sm leading-relaxed text-muted-foreground">{path.caveat}</figcaption>
        )}
        {path.id === "sun-shines-slowly" && <figcaption className="px-5 pt-3 text-sm leading-relaxed text-muted-foreground">{t.caveat}</figcaption>}
        <p className="px-5 pb-5 pt-3 text-xs text-muted-foreground">{path.title}</p>
      </figure>
    </div>
  )
}

export function DataPathPage({ id, lang }: { id: PathId; lang: Lang }) {
  const t = dataPublicDict(lang)
  const d = dict(lang)
  const path = guidedPath(id, lang)
  const steps = [
    ...path.steps.map((s) => ({ title: s.title, body: <StepBody step={s} lang={lang} caveat={path.caveat} /> })),
    { title: path.unknownTitle, body: <Final path={path} lang={lang} /> },
  ]
  const n = steps.length
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 [overflow-wrap:anywhere] sm:px-8 sm:py-14">
      <Breadcrumbs
        label={d.nav.breadcrumb}
        items={[
          { label: d.nav.home, href: localePath(lang, "/") },
          { label: t.name, href: localePath(lang, "/data") },
          { label: path.title },
        ]}
      />
      <p className="mt-8 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.pathsTitle}</p>
      <h1 className="mt-2 text-balance font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{path.title}</h1>
      <p className="mt-3 max-w-2xl text-pretty text-muted-foreground">{path.teaser}</p>
      <div className="mt-8">
        <GuidedPath
          steps={steps}
          title={path.title}
          shareText={path.share}
          strings={{
            stepLabels: steps.map((_, k) => t.stepOf(k + 1, n)),
            goTo: steps.map((_, k) => t.goToStep(k + 1)),
            next: t.next,
            back: t.back,
            restart: t.restart,
            progress: t.progress,
            share: t.share,
            copy: t.copy,
            copied: t.copied,
            shareTitle: t.shareTitle,
          }}
        />
      </div>
      <p className="mt-10 text-sm">
        <Link href={localePath(lang, "/data#paths")} className="inline-flex min-h-10 items-center text-link underline-offset-4 hover:underline">
          {t.allPaths}
        </Link>
      </p>
    </div>
  )
}
