"use client"

import { memo, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import type { Activity } from "@/contexts/session-context"
import { useLang } from "@/components/lang-context"
import { useEvalDict } from "@/components/eval-dict"
import { decimal } from "@/lib/i18n-eval"

/**
 * How long the page has been waiting, and for how much longer it probably
 * will: the stage, the seconds so far, an estimate (from the last time the
 * same thing took in this visit, else the server's typical timing), and a
 * thin bar that fills towards the estimate and turns indeterminate past it.
 *
 * It keeps its own clock, so its once-a-second tick re-renders this small
 * component only, never the plot around it. The bar's motion is a CSS
 * transition (and a sweep past the estimate), off with reduced motion.
 * Screen readers hear the stage when it starts and a short update every
 * 15 s, not every tick.
 */

export type Stage = "open" | "edit" | "data" | "fine" | "extrap"

interface Props {
  stage: Stage
  activity: Activity | null
  /** "overlay": a pill pinned over the plot; "block": a card in place of the content. */
  variant?: "overlay" | "block"
  /** The server is full: when the page tries again (Date.now()). */
  retryAt?: number | null
  /** A line under the timer (e.g. that the previous result is shown meanwhile). */
  note?: string | null
  className?: string
}

function useTick(running: boolean, ms: number) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick((n) => n + 1), ms)
    return () => clearInterval(id)
  }, [running, ms])
}

function ProgressTimerImpl({ stage, activity, variant = "overlay", retryAt = null, note = null, className = "" }: Props) {
  const lang = useLang()
  const t = useEvalDict().live
  const running = Boolean(activity) || retryAt !== null
  useTick(running, 1000)
  // Announced once per stage start, then every 15 s.
  const [spoken, setSpoken] = useState("")
  const elapsed = activity ? Math.max(0, (performance.now() - activity.started) / 1000) : 0
  const estimate = activity?.estimate ?? null
  const left = estimate !== null ? estimate - elapsed : null
  const over = left !== null && left < 0
  const label = activity?.preparing ? t.stagePreparing : t.stages[stage]
  const secs = (s: number) => (s >= 90 ? t.minutes(decimal(Math.round(s / 60), lang)) : t.seconds(decimal(Math.max(1, Math.round(s)), lang)))
  const busy = retryAt !== null ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)) : null

  const bucket = Math.floor(elapsed / 15)
  useEffect(() => {
    if (!activity && busy === null) {
      setSpoken("")
      return
    }
    if (busy !== null) setSpoken(t.busy(decimal(busy, lang)))
    else if (bucket === 0) setSpoken(label)
    else setSpoken(`${label} ${t.elapsedLong(secs(elapsed))}${left !== null && left > 0 ? `, ${t.left(secs(left))}` : ""}`)
    // Only when the stage or the 15-s bucket changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.started, bucket, busy !== null, label])

  const live = (
    <span className="sr-only" role="status" aria-live="polite">
      {spoken}
    </span>
  )
  if (!running) return live

  const fraction = estimate && estimate > 0 ? Math.min(1, elapsed / estimate) : null
  const text =
    busy !== null ? (
      <span>{t.busy(decimal(busy, lang))}</span>
    ) : (
      <>
        <span className="font-medium text-foreground">{label}</span>
        {elapsed >= 1 && <span className="text-muted-foreground">· {secs(elapsed)}</span>}
        {left !== null && elapsed >= 1 && (
          <span className="text-muted-foreground">· {over ? t.longer : t.left(secs(left))}</span>
        )}
      </>
    )

  const bar = (
    <span className="relative block h-[3px] w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      {fraction !== null && !over && busy === null ? (
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--viz-series-1)] transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
          style={{ width: `${Math.max(4, fraction * 100)}%` }}
        />
      ) : (
        <span className="progress-sweep absolute inset-y-0 left-0 w-1/3 rounded-full bg-[var(--viz-series-1)] opacity-70" />
      )}
    </span>
  )

  const prepNote = activity?.preparing ? t.firstChange : null

  return (
    <>
      {live}
    <div
      className={
        variant === "overlay"
          ? `pointer-events-none flex w-[min(22rem,calc(100%-1rem))] flex-col gap-1 rounded-xl border bg-card/95 px-3 py-1.5 text-xs tabular-nums shadow-sm backdrop-blur-sm ${className}`
          : `flex w-full max-w-md flex-col gap-1.5 rounded-lg border bg-card px-4 py-3 text-sm tabular-nums ${className}`
      }
    >
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
        {text}
      </span>
      {bar}
      {(prepNote || note) && <span className="text-[11px] leading-snug text-muted-foreground">{prepNote ?? note}</span>}
    </div>
    </>
  )
}

/** Memoised: the parent's re-renders do not restart or re-render the clock. */
export const ProgressTimer = memo(ProgressTimerImpl)
