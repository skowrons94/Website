"use client"

import { Fragment, memo, startTransition, useEffect, useMemo, useRef, useState } from "react"
import { Download, ZoomOut } from "lucide-react"
import { texPlain } from "@/components/tex"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SegmentChart, type ChartBand, type ChartSeries } from "@/components/segment-chart"
import { Sci } from "@/components/sci"
import { extrapolationsCsvUrl, downloadLink, getExtrapolationGrid, type DataSegment, type ExtrapSegment, type SchemePair } from "@/lib/api"
import { ProgressTimer, type Stage } from "@/components/evaluation-progress"
import type { Activity } from "@/contexts/session-context"
import { OVERLAY_LIMIT, observableLabel, quantityLabel } from "@/lib/viz"
import { decimal } from "@/lib/i18n-eval"
import { localePath } from "@/lib/locale"
import {
  autoLog,
  axisLabel,
  numberText,
  pickUnit,
  quantityFor,
  rawValues,
  segmentTitle,
  segmentValues,
  sfactorUnit,
  xKind,
  type DisplayUnit,
} from "@/lib/eval-plot"
import { downloadPng, downloadSvg } from "@/lib/plot-export"
import { useLang } from "@/components/lang-context"
import { useEvalDict } from "@/components/eval-dict"

/**
 * Extrapolation curves, optionally with measured datasets overlaid for context,
 * the Gamow window of a chosen temperature shaded behind them, and exports.
 *
 * Every energy here is centre-of-mass: the curves come from AZURE2 in that
 * frame, and the API converts the segments' own (laboratory) limits. A curve
 * that sweeps the angle at one energy (a differential extrapolation, 0–180°)
 * is drawn against the angle, as the Plot tab draws an angular distribution,
 * and takes no part in the Gamow window or the S-factor readout.
 *
 * The Gamow window belongs to the evaluation's headline reaction, at the
 * temperatures where the reaction atlas places it (the Sun and the Big Bang
 * for ³He(α,γ)⁷Be); an evaluation of elastic scattering alone has none.
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
  /** Null while the session reopens: the CSV and on-demand grids wait for it. */
  sessionId: string | null
  calculating: boolean
  /** The curves are those before the last edit (new ones on their way): drawn faded. */
  stale?: boolean
  /** The curves shown are the published ones (the reader's own are being calculated). */
  published?: boolean
  /** What the tab waits for, for the progress timer. */
  activity?: Activity | null
  stage?: Stage
  retryAt?: number | null
  evaluationId: string
  /** Elastic scattering only: cross sections, no Gamow window. */
  scatteringOnly?: boolean
  /** The atlas' temperatures for the headline reaction (T₉ and where). */
  temperatures?: { T9: number; label: string }[]
}

type Quantity = "sfactor" | "cross_section"

/** Scattering has no S-factor; such curves are always drawn as dσ/dΩ. */
const scattering = (s: { entrance_key: number; exit_key: number; observable: string }) =>
  s.observable === "phase-shift" || s.entrance_key === s.exit_key

/** A differential curve swept in angle at one energy: drawn against θ. */
function isAngularCurve(s: ExtrapSegment): boolean {
  if (s.is_angle_integrated) return false
  const e = (s.energies ?? []).filter((v) => Number.isFinite(v))
  const a = (s.angles ?? []).filter((v) => v !== null && Number.isFinite(v))
  if (e.length < 3 || a.length < 3) return s.angle_max - s.angle_min > 2 && Math.abs(s.energy_max - s.energy_min) < 1e-6
  return Math.max(...e) - Math.min(...e) <= 1e-3 * Math.max(Math.abs(Math.max(...e)), 1e-3) && Math.max(...a) - Math.min(...a) > 2
}

/**
 * An energy × angle grid (⁶Li(p,α) on ⁷Be: 2.4–5.1 MeV × 0–180°): many
 * energies and many angles in one segment. Drawn against energy as one line it
 * zig-zags through every angle, so it is offered apart, on request, as a few
 * angles or as a map. A newer server sends it without values (`grid`) and
 * computes it when asked.
 */
function isGrid(s: ExtrapSegment): boolean {
  if (s.grid) return true
  if (s.is_angle_integrated) return false
  // One laboratory angle (¹³N at 55°): an excitation function, whose c.m.
  // angle merely drifts with the energy -- a line, not a grid.
  if (Math.abs(s.angle_max - s.angle_min) < 1e-9) return false
  const n = (s.energies ?? []).length
  const e = new Set((s.energies ?? []).filter(Number.isFinite).map((v) => v.toPrecision(6)))
  const a = new Set((s.angles ?? []).filter((v) => v !== null && Number.isFinite(v)).map((v) => v.toPrecision(6)))
  // A grid repeats each energy at every angle: distinct energies × angles ≈ points.
  return e.size > 2 && a.size > 2 && e.size * a.size <= 1.5 * n
}

