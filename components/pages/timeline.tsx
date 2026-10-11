import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Container, PageHeader } from "@/components/page-header"
import { TimelineView, type TimelineItem } from "@/components/atlas/timeline-view"
import { getAtlas } from "@/lib/atlas"
import { referenceHref, shortCitation } from "@/lib/atlas-format"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const timelineMetadata = (lang: Lang): Metadata =>
  pageMetadata(dict(lang).atlas.timelineMeta, dict(lang).atlas.timelineDescription, lang)

export function TimelinePage({ lang }: { lang: Lang }) {
  const atlas = getAtlas(lang)
  const t = dict(lang).atlas

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
      return { key, label: shortCitation(ref, lang), href: referenceHref(ref) }
    }),
  }))

  return (
    <Container wide>
      <Link
        href={localePath(lang, "/atlas")}
        className="-mt-2.5 mb-[1.375rem] inline-flex py-2.5 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.name}
      </Link>
      <PageHeader eyebrow={t.name} title={t.timelineTitle} lead={t.timelineLead} />

      {atlas.timelinePresent && events.length > 0 ? (
        <TimelineView events={events} />
      ) : (
        <p className="max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          {t.timelinePending}
        </p>
      )}
    </Container>
  )
}
