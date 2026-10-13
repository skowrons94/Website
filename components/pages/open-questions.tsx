// --- lit --- /atlas/open-questions: the debates of the field, from content/atlas/debates.yaml
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight, CircleHelp } from "lucide-react"

import { Cite, ReferenceList } from "@/components/atlas/reference-list"
import { PageLd } from "@/components/json-ld"
import { Container, PageHeader } from "@/components/page-header"
import { Sci } from "@/components/sci"
import { getAtlas, getDebates, type Debate } from "@/lib/atlas"
import { atlasPanel } from "@/lib/data/panel"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"
import { ratesHrefFor } from "@/lib/rates/catalog"
import { CURIOSITIES } from "@/lib/rates/curiosities"

export const openQuestionsMetadata = (lang: Lang): Metadata =>
  pageMetadata(dict(lang).openQuestions.meta, dict(lang).openQuestions.description, lang)

/** "15O" → "¹⁵O", for the names of the R-matrix evaluations. */
const supCode = (id: string) => id.replace(/^(\d+)/, (m) => m.split("").map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]).join(""))

/** "Open" or "Converging", as a small badge. */
export function DebateStatus({ status, lang }: { status: Debate["status"]; lang: Lang }) {
  const t = dict(lang).openQuestions
  const converging = status === "converging"
  return (
    <span
      title={converging ? t.convergingHint : undefined}
      className={`inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        converging ? "border-current text-link" : "border-border text-muted-foreground"
      }`}
    >
      {converging ? t.converging : t.open}
    </span>
  )
}

/**
 * The badge on a reaction page: one question links to its anchor, several to
 * the page.
 */
