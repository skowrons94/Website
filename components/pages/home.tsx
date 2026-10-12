import Link from "next/link"
import { Fragment } from "react"
import { ArrowRight, FileText } from "lucide-react"

import { LunaFigure } from "@/components/atlas/luna-figure"
import { HomeNetwork } from "@/components/home-network"
import { getAtlas } from "@/lib/atlas"
import {
  getAllNotes,
  getEvaluationCounts,
  getOutlook,
  getProfile,
  getPublications,
  getRecognition,
  getResearch,
  getSoftware,
} from "@/lib/content"
import { Sci } from "@/components/sci"
import { dict, localePath, type Lang } from "@/lib/i18n"

/**
 * A paragraph with `[text](/path)` links, the only markup the profile's lead
 * allows. Internal paths are localized; anything else opens as a plain link.
 */
function Linked({ text, lang }: { text: string; lang: Lang }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    const start = m.index ?? 0
    if (start > last) parts.push(<Sci key={`t${last}`}>{text.slice(last, start)}</Sci>)
    const [, label, href] = m
    parts.push(
      href.startsWith("/") ? (
        <Link key={`l${start}`} href={localePath(lang, href)} className="text-link underline underline-offset-4 decoration-link/40 hover:decoration-link">
          {label}
        </Link>
      ) : (
        <a key={`l${start}`} href={href} className="text-link underline underline-offset-4 decoration-link/40 hover:decoration-link">
          {label}
        </a>
      ),
    )
    last = start + m[0].length
  }
  if (last < text.length) parts.push(<Sci key={`t${last}`}>{text.slice(last)}</Sci>)
  return <Fragment>{parts}</Fragment>
}

// The atlas' LUNA picture, small. `compact` (labels sized for a small figure,
// the numbered key folded away) is the atlas' to add; typed loosely here so
// this page builds with or without it.
const Luna = LunaFigure as React.ComponentType<React.ComponentProps<typeof LunaFigure> & { compact?: boolean }>

type Selected = {
  key: string
  eyebrow: string
  title: string
  detail: string
  href: string
  external: boolean
  lang?: string
}

/**
 * The profile's `selected` list, resolved against the publications and the
 * research threads. Nothing is restated in profile.yaml, so the strip cannot
 * say anything the rest of the site does not.
 */
function selectedWork(lang: Lang): Selected[] {
  const { selected = [] } = getProfile(lang)
  const publications = getPublications(lang)
  const research = getResearch(lang)
  const t = dict(lang).home
  const out: Selected[] = []
  for (const item of selected) {
    if ("publication" in item) {
      const p = publications.find((x) => x.doi?.toLowerCase() === item.publication.toLowerCase())
      if (!p || !p.journal) continue
      const first = /^J\. Skowronski\b/.test(p.authors)
      out.push({
        key: item.publication,
        eyebrow: `${p.journal} (${p.year})`,
        title: p.title,
        detail: first ? t.firstAuthor : p.authors,
        href: `https://doi.org/${p.doi}`,
        external: true,
        // Titles stay as published, in English.
        lang: lang === "en" ? undefined : "en",
      })
    } else if ("research" in item) {
      const r = research.find((x) => x.id === item.research)
      if (!r) continue
      out.push({
        key: r.id,
        eyebrow: r.period,
        title: r.title,
        detail: r.role,
        href: localePath(lang, `/research#${r.id}`),
        external: false,
      })
    }
  }
  return out
}

type Resource = { key: string; title: string; text: string; href: string; meta: { text: string; href?: string; external?: boolean }[] }

/**
 * What the site offers the field, each with its licence, version and how to
 * cite it, all read from where they are kept (the atlas' meta, software.yaml,
 * the evaluations, the notes, the glossary): nothing restated by hand.
 */
