"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { Download, Loader2, Redo2, RotateCcw, Undo2, ZoomOut } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LevelControls } from "@/components/level-controls"
import { SegmentChart, type ChartSeries } from "@/components/segment-chart"
import { DataTable } from "@/components/data-table"
import type { DataSegment, FineCurve, Scheme } from "@/lib/api"
import {
  autoLog,
  axisLabel,
  datasetName,
  hasRutherford,
  isScattering,
  pickUnit,
  plotCsv,
  pooledChi2,
  qualifier,
  quantityFor,
  rawValues,
  segmentTitle,
  segmentValues,
  xKind,
  type DisplayUnit,
  type Quantity,
} from "@/lib/eval-plot"
import { downloadPng, downloadSvg, downloadText } from "@/lib/plot-export"
import { OVERLAY_LIMIT, observableLabel, seriesShape } from "@/lib/viz"
import { useDict, useLang } from "@/components/lang-provider"
import { decimal, localePath } from "@/lib/i18n"

/**
 * The interactive view: measured data with the model overlaid, beside sliders
 * for the free parameters, and below them the table of every dataset.
 *
 * Layout: on a wide screen the plot and the level sliders sit side by side,
 * the sliders scrolling in their own column so the plot never leaves view; on
 * a phone the plot is pinned under the site header while the sliders scroll
 * beneath it -- but only on a screen tall enough for both (a phone held
 * sideways is 360 px tall: pinned, the plot would cover everything).
 *
 * Above OVERLAY_LIMIT selected datasets -- or when the selection mixes
 * quantities with different units or axes -- the plot switches from one shared
 * pair of axes to small multiples, which share their axes when they can. The
 * limit is a color constraint (see lib/viz.ts).
 */

interface Props {
  data: DataSegment[]
  /** The model on a fine grid, by segment index (null: not loaded yet). */
  fine: Record<number, FineCurve> | null
  fineStatus: "idle" | "loading" | "ready" | "failed"
  /** The data and fine curves at the evaluation's own parameters. */
  initialData: DataSegment[] | null
  initialFine: Record<number, FineCurve> | null
  scheme: Scheme
  calculating: boolean
  selected: number[]
  onSelect: (indices: number[]) => void
  quantity: Quantity
  onQuantity: (quantity: Quantity) => void
  onParameterChange: (updates: Record<number, number>) => void
  onReset: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** Open the table drawer (the old Data tab, reached by ?tab=data). */
  tableOpen?: boolean
  evaluationId: string
  /** The level selected in the scheme (its slider group opens), shared. */
  selectedLevel?: string | null
  onSelectLevel?: (key: string | null) => void
  /** Total-χ² change per edited free parameter. */
  deltaChi2?: Record<number, number>
}

type Group = { key: string; segments: DataSegment[] }

