"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Menu, X } from "lucide-react"

import { LanguageSwitch } from "@/components/language-switch"
import { ThemeToggle } from "@/components/theme-toggle"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function SiteHeader({ name, lang }: { name: string; lang: Lang }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const t = dict(lang).nav

  // `short` is what the desktop bar shows between md and lg, where seven full
  // labels and the name do not fit on one line; the menu always has the full one.
  const NAV: { href: string; label: string; short?: string }[] = [
    { href: "/research", label: t.research },
    { href: "/atlas", label: t.atlas },
    { href: "/notes", label: t.notes },
    { href: "/evaluations", label: t.evaluations },
    { href: "/software", label: t.software },
    { href: "/publications", label: t.publications, short: t.publicationsShort },
    { href: "/cv", label: t.cv },
  ].map((item) => ({ ...item, href: localePath(lang, item.href) }))

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header className="sticky top-0 z-40 print:hidden border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8 xl:max-w-7xl">
        <Link
          href={localePath(lang, "/")}
          className="-my-2 shrink-0 py-2 font-serif text-[1.0625rem] font-semibold tracking-tight"
          onClick={() => setOpen(false)}
        >
          {name}
        </Link>

        <nav aria-label={t.label} className="ml-auto hidden items-center gap-3.5 md:flex lg:gap-6">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              // A 40px-tall target, and the current section marked the same
              // way here and in the menu: foreground ink plus a rule under it.
              className={cn(
                "relative inline-flex h-10 items-center text-sm transition-colors hover:text-foreground",
                "after:absolute after:inset-x-0 after:bottom-1 after:h-0.5 after:rounded-full after:content-['']",
                isActive(item.href)
                  ? "font-medium text-foreground after:bg-foreground"
                  : "text-muted-foreground after:bg-transparent hover:after:bg-border",
              )}
            >
              {item.short ? (
                <>
                  <span className="lg:hidden">{item.short}</span>
                  <span className="hidden lg:inline">{item.label}</span>
                </>
              ) : (
                item.label
              )}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <LanguageSwitch lang={lang} />
          <ThemeToggle />
          <button
            type="button"
            aria-label={open ? t.closeMenu : t.openMenu}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-menu" aria-label={t.label} className="border-t border-border/70 md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col px-5 py-2 sm:px-8 xl:max-w-7xl">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "-ml-3 flex min-h-12 items-center border-b border-l-2 border-b-border/50 pl-[calc(0.75rem-2px)] text-[0.9375rem] last:border-b-0",
                  isActive(item.href)
                    ? "border-l-foreground font-medium text-foreground"
                    : "border-l-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  )
}
