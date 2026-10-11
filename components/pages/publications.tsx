import type { Metadata } from "next"

import { Container, PageHeader } from "@/components/page-header"
import { getProfile, getPublications, type Publication } from "@/lib/content"
import { Sci } from "@/components/sci"
import { dict, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const publicationsMetadata = (lang: Lang): Metadata =>
  pageMetadata(dict(lang).publications.title, dict(lang).publications.description, lang)

const SECTIONS = ["article", "proceedings"]

function Entry({ publication, lang }: { publication: Publication; lang: Lang }) {
  const link = publication.doi
    ? `https://doi.org/${publication.doi}`
    : publication.arxiv
      ? `https://arxiv.org/abs/${publication.arxiv}`
      : undefined

  return (
    <li
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
            className="underline-offset-4 hover:text-link hover:underline"
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
              className="font-mono text-xs underline-offset-2 hover:text-link hover:underline"
            >
              {publication.doi}
            </a>
          </>
        )}
      </p>
    </li>
  )
}

export function PublicationsPage({ lang }: { lang: Lang }) {
  const publications = getPublications(lang)
  const profile = getProfile(lang)
  const t = dict(lang).publications

  const firstAuthor = publications.filter((p) => p.highlight).length

  return (
    <Container wide>
      <PageHeader
        title={t.title}
        lead={t.lead(publications.length)}
      />

      <p className="mb-12 text-sm text-muted-foreground">
        {t.orcidBefore}
        <a
          href={`https://orcid.org/${profile.orcid}`}
          target="_blank"
          rel="noreferrer"
          className="text-link underline-offset-2 hover:underline"
        >
          ORCID
        </a>
        {t.orcidAfter}
      </p>

      <div className="space-y-14">
        {SECTIONS.map((kind) => {
          const entries = publications.filter((p) => p.kind === kind)
          if (entries.length === 0) return null
          return (
            <section key={kind}>
              <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t.sections[kind]}
                <span className="ml-2 tabular font-normal normal-case tracking-normal">
                  ({entries.length})
                </span>
              </h2>
              <ol className="divide-y divide-border/70">
                {entries.map((publication, i) => (
                  <Entry key={i} publication={publication} lang={lang} />
                ))}
              </ol>
            </section>
          )
        })}
      </div>
    </Container>
  )
}
