"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LevelControls } from "@/components/level-controls"
import { SegmentChart, type ChartSeries } from "@/components/segment-chart"
import type { DataSegment, FineCurve, Scheme } from "@/lib/api"
import {
  axisLabel,
  datasetName,
  defaultSegment,
  hasRutherford,
  isScattering,
  qualifier,
  segmentTitle,
  segmentValues,
  type Quantity,
} from "@/lib/eval-plot"
import { OVERLAY_LIMIT, observableLabel } from "@/lib/viz"
import { useDict, useLang } from "@/components/lang-provider"
import { decimal } from "@/lib/i18n"

/**
 * The interactive tab: measured data with the model overlaid, beside sliders
 * for the free parameters.
 *
 * Layout: on a wide screen the plot and the level sliders sit side by side,
 * the sliders scrolling in their own column so the plot never leaves view; on
 * a phone the plot is pinned under the site header while the sliders scroll
 * beneath it. Either way, moving a level and watching the curve answer is one
 * gesture, not a scroll back up.
 *
 * Above OVERLAY_LIMIT selected datasets -- or when the selection mixes
 * quantities with different units -- the plot switches from one shared pair of
 * axes to small multiples. The limit is a color constraint (see lib/viz.ts).
 */

interface Props {
  data: DataSegment[]
  /** The model on a fine grid, by segment index (null: not loaded yet). */
  fine: Record<number, FineCurve> | null
  fineStatus: "idle" | "loading" | "ready" | "failed"
  scheme: Scheme
  calculating: boolean
  onParameterChange: (updates: Record<number, number>) => void
  onReset: () => void
}

/** Pooled χ²/N (Σχ² / ΣN) of some segments, as the Data tab computes it. */
function pooledChi2(segments: DataSegment[]): number | null {
  let chi2 = 0
  let n = 0
  for (const s of segments) {
    if (s.chi2 === null) continue
    const points = s.chi2_points ?? s.n_points
    chi2 += s.chi2_sum ?? s.chi2 * points
    n += points
  }
  return n > 0 ? chi2 / n : null
}

