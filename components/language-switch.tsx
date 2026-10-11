"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { dict, englishPath, localePath, type Lang } from "@/lib/i18n"

/**
 * EN / IT: the same page in the other language.
 *
 * The other language's path is the same path with or without the /it prefix.
 * The link itself carries that path (so it works without JavaScript and for
 * crawlers); on click the current query and hash are carried over too, so a
 * process chosen on the map (#cno) or a timeline filter (?only=luna) survives
 * the switch. The two languages have different root layouts, so the router
 * does a full load, as it must for `<html lang>` to change.
 */
export function LanguageSwitch({ lang }: { lang: Lang }) {
  const pathname = usePathname() ?? "/"
  const router = useRouter()
  const other: Lang = lang === "en" ? "it" : "en"
  const target = localePath(other, englishPath(pathname))
  const t = dict(other)

  return (
    <div role="group" aria-label={dict(lang).nav.language} className="flex items-center text-xs font-medium">
      {/* The current language, shown beside the other on a wide screen only. */}
      <span aria-current="true" className="hidden px-1 text-foreground sm:inline">
        {lang.toUpperCase()}
      </span>
      <span aria-hidden className="hidden text-muted-foreground/60 sm:inline">
        /
      </span>
      <Link
        href={target}
        hrefLang={other}
        lang={other}
        title={t.nav.switchTo}
        aria-label={`${t.langName}: ${t.nav.switchTo}`}
        onClick={(event) => {
          const extra = `${window.location.search}${window.location.hash}`
          if (!extra || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
          event.preventDefault()
          router.push(`${target}${extra}`)
        }}
        className="inline-flex h-10 min-w-10 items-center justify-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {other.toUpperCase()}
      </Link>
    </div>
  )
}
