"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { InlineMath } from "react-katex"
import "katex/dist/katex.min.css"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { SegmentChart, type ChartSeries } from "@/components/segment-chart"
import {
  extrapolationsCsvUrl,
  downloadLink,
  type DataSegment,
  type ExtrapSegment,
} from "@/lib/api"
import { OVERLAY_LIMIT, formatEnergy, observableLabel, quantityLabel } from "@/lib/viz"
import { useDict, useLang } from "@/components/lang-provider"

/**
 * Extrapolation curves, optionally with measured datasets overlaid for context,
 * and a CSV export of whatever is selected.
 *
 * The overlay/facet split is the same color constraint as the data plot: at
 * most OVERLAY_LIMIT series share one pair of axes.
 */

interface Props {
  extrapolations: ExtrapSegment[]
  data: DataSegment[] | null
  sessionId: string
  calculating: boolean
}

type Quantity = "sfactor" | "cross_section"

export function ExtrapPlot({
  extrapolations,
  data,
  sessionId,
  calculating,
}: Props) {
  const lang = useLang()
  const t = useDict().workspace
  const [selected, setSelected] = useState<number[]>([])
  const [overlaid, setOverlaid] = useState<number[]>([])
  const [quantity, setQuantity] = useState<Quantity>("sfactor")
  const [logX, setLogX] = useState(true)
  const [logY, setLogY] = useState(true)

  useEffect(() => {
    setSelected((current) => {
      if (current.length > 0) return current
      const first = extrapolations.find((s) => s.active) ?? extrapolations[0]
      return first ? [first.index] : []
    })
  }, [extrapolations])

  const chosen = useMemo(
    () => extrapolations.filter((s) => selected.includes(s.index)),
    [extrapolations, selected],
  )

  const chosenData = useMemo(
    () => (data ?? []).filter((s) => overlaid.includes(s.index)),
    [data, overlaid],
  )

  const curveSeries = (segment: ExtrapSegment): ChartSeries => {
    const energies = segment.energies ?? []
    const values =
      quantity === "sfactor"
        ? segment.calculated_sfactor
        : segment.calculated
    return {
      label: `${segment.name} (${observableLabel(segment.observable, lang)})`,
      points: [],
      curve: energies.map((x, i) => ({ x, y: values?.[i] ?? NaN })),
    }
  }

  const dataSeries = (segment: DataSegment): ChartSeries => {
    const energies = segment.energies ?? []
    const observed =
      quantity === "sfactor" ? segment.sfactor : segment.cross_sections
    const errors =
      quantity === "sfactor"
        ? segment.sfactor_errors
        : segment.cross_sections_errors
    return {
      label: segment.name,
      points: energies.map((x, i) => ({
        x,
        y: observed?.[i] ?? NaN,
        error: errors?.[i],
      })),
      curve: [],
    }
  }

  const series = useMemo(
    () => [...chosen.map(curveSeries), ...chosenData.map(dataSeries)],
    [chosen, chosenData, quantity, lang],
  )

  const overLimit = series.length > OVERLAY_LIMIT
  const observable = chosen[0]?.observable ?? "angle-integrated"

  return (
    <div className="space-y-4">
      {/* Toolbar outside the grid, so the row below holds only the plot and the
          extrapolation list and grid stretch makes them equal height. */}
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
            <Switch id="ex-logx" checked={logX} onCheckedChange={setLogX} />
            <Label htmlFor="ex-logx" className="text-sm">
              {t.logEnergy}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ex-logy" checked={logY} onCheckedChange={setLogY} />
            <Label htmlFor="ex-logy" className="text-sm">
              {t.logValue}
            </Label>
          </div>
          <Button asChild variant="outline" size="sm" disabled={chosen.length === 0}>
            <a {...downloadLink(extrapolationsCsvUrl(sessionId, selected), "extrapolations.csv")}>
              <Download className="mr-2 h-4 w-4" />
              {t.downloadCsv}
            </a>
          </Button>
          {calculating && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t.calculating}
            </span>
          )}
      </div>

      {overLimit && (
        <p className="text-xs text-muted-foreground">
          {t.facets(series.length, OVERLAY_LIMIT, "series")}
        </p>
      )}

      <div className="grid items-stretch gap-6 lg:grid-cols-[1fr_18rem]">
        {series.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              {t.selectExtrap}
            </CardContent>
          </Card>
        ) : overLimit ? (
          <div className="grid content-start gap-4 xl:grid-cols-2">
              {chosen.map((segment) => (
                <Card key={`x-${segment.index}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      <InlineMath math={segment.entrance} />
                      {" → "}
                      <InlineMath math={segment.exit} />
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {observableLabel(segment.observable, lang)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SegmentChart
                      series={[curveSeries(segment)]}
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
              {chosenData.map((segment) => (
                <Card key={`d-${segment.index}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {segment.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {t.measured}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SegmentChart
                      series={[dataSeries(segment)]}
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
                series={series}
                xLabel={t.energyAxis}
                yLabel={quantityLabel(quantity, observable, lang)}
                logX={logX}
                logY={logY}
              />
            </CardContent>
          </Card>
        )}

        {/* Absolute at lg so the list takes the plot's height without adding to
            it -- a long list scrolls rather than stretching the row. */}
        <div className="relative">
          <Card className="flex min-h-0 flex-col lg:absolute lg:inset-0">
            <CardHeader className="shrink-0 pb-3">
              <CardTitle className="text-base">{t.extrapolations}</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-2 pr-1">
              {extrapolations.map((segment) => (
                <div key={segment.index} className="flex items-start gap-2">
                  <Checkbox
                    id={`ex-${segment.index}`}
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
                    htmlFor={`ex-${segment.index}`}
                    className="flex-1 cursor-pointer text-xs font-normal leading-tight"
                  >
                    <span className="block font-medium">
                      <InlineMath math={segment.entrance} />
                      {" → "}
                      <InlineMath math={segment.exit} />
                    </span>
                    <span className="text-muted-foreground">
                      {observableLabel(segment.observable, lang)} ·{" "}
                      {formatEnergy(segment.energy_min)}–
                      {formatEnergy(segment.energy_max)} MeV
                      {!segment.is_angle_integrated &&
                        ` · ${segment.angle_min.toFixed(0)}°`}
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

      {/* Full width along the bottom: measured datasets are an optional
          comparison layer, so they get room to browse without crowding the
          extrapolation list that drives the plot. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.addMeasured}</CardTitle>
          <CardDescription>{t.addMeasuredText}</CardDescription>
        </CardHeader>
        <CardContent>
          {!data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t.openDataFirst}
            </p>
          ) : (
            <div className="grid max-h-72 gap-x-6 gap-y-2 overflow-y-auto pr-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {data.map((segment) => (
                <div key={segment.index} className="flex items-start gap-2">
                  <Checkbox
                    id={`ov-${segment.index}`}
                    checked={overlaid.includes(segment.index)}
                    onCheckedChange={(checked) =>
                      setOverlaid((current) =>
                        checked
                          ? [...current, segment.index]
                          : current.filter((i) => i !== segment.index),
                      )
                    }
                  />
                  <Label
                    htmlFor={`ov-${segment.index}`}
                    className="flex-1 cursor-pointer text-xs font-normal leading-tight"
                  >
                    <span className="block truncate font-medium">
                      {segment.name}
                    </span>
                    <span className="text-muted-foreground">
                      {formatEnergy(segment.energy_min)}–
                      {formatEnergy(segment.energy_max)} MeV
                    </span>
                  </Label>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
