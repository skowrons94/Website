import type { Metadata } from "next"
import Link from "next/link"
import { Download } from "lucide-react"

import { Container } from "@/components/page-header"
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
  id,
  title,
  children,
}: {
  /** The anchor the landing page's "Roles and recognition" links to. */
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-[calc(var(--header-h)+1rem)] border-t border-border/70 pt-8 print:pt-3">
      <h2 id={`${id}-heading`} className="mb-6 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground print:mb-2.5">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** "Oct 2023 — May 2025" breaks after the dash if at all, never inside a date. */
const keepDates = (text: string | number) => String(text ?? "").replace(/(\p{L}+\.?) (\d{4})/gu, "$1\u00a0$2")

/**
 * Two-column on wide screens, stacked below sm. The period column is fixed so
 * every row in every section lines up on the same axis.
 */
function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="space-y-7 print:space-y-[0.8rem]">
      {entries.map((entry, i) => (
        // An entry stays whole on paper unless it has a list of its own, which
        // may run on to the next page rather than leave this one half empty.
        <li
          key={i}
          className={`${entry.bullets ? "" : "break-inside-avoid"} sm:grid sm:grid-cols-[10.5rem_1fr] sm:gap-6 print:grid-cols-[7.5rem_1fr] print:gap-4`}
        >
          <p className="text-sm text-muted-foreground sm:pt-0.5">
            {keepDates(entry.period)}
          </p>
          <div className="mt-1 sm:mt-0">
            <h3 className="font-serif text-[1.05rem] font-semibold tracking-tight">
              <Sci>{entry.title}</Sci>
            </h3>
            {entry.detail && (
              <p className="mt-1 max-w-[68ch] text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
                <Sci>{entry.detail}</Sci>
              </p>
            )}
            {entry.bullets && (
              <ul className="mt-3 max-w-[68ch] space-y-1.5 text-[0.925rem] leading-relaxed text-muted-foreground">
                {entry.bullets.map((bullet, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="select-none text-muted-foreground/50">—</span>
                    <span className="min-w-0 text-pretty">
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
    <ol className="space-y-6 print:space-y-[0.8rem]">
      {entries.map((entry, i) => (
        <li key={i} className="break-inside-avoid sm:grid sm:grid-cols-[10.5rem_1fr] sm:gap-6 print:grid-cols-[7.5rem_1fr] print:gap-4">
          <p className="text-sm text-muted-foreground sm:pt-0.5">{keepDates(entry.date)}</p>
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
              <p className="mt-1 max-w-[68ch] text-pretty text-[0.95rem] italic leading-relaxed text-muted-foreground">
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
  // The site's own address, for the printed copy: known only when SITE_URL is
  // set at build time (DEPLOY.md), and left out otherwise.
  const site = process.env.SITE_URL
    ? `${process.env.SITE_URL.replace(/\/$/, "")}${process.env.BASE_PATH ?? ""}`.replace(/^https?:\/\//, "")
    : ""

  return (
    <Container wide>
      <div className="cv-page">
      {/* On paper the page has no header or footer, so the name and how to
          reach him go on top. */}
      <p className="mb-4 hidden text-sm print:block">
        <span className="font-semibold">{profile.name}</span>
        {profile.email && <> · {profile.email}</>}
        {site && <> · {site}</>}
      </p>
      {/* PageHeader's markup, a size smaller on paper. */}
      <div className="mb-12 border-b border-border/70 pb-8 print:mb-6 print:pb-4">
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl print:text-[1.75rem]">{t.title}</h1>
        <p className="mt-4 max-w-2xl text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground print:mt-2">
          {profile.role} · {profile.affiliation}
        </p>
      </div>

      <div className="mb-14 flex flex-wrap items-center gap-x-6 gap-y-3 print:hidden">
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

      <div className="space-y-12 print:space-y-5">
        <Section id="employment" title={t.employment}>
          <Timeline entries={cv.employment} />
        </Section>
        <Section id="education" title={t.education}>
          <Timeline entries={cv.education} />
        </Section>
        <Section id="research" title={t.researchExperience}>
          <Timeline entries={cv.research} />
        </Section>
        <Section id="projects" title={t.projects}>
          <Timeline entries={cv.projects} />
        </Section>
        <Section id="awards" title={t.awards}>
          <Timeline entries={cv.awards} />
        </Section>
        <Section id="invited" title={t.invited}>
          <Talks entries={talks.invited} />
        </Section>
        <Section id="organisation" title={t.organisation}>
          <Talks entries={talks.organisation} />
        </Section>
        <Section id="participation" title={t.participation}>
          <Talks entries={talks.participation} />
        </Section>
        <Section id="teaching" title={t.teaching}>
          <Timeline entries={cv.teaching} />
        </Section>
        <Section id="supervision" title={t.supervision}>
          <Timeline entries={cv.supervision} />
        </Section>
        <Section id="outreach" title={t.outreach}>
          <Timeline entries={cv.outreach} />
        </Section>
        <Section id="skills" title={t.skills}>
          <dl className="space-y-5 print:space-y-[0.7rem]">
            {cv.skills.map((skill) => (
              <div key={skill.label} className="break-inside-avoid sm:grid sm:grid-cols-[10.5rem_1fr] sm:gap-6 print:grid-cols-[7.5rem_1fr] print:gap-4">
                <dt className="text-sm text-muted-foreground">{skill.label}</dt>
                <dd className="mt-1 max-w-[68ch] text-pretty text-[0.95rem] leading-relaxed sm:mt-0">
                  <Sci>{skill.items}</Sci>
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
      </div>
    </Container>
  )
}
