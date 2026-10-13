"use client"

import { useState } from "react"

import { Sci } from "@/components/sci"
import type { Lang } from "@/lib/locale"
import { visible, type ChangeRow, type SplitChanges } from "@/lib/rates/changes"
import { ratesDict } from "@/lib/rates/i18n"
import { dec, sci } from "./format"

export type { ChangeRow }

const STEPS = [1.1, 1.25, 1.5, 2, 3, 5, 10, 30, 100, 1e3, 1e4, 1e6, 1e9]

/** ×2.3 or ÷4.1: a ratio as a reader says it. */
export function ratioText(r: number, lang: Lang): string {
  if (!Number.isFinite(r)) return r > 0 ? "∞" : "0"
  const f = (q: number) => (q < 10 ? dec(q.toFixed(q < 1.1 ? 3 : 2), lang) : q < 1e4 ? q.toFixed(0) : sci(q, lang, 2))
  return r >= 1 ? `×${f(r)}` : `÷${f(1 / r)}`
}

/**
 * The final abundances with the changed rates over the unchanged ones, one
 * diverging bar per nucleus on a symmetric log scale: right (violet) is
 * more, left (brown) is less — a pair kept apart from the series colours — and the label says ×2 or ÷2 in
 * words as well, so the direction never rests on colour alone. Every bar is
 * at least a few pixels long, so a change of 1% never reads as no change.
 */
