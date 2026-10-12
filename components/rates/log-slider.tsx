"use client"

import { useId, useRef } from "react"

/**
 * A slider on a logarithmic scale: a native range input (keyboard, screen
 * readers and touch for free) moving log10 of the value, over a quiet track
 * of the page's own drawing. A factor slider (its range spans ×1) shows a
 * tick at ×1 and fills outward from it, violet up and brown down, only when
 * the value is not 1; dragging snaps to ×1 near the middle, the arrow keys
 * step freely (one step is about 2%, or `keyStep` in log10 when given, with
 * Page Up / Page Down a factor √2).
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
  keyStep,
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
  /** the arrow keys' step in log10 (the slider's own fine step when absent) */
  keyStep?: number
  className?: string
}) {
  const id = useId()
  const dragging = useRef(false)
  const lo = Math.log10(min)
  const hi = Math.log10(max)
  const step = (hi - lo) / steps
  const v = Math.min(hi, Math.max(lo, Math.log10(value)))
  const centred = lo < 0 && hi > 0
  const frac = (x: number) => (x - lo) / (hi - lo)
  // the thumb (16 px) travels over the width less its own size
  const at = (f: number) => `calc(8px + (100% - 16px) * ${f})`
  const changed = centred && Math.abs(v) > 1e-9
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
      <div className="relative mt-1 h-7">
        <div
          className="absolute inset-x-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--viz-grid)]"
          aria-hidden
        />
        {centred && (
          <div
            className="absolute top-1.5 bottom-1.5 w-px -translate-x-1/2 bg-[var(--viz-axis)]"
            style={{ left: at(frac(0)) }}
            aria-hidden
          />
        )}
        {changed && (
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
            style={{
              left: at(frac(Math.min(0, v))),
              width: `calc((100% - 16px) * ${Math.abs(frac(v) - frac(0))})`,
              background: v > 0 ? "var(--rates-up)" : "var(--rates-down)",
            }}
            aria-hidden
          />
        )}
        <input
          id={id}
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={v}
          aria-valuetext={valueText}
          onPointerDown={() => (dragging.current = true)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
          onBlur={() => (dragging.current = false)}
          onKeyDown={(e) => {
            if (!keyStep) return
            const d =
              e.key === "ArrowRight" || e.key === "ArrowUp"
                ? keyStep
                : e.key === "ArrowLeft" || e.key === "ArrowDown"
                  ? -keyStep
                  : e.key === "PageUp"
                    ? Math.log10(Math.SQRT2)
                    : e.key === "PageDown"
                      ? -Math.log10(Math.SQRT2)
                      : 0
            if (!d) return
            e.preventDefault()
            // land on ×1 when the step crosses it
            const next = Math.min(hi, Math.max(lo, v + d))
            onChange(centred && v * next < 0 ? 1 : 10 ** next)
          }}
          onChange={(e) => {
            const x = 10 ** Number(e.target.value)
            // a drag snaps to ×1 near the middle; the keyboard never does
            onChange(dragging.current && centred && Math.abs(Math.log10(x)) < step * 1.5 ? 1 : x)
          }}
          className="absolute inset-0 h-7 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--viz-surface)] [&::-moz-range-thumb]:bg-[var(--viz-text)] [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--viz-surface)] [&::-webkit-slider-thumb]:bg-[var(--viz-text)] [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_var(--viz-axis)] focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring focus-visible:[&::-webkit-slider-thumb]:ring-offset-1"
        />
      </div>
    </div>
  )
}