interface GridCut {
  angle: number
  energies: number[]
  calculated: (number | null)[]
  calculated_sfactor: (number | null)[]
}
/** What is known of one grid: a few angle cuts, and/or the whole map. */
interface GridData {
  cuts: GridCut[] | null
  map: GridRows | null
}

interface GridRows {
  angles: number[]
  energies: number[]
  /** value[angle row][energy column] (cross section, as sent), NaN where missing. */
  values: number[][]
  sfactor: number[][]
}

/** A grid's flat lists as rows by angle, energies sorted. */
function gridRows(s: ExtrapSegment): GridRows {
  const es = s.energies ?? []
  const as = s.angles ?? []
  const energies = [...new Set(es.filter(Number.isFinite).map((v) => Number(v.toPrecision(9))))].sort((x, y) => x - y)
  const angles = [...new Set(as.filter((v) => v !== null && Number.isFinite(v)).map((v) => Number(v.toPrecision(9))))].sort((x, y) => x - y)
  const ei = new Map(energies.map((v, i) => [v, i]))
  const ai = new Map(angles.map((v, i) => [v, i]))
  const values = angles.map(() => energies.map(() => NaN))
  const sfactor = angles.map(() => energies.map(() => NaN))
  for (let k = 0; k < es.length; k++) {
    const i = ai.get(Number((as[k] ?? NaN).toPrecision(9)))
    const j = ei.get(Number(es[k].toPrecision(9)))
    if (i === undefined || j === undefined) continue
    values[i][j] = s.calculated?.[k] ?? NaN
    sfactor[i][j] = s.calculated_sfactor?.[k] ?? NaN
  }
  return { angles, energies, values, sfactor }
}

/** Up to `n` of a grid's angles, spread over its range (always its ends and 90° when present). */
function spreadAngles(angles: number[], n = 5): number[] {
  if (angles.length <= n) return angles
  const lo = angles[0]
  const hi = angles[angles.length - 1]
  const want = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1))
  const near = (x: number) => angles.reduce((best, a) => (Math.abs(a - x) < Math.abs(best - x) ? a : best), angles[0])
  return [...new Set(want.map(near))]
}

/** Index of a grid's angle cut, as a curve of its own (kept apart from the segments' indices). */
const cutIndex = (segment: number, angle: number) => 1_000_000 + segment * 1000 + Math.round(angle)

const TEMPERATURES = [0.01, 0.015, 0.02, 0.03, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 3]

/** Gamow peak and 1/e width (MeV) — the same expressions as the atlas (lib/atlas-core.mjs). */
function gamow(pair: SchemePair, T9: number) {
  const mu = (pair.M1 * pair.M2) / (pair.M1 + pair.M2)
  const z = pair.Z1 * pair.Z1 * pair.Z2 * pair.Z2 * mu
  return { E0: 0.122 * Math.cbrt(z * T9 * T9), width: 0.2368 * Math.pow(z * T9 ** 5, 1 / 6) }
}

/** "S(E_min)", "N_A⟨σv⟩", "E_min" in a string, set with real subscripts. */
function rich(text: string) {
  return text.split(/(S\(E_min\)|N_A⟨σv⟩|E_min)/).map((part, i) =>
    part === "S(E_min)" ? (
      <Fragment key={i}>
        <i>S</i>(<i>E</i>
        <sub>min</sub>)
      </Fragment>
    ) : part === "N_A⟨σv⟩" ? (
      <Fragment key={i}>
        <i>N</i>
        <sub>A</sub>⟨σ<i>v</i>⟩
      </Fragment>
    ) : part === "E_min" ? (
      <Fragment key={i}>
        <i>E</i>
        <sub>min</sub>
      </Fragment>
    ) : (
      part
    ),
  )
}

