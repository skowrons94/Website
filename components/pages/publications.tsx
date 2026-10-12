import type { Metadata } from "next"

import { Container, PageHeader } from "@/components/page-header"
import { PublicationFilter } from "@/components/publication-filter"
import { getProfile, getPublications, type Publication } from "@/lib/content"
import { Sci } from "@/components/sci"
import { dict, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const publicationsMetadata = (lang: Lang): Metadata =>
  pageMetadata(dict(lang).publications.title, dict(lang).publications.description, lang)

const SECTIONS = ["article", "proceedings"]

/** Jakub first in the author list. */
const isFirstAuthor = (p: Publication) => /^J\. Skowronski\b/.test(p.authors.trim())

/** Submitted but not out yet: shown apart, and not counted as peer reviewed. */
const isUnderReview = (p: Publication) => Boolean(p.status) && !p.journal

function Entry({ publication, lang }: { publication: Publication; lang: Lang }) {
  const link = publication.doi
    ? `https://doi.org/${publication.doi}`
    : publication.arxiv
      ? `https://arxiv.org/abs/${publication.arxiv}`
      : undefined

  return (
    <li
      data-first={isFirstAuthor(publication) ? "true" : "false"}
      className={`py-5 ${
        publication.highlight ? "border-l-2 border-foreground/25 pl-5" : "pl-[calc(1.25rem+2px)]"
      }`}
    >
      <p className="text-sm text-muted-foreground">
        <Sci>{publication.authors}</Sci>
      </p>
      {/* Titles stay as published, in English. */}
      <h3
        lang={lang === "en" ? undefined : "en"}
        className="mt-1 text-pretty font-serif text-[1.05rem] font-semibold leading-snug tracking-tight"
      >
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="print-no-url underline-offset-4 hover:text-link hover:underline"
          >
            <Sci>{publication.title}</Sci>
          </a>
        ) : (
          <Sci>{publication.title}</Sci>
        )}
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {publication.status ? (
          <span className="italic">
            <Sci>{publication.status}</Sci>
          </span>
        ) : (
          <span>
            <Sci>{publication.journal}</Sci>
          </span>
        )}
        <span className="tabular"> ({publication.year})</span>
        {publication.doi && (
          <>
            {" · "}
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="print-no-url font-mono text-xs underline-offset-2 hover:text-link hover:underline"
            >
              {publication.doi}
            </a>
          </>
        )}
      </p>
    </li>
  )
}

function Section({
  id,
  title,
  entries,
  note,
  lang,
}: {
  id: string
  title: string
  entries: Publication[]
  note?: string
  lang: Lang
}) {
  if (entries.length === 0) return null
  const first = entries.filter(isFirstAuthor).length
  return (
    <section
      aria-labelledby={`pubs-${id}`}
      data-has-first={first > 0 ? "true" : "false"}
      className="break-inside-auto"
    >
      <h2
        id={`pubs-${id}`}
        className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
      >
        {title}
        <span className="ml-2 tabular font-normal normal-case tracking-normal">
          <span data-count="all">({entries.length})</span>
          <span data-count="first">({first})</span>
        </span>
      </h2>
      {note && <p className="-mt-2 mb-3 max-w-2xl text-sm text-muted-foreground">{note}</p>}
      <ol className="divide-y divide-border/70">
        {entries.map((publication, i) => (
          <Entry key={i} publication={publication} lang={lang} />
        ))}
      </ol>
    </section>
  )
}

export function PublicationsPage({ lang }: { lang: Lang }) {
  const all = getPublications(lang)
  const profile = getProfile(lang)
  const t = dict(lang).publications

  const published = all.filter((p) => !isUnderReview(p))
  const review = all.filter(isUnderReview)
  const count = (kind: string) => published.filter((p) => p.kind === kind).length
  // Profiles elsewhere that list every paper with its citations. INSPIRE
  // appears once profile.yaml has the full address (getProfile drops a
  // placeholder).
  const profiles = [
    ...(profile.orcid ? [{ label: "ORCID", href: `https://orcid.org/${profile.orcid}` }] : []),
    ...profile.links.filter((l) => /inspire|scholar|ads/i.test(l.label)),
  ]

  return (
    <Container wide>
      <PageHeader title={t.title} lead={t.lead(count("article"), count("proceedings"), review.length)} />

      {profiles.length > 0 && (
        <p className="-mt-4 mb-10 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
          <span className="mr-1">{t.profiles}</span>
          {profiles.map((link, i) => (
            <span key={link.href} className="inline-flex items-center">
              {i > 0 && <span aria-hidden className="mx-1.5">·</span>}
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center text-link underline-offset-2 hover:underline"
              >
                {link.label}
              </a>
            </span>
          ))}
        </p>
      )}

      <PublicationFilter
        label={t.filter}
        options={[
          { id: "all", label: t.all, count: all.length },
          { id: "first", label: t.firstAuthor, count: all.filter(isFirstAuthor).length },
        ]}
      >
        <div className="space-y-14">
          {SECTIONS.map((kind) => (
            <Section
              key={kind}
              id={kind}
              title={t.sections[kind]}
              entries={published.filter((p) => p.kind === kind)}
              lang={lang}
            />
          ))}
          {/* Anything of another kind gets a section of its own. */}
          {[...new Set(published.map((p) => p.kind))]
            .filter((kind) => !SECTIONS.includes(kind))
            .map((kind) => (
              <Section key={kind} id={kind} title={kind} entries={published.filter((p) => p.kind === kind)} lang={lang} />
            ))}
          <Section id="review" title={t.underReview} note={t.underReviewNote} entries={review} lang={lang} />
        </div>
      </PublicationFilter>
    </Container>
  )
}
