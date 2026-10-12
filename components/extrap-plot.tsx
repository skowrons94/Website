"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Download, Loader2, ZoomOut } from "lucide-react"
import { Tex, texPlain } from "@/components/tex"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SegmentChart, type ChartBand, type ChartSeries } from "@/components/segment-chart"
import { extrapolationsCsvUrl, downloadLink, type DataSegment, type ExtrapSegment, type SchemePair } from "@/lib/api"
import { OVERLAY_LIMIT, formatEnergy, observableLabel, quantityLabel } from "@/lib/viz"
import { decimal, localePath } from "@/lib/i18n"
import { autoLog, axisLabel, pickUnit, quantityFor, rawValues, segmentTitle, segmentValues, sfactorUnit, type DisplayUnit } from "@/lib/eval-plot"
import { downloadPng, downloadSvg } from "@/lib/plot-export"
import { useDict, useLang } from "@/components/lang-provider"

/**
 * Extrapolation curves, optionally with measured datasets overlaid for context,
 * the Gamow window of a chosen temperature shaded behind them, and exports.
 *
 * Every energy here is centre-of-mass: the curves come from AZURE2 in that
 * frame, and the API converts the segments' own (laboratory) limits.
 *
 * The overlay/facet split is the same color constraint as the data plot: at
 * most OVERLAY_LIMIT series share one pair of axes.
 */

interface Props {
  /** The evaluation's headline reaction ("³He(α,γ)⁷Be"): the curve to open on. */
  headline?: string | null
  extrapolations: ExtrapSegment[]
  data: DataSegment[] | null
  pairs: SchemePair[]
  sessionId: string
  calculating: boolean
  evaluationId: string
}

type Quantity = "sfactor" | "cross_section"

/** Scattering has no S-factor; such curves are always drawn as dσ/dΩ. */
const scattering = (s: { entrance_key: number; exit_key: number; observable: string }) =>
  s.observable === "phase-shift" || s.entrance_key === s.exit_key

const TEMPERATURES = [0.01, 0.015, 0.02, 0.03, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 3]

/** Gamow peak and 1/e width (MeV) — the same expressions as the atlas (lib/atlas-core.mjs). */
function gamow(pair: SchemePair, T9: number) {
  const mu = (pair.M1 * pair.M2) / (pair.M1 + pair.M2)
  const z = pair.Z1 * pair.Z1 * pair.Z2 * pair.Z2 * mu
  return { E0: 0.122 * Math.cbrt(z * T9 * T9), width: 0.2368 * Math.pow(z * T9 ** 5, 1 / 6) }
}

