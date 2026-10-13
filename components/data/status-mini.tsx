import { CircleAlert, CircleCheck, CircleDashed, TrendingUp } from "lucide-react"

import type { Status } from "@/lib/atlas"
import { statusHint, statusLabel } from "@/lib/atlas-format"
import type { Lang } from "@/lib/locale"
import { cn } from "@/lib/utils"

/**
 * The atlas' status badge (components/atlas/status-badge.tsx), the same icon
 * and word, for client components: that one reads lib/i18n.ts, which would put
 * the whole site dictionary in the page's JavaScript.
 */
const ICONS: Record<Status, typeof CircleCheck> = {
  "well-known": CircleCheck,
  improving: TrendingUp,
  uncertain: CircleAlert,
  unmeasured: CircleDashed,
}

export function StatusMini({ status, lang, className }: { status: Status; lang: Lang; className?: string }) {
  const Icon = ICONS[status]
  if (!Icon) return null
  return (
    <span
      title={statusHint(status, lang)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {statusLabel(status, lang)}
    </span>
  )
}
