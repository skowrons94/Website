import Link from "next/link"

import type { Profile } from "@/lib/content"
import { dict, localePath, type Lang } from "@/lib/i18n"

/*
 * The footer is the site map: one column for the work (what someone evaluating
 * the researcher looks for), one for the explanations (what a curious reader
 * looks for), one for profiles elsewhere. Its strings are in lib/i18n.ts.
 */
function groups(lang: Lang): { title: string; links: { href: string; label: string }[] }[] {
  const t = dict(lang).footer
  const local = (links: { href: string; label: string }[]) =>
    links.map((link) => ({ ...link, href: localePath(lang, link.href) }))
  return [
    {
      title: t.work,
      links: local([
        { href: "/research", label: t.research },
        { href: "/publications", label: t.publications },
        { href: "/software", label: t.software },
        { href: "/evaluations", label: t.evaluations },
        { href: "/cv", label: t.cv },
      ]),
    },
    {
      title: t.explore,
      links: local([
        { href: "/atlas", label: t.atlas },
        { href: "/atlas/timeline", label: t.timeline },
        { href: "/atlas/methods", label: t.methods },
        { href: "/notes", label: t.notes },
      ]),
    },
  ]
}

// Roomy tap targets on a phone, a compact list once there is a pointer.
const LINK =
  "inline-block py-2.5 text-muted-foreground transition-colors hover:text-foreground sm:py-1"

export function SiteFooter({ profile, lang }: { profile: Profile; lang: Lang }) {
  const t = dict(lang).footer
  return (
    <footer className="mt-24 border-t border-border/70">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-8 gap-y-10 px-5 py-12 sm:px-8 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] xl:max-w-7xl">
        <div className="col-span-2 space-y-1 text-sm text-muted-foreground lg:col-span-1">
          <p className="font-medium text-foreground">{profile.name}</p>
          <p>{profile.department}</p>
          <p>
            {profile.affiliation} · {profile.location}
          </p>
          <p>
            <a
              href={`mailto:${profile.email}`}
              className="inline-block break-all py-2.5 text-link underline-offset-2 hover:underline sm:py-0"
            >
              {profile.email}
            </a>
          </p>
        </div>

        {groups(lang).map((group) => (
          <nav key={group.title} aria-label={group.title} className="text-sm">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {group.title}
            </h2>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={LINK}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <nav aria-label={t.elsewhere} className="text-sm">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t.elsewhere}
          </h2>
          <ul>
            {profile.links.map((link) => (
              <li key={link.label}>
                <a href={link.href} target="_blank" rel="noreferrer" className={LINK}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  )
}
