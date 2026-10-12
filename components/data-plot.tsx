"use client"

import { startTransition, useEffect, useMemo, useRef, useState } from "react"
import { Download, Redo2, RotateCcw, SlidersHorizontal, Undo2, ZoomOut } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LevelControls } from "@/components/level-controls"
import { ProgressTimer, type Stage } from "@/components/evaluation-progress"
import type { Activity } from "@/contexts/session-context"
import { EXTENSION_OPACITY, SegmentChart, extensionDash, type ChartSeries } from "@/components/segment-chart"
import { DataTable } from "@/components/data-table"
import { Sci } from "@/components/sci"
import type { DataSegment, FineCurve, Scheme } from "@/lib/api"
import {
  angleText,
  autoLog,
  axisLabel,
  chi2Text,
  datasetName,
  energyText,
  hasRutherford,
  isScattering,
  pickUnit,
  plotCsv,
  pooledChi2,
  qualifier,
  quantityFor,
  rawValues,
  reactionText,
  segmentTitle,
  segmentValues,
  xKind,
  type DisplayUnit,
  type Quantity,
} from "@/lib/eval-plot"
import { levelKey } from "@/lib/level-layout"
import { downloadPng, downloadSvg, downloadText } from "@/lib/plot-export"
import { OVERLAY_LIMIT, observableLabel, seriesShape } from "@/lib/viz"
import { useLang } from "@/components/lang-context"
import { useEvalDict } from "@/components/eval-dict"
import { decimal } from "@/lib/i18n-eval"
import { localePath } from "@/lib/locale"

/**
 * The interactive view: measured data with the model overlaid, beside sliders
 * for the free parameters, and below them the table of every dataset.
 *
 * Panels: the selection is grouped by reaction and observable, one panel per
 * group (one ³He(α,γ) panel however many experiments measured it); panels of
 * one kind share their energy axis, each keeps its own vertical scale, and an
 * angular distribution always has a panel of its own. One group: one large
 * plot. Within a panel at most OVERLAY_LIMIT datasets get their own hue (a
 * colour constraint, lib/viz.ts); beyond it they share one.
 *
 * The model: one line per distinct calculation (same channels, observable and
 * angle), not one per dataset -- the datasets of one reaction measure the same
 * curve, and the server sends it once (server/app/fine.py). It is calculated
 * on a grid that runs from well below the lowest measurement to above the
 * highest, resonances resolved, so it runs on across the gaps between the
 * selected datasets (¹³N: 0.19–0.33 MeV between Bailey and Burtebaev) and
 * beyond them: solid over the shown data's range, dashed and lighter outside
 * it ("Extend beyond data", on by default, which also widens the energy axis).
 * After an edit the previous curve stays up, faded, until the new one comes.
 *
 * Layout: on a wide screen the plot and the level sliders sit side by side,
 * the sliders scrolling in their own column so the plot never leaves view; on
 * a phone the plot comes first and is pinned under the site header (offset
 * `--header-h`, which the header sets) with the χ² beneath it while the
 * sliders scroll -- on a screen tall enough for both -- and the view settings
 * are folded behind a "View" button.
 */

interface Props {
  data: DataSegment[]
  /** The model on a fine grid, by segment index (null: not loaded yet). */
  fine: Record<number, FineCurve> | null
  fineStatus: "idle" | "loading" | "ready" | "failed"
  /** The fine curves are those of the parameters before the last edit (faded until the new ones arrive). */
  fineStale?: boolean
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
  /** What the plot waits for, for the progress timer (null: nothing). */
  activity?: Activity | null
  stage?: Stage
  /** The server is full: when the page tries again. */
  retryAt?: number | null
  /** The session is open (false: the shipped curves, edits wait for it). */
  live?: boolean
}

type Point = { x: number; y: number }
interface Model {
  key: string
  label: string
  /** The model over the shown data's range (solid). */
  curve: Point[]
  /** The model beyond it, below and above (dashed; empty when not extended). */
  extension: Point[]
  original?: Point[]
}
interface Panel {
  key: string
  segments: DataSegment[]
  angle: boolean
}

const DASHES = ["", "7 4", "2 3"]

/** Same channels, observable and angle (or energy, for an angular distribution): the same calculated curve. */
function modelKey(s: DataSegment): string {
  const kind = xKind(s)
  return `${s.entrance_key}|${s.exit_key}|${s.observable}|${kind}|${kind === "angle" ? energyText(s, "en") : angleText(s)}`
}

