"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"


/** `label` comes from the server (lib/chrome-strings.ts), not the dictionary. */
export function ThemeToggle({ label, withLabel = false }: { label: string; withLabel?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // The server cannot know the resolved theme, so the icon is only decided once
  // the client is up; rendering a fixed-size placeholder keeps the header from
  // shifting when it arrives.
  useEffect(() => setMounted(true), [])

  const icon = mounted && (resolvedTheme === "dark" ? <Sun className="h-[1.05rem] w-[1.05rem]" /> : <Moon className="h-[1.05rem] w-[1.05rem]" />)

  // In the phone menu: the icon and the words.
  if (withLabel) {
    return (
      <button
        type="button"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-[0.9375rem] text-foreground/90 transition-colors hover:bg-accent"
      >
        <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground">
          {icon}
        </span>
        {label}
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {icon}
    </button>
  )
}
