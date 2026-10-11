import { CircleAlert, CircleCheck, CircleDashed, FilePen, Mountain, TrendingUp } from "lucide-react"

import type { Status } from "@/lib/atlas"
import { STATUS_HINT, STATUS_LABEL } from "@/lib/atlas-format"
import { cn } from "@/lib/utils"

/**
 * How well a rate is known, as an icon and a word.
 *
 * Deliberately greyscale: the three chart hues are spent on the networks of the
 * map, and a status colour beside them would read as a fourth series. The icon
 * and the label carry the state, so nothing depends on colour at all.
 */
const ICONS: Record<Status, typeof CircleCheck> = {
  "well-known": CircleCheck,
  improving: TrendingUp,
  uncertain: CircleAlert,
  unmeasured: CircleDashed,
}

export function StatusBadge({
  status,
  pending = false,
  className,
}: {
  status: Status | null
  /** No file yet: say so instead of showing nothing. */
  pending?: boolean
  className?: string
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
        Entry in preparation
      </span>
    )
  }
  const Icon = ICONS[status]
  return (
    <span
      title={STATUS_HINT[status]}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  )
}

/** Marks a measurement, a reaction or an event that involves LUNA. */
export function LunaBadge({ className, label = "LUNA" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-foreground/25 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-foreground",
        className,
      )}
    >
      <Mountain className="h-3 w-3" aria-hidden />
      {label}
    </span>
  )
}
