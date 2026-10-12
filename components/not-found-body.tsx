import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Container } from "@/components/page-header"
import { dict, localePath, type Lang } from "@/lib/i18n"

/** The 404 page's content, in either language. No file access: app/global-not-found.tsx renders it for both languages and the browser picks one. */
export function NotFoundBody({ lang }: { lang: Lang }) {
  const t = dict(lang).notFound
  return (
    <Container>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">404</p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{t.title}</h1>
      <p className="mt-4 max-w-2xl text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground">{t.lead}</p>

      <ul className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
        {t.places.map((place) => (
          <li key={place.href}>
            <Link
              href={localePath(lang, place.href)}
              className="group block h-full min-w-0 hyphens-auto rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/30 sm:p-5"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 font-serif text-lg font-semibold tracking-tight group-hover:text-link">
                {place.label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{place.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  )
}
