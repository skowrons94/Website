import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Container, PageHeader } from "@/components/page-header"
import { getResearch } from "@/lib/content"
import { Sci } from "@/components/sci"
import { pageMetadata } from "@/lib/metadata"

export const metadata: Metadata = pageMetadata(
  "Research",
  "Underground cross-section measurements, R-matrix evaluation, γ-ray tracking and electron screening.",
)

export default function ResearchPage() {
  const threads = getResearch()

  return (
    <Container>
      <PageHeader
        title="Research"
        lead="Four programmes, all pointed at the same problem: knowing a nuclear cross section at the energies where stars use it, rather than only where a beam can reach."
      />

      <nav className="mb-16 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {threads.map((thread) => (
          <a
            key={thread.id}
            href={`#${thread.id}`}
            className="text-muted-foreground underline-offset-4 transition-colors hover:text-link hover:underline"
          >
            <Sci>{thread.title.split(" — ")[0]}</Sci>
          </a>
        ))}
      </nav>

      <div className="space-y-20">
        {threads.map((thread) => (
          <article key={thread.id} id={thread.id} className="scroll-mt-24">
            <header className="border-b border-border/70 pb-5">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                {thread.period} · {thread.venue}
              </p>
              <h2 className="mt-2 font-serif text-2xl font-semibold tracking-tight">
                <Sci>{thread.title}</Sci>
              </h2>
              <p className="mt-1.5 text-sm font-medium text-muted-foreground">
                <Sci>{thread.role}</Sci>
              </p>
            </header>

            <div className="mt-6 space-y-5 text-pretty leading-[1.75] text-foreground/90">
              {thread.body.map((paragraph, i) => (
                <p key={i}>
                  <Sci>{paragraph}</Sci>
                </p>
              ))}
            </div>

            {thread.highlights && (
              <ul className="mt-7 space-y-2.5 border-l-2 border-border pl-5 text-[0.95rem] leading-relaxed text-muted-foreground">
                {thread.highlights.map((item, i) => (
                  <li key={i}>
                    <Sci>{item}</Sci>
                  </li>
                ))}
              </ul>
            )}

            {thread.link && (
              <Link
                href={thread.link.href}
                className="group mt-7 inline-flex items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
              >
                {thread.link.label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </article>
        ))}
      </div>

      <nav
        aria-label="More about my work"
        className="mt-20 flex flex-wrap gap-x-6 gap-y-1 border-t border-border/70 pt-8 text-sm"
      >
        <Link href="/publications" className="inline-flex min-h-10 items-center text-link underline-offset-4 hover:underline">
          Publications
        </Link>
        <Link href="/software" className="inline-flex min-h-10 items-center text-link underline-offset-4 hover:underline">
          Software
        </Link>
        <Link href="/cv" className="inline-flex min-h-10 items-center text-link underline-offset-4 hover:underline">
          Curriculum vitae
        </Link>
        <Link href="/atlas" className="inline-flex min-h-10 items-center text-link underline-offset-4 hover:underline">
          The reactions, explained: the reaction atlas
        </Link>
      </nav>
    </Container>
  )
}