export function ExtrapPlot({
  headline,
  extrapolations,
  data,
  pairs,
  sessionId,
  calculating,
  evaluationId,
  scatteringOnly = false,
  temperatures = [],
  stale = false,
  published = false,
  activity = null,
  stage = "extrap",
  retryAt = null,
}: Props) {
  const lang = useLang()
  const t = useEvalDict().workspace
  const lv = useEvalDict().live
  const r9 = useEvalDict().r9
  const [selected, setSelected] = useState<number[]>([])
  const [overlaid, setOverlaid] = useState<number[]>([])
  const [quantity, setQuantity] = useState<Quantity>(scatteringOnly ? "cross_section" : "sfactor")
  const [logXOverride, setLogX] = useState<boolean | null>(null)
  const [logYOverride, setLogY] = useState<boolean | null>(null)
  const [T9, setT9] = useState<string>(temperatures.length ? String(temperatures[0].T9) : "0.1")
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  const [filter, setFilter] = useState("")
  const charts = useRef(new Map<string, SVGSVGElement>())

  // The headline reaction's entrance pair ("³He(α,γ)" → α + ³He).
  const entrance = useMemo(() => {
    const m = headline ? /^(.+?)\((.+?),/.exec(headline) : null
    return m
      ? pairs.find((p) => {
          const parts = (p.label_plain ?? "").split(" + ")
          return !p.is_photon && parts.includes(m[1].replace(/^⁴He$/, "α")) && parts.includes(m[2])
        })
      : undefined
  }, [headline, pairs])

  useEffect(() => {
    setSelected((current) => {
      if (current.length > 0) return current
      // The headline reaction's own curve: capture or reaction, angle-integrated if any.
      const ok = (s: ExtrapSegment) =>
        s.active && !isGrid(s) && (s.energies?.length ?? 0) > 0 && (!entrance || s.entrance_key === entrance.number)
      const first =
        extrapolations.find((s) => ok(s) && !scattering(s) && s.is_angle_integrated && s.observable === "total-capture") ??
        extrapolations.find((s) => ok(s) && !scattering(s) && s.is_angle_integrated) ??
        extrapolations.find((s) => ok(s) && !scattering(s)) ??
        extrapolations.find(ok) ??
        extrapolations.find((s) => s.active && !isGrid(s) && (s.energies?.length ?? 0) > 0) ??
        extrapolations.find((s) => !isGrid(s))
      return first ? [first.index] : []
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrapolations])

  /* -- energy × angle grids, on request ----------------------------------- */

  const grids = useMemo(() => extrapolations.filter(isGrid), [extrapolations])
  const lines = useMemo(() => extrapolations.filter((s) => !isGrid(s)), [extrapolations])
  // What has been fetched of each grid a newer server computes on request.
  const [fetched, setFetched] = useState<Record<number, GridData & { loading?: "angles" | "map"; failed?: boolean }>>({})
  useEffect(() => setFetched({}), [extrapolations])
  const rowsCache = useRef(new Map<ExtrapSegment, GridRows>())
  /** A grid's angle cuts and map: from its own values (an older server), or as fetched. */
  const dataOf = (s: ExtrapSegment): GridData => {
    if (s.energies?.length) {
      let rows = rowsCache.current.get(s)
      if (!rows) {
        rows = gridRows(s)
        rowsCache.current.set(s, rows)
      }
      const r = rows
      return {
        cuts: spreadAngles(r.angles, 7).map((angle) => {
          const i = r.angles.indexOf(angle)
          return { angle, energies: r.energies, calculated: r.values[i], calculated_sfactor: r.sfactor[i] }
        }),
        map: r,
      }
    }
    return fetched[s.index] ?? { cuts: null, map: null }
  }
  const fetchView = (s: ExtrapSegment, view: "angles" | "map", then: (data: GridData) => void) => {
    if (!sessionId) return
    setFetched((f) => ({ ...f, [s.index]: { ...(f[s.index] ?? { cuts: null, map: null }), loading: view, failed: false } }))
    getExtrapolationGrid(sessionId, s.index, view)
      .then((answer) => {
        if (!answer) throw new Error("no grid")
        setFetched((f) => {
          const before = { ...(f[s.index] ?? { cuts: null, map: null }), loading: undefined, failed: false }
          const next: GridData =
            answer.view === "angles"
              ? { ...before, cuts: answer.curves }
              : {
                  ...before,
                  map: {
                    angles: answer.angles,
                    energies: answer.energies,
                    values: answer.calculated.map((row) => row.map((v) => v ?? NaN)),
                    sfactor: answer.calculated_sfactor.map((row) => row.map((v) => v ?? NaN)),
                  },
                }
          then(next)
          return { ...f, [s.index]: next }
        })
      })
      .catch(() => setFetched((f) => ({ ...f, [s.index]: { ...(f[s.index] ?? { cuts: null, map: null }), loading: undefined, failed: true } })))
  }
  // Per grid: how it is shown (a few angles, or a map) and which angles.
  const [gridView, setGridView] = useState<Record<number, { mode: "angles" | "map"; angles: number[] }>>({})
  const firstAngles = (cuts: GridCut[]) => spreadAngles(cuts.map((c) => c.angle), 3)
  const showGrid = (s: ExtrapSegment) => {
    const known = dataOf(s)
    if (known.cuts) setGridView((v) => ({ ...v, [s.index]: { mode: "angles", angles: firstAngles(known.cuts!) } }))
    else fetchView(s, "angles", (d) => d.cuts && setGridView((v) => ({ ...v, [s.index]: { mode: "angles", angles: firstAngles(d.cuts!) } })))
  }
  const showMap = (s: ExtrapSegment) => {
    const view = gridView[s.index] ?? { mode: "map", angles: [] }
    if (dataOf(s).map) setGridView((v) => ({ ...v, [s.index]: { ...view, mode: "map" } }))
    else fetchView(s, "map", () => setGridView((v) => ({ ...v, [s.index]: { ...view, mode: "map" } })))
  }
  /** The angle cuts asked for, as curves of their own (energy on x). */
  const cuts = useMemo(() => {
    const out: ExtrapSegment[] = []
    for (const g of grids) {
      const view = gridView[g.index]
      if (!view || view.mode !== "angles") continue
      for (const cut of dataOf(g).cuts ?? []) {
        if (!view.angles.includes(cut.angle)) continue
        out.push({
          ...g,
          index: cutIndex(g.index, cut.angle),
          grid: null,
          is_angle_integrated: false,
          angle_min: cut.angle,
          angle_max: cut.angle,
          energies: cut.energies,
          angles: cut.energies.map(() => cut.angle),
          calculated: cut.calculated.map((v) => v ?? NaN),
          calculated_sfactor: cut.calculated_sfactor.map((v) => v ?? NaN),
        })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grids, gridView, fetched])

  const chosen = useMemo(
    () => [...lines.filter((s) => selected.includes(s.index)), ...cuts],
    [lines, selected, cuts],
  )
  const chosenData = useMemo(() => (data ?? []).filter((s) => overlaid.includes(s.index)), [data, overlaid])

  const curveQuantity = (s: ExtrapSegment): Quantity =>
    quantity === "sfactor" && !scattering(s) && !isAngularCurve(s) ? "sfactor" : "cross_section"
  const kind = (q: Quantity, observable: string, angle: boolean) => `${q}|${observable.startsWith("differential") ? "d" : "i"}|${angle ? "a" : "e"}`

  // One display unit per kind of quantity, shared by curves and overlaid data.
  const units = useMemo(() => {
    const values = new Map<string, { q: Quantity; observable: string; v: number[] }>()
    const add = (k: string, q: Quantity, observable: string, v: number[]) => {
      const e = values.get(k) ?? { q, observable, v: [] }
      e.v.push(...v)
      values.set(k, e)
    }
    for (const s of chosen) {
      const q = curveQuantity(s)
      const v = (q === "sfactor" ? s.calculated_sfactor : s.calculated) ?? []
      add(kind(q, s.observable, isAngularCurve(s)), q, s.observable, v.filter((x): x is number => x !== null && Number.isFinite(x)))
    }
    for (const s of chosenData) {
      const q = quantityFor(s, quantity) as Quantity
      add(kind(q, s.observable, xKind(s) === "angle"), q, s.observable, rawValues(s, quantity))
    }
    const out = new Map<string, DisplayUnit>()
    for (const [k, e] of values) out.set(k, pickUnit(e.q, e.observable, e.v))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, chosenData, quantity])
  const unitFor = (q: Quantity, observable: string, angle = false) => units.get(kind(q, observable, angle)) ?? { factor: 1, unit: "" }

  // "p + ²²Ne": the pair with both its nuclei, for a curve without a reaction name.
  const pairName = (key: number, fallback: string) => {
    const pair = pairs.find((p) => p.number === key)
    return pair && !pair.is_photon && pair.label_plain ? pair.label_plain : texPlain(fallback)
  }
  const fmtE = (v: number) => decimal(String(Number(v.toPrecision(4))), lang)
  /** What else tells this curve apart: its energy and angle sweep, its angle, or its observable. */
  // The final state, where the name does not carry it already (label_plain does: "²²Ne(p,γ₁)²³Na → 440 keV").
  const finalOf = (s: ExtrapSegment) =>
    s.final_state && !s.label_plain?.includes("→") && !s.label_plain?.endsWith(", total") && s.final_state !== "all final states" ? ` · ${lv.finalState(s.final_state)}` : ""
  const curveDetail = (s: ExtrapSegment): string => `${curveDetailBase(s)}${finalOf(s)}`
  const curveDetailBase = (s: ExtrapSegment) => {
    if (isAngularCurve(s)) {
      const e = (s.energies ?? []).find((v) => Number.isFinite(v)) ?? s.energy_min
      return t.angularCurve(fmtE(e), decimal(String(Number(s.angle_min.toFixed(1))), lang), decimal(String(Number(s.angle_max.toFixed(1))), lang))
    }
    if (!s.is_angle_integrated) return `${observableLabel(s.observable, lang)}, ${t.atAngle(decimal(String(Number(s.angle_min.toFixed(1))), lang))}`
    return observableLabel(s.observable, lang)
  }
  // With its final state where that tells it apart ("²²Ne(p,γ₁)²³Na → 440 keV").
  const curveName = (s: ExtrapSegment) =>
    (s.label_plain?.includes("→") ? s.label_plain : null) ??
    s.reaction ??
    (s.exit_key === -1 ? pairName(s.entrance_key, s.entrance) : `${pairName(s.entrance_key, s.entrance)} → ${pairName(s.exit_key, s.exit)}`)
  const curveLabel = (s: ExtrapSegment) => `${curveName(s)} · ${curveDetail(s)}`

  const curveSeries = (segment: ExtrapSegment, slot: number): ChartSeries => {
    const q = curveQuantity(segment)
    const angle = isAngularCurve(segment)
    const k = unitFor(q, segment.observable, angle).factor
    const xs = angle ? (segment.angles ?? []) : (segment.energies ?? [])
    const values = q === "sfactor" ? segment.calculated_sfactor : segment.calculated
    return {
      label: curveLabel(segment),
      slot,
      points: [],
      curve: xs.map((x, i) => ({ x: x ?? NaN, y: (values?.[i] ?? NaN) * k })),
      // Curves about to be replaced (before the edit, or the published ones) are drawn faded.
      faded: stale,
    }
  }

  const dataSeries = (segment: DataSegment, slot: number): ChartSeries => {
    const q = quantityFor(segment, quantity) as Quantity
    const v = segmentValues(segment, quantity, undefined, pairs, unitFor(q, segment.observable, xKind(segment) === "angle"))
    return { label: segmentTitle(segment, lang), slot, points: v.points, curve: [] }
  }

  type Item = { series: ChartSeries; angle: boolean; yLabel: string; unit: string; measured: boolean }
  const items = useMemo<Item[]>(
    () => [
      ...chosen.map((s, i) => {
        const q = curveQuantity(s)
        const angle = isAngularCurve(s)
        const unit = unitFor(q, s.observable, angle).unit
        return { series: curveSeries(s, i), angle, yLabel: quantityLabel(q, s.observable, lang, unit), unit, measured: false }
      }),
      ...chosenData.map((s, i) => {
        const q = quantityFor(s, quantity) as Quantity
        const angle = xKind(s) === "angle"
        const u = unitFor(q, s.observable, angle)
        return { series: dataSeries(s, chosen.length + i), angle, yLabel: axisLabel(s, quantity, lang, u), unit: u.unit, measured: true }
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosen, chosenData, quantity, lang, units, stale],
  )
  const series = items.map((i) => i.series)

  // Linear or logarithmic from what is shown, unless the reader chose.
  const energyItems = items.filter((i) => !i.angle)
  const logX = logXOverride ?? autoLog(energyItems.flatMap((i) => [...i.series.curve.map((p) => p.x), ...i.series.points.map((p) => p.x)]), 20)
  const logY = logYOverride ?? autoLog(series.flatMap((s) => [...s.curve.map((p) => p.y), ...s.points.map((p) => p.y)]), 10)

  const kinds = new Set(items.map((i) => `${i.yLabel}|${i.angle}`))
  const mixed = kinds.size > 1
  const overLimit = series.length > OVERLAY_LIMIT || mixed
  const allAngle = items.length > 0 && items.every((i) => i.angle)
  const yLabel = items[0]?.yLabel ?? ""
  const yUnit = items[0]?.unit ?? ""

  // The Gamow window of the headline reaction's entrance pair (charged particles only).
  const gamowPair = useMemo(() => {
    if (scatteringOnly) return null
    const curve = chosen.find((c) => !scattering(c) && !isAngularCurve(c))
    const pair = entrance ?? (curve ? pairs.find((p) => p.number === curve.entrance_key) : undefined)
    return pair && !pair.is_photon && pair.Z1 > 0 && pair.Z2 > 0 ? pair : null
  }, [scatteringOnly, entrance, chosen, pairs])
  const gw = gamowPair && T9 !== "off" ? gamow(gamowPair, Number(T9)) : null
  const bands: ChartBand[] = gw
    ? [{ x0: Math.max(gw.E0 - gw.width / 2, 1e-6), x1: gw.E0 + gw.width / 2, label: t.gamowBand(decimal(T9, lang)) }]
    : []
  const atlasLabel = temperatures.find((x) => String(x.T9) === T9)?.label
  const kelvin = (T: number) => {
    const billion = T >= 1
    const value = billion ? T : T * 1000
    const text = decimal(String(Number(value.toPrecision(3))), lang)
    return t.kelvin(text, billion, value === 1)
  }

  // The number an astrophysicist wants out: the S-factor at the lowest energy
  // of each selected capture/reaction curve, read off the curve. It is S(0)
  // only as far as that energy is ~0, so it is labelled S(E_min).
  const lowest = chosen
    .filter((s) => !scattering(s) && s.is_angle_integrated && !isAngularCurve(s))
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

  const fmt = (v: number) => numberText(v, lang, 3)
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

  const others = TEMPERATURES.filter((v) => !temperatures.some((x) => x.T9 === v))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0 max-w-full space-y-1.5">
          <Label htmlFor="ex-quantity" className="text-xs">
            {t.quantity}
          </Label>
          <Select value={quantity} onValueChange={(value: Quantity) => setQuantity(value)}>
            <SelectTrigger id="ex-quantity" className="w-44 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!scatteringOnly && <SelectItem value="sfactor">{t.sfactor}</SelectItem>}
              <SelectItem value="cross_section">{t.crossSection}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {gamowPair && (
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="ex-t9" className="text-xs">
              {t.gamowTemperature}
            </Label>
            <Select value={T9} onValueChange={setT9}>
              <SelectTrigger id="ex-t9" className="w-auto min-w-32 max-w-[min(22rem,calc(100vw-2.5rem))] [&>span]:truncate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">{t.gamowOff}</SelectItem>
                {temperatures.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs font-normal text-muted-foreground">{t.atlasTemperatures}</SelectLabel>
                    {temperatures.map((x) => (
                      <SelectItem key={x.T9} value={String(x.T9)}>
                        T₉ = {decimal(String(x.T9), lang)} · {x.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                <SelectGroup>
                  {temperatures.length > 0 && (
                    <SelectLabel className="text-xs font-normal text-muted-foreground">{t.otherTemperatures}</SelectLabel>
                  )}
                  {others.map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      T₉ = {decimal(String(v), lang)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex min-h-10 items-center gap-2">
          <Switch id="ex-logx" checked={logX} disabled={allAngle} onCheckedChange={setLogX} />
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
          {sessionId ? (
            <Button asChild variant="outline" size="sm" className="h-8 px-2.5" disabled={chosen.length === 0}>
              <a {...downloadLink(extrapolationsCsvUrl(sessionId, selected), `${evaluationId}_extrapolations.csv`)}>CSV</a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="h-8 px-2.5" disabled>
              CSV
            </Button>
          )}
        </div>

      </div>

      {overLimit && <p className="text-xs text-muted-foreground">{mixed ? t.mixedNote : t.facets(series.length, OVERLAY_LIMIT, "series")}</p>}
      {scatteringOnly && <p className="text-xs text-muted-foreground">{t.noGamowScattering}</p>}

      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] [&>*]:min-w-0">
        <div className="relative min-w-0">
          {/* While new curves are calculated: the timer in a band of its own above the plot (never over the curves), the old ones faded below. */}
          <div className="mb-1.5 flex min-h-[2.25rem] items-end px-1" aria-live="off">
            <ProgressTimer
              stage={stage}
              activity={calculating ? activity : null}
              retryAt={retryAt}
              note={stale ? (published ? r9.publishedShown : lv.extrapStale) : null}
            />
          </div>
          {published && calculating && <p className="-mt-1 mb-1.5 px-1 text-xs text-muted-foreground sm:hidden">{r9.publishedShown}</p>}
          {series.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">{t.selectExtrap}</CardContent>
            </Card>
          ) : overLimit ? (
            <div className="grid content-start gap-3 sm:grid-cols-2">
              {items.map((item, i) => (
                <figure key={`${item.series.label}-${i}`} className="min-w-0 rounded-md border bg-card px-1 pb-1 pt-2">
                  <figcaption className="truncate px-2 text-xs font-medium">
                    <Sci>{item.series.label}</Sci>
                    {item.measured && <span className="ml-2 font-normal text-muted-foreground">{t.measured}</span>}
                  </figcaption>
                  <SegmentChart
                    series={[{ ...item.series, slot: 0 }]}
                    xLabel={item.angle ? t.angleAxis : t.energyAxis}
                    yLabel={item.yLabel}
                    logX={item.angle ? false : logX}
                    logY={logY}
                    height={210}
                    xDomain={item.angle ? null : zoom}
                    onXDomain={item.angle ? undefined : setZoom}
                    bands={item.angle ? [] : bands}
                    colouredCurves
                    xUnit={item.angle ? "°" : "MeV"}
                    xName={item.angle ? "θ" : "E"}
                    yUnit={item.unit}
                    svgRef={refFor(`f${i}`)}
                    ariaLabel={t.plotAria(item.yLabel, item.series.label)}
                  />
                </figure>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col overflow-hidden">
              <ul className="flex flex-wrap gap-x-4 gap-y-1 px-3 pt-3 text-xs" aria-label={t.keyLabel}>
                {series.map((s, i) => (
                  <li key={`${s.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
                    {s.points.length > 0 ? (
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--viz-series-${i + 1})` }} aria-hidden />
                    ) : (
                      <span className="inline-block h-0.5 w-4 shrink-0" style={{ background: `var(--viz-series-${i + 1})` }} aria-hidden />
                    )}
                    <span className="min-w-0 truncate">
                      <Sci>{s.label}</Sci>
                    </span>
                  </li>
                ))}
              </ul>
              <CardContent className="h-[18rem] max-h-[55svh] min-h-[12rem] p-1.5 sm:p-3 lg:h-[26rem] lg:max-h-none" aria-busy={calculating}>
                <SegmentChart
                  series={series}
                  xLabel={allAngle ? t.angleAxis : t.energyAxis}
                  yLabel={yLabel}
                  logX={allAngle ? false : logX}
                  logY={logY}
                  xDomain={zoom}
                  onXDomain={setZoom}
                  bands={allAngle ? [] : bands}
                  marks={allAngle ? [] : marks}
                  colouredCurves
                  xUnit={allAngle ? "°" : "MeV"}
                  xName={allAngle ? "θ" : "E"}
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

          {gw && gamowPair && !allAngle && (
            <p className="mt-2 text-xs text-muted-foreground">
              <Sci>
                {t.gamowNote(
                  decimal(T9, lang),
                  atlasLabel ? `${kelvin(Number(T9))}, ${atlasLabel}` : kelvin(Number(T9)),
                  `${fmtE(gw.E0 * 1000)} keV`,
                  `${fmtE(gw.width * 1000)} keV`,
                  gamowPair.label_plain ?? texPlain(gamowPair.label),
                )}
              </Sci>{" "}
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
            <CardHeader className="shrink-0 p-4 pb-3 sm:p-6 sm:pb-3">
              <CardTitle role="heading" aria-level={3} className="text-base">
                {t.extrapolations}
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6 lg:max-h-none">
              <div className="space-y-2 pr-1">
                {lines.map((segment) => (
                  <div key={segment.index} className="flex items-start gap-2">
                    <Checkbox
                      id={`ex-${segment.index}`}
                      checked={selected.includes(segment.index)}
                      disabled={!segment.energies?.length}
                      onCheckedChange={(checked) =>
                        startTransition(() =>
                          setSelected((current) => (checked ? [...current, segment.index] : current.filter((i) => i !== segment.index))),
                        )
                      }
                    />
                    <Label htmlFor={`ex-${segment.index}`} className="min-w-0 flex-1 cursor-pointer text-xs font-normal leading-tight">
                      <span className="block font-medium">
                        <Sci>{curveName(segment)}</Sci>
                      </span>
                      <span className="text-muted-foreground">
                        {isAngularCurve(segment) ? (
                          curveDetail(segment)
                        ) : (
                          <>
                            {curveDetail(segment)} ·{" "}
                            <Sci>{`${numberText(segment.energy_min, lang, 3)}–${numberText(segment.energy_max, lang, 4)}`}</Sci> MeV
                            {segment.energy_frame === "cm" ? " (c.m.)" : ""}
                          </>
                        )}
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

      {grids.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle role="heading" aria-level={3} className="text-base">
              {lv.gridTitle}
            </CardTitle>
            <CardDescription>{lv.gridText(grids.length)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {grids.map((g) => {
              const view = gridView[g.index]
              const known = dataOf(g)
              const state = fetched[g.index]
              const own = Boolean(g.energies?.length)
              const ne = own ? (known.map?.energies.length ?? 0) : (g.grid?.n_energies ?? 0)
              const na = own ? (known.map?.angles.length ?? 0) : (g.grid?.n_angles ?? 0)
              return (
                <div key={g.index} className="min-w-0 space-y-2 border-t pt-4 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="min-w-0 text-sm">
                      <span className="font-medium">
                        <Sci>{curveName(g)}</Sci>
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {observableLabel(g.observable, lang)}
                        {finalOf(g)}
                        {ne > 0 && na > 0 && (
                          <>
                            {" "}
                            ·{" "}
                            {Math.abs(g.angle_max - g.angle_min) < 1e-9
                              ? r9.gridSummaryOne(ne, fmtE(g.energy_min), fmtE(g.energy_max), decimal(String(Number(g.angle_min.toFixed(1))), lang))
                              : lv.gridSummary(
                                  ne,
                                  na,
                                  fmtE(g.energy_min),
                                  fmtE(g.energy_max),
                                  decimal(String(Number(g.angle_min.toFixed(1))), lang),
                                  decimal(String(Number(g.angle_max.toFixed(1))), lang),
                                )}
                          </>
                        )}
                      </span>
                    </p>
                    <div className="flex items-center gap-1" role="group" aria-label={curveName(g)}>
                      {!view ? (
                        <Button variant="outline" size="sm" className="h-8" onClick={() => showGrid(g)} disabled={Boolean(state?.loading) || (!own && !sessionId)}>
                          {state?.loading ? lv.gridLoading : lv.gridShow}
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant={view.mode === "angles" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-8"
                            aria-pressed={view.mode === "angles"}
                            onClick={() => setGridView((v) => ({ ...v, [g.index]: { ...view, mode: "angles" } }))}
                          >
                            {lv.gridAngles}
                          </Button>
                          <Button
                            variant={view.mode === "map" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-8"
                            aria-pressed={view.mode === "map"}
                            disabled={state?.loading === "map"}
                            onClick={() => showMap(g)}
                          >
                            {state?.loading === "map" ? lv.gridLoading : lv.gridMap}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() =>
                              setGridView((v) => {
                                const next = { ...v }
                                delete next[g.index]
                                return next
                              })
                            }
                          >
                            {lv.gridHide}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {state?.failed && <p className="text-xs text-destructive">{t.unexpected}</p>}
                  {view && known.cuts && view.mode === "angles" && (
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={lv.gridAngles}>
                      {known.cuts.map((c) => c.angle).map((angle) => {
                        const on = view.angles.includes(angle)
                        return (
                          <button
                            key={angle}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              startTransition(() =>
                                setGridView((v) => ({
                                  ...v,
                                  [g.index]: { ...view, angles: on ? view.angles.filter((a) => a !== angle) : [...view.angles, angle].sort((x, y) => x - y) },
                                })),
                              )
                            }
                            className={`min-h-8 rounded-full border px-3 text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              on ? "border-foreground/40 bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"
                            }`}
                          >
                            θ = {decimal(String(Number(angle.toFixed(1))), lang)}°
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {view && known.map && view.mode === "map" && (
                    <GridMap rows={known.map} label={`${curveName(g)} · ${observableLabel(g.observable, lang)}`} aria={lv.gridMapAria(curveName(g))} lang={lang} />
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {lowest.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4 text-sm sm:p-5">
            <ul className="space-y-1">
              {lowest.map(({ segment, energy, value }) => {
                const u = sfactorUnit(value)
                return (
                  <li key={segment.index} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-muted-foreground">
                      <Sci>{curveLabel(segment)}</Sci>:
                    </span>
                    <span className="tabular-nums">
                      <i>S</i>(<i>E</i>
                      <sub>min</sub> = {fmtE(energy * 1000)} keV) ={" "}
                      <span className="font-semibold">
                        <Sci>{fmt(value * u.factor)}</Sci> {u.unit}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-muted-foreground">{rich(t.sZeroNote)}</p>
            <p className="text-xs text-muted-foreground">{rich(t.rateNote)}</p>
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

/**
 * A small map of an energy × angle grid: energy across, angle up, the cross
 * section as a sequential colour on a log scale (lighter: smaller). At most
 * ~120 × 37 cells, averaged from the full grid.
 */
const GridMap = memo(function GridMap({ rows, label, aria, lang }: { rows: GridRows; label: string; aria: string; lang: "en" | "it" }) {
  const cols = Math.min(120, rows.energies.length)
  const rowsN = Math.min(37, rows.angles.length)
  const cells = useMemo(() => {
    const out: { i: number; j: number; v: number }[] = []
    const ce = rows.energies.length / cols
    const ca = rows.angles.length / rowsN
    for (let i = 0; i < rowsN; i++)
      for (let j = 0; j < cols; j++) {
        let sum = 0
        let n = 0
        for (let a = Math.floor(i * ca); a < Math.max(Math.floor(i * ca) + 1, Math.floor((i + 1) * ca)); a++)
          for (let e = Math.floor(j * ce); e < Math.max(Math.floor(j * ce) + 1, Math.floor((j + 1) * ce)); e++) {
            const v = rows.values[a]?.[e]
            if (Number.isFinite(v) && v > 0) {
              sum += Math.log10(v)
              n++
            }
          }
        if (n) out.push({ i, j, v: sum / n })
      }
    return out
  }, [rows, cols, rowsN])
  if (cells.length === 0) return null
  let lo = Infinity
  let hi = -Infinity
  for (const c of cells) {
    lo = Math.min(lo, c.v)
    hi = Math.max(hi, c.v)
  }
  const W = 600
  const H = 180
  const cw = W / cols
  const ch = H / rowsN
  const fmt = (v: number) => decimal(String(Number(v.toPrecision(3))), lang)
  const e0 = rows.energies[0]
  const e1 = rows.energies[rows.energies.length - 1]
  const a0 = rows.angles[0]
  const a1 = rows.angles[rows.angles.length - 1]
  const mix = (v: number) => `color-mix(in oklab, var(--viz-series-1) ${Math.round(12 + 88 * ((v - lo) / (hi - lo || 1)))}%, var(--viz-surface))`
  return (
    <figure className="min-w-0">
      <svg viewBox={`-44 -6 ${W + 52} ${H + 34}`} className="h-auto w-full max-w-3xl" role="img" aria-label={aria}>
        <title>{label}</title>
        {cells.map((c) => (
          <rect key={`${c.i}-${c.j}`} x={c.j * cw} y={H - (c.i + 1) * ch} width={cw + 0.5} height={ch + 0.5} fill={mix(c.v)} />
        ))}
        <rect x={0} y={0} width={W} height={H} fill="none" stroke="var(--viz-axis)" />
        <text x={0} y={H + 16} fontSize={12} fill="var(--viz-text-muted)">{fmt(e0)}</text>
        <text x={W} y={H + 16} fontSize={12} textAnchor="end" fill="var(--viz-text-muted)">{fmt(e1)} MeV</text>
        <text x={W / 2} y={H + 16} fontSize={12} textAnchor="middle" fill="var(--viz-text-muted)">E (c.m.)</text>
        <text x={-6} y={H} fontSize={12} textAnchor="end" fill="var(--viz-text-muted)">{fmt(a0)}°</text>
        <text x={-6} y={10} fontSize={12} textAnchor="end" fill="var(--viz-text-muted)">{fmt(a1)}°</text>
        <text x={-6} y={H / 2} fontSize={12} textAnchor="end" fill="var(--viz-text-muted)">θ</text>
      </svg>
      <figcaption className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{fmt(10 ** lo)}</span>
        <span className="h-2 w-24 rounded-sm" style={{ background: `linear-gradient(to right, ${mix(lo)}, ${mix(hi)})` }} aria-hidden />
        <span>{fmt(10 ** hi)}</span>
        <span>dσ/dΩ (b/sr, log)</span>
      </figcaption>
    </figure>
  )
})