function resources(lang: Lang): Resource[] {
  const t = dict(lang).home
  const atlas = getAtlas(lang)
  const meta = atlas.meta as { licence?: string; version?: string | null }
  const lunasrim = getSoftware(lang).find((s) => s.id === "lunasrim")
  const pypi = lunasrim?.links?.find((l) => /pypi/i.test(l.href))
  const { total: evaluations, published: publishedEvaluations } = getEvaluationCounts()
  const notes = getAllNotes().length
  const out: Resource[] = [
    {
      key: "atlas",
      title: t.resourceAtlas,
      text: t.resourceAtlasText(atlas.reactions.length),
      href: "/atlas",
      meta: [
        ...(meta.licence ? [{ text: t.licence(meta.licence) }] : []),
        ...(meta.version ? [{ text: t.version(meta.version) }] : []),
        { text: t.howToCite, href: "/atlas#cite" },
      ],
    },
    {
      key: "s-process",
      title: t.resourceSProcess,
      text: t.resourceSProcessText,
      href: "/atlas/s-process",
      meta: [{ text: t.resourceSProcessMeta, href: "/atlas#cite" }],
    },
  ]
  if (evaluations > 0)
    out.push({
      key: "evaluations",
      title: t.resourceEvaluations,
      text: t.resourceEvaluationsSplit(evaluations, publishedEvaluations),
      href: "/evaluations",
      meta: [{ text: t.resourceEvaluationsMeta }],
    })
  if (lunasrim)
    out.push({
      key: "lunasrim",
      title: lunasrim.name,
      text: lunasrim.tagline ?? "",
      href: "/software#lunasrim",
      meta: [
        ...(lunasrim.version ? [{ text: t.version(lunasrim.version) }] : []),
        ...(lunasrim.license ? [{ text: t.licence(lunasrim.license) }] : []),
        ...(pypi ? [{ text: "PyPI", href: pypi.href, external: true }] : []),
      ],
    })
  if (notes > 0) out.push({ key: "notes", title: t.resourceNotes, text: t.resourceNotesText(notes), href: "/notes", meta: [] })
  if (atlas.glossary.length > 0)
    out.push({ key: "glossary", title: t.resourceGlossary, text: t.resourceGlossaryText(atlas.glossary.length), href: "/glossary", meta: [] })
  return out
}

