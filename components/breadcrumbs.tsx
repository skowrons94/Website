import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { Sci } from "@/components/sci"

export type Crumb = {
  label: string
  /** Omit for the current page, which is always the last crumb. */
  href?: string
  /** The crumb's language, where it differs from the page's (an English note title on /it). */
  lang?: string
}

/**
 * Where a page sits: Home › Notes › This note. A server component with no
 * JavaScript of its own; usable on any page.
 *
 *   <Breadcrumbs label={dict(lang).nav.breadcrumb} items={[
 *     { label: dict(lang).nav.home, href: localePath(lang, "/") },
 *     { label: dict(lang).nav.notes, href: localePath(lang, "/notes") },
 *     { label: note.title },
 *   ]} />
 *
 * `label` names the landmark ("Breadcrumb" / "Percorso"); the last item is the
 * current page (aria-current), shown but not linked. Long trails wrap, and the
 * last item truncates on one line rather than pushing the page wider. Not
 * printed.
 */
export function Breadcrumbs({ label, items, className = "" }: { label: string; items: Crumb[]; className?: string }) {
  return (
    <nav aria-label={label} className={`text-sm text-muted-foreground print:hidden ${className}`}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={i} className={`flex items-center gap-1.5 ${last ? "min-w-0 max-w-full" : ""}`}>
              {item.href && !last ? (
                <Link
                  href={item.href}
                  lang={item.lang}
                  className="-my-2 inline-flex min-h-10 items-center py-2 underline-offset-4 transition-colors hover:text-foreground hover:underline [@media(pointer:fine)]:min-h-0"
                >
                  <Sci>{item.label}</Sci>
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} lang={item.lang} className="truncate text-foreground/80">
                  <Sci>{item.label}</Sci>
                </span>
              )}
              {!last && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-60" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
