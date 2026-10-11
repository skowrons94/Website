import Link from "next/link"
import { ArrowRight, FileText } from "lucide-react"

import { getAllNotes, getProfile, getResearch } from "@/lib/content"
import { Sci } from "@/components/sci"
import { dict, localePath, type Lang } from "@/lib/i18n"

export function HomePage({ lang }: { lang: Lang }) {
  const profile = getProfile(lang)
  const research = getResearch(lang)
  const notes = getAllNotes().slice(0, 3)
  const t = dict(lang).home
  const to = (path: string) => localePath(lang, path)

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 xl:max-w-7xl">
      {/* -- hero ---------------------------------------------------------- */}
      {/* Headline and prose sit side by side once there is room for both, so a
          wide window is filled rather than left as margin; below lg they stack
          back into a single column in the same reading order. */}
      <section className="py-16 sm:py-24 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start lg:gap-16 lg:py-28 xl:gap-24">
        <div>
          <p className="mb-5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {profile.role}
          </p>
          <h1 className="text-balance font-serif text-4xl font-semibold leading-[1.12] tracking-tight sm:text-5xl xl:text-[3.4rem]">
            <Sci>{profile.tagline}</Sci>
          </h1>
        </div>

        <div className="mt-8 space-y-5 text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground lg:mt-1.5">
          {profile.intro.map((paragraph, i) => (
            <p key={i}>
              <Sci>{paragraph}</Sci>
            </p>
          ))}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-5 text-sm">
            <Link
              href={to("/evaluations")}
              className="group inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t.runEvaluation}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href={to("/atlas")}
              className="inline-flex min-h-10 items-center text-link underline-offset-4 hover:underline"
            >
              {t.exploreAtlas}
            </Link>
            <Link
              href={to("/publications")}
              className="inline-flex min-h-10 items-center text-link underline-offset-4 hover:underline"
            >
              {t.publications}
            </Link>
            <Link
              href={to("/cv")}
              className="inline-flex min-h-10 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <FileText className="h-3.5 w-3.5" />
              {t.cv}
            </Link>
          </div>
        </div>
      </section>

      {/* -- research threads ---------------------------------------------- */}
      <section className="border-t border-border/70 py-16">
        <div className="mb-10 flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">
            {t.research}
          </h2>
          <Link
            href={to("/research")}
            className="text-sm text-link underline-offset-4 hover:underline"
          >
            {t.allResearch}
          </Link>
        </div>

        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {research.map((thread) => (
            <Link
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
              <p className="mt-3 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
                <Sci>{thread.summary}</Sci>
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* -- the two things to open: the atlas and the evaluations ------- */}
      {/* Side by side from lg, so neither sits at the very bottom of the page
          and the outreach half of the site is as close to the top as the
          specialist half. */}
      <section className="grid gap-6 border-t border-border/70 py-16 lg:grid-cols-2">
        <div className="flex flex-col rounded-lg border border-border bg-card p-6 sm:p-8 lg:p-10">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">
            {t.atlasTitle}
          </h2>
          <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            {t.atlasText}
          </p>
          <Link
            href={to("/atlas")}
            className="group mt-auto inline-flex min-h-10 items-center gap-2 self-start pt-6 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            {t.openAtlas}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="flex flex-col rounded-lg border border-border bg-card p-6 sm:p-8 lg:p-10">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">
            {t.evaluationsTitle}
          </h2>
          <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            {t.evaluationsText}
          </p>
          <Link
            href={to("/evaluations")}
            className="group mt-auto inline-flex min-h-10 items-center gap-2 self-start pt-6 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            {t.browseEvaluations}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* -- notes --------------------------------------------------------- */}
      <section className="border-t border-border/70 py-16">
        <div className="mb-10 flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">
            {t.notes}
          </h2>
          <Link
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