export function ChangeBars({
  rows,
  lang,
  label,
  more,
  less,
}: {
  rows: ChangeRow[]
  lang: Lang
  label: string
  more: string
  less: string
}) {
  const maxLog = Math.max(...rows.map((r) => Math.abs(Math.log10(r.ratio))).filter(Number.isFinite), 0)
  const top = STEPS.find((s) => Math.log10(s) >= maxLog) ?? STEPS[STEPS.length - 1]
  const D = Math.log10(top)
  const pos = (r: number) => Math.max(-1, Math.min(1, Math.log10(r) / D))
  const ticks = [1 / top, 1, top]

  return (
    <div role="figure" aria-label={label}>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[6rem_minmax(0,1fr)]">
        <span />
        <div className="relative h-5 text-[0.7rem] text-muted-foreground" aria-hidden>
          <span className="absolute left-0">{ratioText(ticks[0], lang)}</span>
          <span className="absolute left-1/2 -translate-x-1/2">×1</span>
          <span className="absolute right-0">{ratioText(ticks[2], lang)}</span>
        </div>
      </div>
      <ul className="border-y border-border/60">
        {rows.map((r) => {
          const p = Number.isFinite(Math.log10(r.ratio)) ? pos(r.ratio) : r.ratio > 1 ? 1 : -1
          const up = p >= 0
          return (
            <li
              key={r.name}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 py-1.5 sm:grid-cols-[6rem_minmax(0,1fr)]"
            >
              <span className="text-right font-serif text-sm font-semibold">
                <Sci>{r.label}</Sci>
              </span>
              <div className="relative h-6">
                <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--viz-axis)]" aria-hidden />
                <span
                  className="absolute top-1/2 h-3 -translate-y-1/2"
                  data-bar
                  style={{
                    ...(up ? { left: "50%" } : { right: "50%" }),
                    width: `max(6px, ${(Math.abs(p) * 50).toFixed(2)}%)`,
                    background: up ? "var(--rates-up)" : "var(--rates-down)",
                    borderRadius: up ? "0 4px 4px 0" : "4px 0 0 4px",
                  }}
                />
                <span
                  className="tabular absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs"
                  style={up ? { right: "52%" } : { left: "52%" }}
                >
                  <Sci>{ratioText(r.ratio, lang)}</Sci>
                  <span className="sr-only"> {up ? more : less}</span>
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * The note after a changed reaction's own target: "(expected…)" only when it
 * moved by 1% or more the way the change pushes it (down when the reaction
 * is faster, up when slower); "(barely changes…)" when it moved by less; no
 * note when it went the other way or the direction is not known (a LUNA rate).
 */
function selfNoteOf(
  r: ChangeRow,
  decays: Map<string, boolean>,
  factors: Map<string, number> | undefined,
  t: ReturnType<typeof ratesDict>,
): string {
  if (!visible(r.ratio)) return t.selfBarely
  const f = factors ? factors.get(r.name) : 2
  if (!f || f === 1) return ""
  return (f > 1 ? r.ratio < 1 : r.ratio > 1) ? t.selfNote(decays.get(r.name) ?? false) : ""
}

/**
 * "What changes most" after a change: the changed reactions' own targets on
 * a line of their own (expected), the knock-on effects on every other
 * nucleus as bars (the news), the changes under 1% in a fold, and, when no
 * other nucleus moved by 1%, why not in words, with a reaction to try
 * instead (from the sensitivity tables).
 */
export function ChangeResult({
  split,
  changed,
  decays,
  factors,
  lang,
  cycle,
  suggestion,
  limit,
  indirect = [],
  children,
}: {
  split: SplitChanges
  /** the knock-on effects on nuclei the changed reactions neither burn nor make, biggest first */
  indirect?: ChangeRow[]
  /** more of the result, after the nuclei (the energy) */
  children?: React.ReactNode
  /** a rate has been changed */
  changed: boolean
  /** of each self-effect, whether its reaction is a decay */
  decays: Map<string, boolean>
  /** the factor each target's reaction was changed by: the "(expected…)" note only when the target moved that way */
  factors?: Map<string, number>
  lang: Lang
  /** the network's [name, "cycle" | "chain"] for the explanation */
  cycle?: [string, string]
  suggestion: { label: string; why: "slowest" | "sensitive"; factor: string; onTry: () => void } | null
  /** bars shown before "show every nucleus" */
  limit: number
}) {
  const t = ratesDict(lang)
  const [all, setAll] = useState(false)
  if (!changed)
    return (
      <div>
        <p className="rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          {t.noChange}
        </p>
        {children}
      </div>
    )
  const { self, knock, small, state } = split
  const moved = self.filter((r) => visible(r.ratio))
  const [before, after] = suggestion ? t.trySuggest(suggestion.why, cycle?.[1]) : ["", ""]
  return (
    <div className="space-y-3" data-state={state}>
      {self.length > 0 && (
        <ul className="space-y-0.5 text-sm" data-self>
          {self.map((r) => (
            <li key={r.name}>
              <span className="tabular font-medium">
                <Sci>{t.selfLine(r.label, "")}</Sci>
                <span style={{ color: r.ratio >= 1 ? "var(--rates-up)" : "var(--rates-down)" }}>
                  <Sci>{ratioText(r.ratio, lang)}</Sci>
                </span>
              </span>{" "}
              <span className="text-muted-foreground">{selfNoteOf(r, decays, factors, t)}</span>
            </li>
          ))}
        </ul>
      )}
      {indirect.length > 0 && (
        <p className="text-pretty rounded-md bg-secondary/60 px-3 py-2 text-sm" data-indirect>
          <span className="font-medium">{t.indirectTitle}</span>{" "}
          <span className="text-muted-foreground">({t.indirectHint}):</span>{" "}
          {indirect.slice(0, 3).map((r, i) => (
            <span key={r.name} className="tabular whitespace-nowrap">
              {i > 0 && <span className="text-muted-foreground"> · </span>}
              <span className="font-serif font-semibold">
                <Sci>{r.label}</Sci>
              </span>{" "}
              <span style={{ color: r.ratio >= 1 ? "var(--rates-up)" : "var(--rates-down)" }}>
                <Sci>{ratioText(r.ratio, lang)}</Sci>
              </span>
              <span className="sr-only"> {r.ratio >= 1 ? t.more : t.less}</span>
            </span>
          ))}
        </p>
      )}
      {state === "knock" ? (
        <div>
          {self.length > 0 && (
            <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t.knockTitle}
            </p>
          )}
          <ChangeBars
            rows={all ? knock : knock.slice(0, limit)}
            lang={lang}
            label={t.changeChartLabel}
            more={t.more}
            less={t.less}
          />
          {knock.length > limit && (
            <button
              type="button"
              onClick={() => setAll(!all)}
              className="mt-2 min-h-8 text-sm text-link underline-offset-4 hover:underline"
            >
              {all ? t.showKeyNuclei : t.showAllNuclei}
            </button>
          )}
        </div>
      ) : (
        <p className="text-pretty rounded-md border border-dashed border-border px-3 py-3 text-sm leading-relaxed sm:px-4 sm:py-4" data-quiet>
          <Sci>
            {state === "self"
              ? t.quietSelf(moved.map((r) => r.label).join(lang === "it" ? " e " : " and "), cycle)
              : t.quietNone}
          </Sci>
          {suggestion && (
            <>
              {" "}
              {before}
              {/* the comma stays with the button: a button never shares a line break with the text after it */}
              <span className="whitespace-nowrap">
                <button
                  type="button"
                  onClick={suggestion.onTry}
                  title={t.trySuggestTitle}
                  className="font-medium text-link underline underline-offset-4 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Sci>{suggestion.label}</Sci> <span className="tabular">{suggestion.factor}</span>
                </button>
                {after.match(/^[,.;:]?/)![0]}
              </span>
              {after.replace(/^[,.;:]?/, "")}
            </>
          )}
        </p>
      )}
      {small.length > 0 && (
        <details className="group text-sm">
          <summary className="min-h-8 cursor-pointer py-1 text-muted-foreground hover:text-foreground">
            {t.smallFold(small.length)}
          </summary>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {small.map((r) => (
              <li key={r.name} className="tabular whitespace-nowrap">
                <span className="font-serif font-semibold">
                  <Sci>{r.label}</Sci>
                </span>{" "}
                <Sci>{ratioText(r.ratio, lang)}</Sci>
                <span className="sr-only"> {r.ratio >= 1 ? t.more : t.less}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {children}
    </div>
  )
}
