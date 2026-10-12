"use client"

import { useState } from "react"

/**
 * All papers, or only those with Jakub as first author.
 *
 * The list itself is server-rendered; this only flips a data attribute on the
 * wrapper, and globals.css hides the entries (and the per-section counts) that
 * do not belong. Without JavaScript the whole list is simply shown.
 */
export function PublicationFilter({
  label,
  options,
  children,
}: {
  label: string
  options: { id: "all" | "first"; label: string; count: number }[]
  children: React.ReactNode
}) {
  const [mode, setMode] = useState<"all" | "first">("all")
  return (
    <div data-pub-filter={mode}>
      <div role="group" aria-label={label} className="mb-10 flex flex-wrap items-center gap-2 text-sm print:hidden">
        <span className="mr-1 text-muted-foreground" aria-hidden>
          {label}
        </span>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={mode === o.id}
            onClick={() => setMode(o.id)}
            className={
              "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 transition-colors " +
              (mode === o.id
                ? "border-foreground bg-foreground font-medium text-background"
                : "border-input-strong text-foreground hover:bg-accent")
            }
          >
            {o.label}
            <span className="tabular opacity-80">{o.count}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}
