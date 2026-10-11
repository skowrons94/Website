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
import { pageMetadata } from "@/lib/metadata"

export const metadata: Metadata = pageMetadata(
  "CV",
  "Curriculum vitae of Jakub Skowronski, experimental nuclear astrophysicist: employment, education, research experience, awards, talks and teaching.",
)

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

export default function CVPage() {
  const profile = getProfile()
  const cv = getExperience()
  const talks = getTalks()

  return (
    <Container wide>
      <PageHeader
        title="Curriculum Vitae"
        lead={`${profile.role} · ${profile.affiliation}`}
      />

      <div className="mb-14 flex flex-wrap items-center gap-x-6 gap-y-3">
        <a
          href={profile.cv.file.startsWith("/") ? `${process.env.BASE_PATH ?? ""}${profile.cv.file}` : profile.cv.file}
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          {profile.cv.label}
        </a>
        <Link href="/publications" className="inline-flex min-h-10 items-center text-sm text-link underline-offset-4 hover:underline">
          Publications
        </Link>
        <Link href="/research" className="inline-flex min-h-10 items-center text-sm text-link underline-offset-4 hover:underline">
          Research
        </Link>
      </div>

      <div className="space-y-12">
        <Section title="Employment">
          <Timeline entries={cv.employment} />
        </Section>
        <Section title="Education">
          <Timeline entries={cv.education} />
        </Section>
        <Section title="Research experience">
          <Timeline entries={cv.research} />
        </Section>
        <Section title="Projects">
          <Timeline entries={cv.projects} />
        </Section>
        <Section title="Awards and appointments">
          <Timeline entries={cv.awards} />
        </Section>
        <Section title="Invited contributions">
          <Talks entries={talks.invited} />
        </Section>
        <Section title="Organisation and committees">
          <Talks entries={talks.organisation} />
        </Section>
        <Section title="Selected participation">
          <Talks entries={talks.participation} />
        </Section>
        <Section title="Teaching">
          <Timeline entries={cv.teaching} />
        </Section>
        <Section title="Supervision">
          <Timeline entries={cv.supervision} />
        </Section>
        <Section title="Outreach">
          <Timeline entries={cv.outreach} />
        </Section>
        <Section title="Skills">
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