export function ExtrapPlot({ headline, extrapolations, data, pairs, sessionId, calculating, evaluationId }: Props) {
  const lang = useLang()
  const t = useDict().workspace
  const [selected, setSelected] = useState<number[]>([])
  const [overlaid, setOverlaid] = useState<number[]>([])
  const [quantity, setQuantity] = useState<Quantity>("sfactor")
  const [logXOverride, setLogX] = useState<boolean | null>(null)
  const [logYOverride, setLogY] = useState<boolean | null>(null)
  const [T9, setT9] = useState<string>("0.1")
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  const [filter, setFilter] = useState("")
  const charts = useRef(new Map<string, SVGSVGElement>())

  useEffect(() => {
    setSelected((current) => {
      if (current.length > 0) return current
      // The headline reaction's entrance pair ("³He(α,γ)" → α + ³He), then the
      // first capture or reaction curve with values, angle-integrated if any.
      const m = headline ? /^(.+?)\((.+?),/.exec(headline) : null
      const entrance = m
        ? pairs.find((p) => {
            const parts = (p.label_plain ?? "").split(" + ")
            return parts.includes(m[1]) && parts.includes(m[2])
          })
        : undefined
      const ok = (s: ExtrapSegment) =>
        s.active && (s.energies?.length ?? 0) > 0 && (!entrance || s.entrance_key === entrance.number)
      const first =
        extrapolations.find((s) => ok(s) && !scattering(s) && s.is_angle_integrated && s.observable === "total-capture") ??
        extrapolations.find((s) => ok(s) && !scattering(s) && s.is_angle_integrated) ??
        extrapolations.find((s) => ok(s) && !scattering(s)) ??
        extrapolations.find(ok) ??
        extrapolations.find((s) => s.active && (s.energies?.length ?? 0) > 0) ??
        extrapolations[0]
      return first ? [first.index] : []
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrapolations])

  const chosen = useMemo(() => extrapolations.filter((s) => selected.includes(s.index)), [extrapolations, selected])
  const chosenData = useMemo(() => (data ?? []).filter((s) => overlaid.includes(s.index)), [data, overlaid])

  const curveQuantity = (s: ExtrapSegment): Quantity => (quantity === "sfactor" && !scattering(s) ? "sfactor" : "cross_section")
  const kind = (q: Quantity, observable: string) => `${q}|${observable.startsWith("differential") ? "d" : "i"}`

  // One display unit per kind of quantity, shared by curves and overlaid data.
  const units = useMemo(() => {
    const values = new Map<string, { q: Quantity; observable: string; v: number[] }>()
    const add = (q: Quantity, observable: string, v: number[]) => {
      const k = kind(q, observable)
      const e = values.get(k) ?? { q, observable, v: [] }
      e.v.push(...v)
      values.set(k, e)
    }
    for (const s of chosen) {
      const q = curveQuantity(s)
      const v = (q === "sfactor" ? s.calculated_sfactor : s.calculated) ?? []
      add(q, s.observable, v.filter((x): x is number => x !== null && Number.isFinite(x)))
    }
    for (const s of chosenData) add(quantityFor(s, quantity) as Quantity, s.observable, rawValues(s, quantity))
    const out = new Map<string, DisplayUnit>()
    for (const [k, e] of values) out.set(k, pickUnit(e.q, e.observable, e.v))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, chosenData, quantity])
  const unitFor = (q: Quantity, observable: string) => units.get(kind(q, observable)) ?? { factor: 1, unit: "" }

  // "p + ²²Ne → γ₀ (…)": the entrance pair with both its nuclei.
  const pairName = (key: number, fallback: string) => {
    const pair = pairs.find((p) => p.number === key)
    return pair && !pair.is_photon && pair.label_plain ? pair.label_plain : texPlain(fallback)
  }
  const curveLabel = (segment: ExtrapSegment) =>
    segment.exit_key === -1
      ? `${pairName(segment.entrance_key, segment.entrance)} (${observableLabel(segment.observable, lang)})`
      : `${pairName(segment.entrance_key, segment.entrance)} → ${pairName(segment.exit_key, segment.exit)} (${observableLabel(segment.observable, lang)}${
          segment.is_angle_integrated ? "" : `, ${Number(segment.angle_min.toFixed(1))}°`
        })`

  const curveSeries = (segment: ExtrapSegment, slot: number): ChartSeries => {
    const q = curveQuantity(segment)
    const k = unitFor(q, segment.observable).factor
    const energies = segment.energies ?? []
    const values = q === "sfactor" ? segment.calculated_sfactor : segment.calculated
    return {
      label: curveLabel(segment),
      slot,
      points: [],
      curve: energies.map((x, i) => ({ x, y: (values?.[i] ?? NaN) * k })),
    }
  }

  const dataSeries = (segment: DataSegment, slot: number): ChartSeries => {
    const q = quantityFor(segment, quantity)
    const v = segmentValues(segment, quantity, undefined, pairs, unitFor(q as Quantity, segment.observable))
    return { label: segmentTitle(segment, lang), slot, points: v.points, curve: [] }
  }

  const series = useMemo(
    () => [...chosen.map((s, i) => curveSeries(s, i)), ...chosenData.map((s, i) => dataSeries(s, chosen.length + i))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosen, chosenData, quantity, lang, units],
  )

  // Linear or logarithmic from what is shown, unless the reader chose.
  const logX = logXOverride ?? autoLog(series.flatMap((s) => [...s.curve.map((p) => p.x), ...s.points.map((p) => p.x)]), 20)
  const logY = logYOverride ?? autoLog(series.flatMap((s) => [...s.curve.map((p) => p.y), ...s.points.map((p) => p.y)]), 10)

  const labelOf = (s: ExtrapSegment) => quantityLabel(curveQuantity(s), s.observable, lang, unitFor(curveQuantity(s), s.observable).unit)
  const labels = new Set([...chosen.map(labelOf), ...chosenData.map((s) => axisLabel(s, quantity, lang, unitFor(quantityFor(s, quantity) as Quantity, s.observable)))])
  const mixed = labels.size > 1
  const overLimit = series.length > OVERLAY_LIMIT || mixed
  const yLabel = [...labels][0] ?? ""
  const yUnit = chosen[0] ? unitFor(curveQuantity(chosen[0]), chosen[0].observable).unit : ""

  // The Gamow window of the entrance channel of the (first) charged-particle curve.
  const gamowPair = useMemo(() => {
    const s = chosen.find((c) => !scattering(c)) ?? chosenData.find((d) => !scattering(d))
    const pair = s ? pairs.find((p) => p.number === s.entrance_key) : undefined
    return pair && !pair.is_photon && pair.Z1 > 0 && pair.Z2 > 0 ? pair : null
  }, [chosen, chosenData, pairs])
  const gw = gamowPair && T9 !== "off" ? gamow(gamowPair, Number(T9)) : null
  const bands: ChartBand[] = gw
    ? [{ x0: Math.max(gw.E0 - gw.width / 2, 1e-6), x1: gw.E0 + gw.width / 2, label: t.gamowBand(decimal(T9, lang)) }]
    : []

  // The number an astrophysicist wants out: the S-factor at the lowest energy
  // of each selected capture/reaction curve, read off the curve. It is S(0)
  // only as far as that energy is ~0, so it is labelled S(E_min).
  const lowest = chosen
    .filter((s) => !scattering(s) && s.is_angle_integrated)
    .map((s) => {
      const energies = s.energies ?? []
      const values = s.calculated_sfactor ?? []
      let i = 0
      while (i < energies.length && !(Number.isFinite(values[i] ?? NaN) && (values[i] ?? 0) > 0)) i++
      return i < energies.length ? { segment: s, energy: energies[i], value: values[i] as number } : null
    })
    .filter((v): v is { segment: ExtrapSegment; energy: number; value: number } => v !== null)
  const marks =
    quantity === "sfactor" && !overLimit
      ? lowest.map((l) => ({ x: l.energy, y: l.value * unitFor("sfactor", l.segment.observable).factor, label: "S(Eₘᵢₙ)" }))
      : []

  const fmt = (v: number) => decimal(String(Number(v.toPrecision(3))), lang)
  const exportCharts = () => [...charts.current.values()]
  const refFor = (key: string) => ({
    get current() {
      return charts.current.get(key) ?? null
    },
    set current(el: SVGSVGElement | null) {
      if (el) charts.current.set(key, el)
      else charts.current.delete(key)
    },
  })

  const listed = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle || !data) return data ?? []
    return data.filter((s) => segmentTitle(s, lang).toLowerCase().includes(needle))
  }, [data, filter, lang])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ex-quantity" className="text-xs">
            {t.quantity}
          </Label>
          <Select value={quantity} onValueChange={(value: Quantity) => setQuantity(value)}>
            <SelectTrigger id="ex-quantity" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sfactor">{t.sfactor}</SelectItem>
              <SelectItem value="cross_section">{t.crossSection}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ex-t9" className="text-xs">
            {t.gamowTemperature}
          </Label>
          <Select value={T9} onValueChange={setT9} disabled={!gamowPair}>
            <SelectTrigger id="ex-t9" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">{t.gamowOff}</SelectItem>
              {TEMPERATURES.map((v) => (
                <SelectItem key={v} value={String(v)}>
                  T₉ = {decimal(String(v), lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-h-10 items-center gap-2">
          <Switch id="ex-logx" checked={logX} onCheckedChange={setLogX} />
          <Label htmlFor="ex-logx" className="text-sm">
            {t.logEnergy}
          </Label>
        </div>
        <div className="flex min-h-10 items-center gap-2">
          <Switch id="ex-logy" checked={logY} onCheckedChange={setLogY} />
          <Label htmlFor="ex-logy" className="text-sm">
            {t.logValue}
          </Label>
        </div>
        <div className="flex min-h-10 flex-wrap items-center gap-1" role="group" aria-label={t.save}>
          <span className="mr-1 text-xs text-muted-foreground">
            <Download className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            {t.save}
          </span>
          <Button variant="outline" size="sm" className="h-8 px-2.5" disabled={series.length === 0} onClick={() => downloadSvg(exportCharts(), `${evaluationId}_extrapolations.svg`)}>
            SVG
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2.5" disabled={series.length === 0} onClick={() => downloadPng(exportCharts(), `${evaluationId}_extrapolations.png`)}>
            PNG
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 px-2.5" disabled={chosen.length === 0}>
            <a {...downloadLink(extrapolationsCsvUrl(sessionId, selected), `${evaluationId}_extrapolations.csv`)}>CSV</a>
          </Button>
        </div>
        {calculating && (
          <span className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {t.calculating}
          </span>
        )}
      </div>

      {overLimit && <p className="text-xs text-muted-foreground">{mixed ? t.mixedNote : t.facets(series.length, OVERLAY_LIMIT, "series")}</p>}

      <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="relative min-w-0">
          {series.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">{t.selectExtrap}</CardContent>
            </Card>
          ) : overLimit ? (
            <div className="grid content-start gap-3 sm:grid-cols-2">
              {series.map((s, i) => {
                const segment = i < chosen.length ? chosen[i] : null
                const d = segment ? null : chosenData[i - chosen.length]
                const label = segment ? labelOf(segment) : axisLabel(d!, quantity, lang, unitFor(quantityFor(d!, quantity) as Quantity, d!.observable))
                return (
                  <figure key={s.label} className="min-w-0 rounded-md border bg-card px-1 pb-1 pt-2">
                    <figcaption className="truncate px-2 text-xs font-medium">
                      {s.label}
                      {!segment && <span className="ml-2 font-normal text-muted-foreground">{t.measured}</span>}
                    </figcaption>
                    <SegmentChart
                      series={[{ ...s, slot: 0 }]}
                      xLabel={t.energyAxis}
                      yLabel={label}
                      logX={logX}
                      logY={logY}
                      height={210}
                      xDomain={zoom}
                      onXDomain={setZoom}
                      bands={bands}
                      colouredCurves
                      yUnit={unitFor(segment ? curveQuantity(segment) : (quantityFor(d!, quantity) as Quantity), (segment ?? d!).observable).unit}
                      svgRef={refFor(`f${i}`)}
                      ariaLabel={t.plotAria(label, s.label)}
                    />
                  </figure>
                )
              })}
            </div>
          ) : (
            <Card className="flex flex-col overflow-hidden">
              <ul className="flex flex-wrap gap-x-4 gap-y-1 px-3 pt-3 text-xs" aria-label={t.keyLabel}>
                {series.map((s, i) => (
                  <li key={s.label} className="flex min-w-0 items-center gap-1.5">
                    {s.points.length > 0 ? (
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--viz-series-${i + 1})` }} aria-hidden />
                    ) : (
                      <span className="inline-block h-0.5 w-4 shrink-0" style={{ background: `var(--viz-series-${i + 1})` }} aria-hidden />
                    )}
                    <span className="truncate">{s.label}</span>
                  </li>
                ))}
              </ul>
              <CardContent className={`h-[18rem] max-h-[55svh] min-h-[12rem] p-1.5 sm:p-3 lg:h-[26rem] lg:max-h-none ${calculating ? "opacity-45" : ""}`}>
                <SegmentChart
                  series={series}
                  xLabel={t.energyAxis}
                  yLabel={yLabel}
                  logX={logX}
                  logY={logY}
                  xDomain={zoom}
                  onXDomain={setZoom}
                  bands={bands}
                  marks={marks}
                  colouredCurves
                  yUnit={yUnit}
                  svgRef={refFor("main")}
                  ariaLabel={t.plotAria(yLabel, series.map((s) => s.label).join("; "))}
                />
              </CardContent>
            </Card>
          )}
          {zoom && (
            <Button variant="secondary" size="sm" className="absolute right-2 top-2 h-7 px-2 text-xs" onClick={() => setZoom(null)}>
              <ZoomOut className="mr-1 h-3.5 w-3.5" aria-hidden />
              {t.resetZoom}
            </Button>
          )}
          {gw && gamowPair && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t.gamowNote(
                decimal(T9, lang),
                `${fmt(gw.E0 * 1000)} keV`,
                `${fmt(gw.width * 1000)} keV`,
                gamowPair.label_plain ?? texPlain(gamowPair.label),
              )}{" "}
              <a href={`${localePath(lang, "/glossary")}#gamow-window`} className="text-link underline-offset-4 hover:underline">
                {t.glossaryLink}
              </a>
            </p>
          )}
        </div>

        {/* Absolute at lg so the list takes the plot's height without adding to
            it -- a long list scrolls rather than stretching the row. */}
        <div className="relative">
          <Card className="flex min-h-0 flex-col lg:absolute lg:inset-0">
            <CardHeader className="shrink-0 pb-3">
              <CardTitle role="heading" aria-level={3} className="text-base">
                {t.extrapolations}
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 min-h-0 flex-1 overflow-y-auto pb-4 lg:max-h-none">
              <div className="space-y-2 pr-1">
                {extrapolations.map((segment) => (
                  <div key={segment.index} className="flex items-start gap-2">
                    <Checkbox
                      id={`ex-${segment.index}`}
                      checked={selected.includes(segment.index)}
                      disabled={!segment.energies?.length}
                      onCheckedChange={(checked) =>
                        setSelected((current) => (checked ? [...current, segment.index] : current.filter((i) => i !== segment.index)))
                      }
                    />
                    <Label htmlFor={`ex-${segment.index}`} className="flex-1 cursor-pointer text-xs font-normal leading-tight">
                      <span className="block font-medium">
                        <Tex math={segment.entrance} />
                        {segment.exit_key !== -1 && (
                          <>
                            {" → "}
                            <Tex math={segment.exit} />
                          </>
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        {observableLabel(segment.observable, lang)} · {decimal(formatEnergy(segment.energy_min), lang)}–
                        {decimal(formatEnergy(segment.energy_max), lang)} MeV{segment.energy_frame === "cm" ? " (c.m.)" : ""}
                        {!segment.is_angle_integrated && ` · ${segment.angle_min.toFixed(0)}°`}
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

      {lowest.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4 text-sm sm:p-5">
            <ul className="space-y-1">
              {lowest.map(({ segment, energy, value }) => {
                const u = sfactorUnit(value)
                return (
                  <li key={segment.index} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-muted-foreground">
                      {curveLabel(segment)}:
                    </span>
                    <span className="tabular-nums">
                      S(E<sub>min</sub> = {fmt(energy * 1000)} keV) ={" "}
                      <span className="font-semibold">
                        {fmt(value * u.factor)} {u.unit}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-muted-foreground">{t.sZeroNote}</p>
            <p className="text-xs text-muted-foreground">{t.rateNote}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle role="heading" aria-level={3} className="text-base">
            {t.addMeasured}
          </CardTitle>
          <CardDescription>{t.addMeasuredText}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.openDataFirst}</p>
          ) : (
            <>
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.filterDatasets} aria-label={t.filterDatasets} className="h-9 sm:w-72" />
              <div className="grid max-h-72 gap-x-6 gap-y-2 overflow-y-auto pb-2 pr-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {listed.map((segment) => (
                  <div key={segment.index} className="flex items-start gap-2">
                    <Checkbox
                      id={`ov-${segment.index}`}
                      checked={overlaid.includes(segment.index)}
                      onCheckedChange={(checked) =>
                        setOverlaid((current) => (checked ? [...current, segment.index] : current.filter((i) => i !== segment.index)))
                      }
                    />
                    <Label htmlFor={`ov-${segment.index}`} className="min-w-0 flex-1 cursor-pointer text-xs font-normal leading-tight">
                      <span className="block truncate font-medium">{segmentTitle(segment, lang)}</span>
                      <span className="text-muted-foreground">χ²/N {segment.chi2 === null ? "—" : decimal(segment.chi2.toFixed(1), lang)}</span>
                    </Label>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
