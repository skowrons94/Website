"use client"

import Link from "next/link"
import { useDeferredValue, useEffect, useMemo, useState } from "react"

import { Sci } from "@/components/sci"
import { dataUrl } from "@/lib/data/client"
import { fill } from "@/lib/data/fill"
import { kev } from "@/lib/data/format"
import { reactionLabel } from "@/lib/data/nuclide"
import { GROUPS, GROUP_SYMBOL, type Group } from "@/lib/data/quantity"
import { gamowPeak, type ReactionSummary } from "@/lib/data/search-index"
import type { DataExpertStrings } from "@/lib/i18n"
import { localePath, type Lang } from "@/lib/locale"

const PROJECTILES = ["p", "a", "d", "3He", "t", "n", "heavy"]
const PROCESSES = ["g", "n", "p", "a", "el", "other"]
const TEMPS = [0.015, 0.03, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 3]
const PAGE = 100

/**
 * Expert discovery filters over the EXFOR index, client-side: the index is
 * fetched and summarised per reaction in a Web Worker (lib/data/search.worker.ts),
 * so the page never parses 8 MB of JSON on its own thread; each filter is
 * then a pass over 7,700 summaries. Results are listed by target, never
 * ranked.
 */
export function SearchView({
  strings,
  lang,
  prerendered,
  levelsNoWg,
}: {
  strings: DataExpertStrings
  lang: Lang
  prerendered: string[]
  /** atlas reaction key → levels in its window without ωγ (build time) */
  levelsNoWg: Record<string, number>
}) {
  const t = strings.search
  const [data, setData] = useState<ReactionSummary[] | null>(null)
  const [error, setError] = useState(false)
  const [projectile, setProjectile] = useState("any")
  const [process, setProcess] = useState("any")
  const [quantity, setQuantity] = useState<Group | "any">("any")
  const [zLo, setZLo] = useState(1)
  const [zHi, setZHi] = useState(30)
  const [T9, setT9] = useState(0.1)
  const [above, setAbove] = useState(false)
  const [noPartials, setNoPartials] = useState(false)
  const [noRecent, setNoRecent] = useState(false)
  const [singleLab, setSingleLab] = useState(false)
  const [levels, setLevels] = useState(false)
  // the atlas reactions first: 7700 reactions open on ¹H(¹¹Li,…) otherwise
  const [atlasOnly, setAtlasOnly] = useState(true)
  const [limit, setLimit] = useState(PAGE)
  const pre = useMemo(() => new Set(prerendered), [prerendered])

  useEffect(() => {
    const w = new Worker(new URL("../../lib/data/search.worker.ts", import.meta.url), { type: "module" })
    w.onmessage = (ev: MessageEvent<{ type: string; reactions?: ReactionSummary[] }>) => {
      if (ev.data.type === "ready" && ev.data.reactions) setData(ev.data.reactions)
      else setError(true)
      w.terminate()
    }
    w.onerror = () => setError(true)
    w.postMessage({ type: "load", url: new URL(dataUrl("exfor/index.json"), window.location.href).href })
    return () => w.terminate()
  }, [])

  // filtering and re-rendering the list run as a deferred (interruptible) render, so a click never blocks the page
  // one object per change of the filters (not per render), so the deferred value and the page reset are stable
  const current = useMemo(
    () => ({ projectile, process, quantity, zLo, zHi, T9, above, noPartials, noRecent, singleLab, levels, atlasOnly }),
    [projectile, process, quantity, zLo, zHi, T9, above, noPartials, noRecent, singleLab, levels, atlasOnly],
  )
  const filters = useDeferredValue(current)
  const results = useMemo(() => {
    const { projectile, process, quantity, zLo, zHi, T9, above, noPartials, noRecent, singleLab, levels, atlasOnly } = filters
    if (!data) return []
    const LIGHT = new Set(["p", "a", "d", "3He", "t", "n"])
    const qb = quantity === "any" ? 0 : 1 << GROUPS.indexOf(quantity)
    const partialBit = 1 << GROUPS.indexOf("partial")
    return data
      .filter((s) => {
        if (s.Zt < zLo || s.Zt > zHi) return false
        if (
          projectile !== "any" &&
          (projectile === "heavy" ? LIGHT.has(s.projectile) || s.projectile === "g" : s.projectile !== projectile)
        )
          return false
        if (process !== "any" && (process === "other" ? PROCESSES.includes(s.process) : s.process !== process)) return false
        if (qb && !(s.groups & qb)) return false
        if (noPartials && s.groups & partialBit) return false
        if (noRecent && (s.y1 ?? 0) >= 2000) return false
        if (singleLab && s.labs !== 1) return false
        if (atlasOnly && !s.atlas) return false
        if (levels && !(levelsNoWg[s.key] > 0)) return false
        if (above) {
          const E0 = gamowPeak(s, T9)
          if (E0 === null) return false
          if (s.lowest === null || s.lowest <= 2 * E0) return false
        }
        return true
      })
      .sort((a, b) => a.Zt - b.Zt || a.At - b.At || a.key.localeCompare(b.key))
  }, [data, filters, levelsNoWg])

  useEffect(() => setLimit(PAGE), [results])

  const href = (slug: string) =>
    pre.has(slug) ? localePath(lang, `/data/reaction/${slug}`) : `${localePath(lang, "/data/reaction")}?r=${encodeURIComponent(slug)}`
  const sel =
    "h-10 w-full max-w-full truncate rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  const lab = "flex min-w-0 max-w-full flex-col gap-1 text-xs font-medium text-muted-foreground"

  return (
    <div className="mt-10">
      <form className="rounded-lg border border-border bg-card p-5 sm:p-6" onSubmit={(e) => e.preventDefault()} aria-label={t.filters}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className={lab}>
            {t.projectile}
            <select className={sel} value={projectile} onChange={(e) => setProjectile(e.target.value)}>
              <option value="any">{t.any}</option>
              {PROJECTILES.map((p) => (
                <option key={p} value={p}>
                  {p === "heavy" ? "¹²C, ¹⁶O, …" : p === "a" ? "α" : p === "3He" ? "³He" : p}
                </option>
              ))}
            </select>
          </label>
          <label className={lab}>
            {t.process}
            <select className={sel} value={process} onChange={(e) => setProcess(e.target.value)}>
              <option value="any">{t.any}</option>
              {PROCESSES.map((p) => (
                <option key={p} value={p}>
                  {p === "g" ? "γ" : p === "a" ? "α" : p === "el" ? "elastic" : p === "other" ? "…" : p}
                </option>
              ))}
            </select>
          </label>
          <label className={lab}>
            {t.quantity}
            <select className={sel} value={quantity} onChange={(e) => setQuantity(e.target.value as Group | "any")}>
              <option value="any">{t.any}</option>
              {GROUPS.map((g) => (
                <option key={g} value={g}>
                  {GROUP_SYMBOL[g]} · {strings.quantityShort[g]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <label className={lab}>
              {t.zMin}
              <input
                type="number"
                min={0}
                max={83}
                value={zLo}
                onChange={(e) => setZLo(Number(e.target.value))}
                className={`${sel} w-20`}
              />
            </label>
            <label className={lab}>
              {t.zMax}
              <input
                type="number"
                min={0}
                max={83}
                value={zHi}
                onChange={(e) => setZHi(Number(e.target.value))}
                className={`${sel} w-20`}
              />
            </label>
          </div>
        </div>
        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.filters}</legend>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="inline-flex flex-wrap items-center gap-2">
              <Check label={t.aboveE0} checked={above} onChange={setAbove} />
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                {t.temperature}
                <select className={`${sel} h-8`} value={T9} onChange={(e) => setT9(Number(e.target.value))}>
                  {TEMPS.map((x) => (
                    <option key={x} value={x}>
                      T₉ = {lang === "it" ? String(x).replace(".", ",") : x}
                    </option>
                  ))}
                </select>
              </label>
            </span>
            <Check label={t.noPartials} checked={noPartials} onChange={setNoPartials} />
            <Check label={t.noRecent} checked={noRecent} onChange={setNoRecent} />
            <Check label={t.singleLab} checked={singleLab} onChange={setSingleLab} />
            <Check label={t.atlasOnly} checked={atlasOnly} onChange={setAtlasOnly} />
            <Check label={t.levelsNoWg} checked={levels} onChange={setLevels} />
          </div>
        </fieldset>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {t.E0note} {t.wgNote}
        </p>
      </form>

      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium tabular" role="status" aria-live="polite">
          {data ? fill(t.results, { n: results.length }) : error ? t.failed : t.loading}
        </p>
        <p className="text-xs text-muted-foreground">{t.noRanking}</p>
      </div>

      {/* until the index arrives, hold the table's place so the footer does not jump (layout shift) */}
      {!data && !error && <div aria-hidden className="mt-3 h-[70vh] rounded-lg border border-dashed border-border" />}
      {data && (
        <div
          className="mt-3 overflow-x-auto rounded-lg border border-border"
          tabIndex={0}
          role="region"
          aria-label={fill(t.results, { n: results.length })}
        >
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <caption className="sr-only">{fill(t.results, { n: results.length })}</caption>
            <thead className="bg-card text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t.cols.reaction}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t.cols.datasets}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t.cols.lowest}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t.cols.E0}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t.cols.years}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t.cols.labs}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t.cols.quantities}
                </th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, limit).map((s) => {
                const E0 = gamowPeak(s, filters.T9)
                return (
                  <tr key={s.key} className="border-t border-border/60">
                    <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-normal">
                      <Link href={href(s.slug)} className="font-medium text-link underline-offset-4 hover:underline">
                        <Sci>{reactionLabel(s.key)}</Sci>
                      </Link>
                      {levelsNoWg[s.key] > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">{fill(t.levelsCount, { n: levelsNoWg[s.key] })}</span>
                      )}
                    </th>
                    <td className="px-3 py-1.5 text-right tabular">{s.n}</td>
                    <td className="px-3 py-1.5 text-right tabular">{s.lowest !== null ? kev(s.lowest, lang) : "–"}</td>
                    <td className="px-3 py-1.5 text-right tabular">{E0 !== null ? kev(E0, lang) : "–"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 tabular">{s.y0 ? (s.y0 === s.y1 ? s.y0 : `${s.y0}–${s.y1}`) : "–"}</td>
                    <td className="px-3 py-1.5 text-right tabular">{s.labs}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {GROUPS.filter((g) => s.groups & (1 << GROUPS.indexOf(g)))
                        .map((g) => (g === "other" ? strings.quantityShort.other : GROUP_SYMBOL[g]))
                        .join(" · ")}
                    </td>
                  </tr>
                )
              })}
              {results.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    {t.none}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {results.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="mt-3 inline-flex min-h-10 items-center rounded-md border border-border bg-card px-3.5 text-sm font-medium text-link hover:border-foreground/30"
        >
          {fill(t.showMore, { n: Math.min(PAGE, results.length - limit) })}
        </button>
      )}
    </div>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--link))]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
