import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"

import {
  formatDate,
  getAllNotes,
  getNote,
  getNoteSlugs,
} from "@/lib/content"
import { Sci } from "@/components/sci"
import { pageMetadata } from "@/lib/metadata"

export function generateStaticParams() {
  return getNoteSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  if (!getNoteSlugs().includes(slug)) return {}
  const note = await getNote(slug)
  return pageMetadata(note.title, note.summary)
}

export default async function NotePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (!getNoteSlugs().includes(slug)) notFound()

  const note = await getNote(slug)
  const others = getAllNotes().filter((n) => n.slug !== slug).slice(0, 3)
  const sections = note.headings.filter((h) => h.depth === 2)

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 xl:max-w-7xl">
      <Link
        href="/notes"
        className="-my-2.5 inline-flex py-2.5 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All notes
      </Link>

      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-14 xl:grid-cols-[minmax(0,1fr)_17rem]">
        {/* min-w-0 is what lets a wide table or equation scroll inside the
            column instead of forcing the whole grid wider. */}
        <article className="min-w-0 max-w-[46rem] xl:max-w-[52rem]">
          <header className="border-b border-border/70 pb-8">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {note.topic}
            </p>
            <h1 className="mt-3 text-balance font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              <Sci>{note.title}</Sci>
            </h1>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
              <Sci>{note.summary}</Sci>
            </p>
            <p className="mt-5 text-xs uppercase tracking-[0.1em] text-muted-foreground">
              {[formatDate(note.date), `${note.readingTime} min read`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </header>

          <div
            className="prose-note mt-10"
            dangerouslySetInnerHTML={{ __html: note.html }}
          />

          {note.references && note.references.length > 0 && (
            <section className="mt-16 border-t border-border/70 pt-8">
              <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                References
              </h2>
              <ol className="space-y-2 text-[0.9rem] leading-relaxed text-muted-foreground">
                {note.references.map((ref, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="tabular text-muted-foreground/70">
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
          <section className="mt-16 grid gap-4 border-t border-border/70 pt-8 sm:grid-cols-2">
            <Link
              href="/evaluations"
              className="group block rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/30"
            >
              <span className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight group-hover:text-link">
                Try it on a real fit
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                Live AZURE2 evaluations: move a level and watch the cross section respond.
              </span>
            </Link>
            <Link
              href="/atlas"
              className="group block rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/30"
            >
              <span className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight group-hover:text-link">
                The reactions themselves
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                The reaction atlas: what each reaction does in a star and how it was measured.
              </span>
            </Link>
          </section>

          {others.length > 0 && (
            <section className="mt-16 border-t border-border/70 pt-8">
              <h2 className="mb-5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                More notes
              </h2>
              <div className="divide-y divide-border/70">
                {others.map((other) => (
                  <Link
                    key={other.slug}
                    href={`/notes/${other.slug}`}
                    className="group block py-4 first:pt-0"
                  >
                    <h3 className="font-serif font-semibold tracking-tight group-hover:text-link">
                      <Sci>{other.title}</Sci>
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
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
                Contents
              </p>
              <ul className="space-y-2.5 text-sm">
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
