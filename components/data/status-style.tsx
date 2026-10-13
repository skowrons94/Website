import type { Status } from "@/lib/atlas"

/**
 * How a status is drawn on the data explorer's charts: one of the three
 * validated chart hues (lib/viz.ts) or ink, and always a dash pattern of its
 * own, so the status never rests on colour alone (and reads in print, in
 * forced colours and for colour-blind readers). The label and icon are
 * components/atlas/status-badge.tsx, as everywhere else on the site.
 */
export const STATUS_STYLE: Record<Status, { color: string; dash?: string; width: number }> = {
  "well-known": { color: "var(--viz-series-3)", width: 2.75 },
  improving: { color: "var(--viz-series-1)", dash: "8 3.5", width: 2.5 },
  uncertain: { color: "var(--viz-series-2)", dash: "1.5 4", width: 3 },
  unmeasured: { color: "var(--viz-text)", dash: "6 3 1.5 3", width: 2 },
}

export function StatusLine({ status, width = 30 }: { status: Status; width?: number }) {
  const s = STATUS_STYLE[status]
  return (
    <svg width={width} height="10" viewBox={`0 0 ${width} 10`} aria-hidden className="shrink-0">
      <line
        x1="2"
        y1="5"
        x2={width - 2}
        y2="5"
        stroke={s.color}
        strokeWidth={s.width}
        strokeLinecap="round"
        strokeDasharray={s.dash}
      />
    </svg>
  )
}
