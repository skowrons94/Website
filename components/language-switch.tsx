"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import type { ChromeStrings } from "@/lib/chrome-strings"
import { englishPath, localePath, type Lang } from "@/lib/locale"

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
export function LanguageSwitch({
  lang,
  strings,
  variant = "bar",
}: {
  lang: Lang
  strings: ChromeStrings["language"]
  /** "menu": in the phone menu, the other language by name ("Italiano"). */
  variant?: "bar" | "menu"
}) {
  const pathname = usePathname() ?? "/"
  const router = useRouter()
  const other: Lang = lang === "en" ? "it" : "en"
  const target = localePath(other, englishPath(pathname))
  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const extra = `${window.location.search}${window.location.hash}`
    if (!extra || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    router.push(`${target}${extra}`)
  }

  if (variant === "menu") {
    return (
      <Link
        href={target}
        prefetch={false}
        hrefLang={other}
        lang={other}
        onClick={onClick}
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-[0.9375rem] text-foreground/90 transition-colors hover:bg-accent"
      >
        <span aria-hidden className="rounded border border-border px-1 text-xs font-medium text-muted-foreground">
          {other.toUpperCase()}
        </span>
        {strings.otherSwitchTo}
      </Link>
    )
  }

  return (
    <div role="group" aria-label={strings.label} className="flex shrink-0 items-center text-xs font-medium">
      {/* The current language, shown beside the other on a wide screen only. */}
      <span aria-current="true" className="hidden px-1 text-foreground sm:inline">
        {lang.toUpperCase()}
      </span>
      <span aria-hidden className="hidden text-muted-foreground/60 sm:inline">
        /
      </span>
      <Link
        href={target}
        prefetch={false}
        hrefLang={other}
        lang={other}
        title={strings.otherSwitchTo}
        aria-label={`${strings.otherName}: ${strings.otherSwitchTo}`}
        onClick={onClick}
        className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {other.toUpperCase()}
      </Link>
    </div>
  )
}
