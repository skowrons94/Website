"use client"

import { memo, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import type { Activity } from "@/contexts/session-context"
import { useLang } from "@/components/lang-context"
import { useEvalDict } from "@/components/eval-dict"
import { decimal } from "@/lib/i18n-eval"

/**
 * How long the page has been waiting, and for how much longer it probably
 * will: the stage, the seconds so far, an estimate (from the last time the
 * same thing took in this visit, else the server's typical timing, else the
 * typical timings shipped with the site), and a thin bar that fills towards
 * the estimate.
 *
 * One clock per thing the reader waits for: the activity's `started` is when
 * they asked (an edit followed by more edits and by its smooth curve keeps
 * its smooth curve), and the bar never moves back when the estimate grows.
 * The numbers appear after 2 s (a quick calculation shows only its stage).
 * Past the estimate it does not invent more time: "almost done", then,
 * past max(estimate × 1.5, estimate + 5 s), "still working", with the
 * elapsed time only and the bar sweeping. Why the wait is long (a first
 * change, no model prepared in advance, other models being prepared) is
 * said beside it, and on a phone on a line of its own.
 *
 * It keeps its own clock, so its once-a-second tick re-renders this small
 * component only, never the plot around it. The bar's motion is a CSS
 * transition (and a sweep past the estimate), off with reduced motion.
 * Screen readers hear nothing for a quick calculation (a drag would make
 * them chatter): an update every 15 s of a long wait, and each retry of a
 * busy server with its delay.
 */

export type Stage = "open" | "edit" | "data" | "fine" | "extrap"

interface Props {
  stage: Stage
  activity: Activity | null
  /**
   * "band": one line in the band reserved above a plot (never over the data);
   * "block": a card in place of the content.
   */
  variant?: "band" | "block"
  /** The server is full: when the page tries again (Date.now()). */
  retryAt?: number | null
  /** A line under the timer (e.g. that the previous result is shown meanwhile). */
  note?: string | null
  className?: string
}

/**
 * Re-renders every `ms` while `running` -- but not while the browser tab is
 * in the background, nor while `anchor` is not displayed (a hidden workspace
 * tab): the clock is read from `performance.now()`, so the first tick after
 * it shows again is right.
 */
function useTick(running: boolean, ms: number, anchor?: { current: HTMLElement | null }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      if (document.hidden) return
      if (anchor?.current && anchor.current.offsetParent === null) return
      setTick((n) => n + 1)
    }, ms)
    return () => clearInterval(id)
  }, [running, ms, anchor])
}

