import type { Metadata } from "next"
import Link from "next/link"

import { Container, PageHeader } from "@/components/page-header"
import { formatDate, getAllNotes } from "@/lib/content"
import { Sci } from "@/components/sci"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const notesMetadata = (lang: Lang): Metadata =>
  pageMetadata(dict(lang).notes.title, dict(lang).notes.description, lang)

export function NotesPage({ lang }: { lang: Lang }) {
  const notes = getAllNotes()
  const t = dict(lang).notes
  const to = (path: string) => localePath(lang, path)
  // The notes themselves are written in English only.
  const noteLang = lang === "en" ? undefined : "en"

  // Grouped by topic, but only once there is more than one topic to group by.
  const topics = Array.from(new Set(notes.map((n) => n.topic)))

  return (
    <Container>
      <PageHeader
        title={t.title}
        lead={t.lead}
      />

      {t.inEnglish && (
        <p className="-mt-4 mb-6 max-w-2xl rounded-md border border-border bg-card px-4 py-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          {t.inEnglish}
        </p>
      )}

      <p className="-mt-4 mb-12 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
        {t.seeBefore}
        <Link href={to("/evaluations")} className="text-link underline-offset-2 hover:underline">
          {t.seeEvaluations}
        </Link>
        {t.seeMiddle}
        <Link href={to("/atlas")} className="text-link underline-offset-2 hover:underline">
          {t.seeAtlas}
        </Link>
        {t.seeAfter}
      </p>

      <div className="space-y-14">
        {topics.map((topic) => (
          <section key={topic}>
            <h2 lang={noteLang} className="mb-6 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {topic}
            </h2>
            <div className="divide-y divide-border/70">
              {notes
                .filter((note) => note.topic === topic)
                .map((note) => (
                  <Link
                    key={note.slug}
                    href={to(`/notes/${note.slug}`)}
                    className="group block py-6 first:pt-0"
                  >
                    <h3
                      lang={noteLang} className="font-serif text-xl font-semibold tracking-tight group-hover:text-link">
                      <Sci>{note.title}</Sci>
                    </h3>
                    <p lang={noteLang} className="mt-2 text-pretty leading-relaxed text-muted-foreground">
                      <Sci>{note.summary}</Sci>
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                      {[formatDate(note.date, lang), t.readMinutes(note.readingTime)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>

      {notes.length === 0 && (
        <p className="text-muted-foreground">{t.none}</p>
      )}
    </Container>
  )
}
