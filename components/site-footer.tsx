import Link from "next/link"

import type { Profile } from "@/lib/content"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { prefetchFor } from "@/lib/prefetch"
import { REPO } from "@/lib/repo"

/*
 * The footer is the site map, in the header's groups: the work (what someone
 * evaluating the researcher looks for), the tools to explore, the explanations
 * (what a curious reader looks for), and profiles elsewhere. Its strings are in
 * lib/i18n.ts.
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
        { href: "/cv", label: t.cv },
      ]),
    },
    {
      title: t.explore,
      links: local([
        { href: "/atlas", label: t.atlas },
        { href: "/data", label: t.data },
        { href: "/atlas/rates", label: t.rates },
        { href: "/evaluations", label: t.evaluations },
      ]),
    },
    {
      title: t.learn,
      links: local([
        { href: "/notes", label: t.notes },
        { href: "/glossary", label: t.glossary },
        { href: "/learn/exercises", label: t.exercises },
        { href: "/atlas/methods", label: t.methods },
        { href: "/atlas/timeline", label: t.timeline },
      ]),
    },
  ]
}

// The columns are two from 20em (320 px at the default text size), so with
// text at 200% on a phone they stack rather than run off the screen.
// Roomy tap targets wherever the pointer is a finger (a tablet is as wide as a
// laptop), a compact list once there is a mouse.
const LINK =
  "inline-flex min-h-10 max-w-full items-center [overflow-wrap:anywhere] text-muted-foreground transition-colors hover:text-foreground [@media(pointer:fine)]:min-h-8"

export function SiteFooter({ profile, lang }: { profile: Profile; lang: Lang }) {
  const t = dict(lang).footer
  return (
    <footer className="mt-24 border-t border-border/70 print:hidden">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-8 gap-y-10 px-5 py-12 sm:px-8 xl:max-w-7xl [@media(min-width:20em)]:grid-cols-2 lg:!grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
        <div className="space-y-1 text-sm text-muted-foreground [@media(min-width:20em)]:col-span-2 lg:!col-span-1">
          <p className="font-medium text-foreground">{profile.name}</p>
          <p>{profile.department}</p>
          <p>
            {profile.affiliation} · {profile.location}
          </p>
          <p>
            <a
              href={`mailto:${profile.email}`}
              className="inline-flex min-h-10 items-center break-all text-link underline-offset-2 hover:underline [@media(pointer:fine)]:min-h-0"
            >
              {profile.email}
            </a>
          </p>
        </div>

        {groups(lang).map((group) => (
          <nav key={group.title} aria-label={group.title} className="min-w-0 text-sm">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {group.title}
            </h2>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} prefetch={prefetchFor(link.href)} className={LINK}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <nav aria-label={t.elsewhere} className="min-w-0 text-sm">
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
      <div className="border-t border-border/50">
        <p className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-xs text-muted-foreground sm:px-8 xl:max-w-7xl">
          <span>
            © {new Date().getFullYear()} {profile.name}
          </span>
          {/* --- r11 site --- */}
          <Link href={localePath(lang, "/about")} className={LINK}>
            {t.about}
          </Link>
          <a href={REPO} target="_blank" rel="noreferrer" className={LINK}>
            {t.code}
          </a>
          {/* --- find --- */}
          <Link href={localePath(lang, "/news")} className={LINK}>
            {t.news}
          </Link>
          {/* --- r11 sec --- */}
          <Link href={localePath(lang, "/privacy")} className={LINK}>
            {t.privacy}
          </Link>
        </p>
      </div>
    </footer>
  )
}