export function DataPlot({
  data,
  fine,
  fineStatus,
  scheme,
  calculating,
  onParameterChange,
  onReset,
}: Props) {
  const lang = useLang()
  const t = useDict().workspace
  const [selected, setSelected] = useState<number[]>([])
  const [quantity, setQuantity] = useState<Quantity>("sfactor")
  const [logX, setLogX] = useState(false)
  const [logY, setLogY] = useState(true)
  const [listOpen, setListOpen] = useState(false)
  const [showResiduals, setShowResiduals] = useState(false)
  const canRutherford = useMemo(() => data.some(hasRutherford), [data])

  // Open on a capture (or reaction) segment, the thing an S-factor plot is
  // for, so the tab is never an empty frame nor a scattering cross section
  // drawn as an "S-factor".
  useEffect(() => {
    setSelected((current) => {
      if (current.length > 0) return current
      const first = defaultSegment(data)
      return first ? [first.index] : []
    })
  }, [data])

  // The dataset list starts open where there is room for it.
  useEffect(() => {
    setListOpen(window.matchMedia("(min-width: 1024px)").matches)
  }, [])

  const chosen = useMemo(
    () => data.filter((segment) => selected.includes(segment.index)),
    [data, selected],
  )

  const labels = new Set(chosen.map((s) => axisLabel(s, quantity, lang)))
  const mixed = labels.size > 1
  const faceted = chosen.length > OVERLAY_LIMIT || mixed
  const anyScattering = chosen.some(isScattering)

  const values = (segment: DataSegment) =>
    segmentValues(segment, quantity, fine?.[segment.index], scheme.pairs)

  const toSeries = (segment: DataSegment): ChartSeries => {
    const v = values(segment)
    return { label: segmentTitle(segment), points: v.points, curve: v.curve }
  }

  const toResiduals = (segment: DataSegment): ChartSeries => ({
    label: segmentTitle(segment),
    points: values(segment).residuals,
    curve: [],
  })

  // Which of the shown datasets have their model only at the measured
  // energies (said under the plot, so a straight line is not taken for physics).
  const pointwise = fineStatus === "ready" ? chosen.filter((s) => !fine?.[s.index]) : []

  const yLabel = chosen[0] ? axisLabel(chosen[0], quantity, lang) : ""

  // Announce the fit quality once a recalculation lands, for screen readers
  // (the plot itself is one image to them).
  const meanChi2 = useMemo(() => pooledChi2(chosen), [chosen])
  const allChi2 = useMemo(() => pooledChi2(data.filter((s) => s.active)), [data])
  const [announcement, setAnnouncement] = useState("")
  const wasCalculating = useRef(false)
  useEffect(() => {
    if (wasCalculating.current && !calculating && meanChi2 !== null) {
      setAnnouncement(t.chi2Status(decimal(meanChi2.toFixed(2), lang)))
    }
    wasCalculating.current = calculating
  }, [calculating, meanChi2, t, lang])

  const toggle = (index: number, checked: boolean) =>
    setSelected((current) =>
      checked ? [...current, index] : current.filter((i) => i !== index),
    )

  const plot =
    chosen.length === 0 ? (
      <Card>
        <CardContent className="flex h-[15rem] items-center justify-center text-center text-sm text-muted-foreground sm:h-[18rem] lg:h-[26rem]">
          {t.selectDataset}
        </CardContent>
      </Card>
    ) : faceted ? (
      <div className="grid content-start gap-4 xl:grid-cols-2">
        {chosen.map((segment) => (
          <Card key={segment.index}>
            <CardHeader className="pb-2">
              <CardTitle role="heading" aria-level={3} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{datasetName(segment)}</span>
                <span className="shrink-0 text-xs font-normal text-muted-foreground">
                  {qualifier(segment)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SegmentChart
                series={[toSeries(segment)]}
                xLabel={t.energyAxis}
                yLabel={axisLabel(segment, quantity, lang)}
                logX={logX}
                logY={logY}
                height={240}
                showLegend={false}
                ariaLabel={t.plotAria(axisLabel(segment, quantity, lang), segmentTitle(segment))}
              />
              {showResiduals && (
                <SegmentChart
                  series={[toResiduals(segment)]}
                  xLabel={t.energyAxis}
                  yLabel={t.residualAxis}
                  logX={logX}
                  logY={false}
                  height={130}
                  showLegend={false}
                  zeroLine
                  ariaLabel={t.residualAria(segmentTitle(segment))}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    ) : (
      <Card>
        <CardContent
          className={`p-2 sm:p-4 ${showResiduals ? "h-[12rem] sm:h-[15rem] lg:h-[20rem]" : "h-[15rem] sm:h-[18rem] lg:h-[26rem]"}`}
        >
          <SegmentChart
            series={chosen.map(toSeries)}
            xLabel={t.energyAxis}
            yLabel={yLabel}
            logX={logX}
            logY={logY}
            ariaLabel={t.plotAria(yLabel, chosen.map(segmentTitle).join("; "))}
          />
        </CardContent>
        {showResiduals && (
          <CardContent className="h-[7rem] border-t p-2 sm:h-[8rem] sm:p-4 lg:h-[9rem]">
            <SegmentChart
              series={chosen.map(toResiduals)}
              xLabel={t.energyAxis}
              yLabel={t.residualAxis}
              logX={logX}
              logY={false}
              showLegend={false}
              zeroLine
              compact
              ariaLabel={t.residualAria(chosen.map(segmentTitle).join("; "))}
            />
          </CardContent>
        )}
      </Card>
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="plot-quantity" className="text-xs">
            {t.quantity}
          </Label>
          <Select value={quantity} onValueChange={(value: Quantity) => setQuantity(value)}>
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
          <Switch id="logx" checked={logX} onCheckedChange={setLogX} />
          <Label htmlFor="logx" className="text-sm">
            {t.logEnergy}
          </Label>
        </div>
        <div className="flex min-h-10 items-center gap-2">
          <Switch id="logy" checked={logY} onCheckedChange={setLogY} />
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
        <span className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground" aria-hidden={!calculating}>
          {calculating && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t.recalculating}
            </>
          )}
        </span>
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
        {/* The plot column stays in view while the levels are edited: on a
            wide screen the whole column (fit status, plot, dataset list) is
            pinned and the levels panel scrolls in its own box beside it; on a
            phone the plot is pinned under the site header while the sliders
            scroll beneath it. Not when faceted -- a stack of panels is taller
            than the screen. */}
        <div
          // Below lg the column dissolves into the grid (display: contents), so
          // the pinned plot's containing block is the whole grid, levels
          // included, and it stays pinned while they scroll.
          className={`min-w-0 max-lg:contents lg:space-y-3 ${
            faceted ? "" : "lg:sticky lg:top-20 lg:self-start"
          }`}
        >
          <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border bg-card px-3 py-1.5 text-sm">
            <p className="tabular-nums">
              {meanChi2 !== null ? (
                <>
                  <span className="text-muted-foreground">{t.chi2Shown}</span>{" "}
                  <span className="font-semibold">{decimal(meanChi2.toFixed(2), lang)}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{t.chi2None}</span>
              )}
              {allChi2 !== null && (
                <span className="text-muted-foreground">
                  {" · "}
                  {t.chi2All} {decimal(allChi2.toFixed(2), lang)}
                </span>
              )}
            </p>
            <Button variant="outline" size="sm" onClick={onReset} disabled={calculating || !scheme.modified}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" aria-hidden />
              {t.reset}
            </Button>
          </div>

          <div
            className={
              faceted ? "min-w-0" : "sticky top-16 z-20 -mx-1 min-w-0 self-start bg-background px-1 pb-2 pt-1 lg:static lg:mx-0 lg:p-0"
            }
          >
            {plot}
          </div>

          {(fineStatus === "loading" || pointwise.length > 0) && chosen.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {fineStatus === "loading"
                ? t.fineLoading
                : t.finePointwise(pointwise.map(segmentTitle).join("; "))}
            </p>
          )}

          <details
            open={listOpen}
            onToggle={(event) => setListOpen((event.target as HTMLDetailsElement).open)}
            className="min-w-0 rounded-lg border bg-card"
          >
            <summary className="flex min-h-11 cursor-pointer select-none items-center px-4 text-sm font-semibold">
              {t.showDatasets(chosen.length)}
            </summary>
            <div className="grid max-h-80 gap-x-6 gap-y-2 overflow-y-auto border-t px-4 py-3 sm:grid-cols-2 lg:max-h-[min(15rem,calc(100vh-36rem))]">
              {data.map((segment) => (
                <div key={segment.index} className="flex items-start gap-2">
                  <Checkbox
                    id={`seg-${segment.index}`}
                    checked={selected.includes(segment.index)}
                    onCheckedChange={(checked) => toggle(segment.index, Boolean(checked))}
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor={`seg-${segment.index}`}
                    className="min-w-0 flex-1 cursor-pointer text-xs font-normal leading-tight"
                  >
                    <span className="block truncate font-medium">
                      {datasetName(segment)}
                      {qualifier(segment) && (
                        <span className="font-normal text-muted-foreground"> · {qualifier(segment)}</span>
                      )}
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
            </div>
          </details>
        </div>

        <Card className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <CardContent className="p-4 sm:p-5">
            <LevelControls
              scheme={scheme}
              onChange={onParameterChange}
              onReset={onReset}
              disabled={calculating}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
