"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, Check, Link2, RotateCcw, Share2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A guided path: at most five steps, one on screen at a time, with progress
 * dots and a bar whose "Next" is always in reach (it sticks to the bottom of
 * a phone's screen). The step is in the address (#2), so a step can be shared
 * and the browser's back button goes back a step. Moving to a step puts the
 * focus on its heading, for keyboards and screen readers; nothing animates
 * when the reader asks for reduced motion.
 *
 * The steps' contents are rendered on the server and passed in; the strings
 * arrive already formatted (functions cannot cross to the client).
 */

export interface GuidedStrings {
  stepLabels: string[]
  goTo: string[]
  next: string
  back: string
  restart: string
  progress: string
  share: string
  copy: string
  copied: string
  shareTitle: string
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

function fromHash(n: number): number {
  if (typeof window === "undefined") return 0
  const m = /^#(\d+)$/.exec(window.location.hash)
  const i = m ? Number(m[1]) - 1 : 0
  return i >= 0 && i < n ? i : 0
}

export function GuidedPath({
  steps,
  strings: t,
  title,
  shareText,
}: {
  steps: { title: string; body: ReactNode }[]
  strings: GuidedStrings
  title: string
  shareText: string
}) {
  const n = steps.length
  const [i, setI] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const moved = useRef(false)

  // the step in the address, at load and on the browser's back and forward
  useEffect(() => {
    setI(fromHash(n))
    const on = () => {
      moved.current = true
      setI(fromHash(n))
    }
    window.addEventListener("hashchange", on)
    window.addEventListener("popstate", on)
    return () => {
      window.removeEventListener("hashchange", on)
      window.removeEventListener("popstate", on)
    }
  }, [n])

  const go = useCallback(
    (to: number) => {
      const k = Math.max(0, Math.min(n - 1, to))
      moved.current = true
      setI(k)
      const url = `${window.location.pathname}${window.location.search}#${k + 1}`
      window.history.pushState(null, "", url)
    },
    [n],
  )

  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    const box = top.current
    if (box && box.getBoundingClientRect().top < 0) box.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" })
    heading.current?.focus({ preventScroll: true })
  }, [i])

  const last = i === n - 1
  const step = steps[i]

  return (
    <div ref={top} className="scroll-mt-[calc(var(--header-h,0px)+1rem)]">
      {/* progress */}
      <nav aria-label={t.progress} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <ol className="flex min-w-0 flex-wrap items-center gap-1">
          {steps.map((s, k) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => go(k)}
                aria-label={`${t.goTo[k]}: ${s.title}`}
                aria-current={k === i ? "step" : undefined}
                className="group inline-flex h-11 w-9 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "block rounded-full transition-all motion-reduce:transition-none",
                    k === i
                      ? "h-3 w-6 bg-foreground"
                      : k < i
                        ? "h-3 w-3 bg-foreground/55 group-hover:bg-foreground/80"
                        : "h-3 w-3 border-2 border-foreground/40 group-hover:border-foreground/70",
                  )}
                />
              </button>
            </li>
          ))}
        </ol>
        <span className="tabular text-sm text-muted-foreground">{t.stepLabels[i]}</span>
      </nav>

      {/* the step */}
      <section aria-labelledby="step-heading" className="mt-4 min-h-[22rem] rounded-xl border border-border bg-card p-5 shadow-sm sm:p-8">
        <h2
          id="step-heading"
          ref={heading}
          tabIndex={-1}
          className="text-balance font-serif text-2xl font-semibold leading-snug tracking-tight focus:outline-none sm:text-3xl"
        >
          {step.title}
        </h2>
        <div className="mt-4">{step.body}</div>
        {last && <ShareButtons title={title} text={shareText} strings={t} />}
      </section>

      {/* back and next: sticky at the bottom of a small screen */}
      <div className="sticky bottom-0 z-20 -mx-5 mt-6 border-t border-border/70 bg-background/95 px-5 py-3 backdrop-blur [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => go(i - 1)}
            disabled={i === 0}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md [overflow-wrap:normal] border border-border px-4 text-sm font-medium transition-colors hover:bg-accent disabled:invisible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t.back}
          </button>
          {last ? (
            <button
              type="button"
              onClick={() => go(0)}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md [overflow-wrap:normal] bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              {t.restart}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go(i + 1)}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md [overflow-wrap:normal] bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t.next}
              <span className="sr-only">: {steps[i + 1].title}</span>
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ShareButtons({ title, text, strings: t }: { title: string; text: string; strings: GuidedStrings }) {
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), [])
  const url = () => `${window.location.origin}${window.location.pathname}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${text} ${url()}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      // no clipboard: nothing to do; the address bar has the link
    }
  }
  const share = async () => {
    try {
      await navigator.share({ title, text, url: url() })
    } catch {
      // dismissed
    }
  }
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      {canShare && (
        <button
          type="button"
          onClick={share}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md [overflow-wrap:normal] border border-border px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Share2 className="h-4 w-4" aria-hidden />
          {t.share}
        </button>
      )}
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md [overflow-wrap:normal] border border-border px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
        {copied ? t.copied : t.copy}
      </button>
      <span role="status" className="sr-only">
        {copied ? t.copied : ""}
      </span>
    </div>
  )
}
