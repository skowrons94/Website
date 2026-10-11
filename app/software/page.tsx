import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import { Container, PageHeader } from "@/components/page-header"
import { Sci } from "@/components/sci"
import { getSoftware, type SoftwareEntry } from "@/lib/content"

export const metadata: Metadata = {
  title: "Software",
  description:
    "AZURE2, the R-matrix code for nuclear astrophysics; LunaSRIM, SRIM-2013 in pure Python; and LUNA Skills, agent skills for experimental nuclear astrophysics.",
}

function Entry({ entry }: { entry: SoftwareEntry }) {
  const meta = [entry.version && `version ${entry.version}`, entry.license && `${entry.license} licence`].filter(Boolean)

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
                What it is for
              </h3>
              <ul className="space-y-1.5 text-[0.95rem] leading-relaxed text-muted-foreground">
                {entry.uses.map((use, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="select-none text-muted-foreground/50">—</span>
                    <span className="text-pretty">
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
              <dl className="divide-y divide-border/70 border-y border-border/70 text-sm">
                {entry.list.items.map((item) => (
                  <div key={item.name} className="py-2.5 sm:grid sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
                    <dt className="break-words font-mono text-[0.8125rem]">{item.name}</dt>
                    <dd className="mt-0.5 text-pretty text-muted-foreground sm:mt-0">
                      <Sci>{item.text}</Sci>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {entry.note && (
            <p className="mt-7 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
              <Sci>{entry.note}</Sci>
            </p>
          )}
        </div>

        {entry.links && entry.links.length > 0 && (
          <aside className="mt-8 lg:mt-0">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Links</h3>
            <ul className="space-y-2 text-sm">
              {entry.links.map((link) => {
                const internal = link.href.startsWith("/")
                return (
                  <li key={link.href}>
                    {internal ? (
                      <Link href={link.href} className="text-link underline-offset-4 hover:underline">
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="group inline-flex items-center gap-1 text-link underline-offset-4 hover:underline"
                      >
                        {link.label}
                        <ArrowUpRight className="h-3.5 w-3.5 opacity-60 transition-opacity group-hover:opacity-100" />
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          </aside>
        )}
      </div>
    </article>
  )
}

export default function SoftwarePage() {
  const software = getSoftware()

  return (
    <Container wide>
      <PageHeader
        title="Software"
        lead="Code I maintain or wrote for the analysis of low-energy nuclear reactions. All of it is open source."
      />

      <nav className="mb-16 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {software.map((entry) => (
          <a
            key={entry.id}
            href={`#${entry.id}`}
            className="text-muted-foreground underline-offset-4 transition-colors hover:text-link hover:underline"
          >
            {entry.name}
          </a>
        ))}
      </nav>

      <div className="space-y-20">
        {software.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}
      </div>
    </Container>
  )
}
