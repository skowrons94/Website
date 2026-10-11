import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Container } from "@/components/page-header"

export const metadata: Metadata = {
  title: "Page not found",
}

const PLACES = [
  { href: "/", label: "Home", text: "Who I am and what I work on." },
  {
    href: "/atlas",
    label: "Reaction atlas",
    text: "The nuclear reactions that power stars, on the chart of nuclides.",
  },
  { href: "/research", label: "Research", text: "Underground measurements, R-matrix theory and more." },
  { href: "/publications", label: "Publications", text: "Articles and conference proceedings." },
]

export default function NotFound() {
  return (
    <Container>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">404</p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Page not found</h1>
      <p className="mt-4 max-w-2xl text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground">
        There is nothing at this address. It may have moved, or the link may be mistyped. One of these
        may be what you were looking for:
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {PLACES.map((place) => (
          <li key={place.href}>
            <Link
              href={place.href}
              className="group block h-full rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/30"
            >
              <span className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight group-hover:text-link">
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
