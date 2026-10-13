"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react"

import { ExforPlot, type PlotCurve, type PlotSeries } from "@/components/data/exfor-plot"
import { NotBuilt, loadShard, readExforPlain } from "@/lib/data/client"
import { AMU, twoPiEta } from "@/lib/data/export"
import { kev } from "@/lib/data/format"
import { fill } from "@/lib/data/fill"
import { reactionLabel, keyFromLabel } from "@/lib/data/nuclide"
import { FLAG_BITS, GROUPS, GROUP_SYMBOL, flagExplain, flagLabel, type Flag, type Group } from "@/lib/data/quantity"
import { tableRows, type EvalLink, type TableRow } from "@/lib/data/shard-rows"
import type { Points, Shard } from "@/lib/data/types"
import type { DataExpertStrings } from "@/lib/i18n"
import { localePath, type Lang } from "@/lib/locale"
import codes from "@/lib/data/exfor-codes.json"
import { downloadPng, downloadSvg } from "@/lib/plot-export"

export interface ExplorerChannel {
  z1: number
  z2: number
  /** u */
  mu: number
}

type SortKey = "year" | "author" | "lab" | "quantity" | "energy" | "points" | "id"

const NOT_EXPERIMENT = (1 << FLAG_BITS.indexOf("not-experimental")) | (1 << FLAG_BITS.indexOf("derived")) | (1 << FLAG_BITS.indexOf("deleted")) | (1 << FLAG_BITS.indexOf("superseded"))

/**
 * The full page of one reaction's EXFOR data: the table of datasets
 * (filter, sort, select), the plot of the selection and the exports. Loads
 * only this reaction's shard (and, for the plot, any page of it; for an
 * export, the full points of a thinned set).
 */
