import type { Metadata } from "next"
import Link from "next/link"
import { Download } from "lucide-react"

import { Container, PageHeader } from "@/components/page-header"
import {
  getExperience,
  getProfile,
  getTalks,
  type TalkEntry,
  type TimelineEntry,
} from "@/lib/content"
import { Sci } from "@/components/sci"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const cvMetadata = (lang: Lang): Metadata =>
  pageMetadata(dict(lang).cv.metaTitle, dict(lang).cv.description, lang)

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-border/70 pt-8">
      <h2 className="mb-6 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * Two-column on wide screens, stacked below sm. The period column is fixed so
 * every row in every section lines up on the same axis.
 */
function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="space-y-7">
      {entries.map((entry, i) => (
        <li key={i} className="sm:grid sm:grid-cols-[10.5rem_1fr] sm:gap-6">
          <p className="text-sm text-muted-foreground sm:pt-0.5">
            {entry.period}
          </p>
          <div className="mt-1 sm:mt-0">
            <h3 className="font-serif text-[1.05rem] font-semibold tracking-tight">
              <Sci>{entry.title}</Sci>
            </h3>
            {entry.detail && (
              <p className="mt-1 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
                <Sci>{entry.detail}</Sci>
              </p>
            )}
            {entry.bullets && (
              <ul className="mt-3 space-y-1.5 text-[0.925rem] leading-relaxed text-muted-foreground">
                {entry.bullets.map((bullet, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="select-none text-muted-foreground/50">—</span>
                    <span className="text-pretty">
                      <Sci>{bullet}</Sci>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

function Talks({ entries }: { entries: TalkEntry[] }) {
  return (
    <ol className="space-y-6">
      {entries.map((entry, i) => (
        <li key={i} className="sm:grid sm:grid-cols-[10.5rem_1fr] sm:gap-6">
          <p className="text-sm text-muted-foreground sm:pt-0.5">{entry.date}</p>
          <div className="mt-1 sm:mt-0">
            <h3 className="text-pretty font-serif text-[1.05rem] font-semibold tracking-tight">
              <Sci>{entry.event}</Sci>
            </h3>
            {entry.place && (
              <p className="mt-0.5 text-sm text-muted-foreground">{entry.place}</p>
            )}
            {entry.role && (
              <p className="mt-1 text-[0.95rem] text-muted-foreground">
                <Sci>{entry.role}</Sci>
              </p>
            )}
            {entry.title && (
              <p className="mt-1 text-pretty text-[0.95rem] italic leading-relaxed text-muted-foreground">
                <Sci>{entry.title}</Sci>
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function CVPage({ lang }: { lang: Lang }) {
  const profile = getProfile(lang)
  const cv = getExperience(lang)
  const talks = getTalks(lang)
  const t = dict(lang).cv

  return (
    <Container wide>
      <PageHeader
        title={t.title}
        lead={`${profile.role} · ${profile.affiliation}`}
      />

      <div className="mb-14 flex flex-wrap items-center gap-x-6 gap-y-3">
        {profile.cv.file && (
        <a
          href={profile.cv.file.startsWith("/") ? `${process.env.BASE_PATH ?? ""}${profile.cv.file}` : profile.cv.file}
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          {profile.cv.label}
        </a>
        )}
        <Link href={localePath(lang, "/publications")} className="inline-flex min-h-10 items-center text-sm text-link underline-offset-4 hover:underline">
          {t.publications}
        </Link>
        <Link href={localePath(lang, "/research")} className="inline-flex min-h-10 items-center text-sm text-link underline-offset-4 hover:underline">
          {t.research}
        </Link>
      </div>

      <div className="space-y-12">
        <Section title={t.employment}>
          <Timeline entries={cv.employment} />
        </Section>
        <Section title={t.education}>
          <Timeline entries={cv.education} />
        </Section>
        <Section title={t.researchExperience}>
          <Timeline entries={cv.research} />
        </Section>
        <Section title={t.projects}>
          <Timeline entries={cv.projects} />
        </Section>
        <Section title={t.awards}>
          <Timeline entries={cv.awards} />
        </Section>
        <Section title={t.invited}>
          <Talks entries={talks.invited} />
        </Section>
        <Section title={t.organisation}>
          <Talks entries={talks.organisation} />
        </Section>
        <Section title={t.participation}>
          <Talks entries={talks.participation} />
        </Section>
        <Section title={t.teaching}>
          <Timeline entries={cv.teaching} />
        </Section>
        <Section title={t.supervision}>
          <Timeline entries={cv.supervision} />
        </Section>
        <Section title={t.outreach}>
          <Timeline entries={cv.outreach} />
        </Section>
        <Section title={t.skills}>
          <dl className="space-y-5">
            {cv.skills.map((skill) => (
              <div key={skill.label} className="sm:grid sm:grid-cols-[10.5rem_1fr] sm:gap-6">
                <dt className="text-sm text-muted-foreground">{skill.label}</dt>
                <dd className="mt-1 text-pretty text-[0.95rem] leading-relaxed sm:mt-0">
                  <Sci>{skill.items}</Sci>
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </Container>
  )
}
