import "@/components/math-styles"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight } from "lucide-react"

import {
  formatDate,
  getAllNotes,
  getNote,
  getNoteSlugs,
} from "@/lib/content"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Sci } from "@/components/sci"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"
import { PageLd } from "@/components/json-ld"
import { noteLd } from "@/lib/structured-data"

export const noteParams = () => getNoteSlugs().map((slug) => ({ slug }))

export async function noteMetadata(slug: string, lang: Lang): Promise<Metadata> {
  if (!getNoteSlugs().includes(slug)) return {}
  const note = await getNote(slug)
  return pageMetadata(note.title, note.summary, lang, { type: "article", publishedTime: note.date, section: note.topic })
}

export async function NotePage({ slug, lang }: { slug: string; lang: Lang }) {
  if (!getNoteSlugs().includes(slug)) notFound()
  const t = dict(lang).notes
  const nav = dict(lang).nav
  const to = (path: string) => localePath(lang, path)
  // Notes are written in English only; on a page in another language the note
  // itself is marked as English and introduced by a line saying so.
  const noteLang = lang === "en" ? undefined : "en"

  const note = await getNote(slug)
  // Links between pages inside the (English) note lead to the Italian pages here.
  const base = process.env.BASE_PATH ?? ""
  const html =
    lang === "en"
      ? note.html
      : note.html.replace(
          new RegExp(`href="${base}/(?!${lang}/|_next/|atlas/data\\.json)`, "g"),
          `href="${base}/${lang}/`,
        )
  const others = getAllNotes().filter((n) => n.slug !== slug).slice(0, 3)
  const sections = note.headings.filter((h) => h.depth === 2)

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 xl:max-w-7xl">
      {/* --- find --- */}
      <PageLd lang={lang} trail={[{ name: nav.notes, path: "/notes" }, { name: note.title, path: `/notes/${slug}` }]} nodes={[noteLd({ ...note, slug }, lang)]} />
      <Breadcrumbs
        label={nav.breadcrumb}
        items={[
          { label: nav.home, href: to("/") },
          { label: nav.notes, href: to("/notes") },
          { label: note.title, lang: noteLang },
        ]}
      />

      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-14 xl:grid-cols-[minmax(0,1fr)_17rem]">
        {/* min-w-0 is what lets a wide table or equation scroll inside the
            column instead of forcing the whole grid wider. */}
        <article className="min-w-0 max-w-[46rem] xl:max-w-[52rem]">
          {t.noteInEnglish && (
            <p className="mb-6 rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {t.noteInEnglish}
            </p>
          )}
          <header lang={noteLang} className="border-b border-border/70 pb-8">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {note.topic}
            </p>
            <h1 className="mt-3 text-balance font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              <Sci>{note.title}</Sci>
            </h1>
            <p className="mt-4 max-w-[60ch] text-pretty text-lg leading-relaxed text-muted-foreground">
              <Sci>{note.summary}</Sci>
            </p>
            <p lang={lang === "en" ? undefined : lang} className="mt-5 text-xs uppercase tracking-[0.1em] text-muted-foreground">
              {[formatDate(note.date, lang), t.readMinutes(note.readingTime)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </header>

          <div
            lang={noteLang}
            className="prose-note mt-10"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {note.references && note.references.length > 0 && (
            <section className="mt-16 border-t border-border/70 pt-8">
              <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t.references}
              </h2>
              <ol lang={noteLang} className="space-y-2 text-[0.9rem] leading-relaxed text-muted-foreground">
                {note.references.map((ref, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="tabular text-muted-foreground">
                      {i + 1}.
                    </span>
                    <span>
                      <Sci>{ref}</Sci>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* -- where to go from a note: the theory put to use --------------- */}
          <section className="mt-16 grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-border/70 pt-8 sm:grid-cols-2">
            <Link
              href={to("/evaluations")}
              className="group block min-w-0 hyphens-auto rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/30 sm:p-5"
            >
              <span className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight group-hover:text-link">
                {t.tryTitle}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                {t.tryText}
              </span>
            </Link>
            <Link
              href={to("/atlas")}
              className="group block min-w-0 hyphens-auto rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/30 sm:p-5"
            >
              <span className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight group-hover:text-link">
                {t.reactionsTitle}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                {t.reactionsText}
              </span>
            </Link>
          </section>

          {others.length > 0 && (
            <section className="mt-16 border-t border-border/70 pt-8">
              <h2 className="mb-5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t.more}
              </h2>
              <div className="divide-y divide-border/70">
                {others.map((other) => (
                  <Link
                    key={other.slug}
                    href={to(`/notes/${other.slug}`)}
                    lang={noteLang}
                    className="group block py-4 first:pt-0"
                  >
                    <h3 className="font-serif font-semibold tracking-tight group-hover:text-link">
                      <Sci>{other.title}</Sci>
                    </h3>
                    <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
                      <Sci>{other.summary}</Sci>
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>

        {/* Sticky contents; hidden below lg where there is no room for it. */}
        {sections.length > 2 && (
          <aside className="hidden lg:block">
            <nav className="sticky top-24 border-l border-border pl-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t.contents}
              </p>
              <ul lang={noteLang} className="space-y-2.5 text-sm">
                {sections.map((heading) => (
                  <li key={heading.id}>
                    <a
                      href={`#${heading.id}`}
                      className="block text-pretty leading-snug text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>
    </div>
  )
}