/** Curves of one function, merged by x; broken where no curve covers a stretch. */
function unionCurve(curves: Point[][]): Point[] {
  const all = curves.flat().filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (all.length === 0) return []
  all.sort((a, b) => a.x - b.x)
  const log = all[0].x > 0
  const f = (x: number) => (log ? Math.log10(x) : x)
  const span = f(all[all.length - 1].x) - f(all[0].x) || 1
  // The furthest any one curve's own points are apart, as a measure of what
  // a gap is: a stretch wider than that and than 4 % of the range is a hole.
  let step = 0
  for (const c of curves) {
    const xs = c.map((p) => p.x).filter(Number.isFinite).sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++) step = Math.max(step, f(xs[i]) - f(xs[i - 1]))
  }
  const hole = Math.max(0.04 * span, 1.5 * step)
  const out: Point[] = [all[0]]
  for (let i = 1; i < all.length; i++) {
    const p = all[i]
    const last = out[out.length - 1]
    if (p.x === last.x) continue
    if (Number.isFinite(last.x) && f(p.x) - f(last.x) > hole) out.push({ x: NaN, y: NaN })
    out.push(p)
  }
  return out
}

/** y at x on a curve sorted by x (linear interpolation), NaN outside it. */
function at(curve: Point[], x: number): number {
  let lo = 0
  let hi = curve.length - 1
  if (hi < 0 || x < curve[0].x || x > curve[hi].x) return NaN
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (curve[mid].x <= x) lo = mid
    else hi = mid
  }
  const a = curve[lo]
  const b = curve[hi]
  return b.x === a.x ? a.y : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y)
}

/**
 * A model curve split at the shown data's range [lo, hi]: the part over it,
 * and the parts below and above (joined by a break), meeting it at the same
 * interpolated points. Beyond the data the extension is kept only while it
 * stays within `ratio` of the data's values either way (a cross section
 * falling through twenty decades towards the stellar energies is not worth
 * the vertical scale it would take).
 */
function cut(curve: Point[], lo: number, hi: number, band: [number, number] | null, ratio = 1e3) {
  const ok = curve.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x)
  if (ok.length === 0 || !(hi >= lo)) return { inside: ok, outside: [] as Point[] }
  const yLo = at(ok, lo)
  const yHi = at(ok, hi)
  const inside = ok.filter((p) => p.x > lo && p.x < hi)
  if (Number.isFinite(yLo)) inside.unshift({ x: lo, y: yLo })
  if (Number.isFinite(yHi) && hi > lo) inside.push({ x: hi, y: yHi })
  const keep = (y: number) => !band || (y >= band[0] / ratio && y <= band[1] * ratio)
  const below: Point[] = []
  for (let i = ok.length - 1; i >= 0; i--) {
    const p = ok[i]
    if (p.x >= lo) continue
    if (!keep(p.y)) break
    below.unshift(p)
  }
  const above: Point[] = []
  for (const p of ok) {
    if (p.x <= hi) continue
    if (!keep(p.y)) break
    above.push(p)
  }
  const outside: Point[] = []
  if (below.length) outside.push(...below, ...(Number.isFinite(yLo) ? [{ x: lo, y: yLo }] : []))
  if (above.length) {
    if (outside.length) outside.push({ x: NaN, y: NaN })
    outside.push(...(Number.isFinite(yHi) ? [{ x: hi, y: yHi }] : []), ...above)
  }
  return { inside, outside }
}

