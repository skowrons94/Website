import type { Metadata } from "next"

import { Container, PageHeader } from "@/components/page-header"
import { PublicationFilter } from "@/components/publication-filter"
import { getProfile, getPublications, isFirstAuthor, type Publication } from "@/lib/content"
import { Sci } from "@/components/sci"
import { dict, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const publicationsMetadata = (lang: Lang): Metadata =>
  pageMetadata(dict(lang).publications.title, dict(lang).publications.description, lang)

const SECTIONS = ["article", "proceedings"]

/** Submitted but not out yet: shown apart, and not counted as peer reviewed. */
const isUnderReview = (p: Publication) => Boolean(p.status) && !p.journal

/** A LUNA collaboration paper: tagged by hand in publications.yaml. */
const isLuna = (p: Publication) => Boolean(p.tags?.includes("luna"))

/** "Phys. Rev. C 111, 035802" → "Phys. Rev. C"; "J. Phys. G, Nucl. Part. Phys. 50, …" → "J. Phys. G". */
const venueOf = (journal: string) => journal.split(",")[0].replace(/\s+L?\d.*$/, "").trim()

/**
 * The first-author record in one line, counted from publications.yaml:
 * articles (with their journals), proceedings, and submitted papers.
 */
function firstAuthorLine(all: Publication[], lang: Lang): string {
  const t = dict(lang).publications
  const mine = all.filter(isFirstAuthor)
  const out = mine.filter((p) => !isUnderReview(p))
  const articles = out.filter((p) => p.kind === "article")
  const venues = new Map<string, number>()
  for (const p of articles) {
    const v = p.journal ? venueOf(p.journal) : ""
    if (v) venues.set(v, (venues.get(v) ?? 0) + 1)
  }
  const venueText = [...venues]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([v, n]) => (n > 1 ? `${n} × ${v}` : v))
    .join(", ")
  return t.firstAuthorSummary(
    articles.length,
    venueText,
    out.filter((p) => p.kind === "proceedings").length,
    mine.filter(isUnderReview).length,
  )
}

function Entry({ publication, lang }: { publication: Publication; lang: Lang }) {
  const first = isFirstAuthor(publication)
  const link = publication.doi
    ? `https://doi.org/${publication.doi}`
    : publication.arxiv
      ? `https://arxiv.org/abs/${publication.arxiv}`
      : undefined

  return (
    <li
      data-pub=""
      data-first={first ? "true" : "false"}
      data-luna={isLuna(publication) ? "true" : "false"}
      data-year={publication.year}
      // Two tiers: a dark rule for a first-author paper, a light one for the
      // other key papers (lib/content.ts, isKeyPaper).
      className={`py-5 ${
        first
          ? "border-l-2 border-foreground/80 pl-5"
          : publication.highlight
            ? "border-l-2 border-foreground/25 pl-5"
            : "pl-[calc(1.25rem+2px)]"
      }`}
    >
      <p className="text-sm text-muted-foreground">
        <Sci>{publication.authors}</Sci>
        {publication.role && (
          <>
            {" · "}
            <span className="text-foreground/80">
              <Sci>{publication.role}</Sci>
            </span>
          </>
        )}
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
        {first && (
          <>
            {" · "}
            <span className="text-foreground/80">{dict(lang).publications.firstAuthorTag}</span>
          </>
        )}
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
  return (
    <section aria-labelledby={`pubs-${id}`} data-pub-section="" className="break-inside-auto">
      <h2
        id={`pubs-${id}`}
        className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
      >
        {title}
        <span className="ml-2 tabular font-normal normal-case tracking-normal">
          <span data-count="">({entries.length})</span>
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
      <p data-first-summary="" className="-mt-6 mb-8 max-w-3xl border-l-2 border-foreground/80 pl-4 text-pretty text-[0.95rem]">
        <Sci>{firstAuthorLine(all, lang)}</Sci>
      </p>

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
        labels={{
          filter: t.filter,
          all: t.all,
          first: t.firstAuthor,
          luna: t.luna,
          year: t.year,
          allYears: t.allYears,
          shown: t.shown(Number.NaN).replace("NaN", "{n}"),
          shownOne: t.shown(1),
          none: t.none,
        }}
        items={all.map((p) => ({ year: p.year, first: isFirstAuthor(p), luna: isLuna(p) }))}
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
