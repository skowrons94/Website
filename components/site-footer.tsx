import Link from "next/link"

import type { Profile } from "@/lib/content"

export function SiteFooter({ profile }: { profile: Profile }) {
  return (
    <footer className="mt-24 border-t border-border/70">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:px-8 sm:grid-cols-2 xl:max-w-7xl">
        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{profile.name}</p>
          <p>{profile.department}</p>
          <p>
            {profile.affiliation} · {profile.location}
          </p>
          <p>
            <a
              href={`mailto:${profile.email}`}
              className="text-link underline-offset-2 hover:underline"
            >
              {profile.email}
            </a>
          </p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm sm:justify-end">
          {profile.links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/cv"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            CV
          </Link>
        </div>
      </div>
    </footer>
  )
}