export function HomePage({ lang }: { lang: Lang }) {
  const profile = getProfile(lang)
  const research = getResearch(lang)
  const notes = getAllNotes().slice(0, 3)
  const selected = selectedWork(lang)
  const roles = getRecognition(lang)
  const outlook = getOutlook(lang)
  const offered = resources(lang)
  const t = dict(lang).home
  const to = (path: string) => localePath(lang, path)

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 xl:max-w-7xl">
      {/* -- hero ---------------------------------------------------------- */}
      {/* Who, one plain paragraph and the two ways in, for any reader; the
          picture beside it from lg (below it on a phone, so the buttons stay
          on the first screen even of a 640-px-tall phone). The specialist
          detail is further down. */}
      <section className="pb-12 pt-6 sm:py-20 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:py-24 xl:gap-24">
        <div>
          <p className="mb-3 text-sm leading-snug sm:mb-5">
            <span className="font-semibold text-foreground">{profile.name}</span>
            <span className="text-muted-foreground"> · {profile.role}</span>
          </p>
          <h1 className="hyphens-auto text-balance font-serif text-[2rem] font-semibold leading-[1.12] tracking-tight sm:text-5xl xl:text-[3.4rem]">
            <Sci>{profile.tagline}</Sci>
          </h1>
          {profile.lead && (
            <p className="mt-4 max-w-2xl text-pretty text-[0.975rem] leading-[1.55] text-muted-foreground sm:mt-7 sm:text-lg sm:leading-relaxed">
              <Linked text={profile.lead} lang={lang} />
            </p>
          )}
          {/* The research outlook in one line; the rest is on /research. */}
          {outlook?.line && (
            <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:mt-4">
              <Sci>{outlook.line}</Sci>{" "}
              <Link
                prefetch={false}
                href={to("/research#outlook")}
                className="whitespace-nowrap text-link underline-offset-4 hover:underline"
              >
                {t.outlookMore}
              </Link>
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-3 text-sm sm:mt-8">
            <Link
              href={to("/atlas")}
              className="group inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t.exploreAtlas}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href={to("/research")}
              className="inline-flex min-h-11 items-center rounded-md border border-input-strong px-4 py-2.5 font-medium transition-colors hover:bg-accent"
            >
              {t.researchButton}
            </Link>
          </div>
        </div>

        <div className="mt-12 lg:mt-0">
          <HomeNetwork lang={lang} />
        </div>
      </section>

      {/* -- roles and recognition ----------------------------------------- */}
      {/* Straight under the opening, so a reader judging the person sees the
          responsibilities without opening the CV; each one links to where it
          is told in full. */}
      {roles.length > 0 && (
        <section aria-labelledby="roles-heading" className="border-t border-border/70 py-10">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 id="roles-heading" className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t.rolesTitle}
            </h2>
            <Link prefetch={false} href={to("/cv")} className="inline-flex min-h-10 items-center text-sm text-link underline-offset-4 hover:underline">
              {t.rolesMore}
            </Link>
          </div>
          <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {roles.map((role, i) => (
              <li key={i} className="min-w-0">
                <Link
                  prefetch={false}
                  href={to(role.href)}
                  className="group -mx-2 block rounded-md px-2 py-2 transition-colors hover:bg-accent/60"
                >
                  <span className="block text-[0.9375rem] font-medium leading-snug text-foreground group-hover:text-link">
                    <Sci>{role.label}</Sci>
                  </span>
                  <span className="block text-pretty text-sm leading-snug text-muted-foreground">
                    <Sci>{role.what}</Sci>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{role.date}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* -- research: the longer version, and the four threads ----------- */}
      {/* One section rather than three (an "about", the threads, and the
          threads again among the selected work): the intro carries what the
          hero does not say, and each thread appears once. */}
      <section className="border-t border-border/70 py-14 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16 xl:gap-24">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight">{t.research}</h2>
          <div className="mt-5 max-w-3xl space-y-4 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
            {profile.intro.map((paragraph, i) => (
              <p key={i}>
                <Sci>{paragraph}</Sci>
              </p>
            ))}
          </div>
          {/* Beside "the rock above the laboratory": what 1.4 km of rock does. */}
          <Luna lang={lang} compact className="mt-6 max-w-sm" />
          <p className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <Link prefetch={false} href={to("/research")} className="inline-flex min-h-10 items-center text-link underline-offset-4 hover:underline">
              {t.allResearch}
            </Link>
            <Link prefetch={false} href={to("/cv")} className="inline-flex min-h-10 items-center gap-1.5 text-link underline-offset-4 hover:underline">
              <FileText className="h-3.5 w-3.5" />
              {t.cv}
            </Link>
            <Link prefetch={false} href={to("/software")} className="inline-flex min-h-10 items-center text-link underline-offset-4 hover:underline">
              {t.software}
            </Link>
          </p>
        </div>

        <div className="mt-10 grid content-start gap-x-10 gap-y-8 sm:grid-cols-2 lg:mt-1">
          {research.map((thread) => (
            <Link
              prefetch={false}
              key={thread.id}
              href={to(`/research#${thread.id}`)}
              className="group block"
            >
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                {thread.period}
              </p>
              <h3 className="mt-2 font-serif text-lg font-semibold tracking-tight group-hover:text-link">
                <Sci>{thread.title}</Sci>
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                <Sci>{thread.role}</Sci>
              </p>
              <p className="mt-2 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
                <Sci>{thread.summary}</Sci>
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* -- selected papers ----------------------------------------------- */}
      {selected.length > 0 && (
        <section className="border-t border-border/70 py-14" aria-labelledby="selected-heading">
          <div className="mb-8 flex break-after-avoid flex-wrap items-baseline justify-between gap-x-4">
            <h2 id="selected-heading" className="font-serif text-2xl font-semibold tracking-tight">
              {selected.every((s) => s.external) ? t.selectedPapers : t.selected}
            </h2>
            <Link
              prefetch={false}
              href={to("/publications")}
              className="inline-flex min-h-10 items-center text-sm text-link underline-offset-4 hover:underline"
            >
              {t.publications}
            </Link>
          </div>
          <ul className={`grid gap-x-10 gap-y-8 sm:grid-cols-2 ${selected.length > 2 ? "lg:grid-cols-4" : ""}`}>
            {selected.map((item) => (
              <li key={item.key} className="border-t-2 border-foreground/15 pt-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <Sci>{item.eyebrow}</Sci>
                </p>
                <h3
                  lang={item.lang}
                  className="mt-2 text-pretty font-serif text-[1.05rem] font-semibold leading-snug tracking-tight"
                >
                  {item.external ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-4 hover:text-link hover:underline"
                    >
                      <Sci>{item.title}</Sci>
                    </a>
                  ) : (
                    <Link prefetch={false} href={item.href} className="underline-offset-4 hover:text-link hover:underline">
                      <Sci>{item.title}</Sci>
                    </Link>
                  )}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  <Sci>{item.detail}</Sci>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* -- the two things to open: the atlas and the evaluations ------- */}
      {/* Side by side from lg, so neither sits at the very bottom of the page
          and the outreach half of the site is as close to the top as the
          specialist half. */}
      <section className="grid gap-6 border-t border-border/70 py-14 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-6 sm:p-8 lg:p-10">
          <h2 className="hyphens-auto break-words font-serif text-2xl font-semibold tracking-tight">
            {t.atlasTitle}
          </h2>
          <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            {t.atlasText}
          </p>
          <Link
            prefetch={false}
            href={to("/atlas")}
            className="group mt-auto inline-flex min-h-10 items-center gap-2 self-start pt-6 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            {t.openAtlas}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-6 sm:p-8 lg:p-10">
          <h2 className="hyphens-auto break-words font-serif text-2xl font-semibold tracking-tight">
            {t.evaluationsTitle}
          </h2>
          <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            {t.evaluationsText}
          </p>
          <Link
            prefetch={false}
            href={to("/evaluations")}
            className="group mt-auto inline-flex min-h-10 items-center gap-2 self-start pt-6 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            {t.browseEvaluations}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* -- resources for the community ---------------------------------- */}
      <section aria-labelledby="resources-heading" className="border-t border-border/70 py-14">
        <h2 id="resources-heading" className="font-serif text-2xl font-semibold tracking-tight">
          {t.resourcesTitle}
        </h2>
        <p className="mt-3 max-w-2xl text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">{t.resourcesLead}</p>
        <ul className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {offered.map((r) => (
            <li key={r.key} className="min-w-0 border-t-2 border-foreground/15 pt-4">
              <h3 className="font-serif text-[1.05rem] font-semibold tracking-tight">
                <Link prefetch={false} href={to(r.href)} className="underline-offset-4 hover:text-link hover:underline">
                  {r.title}
                </Link>
              </h3>
              <p className="mt-1.5 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
                <Sci>{r.text}</Sci>
              </p>
              {r.meta.length > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  {r.meta.map((m, i) => (
                    <Fragment key={i}>
                      {i > 0 && <span aria-hidden>·</span>}
                      {m.href ? (
                        m.external ? (
                          <a href={m.href} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center text-link underline-offset-4 hover:underline">
                            {m.text}
                          </a>
                        ) : (
                          <Link prefetch={false} href={to(m.href)} className="inline-flex min-h-8 items-center text-link underline-offset-4 hover:underline">
                            {m.text}
                          </Link>
                        )
                      ) : (
                        <span className="tabular">{m.text}</span>
                      )}
                    </Fragment>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
        {/* Broader impact: the Italian half of the site, and the outreach on record. */}
        <p className="mt-10 max-w-3xl text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
          {t.impactBefore}
          {lang === "en" ? (
            <Link prefetch={false} href="/it" hrefLang="it" className="text-link underline underline-offset-4 decoration-link/40 hover:decoration-link">
              {t.impactLink}
            </Link>
          ) : (
            t.impactLink
          )}
          {t.impactAfter}
          <Link prefetch={false} href={to("/cv#outreach")} className="text-link underline underline-offset-4 decoration-link/40 hover:decoration-link">
            {t.impactCv}
          </Link>
          .
        </p>
      </section>

      {/* -- notes --------------------------------------------------------- */}
      <section className="border-t border-border/70 py-14">
        <div className="mb-10 flex break-after-avoid flex-wrap items-baseline justify-between gap-x-4">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">
            {t.notes}
          </h2>
          <Link
            prefetch={false}
            href={to("/notes")}
            className="text-sm text-link underline-offset-4 hover:underline"
          >
            {t.allNotes}
          </Link>
        </div>
        {t.notesInEnglish && (
          <p className="-mt-6 mb-8 text-sm text-muted-foreground">{t.notesInEnglish}</p>
        )}

        <div className="divide-y divide-border/70">
          {notes.map((note) => (
            <Link
              prefetch={false}
              key={note.slug}
              href={to(`/notes/${note.slug}`)}
              // The notes are in English on every page.
              lang={lang === "en" ? undefined : "en"}
              className="group block py-5 first:pt-0"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-serif text-lg font-semibold tracking-tight group-hover:text-link">
                  <Sci>{note.title}</Sci>
                </h3>
                <span className="text-xs text-muted-foreground">
                  {note.topic} · {note.readingTime} min
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
                <Sci>{note.summary}</Sci>
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
