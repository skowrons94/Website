"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Menu, X } from "lucide-react"

import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

// `short` is what the desktop bar shows between md and lg, where seven full
// labels and the name do not fit on one line; the menu always has the full one.
const NAV = [
  { href: "/research", label: "Research" },
  { href: "/atlas", label: "Atlas" },
  { href: "/notes", label: "Notes" },
  { href: "/evaluations", label: "Evaluations" },
  { href: "/software", label: "Software" },
  { href: "/publications", label: "Publications", short: "Papers" },
  { href: "/cv", label: "CV" },
]

export function SiteHeader({ name }: { name: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8 xl:max-w-7xl">
        <Link
          href="/"
          className="-my-2 py-2 font-serif text-[1.0625rem] font-semibold tracking-tight"
          onClick={() => setOpen(false)}
        >
          {name}
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-4 md:flex lg:gap-6">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "text-sm transition-colors hover:text-foreground",
                isActive(item.href)
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
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
          <ThemeToggle />
        </nav>

        <div className="ml-auto flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-menu" aria-label="Main" className="border-t border-border/70 md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col px-5 py-2 sm:px-8 xl:max-w-7xl">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "border-b border-border/50 py-3 text-sm last:border-0",
                  isActive(item.href)
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
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