export function OpenQuestionBadge({ debates, lang }: { debates: Debate[]; lang: Lang }) {
  if (debates.length === 0) return null
  const t = dict(lang).openQuestions
  const href = localePath(lang, debates.length === 1 ? `/atlas/open-questions#${debates[0].id}` : "/atlas/open-questions")
  return (
    <Link
      href={href}
      title={debates.map((d) => d.title).join(" · ")}
      className="group inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-link transition-colors hover:border-foreground/30"
    >
      <CircleHelp className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{debates.length === 1 ? t.badge : t.badges(debates.length)}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

function ExploreLinks({ debate: d, lang }: { debate: Debate; lang: Lang }) {
  const t = dict(lang).openQuestions
  const atlas = getAtlas(lang)
  const to = (p: string) => localePath(lang, p)
  const reactions = d.reactions.map((id) => atlas.reactions.find((r) => r.id === id)).filter((r) => r !== undefined)
  const links: { key: string; href: string; label: React.ReactNode }[] = []
  for (const r of reactions) {
    links.push({ key: `atlas-${r.id}`, href: to(`/atlas/${r.id}`), label: <><Sci>{r.label}</Sci> · {t.atlasLink}</> })
  }
  for (const r of reactions) {
    const slug = atlasPanel(r.id, lang)?.slugs[0]?.slug
    if (slug) links.push({ key: `data-${r.id}`, href: to(`/data/reaction/${slug}`), label: <><Sci>{r.label}</Sci> · {t.dataLink}</> })
  }
  const curiosity = d.curiosity ? CURIOSITIES.find((c) => c.id === d.curiosity) : undefined
  if (curiosity) links.push({ key: "curiosity", href: to(`/atlas/rates/curiosities/${curiosity.id}`), label: t.curiosityLink })
  const rates = [...new Set(reactions.map((r) => ratesHrefFor(r.id)).filter((h): h is string => Boolean(h)))]
  for (const h of rates) links.push({ key: `rates-${h}`, href: to(h), label: t.ratesLink })
  const evaluations = [...new Set(reactions.flatMap((r) => r.rmatrix))]
  for (const ev of evaluations) {
    links.push({ key: `ev-${ev}`, href: to(`/evaluations/${ev}`), label: <>{t.evaluationLink} · <Sci>{supCode(ev)}</Sci></> })
  }
  if (links.length === 0) return null
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t.explore}</h3>
      <ul className="flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.key} className="min-w-0 max-w-full">
            <Link
              href={l.href}
              className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-sm text-link underline-offset-4 transition-colors hover:border-foreground/30 hover:underline"
            >
              <span className="min-w-0">{l.label}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Question({ debate: d, order, lang }: { debate: Debate; order: string[]; lang: Lang }) {
  const t = dict(lang).openQuestions
  return (
    <section id={d.id} className="min-w-0 scroll-mt-24 border-t border-border/70 pt-10 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-balance font-serif text-2xl font-semibold tracking-tight">
          <Sci>{d.title}</Sci>
        </h2>
        <DebateStatus status={d.status} lang={lang} />
      </div>
      <p className="mt-4 max-w-3xl text-pretty text-[1.0625rem] leading-[1.75] text-foreground/90">
        <Sci>{d.summary}</Sci>
      </p>

      <h3 className="mt-7 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t.positions}</h3>
      <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {d.positions.map((p, i) => (
          <li key={i} className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
            <p className="font-medium">
              <Sci>{p.who}</Sci>
            </p>
            <p className="mt-2 text-pretty text-[0.95rem] leading-relaxed text-foreground/90">
              <Sci>{p.text}</Sci> <Cite keys={p.refs} order={order} />
            </p>
          </li>
        ))}
      </ul>

      {d.settle && (
        <div className="mt-6 max-w-3xl border-l-2 border-border pl-4">
          <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t.settle}</h3>
          <p className="mt-1.5 text-pretty text-[0.95rem] leading-relaxed">
            <Sci>{d.settle}</Sci>
          </p>
        </div>
      )}

      <ExploreLinks debate={d} lang={lang} />
    </section>
  )
}

export function OpenQuestionsPage({ lang }: { lang: Lang }) {
  const atlas = getAtlas(lang)
  const debates = getDebates(lang)
  const t = dict(lang).openQuestions
  const a = dict(lang).atlas
  // One bibliography for the page, numbered in order of first citation.
  const order: string[] = []
  for (const d of debates) for (const k of d.refs) if (!order.includes(k)) order.push(k)

  return (
    <Container>
      <PageLd
        lang={lang}
        trail={[
          { name: dict(lang).nav.atlas, path: "/atlas" },
          { name: dict(lang).nav.openQuestions, path: "/atlas/open-questions" },
        ]}
      />
      <Link
        href={localePath(lang, "/atlas")}
        className="-mt-2.5 mb-[1.375rem] inline-flex items-center gap-1.5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {a.name}
      </Link>
      <PageHeader eyebrow={a.name} title={t.title} lead={t.lead} />

      <nav aria-labelledby="oq-contents" className="mb-12">
        <h2 id="oq-contents" className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {t.contents} <span className="tabular">({debates.length})</span>
        </h2>
        <ol className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-1 sm:grid-cols-2">
          {debates.map((d) => (
            <li key={d.id} className="min-w-0">
              <a
                href={`#${d.id}`}
                className="inline-flex min-h-8 max-w-full items-center gap-2 text-[0.95rem] text-link underline-offset-4 hover:underline"
              >
                <span className="min-w-0">
                  <Sci>{d.title}</Sci>
                </span>
                {d.status === "converging" && (
                  <span className="shrink-0 text-xs text-muted-foreground">· {t.converging}</span>
                )}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-14">
        {debates.map((d) => (
          <Question key={d.id} debate={d} order={order} lang={lang} />
        ))}
      </div>

      {order.length > 0 && (
        <section id="references" className="mt-16 scroll-mt-24 border-t border-border/70 pt-8">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.references}</h2>
          <ReferenceList keys={order} references={atlas.references} lang={lang} />
        </section>
      )}
    </Container>
  )
}
