"use client"

import { useId } from "react"

/**
 * A slider on a logarithmic scale: a native range input (keyboard, screen
 * readers and touch for free) moving log10 of the value.
 */
export function LogSlider({
  label,
  value,
  min,
  max,
  steps = 200,
  onChange,
  valueText,
  hideLabel,
  className = "",
}: {
  label: React.ReactNode
  value: number
  min: number
  max: number
  steps?: number
  onChange: (v: number) => void
  valueText: string
  hideLabel?: boolean
  className?: string
}) {
  const id = useId()
  const lo = Math.log10(min)
  const hi = Math.log10(max)
  const step = (hi - lo) / steps
  const v = Math.min(hi, Math.max(lo, Math.log10(value)))
  return (
    <div className={className}>
      <div className={`flex items-baseline justify-between gap-3 ${hideLabel ? "sr-only" : ""}`}>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <output htmlFor={id} className="tabular text-sm text-muted-foreground">
          {valueText}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={lo}
        max={hi}
        step={step}
        value={v}
        aria-valuetext={valueText}
        onChange={(e) => {
          const x = 10 ** Number(e.target.value)
          // snap to 1 near the middle of a factor slider
          onChange(Math.abs(Math.log10(x)) < step * 1.5 && lo < 0 && hi > 0 ? 1 : x)
        }}
        className="mt-1.5 h-6 w-full cursor-pointer accent-[hsl(var(--link))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  )
}