function ProgressTimerImpl({ stage, activity, variant = "band", retryAt = null, note = null, className = "" }: Props) {
  const lang = useLang()
  const dict = useEvalDict()
  const t = dict.live
  const r9 = dict.r9
  const r11 = dict.r11
  const running = Boolean(activity) || retryAt !== null
  const anchor = useRef<HTMLSpanElement>(null)
  useTick(running, 1000, anchor)
  // Announced once per stage start, then every 15 s.
  const [spoken, setSpoken] = useState("")
  // The bar never moves back (an estimate that grows, a clock carried over).
  const shown = useRef<{ started: number; fraction: number }>({ started: -1, fraction: 0 })
  const elapsed = activity ? Math.max(0, (performance.now() - activity.started) / 1000) : 0
  const estimate = activity?.estimate ?? null
  const left = estimate !== null ? estimate - elapsed : null
  // Past the estimate: "almost done"; well past it: "still working".
  const late = left !== null && left < 0.5
  const over = estimate !== null && elapsed > Math.max(estimate * 1.5, estimate + 5)
  // A quick calculation shows its stage only; the numbers from 2 s on.
  const counting = elapsed >= 2
  const label = activity?.preparing ? t.stagePreparing : t.stages[stage]
  const secs = (s: number) => (s >= 90 ? t.minutes(decimal(Math.round(s / 60), lang)) : t.seconds(decimal(Math.max(1, Math.round(s)), lang)))
  // Counting down to the retry; once it is under way, back to the stage.
  const busy = retryAt !== null && retryAt > Date.now() ? Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)) : null

  const bucket = Math.floor(elapsed / 15)
  useEffect(() => {
    if (!activity && busy === null) {
      setSpoken("")
      return
    }
    if (busy !== null) setSpoken(t.busy(decimal(busy, lang)))
    else if (bucket === 0) setSpoken("")
    else setSpoken(`${label} ${t.elapsedLong(secs(elapsed))}${left !== null && left > 0.5 ? `, ${t.left(secs(left))}` : ""}`)
    // Only when the stage, the 15-s bucket or the retry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.started, bucket, retryAt, label])

  const live = (
    <span ref={anchor} className="sr-only" role="status" aria-live="polite">
      {spoken}
    </span>
  )
  if (!running) return live

  let fraction: number | null = null
  if (activity && estimate && estimate > 0) {
    const raw = Math.min(0.97, elapsed / estimate)
    if (shown.current.started !== activity.started) shown.current = { started: activity.started, fraction: 0 }
    fraction = Math.max(shown.current.fraction, raw)
    shown.current.fraction = fraction
  }
  const text =
    busy !== null ? (
      <span>{t.busy(decimal(busy, lang))}</span>
    ) : (
      <>
        <span className="font-medium text-foreground">{label}</span>
        {counting && <span className="text-muted-foreground">· {secs(elapsed)}</span>}
        {counting && left !== null && (
          <span className="text-muted-foreground">· {over ? r11.stillWorking : late ? r9.almost : t.left(secs(left!))}</span>
        )}
      </>
    )

  const bar = (
    <span className="relative block h-[3px] w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      {fraction !== null && !late && busy === null ? (
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--viz-series-1)] transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
          style={{ width: `${Math.max(4, fraction * 100)}%` }}
        />
      ) : (
        <span className="progress-sweep absolute inset-y-0 left-0 w-1/3 rounded-full bg-[var(--viz-series-1)] opacity-70" />
      )}
    </span>
  )

  // Why this wait is long: what is prepared for the first time, said for the
  // stage it is (a first extrapolation is not a "first change"), and that
  // other models share the server.
  const firstNote = stage === "extrap" ? r11.firstExtrap : stage === "fine" ? r11.firstCurve : t.firstChange
  const prepNote = activity?.preparing ? (activity.note ?? firstNote) : (activity?.note ?? null)
  const busyNote = activity?.busy && counting ? r11.serverBusy : null
  const sideNote = busy !== null ? null : [prepNote ?? note, busyNote].filter(Boolean).join(" · ") || null

  if (variant === "band") {
    // One line in a band of its own above the plot: never over the data.
    return (
      <>
        {live}
        <div className={`flex w-full min-w-0 flex-col justify-center gap-[3px] text-xs tabular-nums ${className}`}>
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
            {text}
            {sideNote && (
              <span className="min-w-0 truncate text-muted-foreground max-sm:hidden" title={sideNote}>
                — {sideNote}
              </span>
            )}
          </span>
          {/* A phone has no room beside it: the reason on a line of its own. */}
          {sideNote && <span className="text-[0.6875rem] leading-snug text-muted-foreground sm:hidden">{sideNote}</span>}
          {bar}
        </div>
      </>
    )
  }

  return (
    <>
      {live}
      <div className={`flex w-full max-w-md flex-col gap-1.5 rounded-lg border bg-card px-4 py-3 text-sm tabular-nums ${className}`}>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
          {text}
        </span>
        {bar}
        {sideNote && <span className="text-[0.6875rem] leading-snug text-muted-foreground">{sideNote}</span>}
      </div>
    </>
  )
}

/** Memoised: the parent's re-renders do not restart or re-render the clock. */
export const ProgressTimer = memo(ProgressTimerImpl)

/**
 * Under a smooth curve whose model is still being built (its first build
 * can take half a minute in the browser): when it will be ready, counting
 * down on its own clock, else `fallback`.
 */
export function CurveEta({ activity, fallback }: { activity: Activity | null; fallback: string }) {
  const lang = useLang()
  const r11 = useEvalDict().r11
  const waiting = Boolean(activity?.preparing && activity.estimate)
  useTick(waiting, 1000)
  if (!waiting || !activity) return <>{fallback}</>
  const left = activity.estimate! - (performance.now() - activity.started) / 1000
  return <>{left >= 1.5 ? r11.curveSoon(decimal(Math.round(left), lang)) : r11.curveAlmost}</>
}