export function DataPlot({
  data,
  fine,
  fineStatus,
  fineStale = false,
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
  activity = null,
  stage = "edit",
  retryAt = null,
  live = true,
}: Props) {
  const lang = useLang()
  const t = useEvalDict().workspace
  const lv = useEvalDict().live
  const [logXOverride, setLogX] = useState<boolean | null>(null)
  const [logYOverride, setLogY] = useState<boolean | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [showResiduals, setShowResiduals] = useState(false)
  // The model beyond the shown data (dashed), and the axis widened to it.
  const [extend, setExtend] = useState(true)
  const [filter, setFilter] = useState("")
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  const canRutherford = useMemo(() => data.some(hasRutherford), [data])
  const charts = useRef(new Map<string, SVGSVGElement | null>())

  // The dataset list starts open where there is room for it, and when it is
  // short: a long one (120 on ⁷Be) would stand between a keyboard and the sliders.
  useEffect(() => {
    setListOpen(window.matchMedia("(min-width: 1024px)").matches && data.length <= 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // View switches redraw every panel: as transitions, so the switch itself paints at once.
  const later =
    <T,>(set: (value: T) => void) =>
    (value: T) =>
      startTransition(() => set(value))

  const chosen = useMemo(() => data.filter((segment) => selected.includes(segment.index)), [data, selected])
  const selectionKey = selected.join(",")
  // A new selection or quantity starts from the automatic axes, unzoomed.
  useEffect(() => {
    setLogX(null)
    setLogY(null)
    setZoom(null)
  }, [selectionKey, quantity])

  // One unit per kind of quantity (keV b, b vs μb …).
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

  // Panels: one per reaction and observable; one per angular distribution.
  const panels = useMemo<Panel[]>(() => {
    const map = new Map<string, DataSegment[]>()
    for (const s of chosen) {
      const angle = xKind(s) === "angle"
      const key = angle ? `a${s.index}` : `${kindOf(s)}|${s.reaction ?? s.entrance_key}|${s.exit_key}`
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return [...map.entries()].map(([key, segments]) => ({ key, segments, angle: key.startsWith("a") }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, quantity])
  const faceted = panels.length > 1
  const anyScattering = chosen.some(isScattering)

  const values = useMemo(() => {
    const out = new Map<number, ReturnType<typeof segmentValues>>()
    for (const s of chosen) out.set(s.index, segmentValues(s, quantity, fine?.[s.index], scheme.pairs, unitOf(s)))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, quantity, fine, scheme.pairs, units])

  /** The model lines of a panel: one per calculation, see the comment at the top. */
  const modelsFor = (segments: DataSegment[]): Model[] => {
    // A dataset whose own energy shift moves its curve has a line of its own.
    const keyOf = (s: DataSegment, fineMap: Record<number, FineCurve> | null) =>
      fineMap?.[s.index]?.shift ? `${modelKey(s)}@${s.index}` : modelKey(s)
    const keys = [...new Set(segments.map((s) => keyOf(s, fine)))]
    const out: Model[] = []
    // The calculation's curve: every segment of this kind shares it (one
    // per distinct server-side curve; more than one only from an older API).
    const lineOf = (key: string, list: DataSegment[] | null, fineMap: Record<number, FineCurve> | null, unit: DisplayUnit) => {
      if (!list) return null
      const seen = new Set<FineCurve>()
      const smooth = list.filter((s) => {
        const c = keyOf(s, fineMap) === key ? fineMap?.[s.index] : undefined
        if (!c || seen.has(c)) return false
        seen.add(c)
        return true
      })
      if (smooth.length === 0) return null
      const curves = smooth.map((s) => segmentValues(s, quantity, fineMap![s.index], scheme.pairs, unit).curve)
      return curves.length === 1 ? curves[0] : unionCurve(curves)
    }
    const pointwise = (list: DataSegment[], unit: DisplayUnit) =>
      unionCurve(list.map((s) => segmentValues(s, quantity, undefined, scheme.pairs, unit).curve))
    for (const key of keys) {
      const here = segments.filter((s) => keyOf(s, fine) === key)
      const unit = unitOf(here[0])
      const qualifierOf = (s: DataSegment) =>
        key.includes("@") ? datasetName(s) : xKind(s) === "angle" ? energyText(s, lang) : angleText(s, lang)
      // The shown data's range along x, and the span of their values.
      let lo = Infinity
      let hi = -Infinity
      let yMin = Infinity
      let yMax = -Infinity
      for (const s of here)
        for (const p of values.get(s.index)!.points) {
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
          lo = Math.min(lo, p.x)
          hi = Math.max(hi, p.x)
          if (p.y > 0) {
            yMin = Math.min(yMin, p.y)
            yMax = Math.max(yMax, p.y)
          }
        }
      const band: [number, number] | null = Number.isFinite(yMin) ? [yMin, yMax] : null
      const extendable = xKind(here[0]) !== "angle" && Number.isFinite(lo)
      const split = (curve: Point[]) => {
        if (!extendable) return { inside: curve, outside: [] as Point[] }
        const { inside, outside } = cut(curve, lo, hi, band)
        return { inside, outside: extend ? outside : [] }
      }
      // The published fit, faint: over the same stretch as the model.
      const whole = (curve: Point[] | null) => {
        if (!curve) return undefined
        if (!extendable) return curve
        const { inside, outside } = cut(curve, lo, hi, band)
        if (!extend) return inside
        return [...outside.filter((p) => p.x < lo), ...inside, ...outside.filter((p) => p.x > hi)]
      }
      const curve = lineOf(key, data, fine, unit)
      const before = scheme.modified ? lineOf(key, initialData, initialFine, unit) : null
      const initialHere = (initialData ?? []).filter((s) => here.some((h) => h.index === s.index))
      if (curve) {
        const { inside, outside } = split(curve)
        out.push({ key, label: qualifierOf(here[0]), curve: inside, extension: outside, original: whole(before) })
        // A selected dataset whose model is not the plain calculation (AZURE2
        // folds it with the target or the detector): its own line.
        if (fineStatus === "ready")
          for (const s of here.filter((s) => !fine?.[s.index]))
            out.push({
              key: `${key}#${s.index}`,
              label: datasetName(s),
              curve: pointwise([s], unit),
              extension: [],
              original: scheme.modified ? pointwise(initialHere.filter((i) => i.index === s.index), unit) : undefined,
            })
      } else {
        out.push({
          key,
          label: qualifierOf(here[0]),
          curve: pointwise(here, unit),
          extension: [],
          original: scheme.modified && initialHere.length ? pointwise(initialHere, unit) : undefined,
        })
      }
    }
    return out
  }

  const panelData = useMemo(
    () =>
      panels.map((panel) => {
        const many = panel.segments.length > OVERLAY_LIMIT
        const models = modelsFor(panel.segments)
        const series: ChartSeries[] = [
          ...models.map((m, i) => ({
            label: t.modelLine,
            points: [],
            curve: m.curve,
            extension: m.extension,
            original: m.original,
            dash: DASHES[i % DASHES.length],
            // Curves of the parameters before the edit, until the new ones come.
            faded: fineStale && !m.key.includes("#"),
          })),
          ...panel.segments.map((s, slot) => ({
            label: segmentTitle(s, lang),
            slot: many ? 0 : slot,
            points: values.get(s.index)!.points,
            curve: [],
          })),
        ]
        const residuals: ChartSeries[] = panel.segments.map((s, slot) => ({
          label: segmentTitle(s, lang),
          slot: many ? 0 : slot,
          points: values.get(s.index)!.residuals,
          curve: [],
        }))
        return { panel, models, series, residuals, many }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panels, values, fine, initialFine, initialData, data, scheme.modified, fineStatus, fineStale, extend, lang, t],
  )

  // Linear or logarithmic, from the data unless the reader chose; the x axis
  // once for every energy panel, so they line up.
  const axesFor = (segments: DataSegment[]) => {
    const xs: number[] = []
    const ys: number[] = []
    for (const s of segments) {
      for (const p of values.get(s.index)!.points) {
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
  const energySegments = chosen.filter((s) => xKind(s) !== "angle")
  const mainAxes = axesFor(energySegments.length ? energySegments : chosen)
  const energyKey = energySegments.map((s) => s.index).join(",")
  /**
   * The x range of some panels with their model lines beyond the data: the
   * points and every line (null when no line reaches beyond its data).
   */
  const reach = (list: { panel: Panel; models: Model[] }[], logX: boolean): [number, number] | null => {
    let lo = Infinity
    let hi = -Infinity
    let beyond = false
    const take = (x: number) => {
      if (!Number.isFinite(x) || (logX && x <= 0)) return
      lo = Math.min(lo, x)
      hi = Math.max(hi, x)
    }
    for (const { panel, models } of list) {
      for (const s of panel.segments) for (const p of values.get(s.index)!.points) if (Number.isFinite(p.y)) take(p.x)
      for (const m of models) {
        if (m.extension.length === 0) continue
        beyond = true
        for (const p of m.extension) if (Number.isFinite(p.y)) take(p.x)
      }
    }
    return beyond && Number.isFinite(lo) ? [lo, hi] : null
  }
  const sharedX = useMemo<[number, number] | null>(() => {
    if (zoom) return zoom
    let lo = Infinity
    let hi = -Infinity
    for (const s of energySegments)
      for (const p of values.get(s.index)!.points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || (mainAxes.logX && p.x <= 0)) continue
        lo = Math.min(lo, p.x)
        hi = Math.max(hi, p.x)
      }
    const wide = extend ? reach(panelData.filter((d) => !d.panel.angle), mainAxes.logX) : null
    if (wide) {
      lo = Math.min(lo, wide[0])
      hi = Math.max(hi, wide[1])
    }
    return Number.isFinite(lo) ? [lo, hi] : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, energyKey, values, mainAxes.logX, extend, panelData])

  const xLabelOf = (angle: boolean) => (angle ? t.angleAxis : t.energyAxis)
  const xUnitOf = (angle: boolean) => (angle ? "°" : "MeV")
  const xNameOf = (angle: boolean) => (angle ? "θ" : "E")

  // Which of the shown datasets have their model only at the measured points.
  const pointwise = fineStatus === "ready" ? chosen.filter((s) => !fine?.[s.index]) : []

  // Fit quality, and how the last edits changed it.
  const meanChi2 = useMemo(() => pooledChi2(chosen), [chosen])
  const active = useMemo(() => data.filter((s) => s.active), [data])
  const allChi2 = useMemo(() => pooledChi2(active), [active])
  const allOne = active.every((s) => Math.abs((s.norm || 1) - 1) < 1e-9)
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

  // The level whose sliders open first: one with free parameters that sits
  // in the plotted range (the 2.368 MeV resonance for ¹³N, not the ground
  // state's ANC), else the first resonance above the entrance threshold.
  const focusLevel = useMemo(() => {
    const entrance =
      scheme.pairs.find((p) => p.is_entrance && !p.is_photon && p.excitation < 1e-6) ?? scheme.pairs.find((p) => p.is_entrance)
    const threshold = entrance ? (entrance.threshold ?? entrance.separation_energy + entrance.excitation) : null
    const nFree = (l: Scheme["levels"][number]) =>
      (l.energy_fixed ? 0 : 1) + l.channels.filter((c) => !c.fixed && c.free_index !== null).length
    const free = scheme.levels.filter((l) => nFree(l) > 0)
    if (threshold === null || free.length === 0) return null
    const xs = energySegments.flatMap((s) => values.get(s.index)!.points.map((p) => p.x)).filter(Number.isFinite)
    if (xs.length) {
      const lo = Math.min(...xs)
      const hi = Math.max(...xs)
      const inside = free.filter((l) => l.energy - threshold >= lo && l.energy - threshold <= hi)
      if (inside.length) return levelKey([...inside].sort((a, b) => nFree(b) - nFree(a) || a.energy - b.energy)[0])
    }
    const above = free.filter((l) => l.energy > threshold).sort((a, b) => a.energy - b.energy)
    return above.length ? levelKey(above[0]) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme.levels, scheme.pairs, energyKey])

  const toggle = (index: number, checked: boolean) =>
    startTransition(() =>
      onSelect(checked ? [...selected.filter((i) => i !== index), index] : selected.filter((i) => i !== index)),
    )

  const listed = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return data
    return data.filter((s) =>
      [segmentTitle(s, lang), s.name, s.data_file, observableLabel(s.observable, lang)].some((v) => v.toLowerCase().includes(needle)),
    )
  }, [data, filter, lang])

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

  /* -- legends ------------------------------------------------------------- */

  const marker = (slot: number) => (
    <svg width="10" height="10" aria-hidden className="shrink-0">
      {seriesShape(slot) === "circle" && <circle cx={5} cy={5} r={3.5} fill={`var(--viz-series-${slot + 1})`} />}
      {seriesShape(slot) === "square" && <rect x={1.5} y={1.5} width={7} height={7} fill={`var(--viz-series-${slot + 1})`} />}
      {seriesShape(slot) === "triangle" && <path d="M5,1L9,8.5L1,8.5Z" fill={`var(--viz-series-${slot + 1})`} />}
    </svg>
  )
  const line = (dash: string, grey = false, faint = false) => (
    <svg width="22" height="10" aria-hidden className="shrink-0">
      {grey ? (
        // The published fit: a wide, light "ghost" band under the model.
        <line x1={1} x2={21} y1={5} y2={5} stroke="var(--viz-text-muted)" strokeWidth={4} strokeLinecap="round" opacity={0.3} />
      ) : (
        <line
          x1={1}
          x2={21}
          y1={5}
          y2={5}
          stroke="var(--viz-text)"
          strokeWidth={faint ? 1.4 : 1.6}
          strokeDasharray={dash || undefined}
          opacity={faint ? EXTENSION_OPACITY : 1}
        />
      )}
    </svg>
  )
  /** Datasets (markers), the model line(s), and the published fit once edited. */
  const legendFor = (segments: DataSegment[], models: Model[], many: boolean, compact: boolean) => (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground ${compact ? "px-2" : "px-1"}`} aria-label={t.keyLabel}>
      {many ? (
        <li className="flex min-w-0 items-center gap-1.5">
          {marker(0)}
          <span className="text-foreground">{t.nDatasets(segments.length)}</span>
        </li>
      ) : (
        segments.map((s, i) => (
          <li key={s.index} className="flex min-w-0 items-center gap-1.5">
            {marker(i)}
            <span className="min-w-0 truncate text-foreground">
              {compact ? [datasetName(s), xKind(s) === "angle" ? "" : angleText(s, lang)].filter(Boolean).join(" · ") : segmentTitle(s, lang)}
            </span>
          </li>
        ))
      )}
      {models.map((m, i) => (
        <li key={m.key} className="flex min-w-0 items-center gap-1.5">
          {line(DASHES[i % DASHES.length])}
          <span className="min-w-0 truncate">
            {t.modelLine}
            {models.length > 1 && m.label ? ` · ${m.label}` : ""}
          </span>
        </li>
      ))}
      {/* Kept from the start (not when the smooth curve arrives), so the key does not jump. */}
      {extend && fineStatus !== "failed" && segments.some((s) => xKind(s) !== "angle") && (
        <li className="flex min-w-0 items-center gap-1.5">
          {line(extensionDash(DASHES[0]), false, true)}
          <span className="min-w-0 truncate">{t.modelBeyond}</span>
        </li>
      )}
      {scheme.modified && models.some((m) => m.original?.length) && (
        <li className="flex min-w-0 items-center gap-1.5">
          {line("", true)}
          <span>{lv.publishedFitLegend}</span>
        </li>
      )}
    </ul>
  )

  /* -- the plot ------------------------------------------------------------ */

  const panelTitle = (s: DataSegment) =>
    xKind(s) === "angle"
      ? `${datasetName(s)} · ${qualifier(s, lang)}`
      : [reactionText(s, lang), observableLabel(s.observable, lang)].filter(Boolean).join(" · ")

  const plot =
    chosen.length === 0 ? (
      <Card>
        <CardContent className="flex h-[15rem] items-center justify-center text-center text-sm text-muted-foreground lg:h-[26rem]">
          {t.selectDataset}
        </CardContent>
      </Card>
    ) : faceted ? (
      <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 2xl:grid-cols-3">
        {panelData.map(({ panel, models, series, residuals, many }) => {
          const first = panel.segments[0]
          const axes = axesFor(panel.segments)
          const logX = panel.angle ? false : mainAxes.logX
          const x = panel.angle ? null : sharedX
          const label = axisLabel(first, quantity, lang, unitOf(first))
          return (
            <figure key={panel.key} className="min-w-0 space-y-1 rounded-md border bg-card px-1 pb-1 pt-2">
              <figcaption className="space-y-1">
                <p className="truncate px-2 text-xs font-medium">
                  <Sci>{panelTitle(first)}</Sci>
                </p>
                {legendFor(panel.segments, models, many, true)}
              </figcaption>
              <SegmentChart
                series={series}
                xLabel={xLabelOf(panel.angle)}
                yLabel={label}
                logX={logX}
                logY={axes.logY}
                xDomain={x}
                onXDomain={panel.angle ? undefined : setZoom}
                height={showResiduals ? 190 : 220}
                xUnit={xUnitOf(panel.angle)}
                xName={xNameOf(panel.angle)}
                yUnit={unitOf(first).unit}
                clampCurves
                svgRef={refFor(`f${panel.key}`)}
                ariaLabel={t.plotAria(label, panel.segments.map((s) => segmentTitle(s, lang)).join("; "))}
              />
              {showResiduals && (
                <SegmentChart
                  series={residuals}
                  xLabel={xLabelOf(panel.angle)}
                  yLabel={t.residualAxis}
                  logX={logX}
                  logY={false}
                  xDomain={x}
                  onXDomain={panel.angle ? undefined : setZoom}
                  height={80}
                  zeroLine
                  compact
                  xUnit={xUnitOf(panel.angle)}
                  xName={xNameOf(panel.angle)}
                  ariaLabel={t.residualAria(panel.segments.map((s) => segmentTitle(s, lang)).join("; "))}
                />
              )}
            </figure>
          )
        })}
      </div>
    ) : (
      (() => {
        const { panel, series, residuals } = panelData[0]
        const angle = panel.angle
        // Zoomed, or widened to the model beyond the data, or fitted to the points.
        const domain = zoom ?? (extend && !angle ? reach([panelData[0]], mainAxes.logX) : null)
        const first = panel.segments[0]
        const yLabel = axisLabel(first, quantity, lang, unitOf(first))
        return (
          <Card className="overflow-hidden">
            <CardContent
              className={`p-1.5 sm:p-3 ${
                showResiduals
                  ? "h-[12rem] max-h-[34svh] min-h-[9rem] sm:h-[15rem] lg:h-[20rem] lg:max-h-none"
                  : "h-[15rem] max-h-[42svh] min-h-[10rem] sm:h-[18rem] lg:h-[26rem] lg:max-h-none"
              }`}
            >
              <SegmentChart
                series={series}
                xLabel={xLabelOf(angle)}
                yLabel={yLabel}
                logX={angle ? false : mainAxes.logX}
                logY={mainAxes.logY}
                xDomain={domain}
                onXDomain={setZoom}
                xUnit={xUnitOf(angle)}
                xName={xNameOf(angle)}
                yUnit={unitOf(first).unit}
                clampCurves
                svgRef={refFor("main")}
                ariaLabel={t.plotAria(yLabel, chosen.map((s) => segmentTitle(s, lang)).join("; "))}
              />
            </CardContent>
            {showResiduals && (
              <CardContent className="h-[6.5rem] border-t p-1.5 sm:h-[8rem] sm:p-3 lg:h-[9rem]">
                <SegmentChart
                  series={residuals}
                  xLabel={xLabelOf(angle)}
                  yLabel={t.residualAxis}
                  logX={angle ? false : mainAxes.logX}
                  logY={false}
                  xDomain={domain}
                  onXDomain={setZoom}
                  zeroLine
                  compact
                  xUnit={xUnitOf(angle)}
                  xName={xNameOf(angle)}
                  svgRef={refFor("resid")}
                  ariaLabel={t.residualAria(chosen.map((s) => segmentTitle(s, lang)).join("; "))}
                />
              </CardContent>
            )}
          </Card>
        )
      })()
    )

  /* -- χ² ------------------------------------------------------------------ */

  const delta = (now: number | null, before: number | null) => {
    if (!scheme.modified || now === null || before === null) return null
    const d = now - before
    if (Math.abs(d) < 0.005) return <span className="text-muted-foreground">({t.chi2Same})</span>
    const better = d < 0
    // Tenfold or more: a ratio in words reads better than a seven-digit difference.
    const ratio = better ? before / Math.max(now, 1e-12) : now / Math.max(before, 1e-12)
    const text =
      ratio >= 10
        ? (better ? lv.muchBetter : lv.muchWorse)(chi2Text(Number(ratio.toPrecision(2)), lang).replace(/[.,]00$/, ""))
        : `${chi2Text(Math.abs(d), lang)} ${better ? t.better : t.worse}`
    return (
      <span className={`whitespace-nowrap font-medium ${better ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
        ({better ? "▼" : "▲"} {text})
      </span>
    )
  }
  const huge = scheme.modified && meanChi2 !== null && initialShown !== null && meanChi2 >= 10 * initialShown

  const chi2Line = (
    <p className="min-w-0 tabular-nums">
      {meanChi2 !== null ? (
        <>
          <a href={`${localePath(lang, "/glossary")}#chi-squared`} className="text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-link">
            χ²/N
          </a>{" "}
          <span className="font-semibold">{chi2Text(meanChi2, lang)}</span>{" "}
          <span className="text-muted-foreground">{t.chi2ShownShort}</span> {delta(meanChi2, initialShown)}
        </>
      ) : (
        <span className="text-muted-foreground">{t.chi2None}</span>
      )}
    </p>
  )

  const history = (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <Button variant="ghost" size="sm" className="h-9 w-9 px-0" onClick={onUndo} disabled={calculating || !canUndo} aria-label={t.undo} title={t.undo}>
        <Undo2 className="h-4 w-4" aria-hidden />
      </Button>
      <Button variant="ghost" size="sm" className="h-9 w-9 px-0" onClick={onRedo} disabled={calculating || !canRedo} aria-label={t.redo} title={t.redo}>
        <Redo2 className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-auto min-h-9 max-w-full whitespace-normal"
        onClick={onReset}
        disabled={calculating || !scheme.modified}
        title={t.resetAllHint}
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {t.resetAll}
      </Button>
    </div>
  )

  const chi2Notes = (
    <div className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
      <p>{t.chi2Plain}</p>
      {huge && <p className="text-foreground/80">{lv.chi2Huge}</p>}
      {allChi2 !== null && allChi2 > 5 && <p>{t.chi2NormNote(allOne)}</p>}
      {allChi2 !== null && (
        <details>
          <summary className="cursor-pointer select-none text-foreground/80 marker:text-muted-foreground">{t.chi2AllSummary}</summary>
          <p className="mt-1 tabular-nums">
            {t.chi2AllText(chi2Text(allChi2, lang))} {delta(allChi2, initialAll)}
          </p>
        </details>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* The first stop in the plot view: past the view settings and the dataset list, straight to the sliders. */}
      <a
        href="#plot-levels"
        onClick={(event) => {
          // Focus moves with the reader, so the next Tab is inside the levels.
          const target = document.getElementById("plot-levels")
          if (!target) return
          event.preventDefault()
          target.focus({ preventScroll: true })
          target.scrollIntoView({ block: "start" })
        }}
        className="sr-only w-fit rounded-md bg-card px-3 py-2 text-sm font-medium text-link ring-2 ring-ring focus:not-sr-only focus:inline-flex [&+*]:!mt-0 focus:[&+*]:!mt-4"
      >
        {lv.skipToLevels}
      </a>
      {(anyScattering && quantity === "sfactor") || faceted || quantity === "rutherford" ? (
        <p className="text-xs text-muted-foreground">
          {anyScattering && quantity === "sfactor" && t.elasticNote}{" "}
          {quantity === "rutherford" && t.rutherfordNote} {faceted && t.sharedNote}
        </p>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:gap-x-6 lg:gap-y-4">
        {/* The view settings: a toolbar from lg, behind "View" on a phone. */}
        <div
          id="plot-view"
          className={`flex flex-wrap items-end gap-x-4 gap-y-3 max-lg:order-2 lg:col-span-2 ${
            viewOpen ? "max-lg:rounded-lg max-lg:border max-lg:bg-card max-lg:p-3" : "max-lg:hidden"
          }`}
        >
          <div className="min-w-0 max-w-full space-y-1.5">
            <Label htmlFor="plot-quantity" className="text-xs">
              {t.quantity}
            </Label>
            <Select value={quantity} onValueChange={(value: Quantity) => startTransition(() => onQuantity(value))}>
              <SelectTrigger id="plot-quantity" className="w-44 max-w-full">
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
            <Switch id="logx" checked={mainAxes.logX} disabled={mainAxes.angle} onCheckedChange={later(setLogX)} />
            <Label htmlFor="logx" className="text-sm">
              {t.logEnergy}
            </Label>
          </div>
          <div className="flex min-h-10 items-center gap-2">
            <Switch id="logy" checked={mainAxes.logY} onCheckedChange={later(setLogY)} />
            <Label htmlFor="logy" className="text-sm">
              {t.logValue}
            </Label>
          </div>
          <div className="flex min-h-10 items-center gap-2">
            <Switch id="extend" checked={extend} onCheckedChange={later(setExtend)} />
            <Label htmlFor="extend" className="text-sm" title={t.extendHint}>
              {t.extend}
            </Label>
          </div>
          <div className="flex min-h-10 items-center gap-2">
            <Switch id="residuals" checked={showResiduals} onCheckedChange={later(setShowResiduals)} />
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

        <div className={`min-w-0 max-lg:contents lg:space-y-3 ${faceted ? "" : "lg:sticky lg:top-20 lg:self-start"}`}>
          {/* χ² and the edit history (from lg; on a phone they ride with the plot). */}
          <div className="rounded-md border bg-card px-3 py-2 text-sm max-lg:order-4">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 max-lg:hidden">
              {chi2Line}
              {history}
            </div>
            {chi2Notes}
          </div>

          <div
            className={
              faceted
                ? "min-w-0 max-lg:order-1"
                : "z-20 -mx-1 min-w-0 self-start bg-background px-1 pb-2 pt-1 max-lg:order-1 max-lg:[@media(min-height:600px)]:sticky max-lg:[@media(min-height:600px)]:top-[var(--header-h,4rem)] lg:static lg:mx-0 lg:p-0"
            }
          >
            <div className="relative">
              {/*
                The timer in a band of its own above the plot (which is pinned
                under the header on a phone, so it is always in view): never
                over the data, and the plot is not dimmed -- the curve follows
                the slider, the one being replaced drawn faded.
              */}
              <div className="flex min-h-8 items-center px-0.5" aria-live="off">
                <ProgressTimer stage={stage} activity={activity ?? null} retryAt={retryAt} />
              </div>
              <div className="space-y-1.5" aria-busy={calculating}>
                {!faceted && panelData[0] && legendFor(panelData[0].panel.segments, panelData[0].models, panelData[0].many, false)}
                {plot}
              </div>
              {zoom && (
                <Button variant="secondary" size="sm" className="absolute right-2 top-2 h-7 px-2 text-xs" onClick={() => setZoom(null)}>
                  <ZoomOut className="mr-1 h-3.5 w-3.5" aria-hidden />
                  {t.resetZoom}
                </Button>
              )}
            </div>
            {/* Phone: χ², the view settings and the history under the plot. */}
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-sm lg:hidden">
              {chi2Line}
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <Button
                  variant={viewOpen ? "secondary" : "ghost"}
                  size="sm"
                  className="h-9 px-2.5"
                  aria-expanded={viewOpen}
                  aria-controls="plot-view"
                  onClick={() => setViewOpen((v) => !v)}
                >
                  <SlidersHorizontal className="mr-1.5 h-4 w-4" aria-hidden />
                  {t.view}
                </Button>
                {history}
              </div>
            </div>
            {chosen.length > 0 && (
              <p className="mt-1.5 px-1 text-xs text-muted-foreground max-sm:hidden">
                {t.keyText}
                {extend && panelData.some((d) => d.models.some((m) => m.extension.length > 0)) && ` ${t.keyBeyond}`}
                {scheme.modified && ` ${t.keyOriginal}`} {t.zoomHint}
              </p>
            )}
          </div>

          {(fineStatus === "loading" || pointwise.length > 0) && chosen.length > 0 && (
            <p className="text-xs text-muted-foreground max-lg:order-5">
              {fineStatus === "loading"
                ? fineStale
                  ? t.fineUpdating
                  : t.fineLoading
                : t.finePointwise(pointwise.map((s) => segmentTitle(s, lang)).join("; "))}
            </p>
          )}

          <details
            open={listOpen}
            onToggle={(event) => setListOpen((event.target as HTMLDetailsElement).open)}
            className="min-w-0 rounded-lg border bg-card max-lg:order-6"
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
                  <input
                    type="checkbox"
                    id={`seg-${segment.index}`}
                    checked={selected.includes(segment.index)}
                    onChange={(event) => toggle(segment.index, event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded-sm border-input-strong accent-[var(--viz-series-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

        {/* The sliders: their own scrolling column beside the plot from lg. */}
        <Card
          id="plot-levels"
          tabIndex={-1}
          className="min-w-0 scroll-mt-24 outline-none focus-visible:ring-2 focus-visible:ring-ring max-lg:order-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto"
        >
          <CardContent className="p-4 sm:p-5">
            <LevelControls
              scheme={scheme}
              onChange={onParameterChange}
              disabled={calculating}
              selectedLevel={selectedLevel}
              onSelectLevel={onSelectLevel}
              deltaChi2={deltaChi2}
              defaultOpen={focusLevel}
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
