import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Container, PageHeader } from "@/components/page-header"
import { TimelineView, type TimelineItem } from "@/components/atlas/timeline-view"
import { getAtlas } from "@/lib/atlas"
import { referenceHref, shortCitation } from "@/lib/atlas-format"
import { pageMetadata } from "@/lib/metadata"

export const metadata: Metadata = pageMetadata(
  "Timeline · Reaction atlas",
  "A history of nuclear astrophysics: the theory, the experiments, the observations and the laboratories, from 1920 to today.",
)

export default function TimelinePage() {
  const atlas = getAtlas()

  const events: TimelineItem[] = atlas.timeline.map((e) => ({
    id: e.id,
    year: e.year,
    month: e.month,
    title: e.title,
    text: e.text,
    categories: e.categories,
    luna: e.luna,
    url: e.url,
    reactions: e.reactions.map((id) => ({
      id,
      label: atlas.reactions.find((r) => r.id === id)?.label ?? id,
    })),
    refs: e.refs.map((key) => {
      const ref = atlas.references[key]
      if (!ref) return { key, label: key }
      return { key, label: shortCitation(ref), href: referenceHref(ref) }
    }),
  }))

  return (
    <Container wide>
      <Link
        href="/atlas"
        className="-mt-2.5 mb-[1.375rem] inline-flex py-2.5 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Reaction atlas
      </Link>
      <PageHeader
        eyebrow="Reaction atlas"
        title="A history of nuclear astrophysics"
        lead="How we learned what powers the stars: the ideas, the measurements, the observations that tested them, and the laboratories that made the measurements possible."
      />

      {atlas.timelinePresent && events.length > 0 ? (
        <TimelineView events={events} />
      ) : (
        <p className="max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          The timeline is being written. In the meantime, each reaction page lists its measurements in
          chronological order.
        </p>
      )}
    </Container>
  )
}
