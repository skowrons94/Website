import Link from "next/link"
import { CircleAlert, CircleCheck, CircleDashed, FilePen, Mountain, TrendingUp } from "lucide-react"

import type { Status } from "@/lib/atlas"
import { statusHint, statusLabel } from "@/lib/atlas-format"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * How well a rate is known, as an icon and a word.
 *
 * Deliberately greyscale: the three chart hues are spent on the networks of the
 * map, and a status colour beside them would read as a fourth series. The icon
 * and the label carry the state, so nothing depends on colour at all.
 *
 * The LUNA badge has exactly the same shape, weight and casing: it marks where
 * the atlas' own focus lies without making one laboratory look louder than the
 * status of the rate.
 */
const ICONS: Record<Status, typeof CircleCheck> = {
  "well-known": CircleCheck,
  improving: TrendingUp,
  uncertain: CircleAlert,
  unmeasured: CircleDashed,
}

export const STATUSES: Status[] = ["well-known", "improving", "uncertain", "unmeasured"]

const BADGE =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"

export function StatusBadge({
  status,
  pending = false,
  className,
  lang = "en",
  link = false,
}: {
  status: Status | null
  /** No file yet: say so instead of showing nothing. */
  pending?: boolean
  className?: string
  lang?: Lang
  /** Make the badge a link to the glossary entry that explains the labels. */
  link?: boolean
}) {
  if (!status || !(status in ICONS)) {
    // A decay has no status (its half-life is simply measured); only a
    // reaction whose file has not been written gets the placeholder.
    if (!pending) return null
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <FilePen className="h-3.5 w-3.5" aria-hidden />
        {dict(lang).atlas.entryInPreparation}
      </span>
    )
  }
  const Icon = ICONS[status]
  const body = (
    <>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {statusLabel(status, lang)}
    </>
  )
  if (link) {
    return (
      <Link
        href={localePath(lang, "/glossary#status")}
        title={statusHint(status, lang)}
        className={cn(BADGE, "transition-colors hover:border-foreground/40 hover:text-foreground", className)}
      >
        {body}
      </Link>
    )
  }
  return (
    <span title={statusHint(status, lang)} className={cn(BADGE, className)}>
      {body}
    </span>
  )
}

/** Marks a measurement, a reaction or an event that involves LUNA. */
export function LunaBadge({ className, label = "LUNA" }: { className?: string; label?: string }) {
  return (
    <span className={cn(BADGE, className)}>
      <Mountain className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  )
}

/**
 * The four status labels with their meaning written out, for screens that
 * cannot hover: under the map and on the glossary.
 */
export function StatusLegend({ lang, className }: { lang: Lang; className?: string }) {
  const t = dict(lang).atlas
  return (
    <div className={cn("text-xs text-muted-foreground", className)}>
      <p className="font-medium text-foreground/80">
        {t.statusLegend}{" "}
        <Link href={localePath(lang, "/glossary#status")} className="font-normal text-link underline-offset-2 hover:underline">
          {t.moreInGlossary}
        </Link>
      </p>
      <ul className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {STATUSES.map((s) => (
          <li key={s} className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
            <StatusBadge status={s} lang={lang} className="max-w-full shrink-0" />
            <span className="min-w-0 flex-1 basis-40 pt-0.5 leading-snug [overflow-wrap:anywhere]">{statusHint(s, lang)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
