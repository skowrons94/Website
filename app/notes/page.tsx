import type { Metadata } from "next"
import Link from "next/link"

import { Container, PageHeader } from "@/components/page-header"
import { formatDate, getAllNotes } from "@/lib/content"
import { Sci } from "@/components/sci"

export const metadata: Metadata = {
  title: "Notes",
  description:
    "Explanatory notes on R-matrix theory: polarization observables, identical particles, the channel radius, reaction pathways and stellar reaction rates.",
}

export default function NotesPage() {
  const notes = getAllNotes()

  // Grouped by topic, but only once there is more than one topic to group by.
  const topics = Array.from(new Set(notes.map((n) => n.topic)))

  return (
    <Container>
      <PageHeader
        title="Notes"
        lead="Pieces of R-matrix theory written out properly — the physics first, then a worked example on a real reaction. Written for someone who wants to understand the machinery, not just use it."
      />

      <div className="space-y-14">
        {topics.map((topic) => (
          <section key={topic}>
            <h2 className="mb-6 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {topic}
            </h2>
            <div className="divide-y divide-border/70">
              {notes
                .filter((note) => note.topic === topic)
                .map((note) => (
                  <Link
                    key={note.slug}
                    href={`/notes/${note.slug}`}
                    className="group block py-6 first:pt-0"
                  >
                    <h3 className="font-serif text-xl font-semibold tracking-tight group-hover:text-link">
                      <Sci>{note.title}</Sci>
                    </h3>
                    <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
                      <Sci>{note.summary}</Sci>
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                      {[formatDate(note.date), `${note.readingTime} min read`]
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
        <p className="text-muted-foreground">No notes yet.</p>
      )}
    </Container>
  )
}
