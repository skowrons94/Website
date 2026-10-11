"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { InlineMath } from "react-katex"
import "katex/dist/katex.min.css"

import { Badge } from "@/components/ui/badge"
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
import type { DataSegment, Scheme } from "@/lib/api"
import { OVERLAY_LIMIT, observableLabel, quantityLabel } from "@/lib/viz"
import { useDict, useLang } from "@/components/lang-provider"

/**
 * The interactive tab: measured data with the model overlaid, beside sliders
 * for the free parameters.
 *
 * Above OVERLAY_LIMIT selected datasets the layout switches from one shared
 * pair of axes to small multiples. That is a color constraint, not a
 * preference — only three categorical hues clear the all-pairs colorblind floor
 * (see lib/viz.ts), so a fourth overlaid dataset could not be told apart. In
 * facet mode each panel carries a single dataset and takes its identity from
 * the panel title.
 */

interface Props {
  data: DataSegment[]
  scheme: Scheme
  calculating: boolean
  onParameterChange: (updates: Record<number, number>) => void
  onReset: () => void
}

type Quantity = "sfactor" | "cross_section"

export function DataPlot({
  data,
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

  // Start with the first dataset so the tab is never an empty frame.
  useEffect(() => {
    setSelected((current) => {
      if (current.length > 0) return current
      return data.length > 0 ? [data[0].index] : []
    })
  }, [data])

  const chosen = useMemo(
    () => data.filter((segment) => selected.includes(segment.index)),
    [data, selected],
  )

  const faceted = chosen.length > OVERLAY_LIMIT

  const toSeries = (segment: DataSegment): ChartSeries => {
    const energies = segment.energies ?? []
    const observed =
      quantity === "sfactor" ? segment.sfactor : segment.cross_sections
    const errors =
      quantity === "sfactor"
        ? segment.sfactor_errors
        : segment.cross_sections_errors
    const model =
      quantity === "sfactor" ? segment.calculated_sfactor : segment.calculated

    return {
      label: segment.name,
      points: energies.map((x, i) => ({
        x,
        y: observed?.[i] ?? NaN,
        error: errors?.[i],
      })),
      curve: energies.map((x, i) => ({ x, y: model?.[i] ?? NaN })),
    }
  }

  const observable = chosen[0]?.observable ?? "angle-integrated"
  const yLabel = quantityLabel(quantity, observable, lang)

  return (
    <div className="space-y-4">
      {/* The toolbar sits outside the grid so the row below contains only the
          plot and the dataset list -- that way grid stretch alone makes the two
          exactly the same height, with no hard-coded chart dimension. */}
      <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t.quantity}</Label>
            <Select
              value={quantity}
              onValueChange={(value: Quantity) => setQuantity(value)}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sfactor">{t.sfactor}</SelectItem>
                <SelectItem value="cross_section">{t.crossSection}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="logx" checked={logX} onCheckedChange={setLogX} />
            <Label htmlFor="logx" className="text-sm">
              {t.logEnergy}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="logy" checked={logY} onCheckedChange={setLogY} />
            <Label htmlFor="logy" className="text-sm">
              {quantity === "sfactor" ? t.logSfactor : t.logCrossSection}
            </Label>
          </div>
          {calculating && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t.recalculating}
            </span>
          )}
      </div>

      {faceted && (
        <p className="text-xs text-muted-foreground">
          {t.facets(chosen.length, OVERLAY_LIMIT, "datasets")}
        </p>
      )}

      <div className="grid items-stretch gap-6 lg:grid-cols-[1fr_18rem]">
        {chosen.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              {t.selectDataset}
            </CardContent>
          </Card>
        ) : faceted ? (
          <div className="grid content-start gap-4 xl:grid-cols-2">
              {chosen.map((segment) => (
                <Card key={segment.index}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-baseline justify-between text-sm">
                      <span className="truncate">{segment.name}</span>
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        <InlineMath math={segment.entrance} />
                        {" → "}
                        <InlineMath math={segment.exit} />
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SegmentChart
                      series={[toSeries(segment)]}
                      xLabel={t.energyAxis}
                      yLabel={quantityLabel(quantity, segment.observable, lang)}
                      logX={logX}
                      logY={logY}
                      height={240}
                      showLegend={false}
                    />
                  </CardContent>
                </Card>
            ))}
          </div>
        ) : (
          <Card className="flex flex-col">
            <CardContent className="flex-1 pt-6">
              <SegmentChart
                series={chosen.map(toSeries)}
                xLabel={t.energyAxis}
                yLabel={yLabel}
                logX={logX}
                logY={logY}
              />
            </CardContent>
          </Card>
        )}

        {/* Matches the plot's height exactly: absolute positioning takes the
            row height without *contributing* to it, so a long list (7Be has 93
            datasets) scrolls instead of stretching the row past the plot. Below
            lg the card is static and flows normally. */}
        <div className="relative">
          <Card className="flex min-h-0 flex-col lg:absolute lg:inset-0">
            <CardHeader className="shrink-0 pb-3">
              <CardTitle className="text-base">{t.datasets}</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-2 pr-1">
              {data.map((segment) => (
                <div key={segment.index} className="flex items-start gap-2">
                  <Checkbox
                    id={`seg-${segment.index}`}
                    checked={selected.includes(segment.index)}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...current, segment.index]
                          : current.filter((i) => i !== segment.index),
                      )
                    }
                  />
                  <Label
                    htmlFor={`seg-${segment.index}`}
                    className="flex-1 cursor-pointer text-xs font-normal leading-tight"
                  >
                    <span className="block truncate font-medium">
                      {segment.name}
                    </span>
                    <span className="text-muted-foreground">
                      {observableLabel(segment.observable, lang)}
                      {segment.chi2 !== null &&
                        ` · χ²/N ${segment.chi2.toFixed(1)}`}
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
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Full width along the bottom: the sliders get room to lay out in a
          grid, and dragging one keeps the plot above it in view. */}
      <Card>
        <CardContent className="pt-6">
          <LevelControls
            scheme={scheme}
            onChange={onParameterChange}
            onReset={onReset}
            disabled={calculating}
          />
        </CardContent>
      </Card>
    </div>
  )
}