export function DataPlot({
  data,
  fine,
  fineStatus,
  initialData,
  initialFine,
  scheme,
  calculating,
  selected,
  onSelect,
  quantity,
  onQuantity,
  onParameterChange,
  onReset,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  tableOpen = false,
  evaluationId,
  selectedLevel,
  onSelectLevel,
  deltaChi2,
}: Props) {
  const lang = useLang()
  const t = useDict().workspace
  const [logXOverride, setLogX] = useState<boolean | null>(null)
  const [logYOverride, setLogY] = useState<boolean | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [showResiduals, setShowResiduals] = useState(false)
  const [filter, setFilter] = useState("")
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  const canRutherford = useMemo(() => data.some(hasRutherford), [data])
  const charts = useRef(new Map<string, SVGSVGElement | null>())

  // The dataset list starts open where there is room for it.
  useEffect(() => {
    setListOpen(window.matchMedia("(min-width: 1024px)").matches)
  }, [])

  const chosen = useMemo(() => data.filter((segment) => selected.includes(segment.index)), [data, selected])
  const selectionKey = selected.join(",")
  // A new selection or quantity starts from the automatic axes, unzoomed.
  useEffect(() => {
    setLogX(null)
    setLogY(null)
    setZoom(null)
  }, [selectionKey, quantity])

  // One unit per kind of quantity (keV b vs MeV b, b vs μb …).
  const kindOf = (s: DataSegment) => `${quantityFor(s, quantity)}|${s.observable.startsWith("differential") ? "d" : "i"}|${xKind(s)}`
  const units = useMemo(() => {
    const values = new Map<string, number[]>()
    for (const s of chosen) {
      const k = kindOf(s)
      values.set(k, [...(values.get(k) ?? []), ...rawValues(s, quantity)])
    }
    const out = new Map<string, DisplayUnit>()
    for (const s of chosen) out.set(kindOf(s), pickUnit(quantityFor(s, quantity), s.observable, values.get(kindOf(s)) ?? []))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, quantity])
  const unitOf = (s: DataSegment) => units.get(kindOf(s)) ?? { factor: 1, unit: "" }

  const groups = useMemo<Group[]>(() => {
    // Panels share their axes only within one reaction and observable, where
    // the values are comparable; the unit is shared per kind of quantity.
    const map = new Map<string, DataSegment[]>()
    const key = (s: DataSegment) => `${kindOf(s)}|${s.reaction ?? s.entrance_key}|${s.exit_key}`
    for (const s of chosen) map.set(key(s), [...(map.get(key(s)) ?? []), s])
    return [...map.entries()].map(([key, segments]) => ({ key, segments }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, quantity])
  const mixed = new Set(chosen.map(kindOf)).size > 1
  const faceted = chosen.length > OVERLAY_LIMIT || mixed
  const anyScattering = chosen.some(isScattering)

  const initialBy = useMemo(() => new Map((initialData ?? []).map((s) => [s.index, s])), [initialData])

  const values = useMemo(() => {
    const out = new Map<number, ReturnType<typeof segmentValues>>()
    for (const s of chosen) out.set(s.index, segmentValues(s, quantity, fine?.[s.index], scheme.pairs, unitOf(s)))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, quantity, fine, scheme.pairs, units])

  // The model as the evaluation shipped it, kept faint after an edit.
  const originals = useMemo(() => {
    const out = new Map<number, { x: number; y: number }[]>()
    if (!scheme.modified) return out
    for (const s of chosen) {
      const before = initialBy.get(s.index)
      if (!before) continue
      out.set(s.index, segmentValues(before, quantity, initialFine?.[s.index], scheme.pairs, unitOf(s)).curve)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, scheme.modified, initialBy, initialFine, quantity, units])

  const series = (segments: DataSegment[]): ChartSeries[] =>
    segments.map((s, slot) => {
      const v = values.get(s.index)!
      return {
        label: segmentTitle(s, lang),
        slot: segments.length > OVERLAY_LIMIT ? 0 : slot,
        points: v.points,
        curve: v.curve,
        original: originals.get(s.index),
      }
    })
  const residualSeries = (segments: DataSegment[]): ChartSeries[] =>
    segments.map((s, slot) => ({
      label: segmentTitle(s, lang),
      slot: segments.length > OVERLAY_LIMIT ? 0 : slot,
      points: values.get(s.index)!.residuals,
      curve: [],
    }))

  // Linear or logarithmic, from the data unless the reader chose.
  const axesFor = (segments: DataSegment[]) => {
    const xs: number[] = []
    const ys: number[] = []
    for (const s of segments) {
      const v = values.get(s.index)!
      for (const p of v.points) {
        xs.push(p.x)
        ys.push(p.y)
      }
    }
    const angle = segments.every((s) => xKind(s) === "angle")
    return {
      logX: angle ? false : (logXOverride ?? autoLog(xs, 20)),
      logY: logYOverride ?? autoLog(ys, 10),
      angle,
    }
  }
  const mainAxes = axesFor(chosen)

  const xLabelOf = (segments: DataSegment[]) => (segments.every((s) => xKind(s) === "angle") ? t.angleAxis : t.energyAxis)
  const xUnitOf = (segments: DataSegment[]) => (segments.every((s) => xKind(s) === "angle") ? "°" : "MeV")
  const xNameOf = (segments: DataSegment[]) => (segments.every((s) => xKind(s) === "angle") ? "θ" : "E")

  // Small multiples of one kind share their axes, so panels compare at a glance.
  const sharedY = (segments: DataSegment[], log: boolean): [number, number] | null => {
    let lo = Infinity
    let hi = -Infinity
    for (const s of segments) {
      const v = values.get(s.index)!
      for (const p of v.points) {
        if (!Number.isFinite(p.y) || (log && p.y <= 0)) continue
        lo = Math.min(lo, p.y)
        hi = Math.max(hi, p.y + (p.error ?? 0))
      }
    }
    return Number.isFinite(lo) ? [lo, hi] : null
  }
  const sharedX = (segments: DataSegment[], log: boolean): [number, number] | null => {
    let lo = Infinity
    let hi = -Infinity
    for (const s of segments)
      for (const p of values.get(s.index)!.points) {
        if (!Number.isFinite(p.x) || (log && p.x <= 0)) continue
        lo = Math.min(lo, p.x)
        hi = Math.max(hi, p.x)
      }
    return Number.isFinite(lo) ? [lo, hi] : null
  }

  // Which of the shown datasets have their model only at the measured points.
  const pointwise = fineStatus === "ready" ? chosen.filter((s) => !fine?.[s.index]) : []

  // Fit quality, and how the last edits changed it.
  const meanChi2 = useMemo(() => pooledChi2(chosen), [chosen])
  const allChi2 = useMemo(() => pooledChi2(data.filter((s) => s.active)), [data])
  const initialShown = useMemo(
    () => (initialData ? pooledChi2(initialData.filter((s) => selected.includes(s.index))) : null),
    [initialData, selected],
  )
  const initialAll = useMemo(() => (initialData ? pooledChi2(initialData.filter((s) => s.active)) : null), [initialData])
  const [announcement, setAnnouncement] = useState("")
  const wasCalculating = useRef(false)
  useEffect(() => {
    if (wasCalculating.current && !calculating && meanChi2 !== null) {
      setAnnouncement(t.chi2Status(decimal(meanChi2.toFixed(2), lang)))
    }
    wasCalculating.current = calculating
  }, [calculating, meanChi2, t, lang])

  const toggle = (index: number, checked: boolean) =>
    onSelect(checked ? [...selected.filter((i) => i !== index), index] : selected.filter((i) => i !== index))

  const listed = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return data
    return data.filter((s) =>
      [segmentTitle(s, lang), s.name, s.data_file, observableLabel(s.observable, lang)].some((v) => v.toLowerCase().includes(needle)),
    )
  }, [data, filter, lang])

  const yLabel = chosen[0] ? axisLabel(chosen[0], quantity, lang, unitOf(chosen[0])) : ""

  const exportName = `${evaluationId}_${quantity}`
  const exportCharts = () => [...charts.current.values()].filter((v): v is SVGSVGElement => Boolean(v))
  const exportTitle = chosen.map((s) => segmentTitle(s, lang)).join("; ")
  const saveCsv = () =>
    downloadText(
      plotCsv(
        chosen.map((s) => ({
          title: `${segmentTitle(s, "en")} (norm n = ${s.norm})`,
          xName: xKind(s) === "angle" ? "theta_cm_deg" : "E_cm_MeV",
          yName: axisLabel(s, quantity, "en", unitOf(s)).replace(/,/g, ""),
          values: values.get(s.index)!,
        })),
      ),
      `${exportName}.csv`,
    )
  // An object ref whose assignments land in `charts` under `key`.
  const refFor = (key: string) => ({
    get current() {
      return charts.current.get(key) ?? null
    },
    set current(el: SVGSVGElement | null) {
      if (el) charts.current.set(key, el)
      else charts.current.delete(key)
    },
  })

  const plot =
    chosen.length === 0 ? (
      <Card>
        <CardContent className="flex h-[15rem] items-center justify-center text-center text-sm text-muted-foreground lg:h-[26rem]">
          {t.selectDataset}
        </CardContent>
      </Card>
    ) : faceted ? (
      <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 2xl:grid-cols-3">
        {groups.map((group) => {
          const axes = axesFor(group.segments)
          const y = group.segments.length > 1 ? sharedY(group.segments, axes.logY) : null
          const x = zoom ?? (group.segments.length > 1 ? sharedX(group.segments, axes.logX) : null)
          const label = axisLabel(group.segments[0], quantity, lang, unitOf(group.segments[0]))
          return (
            <Fragment key={group.key}>
              {group.segments.map((segment) => (
                <figure key={segment.index} className="min-w-0 rounded-md border bg-card px-1 pb-1 pt-2">
                  <figcaption className="flex items-baseline gap-2 px-2 text-xs">
                    <span className="truncate font-medium">{datasetName(segment)}</span>
                    <span className="truncate text-muted-foreground">{qualifier(segment, lang)}</span>
                  </figcaption>
                  <SegmentChart
                    series={series([segment])}
                    xLabel={xLabelOf([segment])}
                    yLabel={label}
                    logX={axes.logX}
                    logY={axes.logY}
                    xDomain={x}
                    yDomain={y}
                    onXDomain={setZoom}
                    height={showResiduals ? 170 : 200}
                    xUnit={xUnitOf([segment])}
                    xName={xNameOf([segment])}
                    yUnit={unitOf(segment).unit}
                    svgRef={refFor(`f${segment.index}`)}
                    ariaLabel={t.plotAria(label, segmentTitle(segment, lang))}
                  />
                  {showResiduals && (
                    <SegmentChart
                      series={residualSeries([segment])}
                      xLabel={xLabelOf([segment])}
                      yLabel={t.residualAxis}
                      logX={axes.logX}
                      logY={false}
                      xDomain={x}
                      onXDomain={setZoom}
                      height={80}
                      zeroLine
                      compact
                      xUnit={xUnitOf([segment])}
                      xName={xNameOf([segment])}
                      ariaLabel={t.residualAria(segmentTitle(segment, lang))}
                    />
                  )}
                </figure>
              ))}
            </Fragment>
          )
        })}
      </div>
    ) : (
      <Card className="overflow-hidden">
        <CardContent
          className={`p-1.5 sm:p-3 ${
            showResiduals
              ? "h-[12rem] max-h-[34svh] min-h-[9rem] sm:h-[15rem] lg:h-[20rem] lg:max-h-none"
              : "h-[15rem] max-h-[45svh] min-h-[10rem] sm:h-[18rem] lg:h-[26rem] lg:max-h-none"
          }`}
        >
          <SegmentChart
            series={series(chosen)}
            xLabel={xLabelOf(chosen)}
            yLabel={yLabel}
            logX={mainAxes.logX}
            logY={mainAxes.logY}
            xDomain={zoom}
            onXDomain={setZoom}
            xUnit={xUnitOf(chosen)}
            xName={xNameOf(chosen)}
            yUnit={chosen[0] ? unitOf(chosen[0]).unit : ""}
            svgRef={refFor("main")}
            ariaLabel={t.plotAria(yLabel, chosen.map((s) => segmentTitle(s, lang)).join("; "))}
          />
        </CardContent>
        {showResiduals && (
          <CardContent className="h-[6.5rem] border-t p-1.5 sm:h-[8rem] sm:p-3 lg:h-[9rem]">
            <SegmentChart
              series={residualSeries(chosen)}
              xLabel={xLabelOf(chosen)}
              yLabel={t.residualAxis}
              logX={mainAxes.logX}
              logY={false}
              xDomain={zoom}
              onXDomain={setZoom}
              zeroLine
              compact
              xUnit={xUnitOf(chosen)}
              xName={xNameOf(chosen)}
              svgRef={refFor("resid")}
              ariaLabel={t.residualAria(chosen.map((s) => segmentTitle(s, lang)).join("; "))}
            />
          </CardContent>
        )}
      </Card>
    )

  const delta = (now: number | null, before: number | null) => {
    if (!scheme.modified || now === null || before === null) return null
    const d = now - before
    if (Math.abs(d) < 0.005) return <span className="text-muted-foreground">({t.chi2Same})</span>
    const better = d < 0
    return (
      <span className={`font-medium ${better ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
        ({better ? "▼" : "▲"} {decimal(Math.abs(d).toFixed(2), lang)} {better ? t.better : t.worse})
      </span>
    )
  }

  const legend = chosen.length > 0 && !faceted && (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground" aria-label={t.keyLabel}>
      {chosen.map((s, i) => (
        <li key={s.index} className="flex min-w-0 items-center gap-1.5">
          <svg width="30" height="10" aria-hidden className="shrink-0">
            {seriesShape(i) === "circle" && <circle cx={5} cy={5} r={3.5} fill={`var(--viz-series-${i + 1})`} />}
            {seriesShape(i) === "square" && <rect x={1.5} y={1.5} width={7} height={7} fill={`var(--viz-series-${i + 1})`} />}
            {seriesShape(i) === "triangle" && <path d="M5,1L9,8.5L1,8.5Z" fill={`var(--viz-series-${i + 1})`} />}
            <line x1={13} x2={29} y1={5} y2={5} stroke="var(--viz-text)" strokeWidth={1.6} strokeDasharray={["", "7 4", "2 3"][i]} />
          </svg>
          <span className="truncate text-foreground">{segmentTitle(s, lang)}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="plot-quantity" className="text-xs">
            {t.quantity}
          </Label>
          <Select value={quantity} onValueChange={(value: Quantity) => onQuantity(value)}>
            <SelectTrigger id="plot-quantity" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sfactor">{t.sfactor}</SelectItem>
              <SelectItem value="cross_section">{t.crossSection}</SelectItem>
              {canRutherford && <SelectItem value="rutherford">{t.ratioRutherford}</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-h-10 items-center gap-2">
          <Switch id="logx" checked={mainAxes.logX} disabled={mainAxes.angle} onCheckedChange={setLogX} />
          <Label htmlFor="logx" className="text-sm">
            {t.logEnergy}
          </Label>
        </div>
        <div className="flex min-h-10 items-center gap-2">
          <Switch id="logy" checked={mainAxes.logY} onCheckedChange={setLogY} />
          <Label htmlFor="logy" className="text-sm">
            {t.logValue}
          </Label>
        </div>
        <div className="flex min-h-10 items-center gap-2">
          <Switch id="residuals" checked={showResiduals} onCheckedChange={setShowResiduals} />
          <Label htmlFor="residuals" className="text-sm">
            {t.residuals}
          </Label>
        </div>
        <div className="flex min-h-10 items-center gap-1" role="group" aria-label={t.save}>
          <span className="mr-1 text-xs text-muted-foreground">
            <Download className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            {t.save}
          </span>
          <Button variant="outline" size="sm" className="h-8 px-2.5" disabled={chosen.length === 0} onClick={() => downloadSvg(exportCharts(), `${exportName}.svg`, exportTitle)}>
            SVG
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2.5" disabled={chosen.length === 0} onClick={() => downloadPng(exportCharts(), `${exportName}.png`, exportTitle)}>
            PNG
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2.5" disabled={chosen.length === 0} onClick={saveCsv}>
            CSV
          </Button>
        </div>
      </div>

      {(anyScattering && quantity === "sfactor") || faceted || quantity === "rutherford" ? (
        <p className="text-xs text-muted-foreground">
          {anyScattering && quantity === "sfactor" && t.elasticNote}{" "}
          {quantity === "rutherford" && t.rutherfordNote}{" "}
          {faceted && (mixed ? t.mixedNote : t.facets(chosen.length, OVERLAY_LIMIT, "datasets"))}
        </p>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:gap-6">
        <div className={`min-w-0 max-lg:contents lg:space-y-3 ${faceted ? "" : "lg:sticky lg:top-20 lg:self-start"}`}>
          <div className="rounded-md border bg-card px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="tabular-nums">
                {meanChi2 !== null ? (
                  <>
                    <a href={`${localePath(lang, "/glossary")}#chi-squared`} className="text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-link">
                      χ²/N
                    </a>{" "}
                    <span className="font-semibold">{decimal(meanChi2.toFixed(2), lang)}</span>{" "}
                    <span className="text-muted-foreground">{t.chi2ShownShort}</span> {delta(meanChi2, initialShown)}
                  </>
                ) : (
                  <span className="text-muted-foreground">{t.chi2None}</span>
                )}
                {allChi2 !== null && (
                  <span className="text-muted-foreground">
                    {" · "}
                    {decimal(allChi2.toFixed(2), lang)} {t.chi2AllShort} {delta(allChi2, initialAll)}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onUndo} disabled={calculating || !canUndo} aria-label={t.undo} title={t.undo}>
                  <Undo2 className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onRedo} disabled={calculating || !canRedo} aria-label={t.redo} title={t.redo}>
                  <Redo2 className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="outline" size="sm" className="h-8" onClick={onReset} disabled={calculating || !scheme.modified}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {t.reset}
                </Button>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t.chi2Gloss}</p>
          </div>

          <div
            className={
              faceted
                ? "min-w-0"
                : "z-20 -mx-1 min-w-0 self-start bg-background px-1 pb-2 pt-1 max-lg:[@media(min-height:600px)]:sticky max-lg:[@media(min-height:600px)]:top-16 lg:static lg:mx-0 lg:p-0"
            }
          >
            <div className="relative">
              <div className={`space-y-1.5 transition-opacity duration-150 ${calculating ? "opacity-45" : ""}`} aria-busy={calculating}>
                {legend}
                {plot}
              </div>
              {calculating && (
                <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center">
                  <span className="flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs shadow-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    {t.recalculating}
                  </span>
                </div>
              )}
              {zoom && (
                <Button variant="secondary" size="sm" className="absolute right-2 top-2 h-7 px-2 text-xs" onClick={() => setZoom(null)}>
                  <ZoomOut className="mr-1 h-3.5 w-3.5" aria-hidden />
                  {t.resetZoom}
                </Button>
              )}
            </div>
            {chosen.length > 0 && (
              <p className="mt-1.5 px-1 text-xs text-muted-foreground max-sm:hidden">
                {t.keyText}
                {scheme.modified && ` ${t.keyOriginal}`} <span className="max-sm:hidden">{t.zoomHint}</span>
              </p>
            )}
          </div>

          {(fineStatus === "loading" || pointwise.length > 0) && chosen.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {fineStatus === "loading" ? t.fineLoading : t.finePointwise(pointwise.map((s) => segmentTitle(s, lang)).join("; "))}
            </p>
          )}

          <details
            open={listOpen}
            onToggle={(event) => setListOpen((event.target as HTMLDetailsElement).open)}
            className="min-w-0 rounded-lg border bg-card"
          >
            <summary className="flex min-h-11 cursor-pointer select-none items-center px-4 text-sm font-semibold">
              {t.showDatasets(chosen.length, data.length)}
            </summary>
            <div className="border-t px-4 pb-1 pt-3">
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t.filterDatasets}
                aria-label={t.filterDatasets}
                className="h-9"
              />
            </div>
            <div className="grid max-h-72 gap-x-6 gap-y-2.5 overflow-y-auto px-4 pb-4 pt-3 sm:grid-cols-2">
              {listed.map((segment) => (
                <div key={segment.index} className="flex items-start gap-2">
                  <Checkbox
                    id={`seg-${segment.index}`}
                    checked={selected.includes(segment.index)}
                    onCheckedChange={(checked) => toggle(segment.index, Boolean(checked))}
                    className="mt-0.5"
                  />
                  <Label htmlFor={`seg-${segment.index}`} className="min-w-0 flex-1 cursor-pointer text-xs font-normal leading-snug">
                    <span className="block truncate font-medium">
                      {datasetName(segment)}
                      {qualifier(segment, lang) && <span className="font-normal text-muted-foreground"> · {qualifier(segment, lang)}</span>}
                    </span>
                    <span className="text-muted-foreground">
                      {observableLabel(segment.observable, lang)}
                      {segment.chi2 !== null && ` · χ²/N ${decimal(segment.chi2.toFixed(1), lang)}`}
                    </span>
                  </Label>
                  {!segment.active && (
                    <Badge variant="outline" className="text-[10px]">
                      {t.off}
                    </Badge>
                  )}
                </div>
              ))}
              {listed.length === 0 && <p className="text-xs text-muted-foreground">{t.noMatch(filter)}</p>}
            </div>
          </details>
        </div>

        <Card className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <CardContent className="p-4 sm:p-5">
            {/* The round-3 sliders also take the shared level selection and
                the χ² change per parameter; asserted so that this file
                compiles against either version of them. */}
            <LevelControls
              {...({
                scheme,
                onChange: onParameterChange,
                onReset,
                disabled: calculating,
                selectedLevel,
                onSelectLevel,
                deltaChi2,
              } as React.ComponentProps<typeof LevelControls>)}
            />
          </CardContent>
        </Card>
      </div>

      <details open={tableOpen || undefined} className="group min-w-0 rounded-lg border bg-card">
        <summary className="flex min-h-11 cursor-pointer select-none items-center px-4 text-sm font-semibold">
          {t.tableDrawer(data.length)}
        </summary>
        <div className="border-t p-3 sm:p-4">
          <DataTable data={data} selected={selected} onToggle={toggle} />
        </div>
      </details>
    </div>
  )
}
