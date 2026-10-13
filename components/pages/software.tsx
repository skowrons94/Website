import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import { Container, PageHeader } from "@/components/page-header"
import { Sci } from "@/components/sci"
import { getSoftware, type SoftwareEntry } from "@/lib/content"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const softwareMetadata = (lang: Lang): Metadata =>
  pageMetadata(dict(lang).software.title, dict(lang).software.description, lang)

function Entry({ entry, lang }: { entry: SoftwareEntry; lang: Lang }) {
  const t = dict(lang).software
  const meta = [entry.version && t.version(entry.version), entry.license && t.licence(entry.license)].filter(Boolean)

  return (
    <article id={entry.id} className="scroll-mt-24">
      <header className="border-b border-border/70 pb-5">
        {entry.role && (
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <Sci>{entry.role}</Sci>
          </p>
        )}
        <h2 className="mt-2 font-serif text-2xl font-semibold tracking-tight">{entry.name}</h2>
        {entry.tagline && (
          <p className="mt-1.5 text-sm font-medium text-muted-foreground">
            <Sci>{entry.tagline}</Sci>
            {meta.length > 0 && <span className="font-normal"> · {meta.join(" · ")}</span>}
          </p>
        )}
      </header>

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-12">
        <div className="min-w-0">
          <div className="space-y-4 text-pretty leading-[1.75] text-foreground/90">
            {entry.summary.map((paragraph, i) => (
              <p key={i}>
                <Sci>{paragraph}</Sci>
              </p>
            ))}
          </div>

          {entry.uses && entry.uses.length > 0 && (
            <div className="mt-7">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t.uses}
              </h3>
              <ul className="space-y-1.5 text-[0.95rem] leading-relaxed text-muted-foreground">
                {entry.uses.map((use, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="select-none text-muted-foreground/50">—</span>
                    {/* min-w-0: a long word ("contemporaneamente" at 200% text)
                        breaks rather than widening the page. */}
                    <span className="min-w-0 hyphens-auto text-pretty">
                      <Sci>{use}</Sci>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entry.snippets && entry.snippets.length > 0 && (
            <div className="mt-8 space-y-5">
              {entry.snippets.map((snippet, i) => (
                <figure key={i} className="min-w-0">
                  {snippet.caption && (
                    <figcaption className="mb-2 text-sm text-muted-foreground">
                      <Sci>{snippet.caption}</Sci>
                    </figcaption>
                  )}
                  <pre className="overflow-x-auto rounded-md border border-border bg-muted px-4 py-3 font-mono text-[0.8125rem] leading-relaxed">
                    <code>{snippet.code}</code>
                  </pre>
                </figure>
              ))}
            </div>
          )}

          {entry.list && (
            <div className="mt-8">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {entry.list.title}
              </h3>
              {listGroups(entry.list.items).map(({ group, items }) => (
                <div key={group ?? ""} className={group ? "mt-6" : undefined}>
                  {group && <h4 className="mb-2 text-sm font-semibold">{group}</h4>}
                  <dl className="divide-y divide-border/70 border-y border-border/70 text-sm">
                    {items.map((item) => (
                      <div key={item.name} className="py-2.5 sm:grid sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
                        <dt className="break-words font-mono text-[0.8125rem]">{item.name}</dt>
                        <dd className="mt-0.5 text-pretty text-muted-foreground sm:mt-0">
                          <Sci>{item.text}</Sci>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}

          {entry.cite && (
            <div className="mt-8 rounded-md border border-border bg-card px-4 py-3.5 sm:px-5">
              <h3 className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t.cite}
              </h3>
              {/* The reference is quoted as published, in English. */}
              <p lang={lang === "en" ? undefined : "en"} className="text-pretty text-[0.95rem] leading-relaxed">
                <Sci>{entry.cite.text}</Sci>
                {entry.cite.doi && (
                  <>
                    {". "}
                    <a
                      href={`https://doi.org/${entry.cite.doi}`}
                      target="_blank"
                      rel="noreferrer"
                      className="print-no-url break-all font-mono text-xs text-link underline-offset-2 hover:underline"
                    >
                      doi:{entry.cite.doi}
                    </a>
                  </>
                )}
              </p>
            </div>
          )}

          {entry.note && (
            <p className="mt-7 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
              <Sci>{entry.note}</Sci>
            </p>
          )}
        </div>

        {entry.links && entry.links.length > 0 && (
          <div className="mt-8 lg:mt-0">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.links}</h3>
            <ul className="space-y-0.5 text-sm">
              {entry.links.map((link) => {
                const internal = link.href.startsWith("/")
                // --- webdaq ---
                // The demo is a separate static app, not a Next route: a plain
                // link with the base path, and the language as a query.
                const demo = link.href.startsWith("/webdaq-demo/")
                return (
                  <li key={link.href}>
                    {demo ? (
                      <a
                        href={`${process.env.BASE_PATH ?? ""}${link.href}${lang === "it" ? "?lang=it" : ""}`}
                        className="inline-flex min-h-8 items-center text-link underline-offset-4 hover:underline"
                      >
                        {link.label}
                      </a>
                    ) : internal ? (
                      <Link href={localePath(lang, link.href)} className="inline-flex min-h-8 items-center text-link underline-offset-4 hover:underline">
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="group inline-flex min-h-8 items-center gap-1 text-link underline-offset-4 hover:underline"
                      >
                        {link.label}
                        <ArrowUpRight className="h-3.5 w-3.5 opacity-60 transition-opacity group-hover:opacity-100" />
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </article>
  )
}

/** A list's items, the ungrouped ones first, then each `group` in order of appearance. */
function listGroups<T extends { group?: string }>(items: T[]): { group: string | null; items: T[] }[] {
  const groups = new Map<string | null, T[]>([[null, []]])
  for (const item of items) {
    const key = item.group ?? null
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  return [...groups].filter(([, list]) => list.length > 0).map(([group, list]) => ({ group, items: list }))
}

export function SoftwarePage({ lang }: { lang: Lang }) {
  const software = getSoftware(lang)
  const t = dict(lang).software

  return (
    <Container wide>
      <PageHeader
        title={t.title}
        lead={t.lead}
      />

      <nav className="mb-16 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {software.map((entry) => (
          <a
            key={entry.id}
            href={`#${entry.id}`}
            className="inline-flex min-h-10 items-center text-muted-foreground underline-offset-4 transition-colors hover:text-link hover:underline"
          >
            {entry.name}
          </a>
        ))}
      </nav>

      <div className="space-y-20">
        {software.map((entry) => (
          <Entry key={entry.id} entry={entry} lang={lang} />
        ))}
      </div>
    </Container>
  )
}