export function ReactionExplorer({
  slug,
  strings,
  lang,
  channel,
  evaluations,
  window: w,
}: {
  slug: string
  strings: DataExpertStrings
  lang: Lang
  channel: ExplorerChannel | null
  evaluations: EvalLink[]
  window: { lo: number; hi: number; E0: number; label: string } | null
}) {
  const t = strings.table
  const [shard, setShard] = useState<Shard | null>(null)
  const [error, setError] = useState<"notBuilt" | "failed" | null>(null)
  const [pagePoints, setPagePoints] = useState<Map<string, Points>>(new Map())

  useEffect(() => {
    let live = true
    loadShard(slug).then(
      ({ shard }) => live && setShard(shard),
      (e) => live && setError(e instanceof NotBuilt ? "notBuilt" : "failed"),
    )
    return () => {
      live = false
    }
  }, [slug])

  const rows = useMemo(() => (shard ? tableRows(shard, evaluations) : []), [shard, evaluations])

  // a paged shard keeps its points in pages: fetched for the plot
  useEffect(() => {
    if (!shard?.pages?.length) return
    let live = true
    Promise.all(shard.pages.map((p) => readExforPlain<{ datasets: { id: string; points: Points }[] }>(p))).then((pages) => {
      if (!live) return
      const map = new Map<string, Points>()
      for (const page of pages) for (const d of page.datasets) map.set(d.id, d.points)
      setPagePoints(map)
    })
    return () => {
      live = false
    }
  }, [shard])

  /* -- selection, filters, sort -------------------------------------------------- */
  // by default: every counted σ/S measurement, partials included, but not relative data
  const defaults = useMemo(
    () => new Set(rows.filter((r) => r.counted && r.plottable && !(r.flagBits & (1 << FLAG_BITS.indexOf("relative")))).map((r) => r.id)),
    [rows],
  )
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const sel = selected ?? defaults
  const [group, setGroup] = useState<Group | "all">("all")
  const [text, setText] = useState("")
  const [hideFlagged, setHideFlagged] = useState(false)
  const [onlySelected, setOnlySelected] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "year", dir: -1 })
  const [highlight, setHighlight] = useState<string | null>(null)

  const shown = useMemo(() => {
    const q = text.trim().toLowerCase()
    const out = rows.filter(
      (r) =>
        (group === "all" || r.group === group) &&
        (!hideFlagged || !(r.flagBits & NOT_EXPERIMENT)) &&
        (!onlySelected || sel.has(r.id)) &&
        (!q || `${r.id} ${r.authors.join(" ")} ${r.labFull} ${r.facility} ${r.year ?? ""}`.toLowerCase().includes(q)),
    )
    const val = (r: TableRow): string | number => {
      switch (sort.key) {
        case "year":
          return r.year ?? 0
        case "author":
          return r.author.toLowerCase()
        case "lab":
          return r.lab.toLowerCase()
        case "quantity":
          return GROUPS.indexOf(r.group)
        case "energy":
          return r.e0 ?? r.k0 ?? Infinity
        case "points":
          return r.n
        default:
          return r.id
      }
    }
    return out.sort((a, b) => {
      const x = val(a)
      const y = val(b)
      return (x < y ? -1 : x > y ? 1 : a.index - b.index) * sort.dir
    })
  }, [rows, group, text, hideFlagged, onlySelected, sel, sort])

  const toggle = (id: string) => {
    const next = new Set(sel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  /* -- plot ------------------------------------------------------------------------- */
  const neutral = !channel || channel.z1 === 0 || channel.z2 === 0
  const [quantity, setQuantity] = useState<"S" | "sigma">(neutral ? "sigma" : "S")
  const [logX, setLogX] = useState(true)
  const [logY, setLogY] = useState(true)
  useEffect(() => {
    if (neutral) setQuantity("sigma")
  }, [neutral])

  const series = useMemo<PlotSeries[]>(() => {
    if (!shard) return []
    const out: PlotSeries[] = []
    const muMeV = channel ? channel.mu * AMU : 0
    for (const r of rows) {
      if (!sel.has(r.id) || !r.plottable) continue
      const ds = shard.datasets[r.index]
      const p = pagePoints.get(r.id) ?? ds.points
      if (!p?.value) continue
      const E: number[] = []
      const y: number[] = []
      const dy: (number | null)[] = []
      const isS = r.qclass === "S"
      for (let i = 0; i < p.value.length; i++) {
        const e = p.E_cm[i]
        const v = p.value[i]
        if (e === null || v === null || !(e > 0)) continue
        if (p.limit && p.limit[i]) continue
        let err = p.d_tot?.[i] ?? (p.d_stat?.[i] !== undefined || p.d_sys?.[i] !== undefined ? Math.hypot(p.d_stat?.[i] ?? 0, p.d_sys?.[i] ?? 0) || null : null)
        let f = 1
        if (quantity === "S" && !isS) {
          if (!channel || neutral) continue
          f = e * Math.exp(twoPiEta(channel.z1, channel.z2, muMeV, e))
        } else if (quantity === "sigma" && isS) {
          if (!channel || neutral) continue
          f = Math.exp(-twoPiEta(channel.z1, channel.z2, muMeV, e)) / e
        }
        E.push(e)
        y.push(v * f)
        dy.push(err === null || err === undefined ? null : err * f)
        err = null
      }
      if (E.length) out.push({ id: r.id, label: `${r.author}${r.authors.length > 1 ? " et al." : ""} ${r.year ?? ""} · ${r.id}`, partial: r.group === "partial", E, y, dy })
    }
    return out
  }, [shard, rows, sel, pagePoints, quantity, channel, neutral])

  /* -- evaluation curves -------------------------------------------------------------------- */
  const [curves, setCurves] = useState<PlotCurve[]>([])
  const key = shard?.reaction.key ?? null
  useEffect(() => {
    if (!key) return
    const evs = evaluations.filter((e) => e.reactions.includes(key))
    if (!evs.length) return
    let live = true
    const apiBase = process.env.API_BASE ?? ""
    const base = process.env.BASE_PATH ?? ""
    Promise.all(
      evs.map(async (e) => {
        const url = apiBase === "browser" ? `${base}/azure2/evaluations/${encodeURIComponent(e.id)}/initial.json` : `${apiBase}/api/evaluations/${encodeURIComponent(e.id)}/initial`
        try {
          const r = await fetch(url)
          if (!r.ok) return null
          const init = (await r.json()) as {
            data?: { index: number; reaction: string; observable: string }[]
            fine?: { curves: { id: number; energies: number[]; calculated: number[]; sfactor_energies?: number[]; calculated_sfactor?: number[] }[]; segments: { index: number; curve: number }[] }
          }
          const segs = (init.data ?? []).filter((s) => keyFromLabel(s.reaction) === key && (s.observable === "total-capture" || s.observable === "angle-integrated"))
          const pick = segs.find((s) => s.observable === "total-capture") ?? segs[0]
          if (!pick || !init.fine) return null
          const cid = init.fine.segments.find((s) => s.index === pick.index)?.curve
          const c = init.fine.curves.find((x) => x.id === cid)
          if (!c) return null
          return { id: e.id, c }
        } catch {
          return null
        }
      }),
    ).then((list) => {
      if (!live) return
      setCurvesRaw(list.filter((x): x is NonNullable<typeof x> => Boolean(x)))
    })
    return () => {
      live = false
    }
  }, [key, evaluations])
  const [curvesRaw, setCurvesRaw] = useState<{ id: string; c: { energies: number[]; calculated: number[]; sfactor_energies?: number[]; calculated_sfactor?: number[] } }[]>([])
  useEffect(() => {
    setCurves(
      curvesRaw.map(({ id, c }) =>
        quantity === "S" && c.calculated_sfactor
          ? { label: fill(strings.plot.evaluation, { id }), E: c.sfactor_energies ?? c.energies, y: c.calculated_sfactor }
          : { label: fill(strings.plot.evaluation, { id }), E: c.energies, y: c.calculated },
      ),
    )
  }, [curvesRaw, quantity, strings.plot.evaluation])

  const svgRef = useRef<SVGSVGElement | null>(null)
  const label = key ? reactionLabel(key) : slug

  /* -- render ----------------------------------------------------------------------------------- */
  if (error) {
    return <p className="mt-6 rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">{error === "notBuilt" ? t.notBuilt : t.failed}</p>
  }
  if (!shard) {
    return (
      <p className="mt-6 animate-pulse text-sm text-muted-foreground" role="status">
        {t.loading}
      </p>
    )
  }

  const nPoints = series.reduce((a, s) => a + s.E.length, 0)
  const flagsSeen = [...new Set(rows.flatMap((r) => r.flags))]

  return (
    <div className="space-y-12">
      {/* -- plot -- */}
      <section aria-labelledby="plot-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="plot-title" className="font-serif text-2xl font-semibold tracking-tight">
            {strings.plot.title}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {!neutral && (
              <Segmented
                label={strings.plot.show}
                value={quantity}
                options={[
                  ["S", strings.plot.sfactor],
                  ["sigma", strings.plot.sigma],
                ]}
                onChange={(v) => setQuantity(v as "S" | "sigma")}
              />
            )}
            <Segmented label={strings.plot.xAxis} value={logX ? "log" : "lin"} options={[["log", strings.plot.log], ["lin", strings.plot.linear]]} onChange={(v) => setLogX(v === "log")} prefix="x" />
            <Segmented label={strings.plot.yAxis} value={logY ? "log" : "lin"} options={[["log", strings.plot.log], ["lin", strings.plot.linear]]} onChange={(v) => setLogY(v === "log")} prefix="y" />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border bg-[var(--viz-surface)] p-2 sm:p-4">
          <ExforPlot
            series={series}
            curves={curves}
            window={w}
            quantity={quantity}
            logX={logX}
            logY={logY}
            highlight={highlight}
            onHighlight={setHighlight}
            strings={strings}
            lang={lang}
            svgRef={svgRef}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <ul className="max-w-prose space-y-1 text-xs leading-snug text-muted-foreground">
            <li>
              {fill(strings.plot.caption, { reaction: label, n: nPoints, d: series.length })}. {strings.plot.hover}
            </li>
            {curves.length > 0 && (
              <li className="flex items-center gap-2">
                <svg aria-hidden width="18" height="6">
                  <line x1="0" x2="18" y1="3" y2="3" stroke="var(--viz-series-2)" strokeWidth="2" />
                </svg>
                {curves.map((c) => c.label).join(" · ")}
              </li>
            )}
            <li>
              {strings.plot.extrapolatedNever} {strings.plot.partial} {!neutral && strings.plot.converted}
            </li>
          </ul>
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={() => svgRef.current && downloadSvg([svgRef.current], `${slug}.svg`, label)}>
              <Download className="h-3.5 w-3.5" aria-hidden /> {strings.plot.svg}
            </button>
            <button type="button" className={btn} onClick={() => svgRef.current && downloadPng([svgRef.current], `${slug}.png`, label)}>
              <Download className="h-3.5 w-3.5" aria-hidden /> {strings.plot.png}
            </button>
          </div>
        </div>
      </section>

      {/* -- table -- */}
      <section aria-labelledby="table-title">
        <h2 id="table-title" className="font-serif text-2xl font-semibold tracking-tight">
          {t.title}
        </h2>
        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:max-w-xs">
            {t.filter}
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t.search}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t.quantity}
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as Group | "all")}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">{t.all}</option>
              {GROUPS.filter((g) => rows.some((r) => r.group === g)).map((g) => (
                <option key={g} value={g}>
                  {GROUP_SYMBOL[g]} · {strings.quantityShort[g]} ({rows.filter((r) => r.group === g).length})
                </option>
              ))}
            </select>
          </label>
          <Check label={t.hideFlagged} checked={hideFlagged} onChange={setHideFlagged} />
          <Check label={t.onlySelected} checked={onlySelected} onChange={setOnlySelected} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="tabular text-muted-foreground" role="status" aria-live="polite">
            {fill(t.shown, { n: shown.length, total: rows.length })} · {fill(t.selected, { n: sel.size })}
          </span>
          <button type="button" className={btnLink} onClick={() => setSelected(new Set([...sel, ...shown.map((r) => r.id)]))}>
            {t.selectAll}
          </button>
          <button type="button" className={btnLink} onClick={() => setSelected(new Set())}>
            {t.selectNone}
          </button>
          <button type="button" className={btnLink} onClick={() => setSelected(null)}>
            {t.selectDefault}
          </button>
        </div>

        <div className="mt-3 max-h-[70vh] overflow-auto rounded-lg border border-border" tabIndex={0} role="region" aria-labelledby="table-title">
          <table className="w-full min-w-[64rem] border-collapse text-sm">
            <caption className="sr-only">{fill(t.caption, { reaction: label })}</caption>
            <thead className="sticky top-0 z-[1] bg-card text-left text-xs text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]">
              <tr>
                <th scope="col" className="w-10 px-3 py-2">
                  <span className="sr-only">{t.selected.replace("{n}", "")}</span>
                </th>
                <SortHead k="year" label={t.cols.year} sort={sort} setSort={setSort} sortBy={t.sortBy} />
                <SortHead k="author" label={t.cols.author} sort={sort} setSort={setSort} sortBy={t.sortBy} />
                <SortHead k="lab" label={t.cols.lab} sort={sort} setSort={setSort} sortBy={t.sortBy} />
                <th scope="col" className="px-3 py-2 font-medium">{t.cols.method}</th>
                <SortHead k="quantity" label={t.cols.quantity} sort={sort} setSort={setSort} sortBy={t.sortBy} />
                <SortHead k="energy" label={t.cols.energy} sort={sort} setSort={setSort} sortBy={t.sortBy} right />
                <SortHead k="points" label={t.cols.points} sort={sort} setSort={setSort} sortBy={t.sortBy} right />
                <th scope="col" className="px-3 py-2 font-medium">{t.cols.errors}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t.cols.flags}</th>
                <SortHead k="id" label={t.cols.id} sort={sort} setSort={setSort} sortBy={t.sortBy} />
                <th scope="col" className="px-3 py-2 font-medium">{t.cols.doi}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.id}
                  className={`border-t border-border/60 align-top ${highlight === r.id ? "bg-[color-mix(in_srgb,var(--viz-series-1)_12%,transparent)]" : sel.has(r.id) ? "" : "text-muted-foreground"}`}
                  onPointerEnter={() => r.plottable && sel.has(r.id) && setHighlight(r.id)}
                  onPointerLeave={() => setHighlight(null)}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--link))]"
                      checked={sel.has(r.id)}
                      onChange={() => toggle(r.id)}
                      onFocus={() => r.plottable && setHighlight(r.id)}
                      aria-label={fill(t.select, { id: `${r.id}, ${r.author} ${r.year ?? ""}` })}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular">{r.year ?? "–"}</td>
                  <td className="min-w-[9rem] px-3 py-2">
                    <span className="font-medium text-foreground">{r.author}</span>
                    {r.authors.length > 1 && <span> et al.</span>}
                    {r.evaluations.map((id) => (
                      <Link
                        key={id}
                        href={localePath(lang, `/evaluations/${id}`)}
                        title={fill(t.usedIn, { id })}
                        className="ml-1.5 inline-flex items-center rounded-full border border-[var(--viz-series-2)] px-1.5 text-[0.6875rem] font-medium text-foreground hover:bg-accent"
                      >
                        {fill(t.usedInShort, { id })}
                      </Link>
                    ))}
                  </td>
                  <td className="max-w-[14rem] px-3 py-2" title={r.labFull}>
                    <span className="line-clamp-2">{r.lab || "–"}</span>
                    {r.facility && <span className="block text-xs text-muted-foreground">{r.facility}</span>}
                  </td>
                  <td className="max-w-[11rem] px-3 py-2 text-xs" title={[...r.methods.map((c) => (codes.methods as Record<string, string>)[c] ?? c), ...r.detectors.map((c) => (codes.detectors as Record<string, string>)[c] ?? c)].join("; ")}>
                    {r.methods.map((c) => (codes.methods as Record<string, string>)[c] ?? c).join(", ") || "–"}
                    {r.detectors.length > 0 && <span className="block text-muted-foreground">{r.detectors.join(", ")}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-foreground">{GROUP_SYMBOL[r.group]}</span>
                    {r.levels > 0 && <span className="block text-xs text-muted-foreground">{fill(t.levels, { n: r.levels })}</span>}
                    <span className="block font-mono text-[0.6875rem] text-muted-foreground">{r.quantity}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular">
                    {r.e0 !== null ? `${kev(r.e0 * 1000, lang)}${r.e1 !== null && r.e1 > r.e0 * 1.0001 ? `–${kev(r.e1 * 1000, lang)}` : ""}` : r.k0 !== null ? `kT ${kev(r.k0 * 1000, lang)}${r.k1 && r.k1 > r.k0 ? `–${kev(r.k1 * 1000, lang)}` : ""}` : "–"}
                  </td>
                  <td className="px-3 py-2 text-right tabular">
                    {r.n}
                    {r.decimated && (
                      <span className="block text-[0.6875rem] text-muted-foreground" title={fill(t.decimated, { kept: r.decimated.kept, total: r.decimated.total })}>
                        ({r.decimated.kept})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.errors.join(", ") || "–"}
                    {r.norm !== null && <span className="block text-muted-foreground">norm. {kev(r.norm, lang, 2)} %</span>}
                  </td>
                  <td className="max-w-[10rem] px-3 py-2 text-xs">
                    {r.flags.length ? (
                      <ul className="flex flex-wrap gap-1">
                        {r.flags.map((f) => (
                          <li key={f} className="rounded border border-border px-1 py-px" title={(FLAG_BITS as readonly string[]).includes(f) ? flagExplain(f as Flag, lang) : f}>
                            {(FLAG_BITS as readonly string[]).includes(f) ? flagLabel(f as Flag, lang) : f}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    <a href={r.exfor} className="text-link underline-offset-2 hover:underline">
                      {r.id}
                    </a>
                  </td>
                  <td className="max-w-[12rem] px-3 py-2 text-xs">
                    {r.doi ? (
                      <a href={`https://doi.org/${r.doi}`} className="break-all text-link underline-offset-2 hover:underline">
                        {r.doi}
                      </a>
                    ) : (
                      "–"
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                    {t.none}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {flagsSeen.length > 0 && (
          <details className="group mt-3 text-sm">
            <summary className="inline-flex min-h-9 cursor-pointer items-center text-link">{t.flagsTitle}</summary>
            <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {flagsSeen.map((f) => (
                <div key={f}>
                  <dt className="font-medium">{(FLAG_BITS as readonly string[]).includes(f) ? flagLabel(f as Flag, lang) : f}</dt>
                  <dd className="text-muted-foreground">{(FLAG_BITS as readonly string[]).includes(f) ? flagExplain(f as Flag, lang) : `EXFOR: ${f}`}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </section>

      <ExportPanel slug={slug} selected={rows.filter((r) => sel.has(r.id)).map((r) => r.id)} strings={strings} />
    </div>
  )
}

const btn =
  "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
const btnLink = "inline-flex min-h-8 items-center rounded px-1.5 text-sm text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

function Segmented({ label, value, options, onChange, prefix = "q" }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; prefix?: string }) {
  return (
    <fieldset className="flex items-center gap-1.5">
      <legend className="sr-only">{label}</legend>
      <span aria-hidden className="text-xs text-muted-foreground">
        {label}
      </span>
      <div className="inline-flex rounded-md border border-border bg-card p-0.5">
        {options.map(([v, l]) => (
          <label
            key={v}
            className={`inline-flex min-h-8 cursor-pointer items-center rounded px-2.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${value === v ? "bg-foreground text-background" : "hover:bg-accent"}`}
          >
            <input type="radio" name={`${prefix}-${label}`} className="sr-only" checked={value === v} onChange={() => onChange(v)} />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
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

function SortHead({
  k,
  label,
  sort,
  setSort,
  sortBy,
  right,
}: {
  k: SortKey
  label: string
  sort: { key: SortKey; dir: 1 | -1 }
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void
  sortBy: string
  right?: boolean
}) {
  const active = sort.key === k
  const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-1 py-1 font-medium ${right ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => setSort({ key: k, dir: active ? (sort.dir === 1 ? -1 : 1) : k === "year" || k === "points" ? -1 : 1 })}
        className={`inline-flex min-h-8 items-center gap-1 rounded px-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "text-foreground" : ""}`}
        title={fill(sortBy, { col: label })}
      >
        {label}
        <Icon className="h-3 w-3" aria-hidden />
      </button>
    </th>
  )
}

/* -- exports -------------------------------------------------------------------------------- */

function ExportPanel({ slug, selected, strings }: { slug: string; selected: string[]; strings: DataExpertStrings }) {
  const t = strings.export
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string>("")
  const [labParticle, setLabParticle] = useState<"projectile" | "target">("projectile")
  const [massModel, setMassModel] = useState<"ame" | "integer">("ame")
  const [error, setError] = useState<"point" | "stat" | "total">("point")

  const run = useCallback(
    async (kind: "csv" | "json" | "bibtex" | "azure2") => {
      if (!selected.length) {
        setNote(t.nothingSelected)
        return
      }
      setBusy(kind)
      setNote(t.preparing)
      try {
        const [{ fullDatasets, loadMasses, loadJournals, save }, ex] = await Promise.all([import("@/lib/data/client"), import("@/lib/data/export")])
        const sets = await fullDatasets(slug, selected)
        const metaR = await fetch(`${process.env.BASE_PATH ?? ""}/data/meta.json`)
        const meta = (await metaR.json()) as { exfor: { snapshot_date: string; commit: string } }
        const snap = { date: meta.exfor.snapshot_date, commit: meta.exfor.commit }
        if (kind === "csv") save(ex.csvLong(sets), `${slug}.csv`, "text/csv")
        else if (kind === "json") save(ex.jsonExport(sets, snap), `${slug}.json`, "application/json")
        else if (kind === "bibtex") save(ex.bibtex(sets, await loadJournals()), `${slug}.bib`, "application/x-bibtex")
        else {
          const { zip } = await import("@/lib/data/zip")
          const { files, count } = ex.azure2Files(sets, snap, await loadMasses(), { labParticle, massModel, error })
          const bytes = zip(files, `${slug}-azure2`)
          save(bytes as BlobPart, `${slug}-azure2.zip`, "application/zip")
          const skipped = [...(files.get("README.txt") ?? "").matchAll(/^skipped:/gm)].length
          setNote(`${fill(t.done, { n: files.size })}${skipped ? ` · ${fill(t.skipped, { n: skipped })}` : ""}`)
          void count
          return
        }
        setNote("")
      } catch (e) {
        setNote(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(null)
      }
    },
    [selected, slug, t, labParticle, massModel, error],
  )

  return (
    <section aria-labelledby="export-title" className="rounded-lg border border-border bg-card p-5 sm:p-6">
      <h2 id="export-title" className="font-serif text-xl font-semibold tracking-tight">
        {t.title} <span className="font-sans text-sm font-normal text-muted-foreground tabular">({fill(strings.table.selected, { n: selected.length })})</span>
      </h2>
      <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">{t.intro}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["csv", t.csv, t.csvHint],
            ["json", t.json, t.jsonHint],
            ["bibtex", t.bibtex, t.bibtexHint],
          ] as const
        ).map(([k, l, hint]) => (
          <button key={k} type="button" className={btn} disabled={busy !== null} onClick={() => run(k)}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            {l} <span className="font-normal text-muted-foreground">· {hint}</span>
          </button>
        ))}
      </div>
      <fieldset className="mt-5 rounded-md border border-border/80 p-4">
        <legend className="px-1 text-sm font-medium">
          {t.azure2} <span className="font-normal text-muted-foreground">· {t.azure2Hint}</span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label={t.labParticle} value={labParticle} onChange={(v) => setLabParticle(v as "projectile" | "target")} options={[["projectile", t.projectile], ["target", t.target]]} />
          <Select label={t.masses} value={massModel} onChange={(v) => setMassModel(v as "ame" | "integer")} options={[["ame", t.ame], ["integer", t.integer]]} />
          <Select label={t.error} value={error} onChange={(v) => setError(v as "point" | "stat" | "total")} options={[["point", t.errPoint], ["stat", t.errStat], ["total", t.errTotal]]} />
        </div>
        <button type="button" className={`${btn} mt-4`} disabled={busy !== null} onClick={() => run("azure2")}>
          <Download className="h-3.5 w-3.5" aria-hidden /> {t.azure2} (.zip)
        </button>
      </fieldset>
      <p className="mt-3 min-h-5 text-sm text-muted-foreground" role="status" aria-live="polite">
        {note}
      </p>
    </section>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}
