"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import { ImageDown, Maximize2, ZoomIn } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Sci } from "@/components/sci"
import { Unit, texPlain } from "@/components/tex"
import type { SchemeLevel, SchemePair } from "@/lib/api"
import { decimal } from "@/lib/i18n-eval"
import {
  buildAxis,
  entranceOf,
  findBackground,
  formatLevelEnergy,
  ancChannels,
  hasAnc,
  jpiOrder,
  jpiPlain,
  levelKey,
  levelStatus,
  levelWidth,
  normaliseThresholds,
  poleNotes,
  segmentTicks,
  speciesList,
  spreadLabels,
  thresholdsFromPairs,
  BREAK_GAP,
  type EnergyAxis,
  type LevelStatus,
  type LevelWidth,
  type PoleNote,
  type Threshold,
  type ThresholdInput,
} from "@/lib/level-layout"
import { formatQuantity } from "@/lib/viz"
import { numberText } from "@/lib/eval-plot"
import { localePath } from "@/lib/locale"
import { useLang } from "@/components/lang-context"
import { useEvalDict } from "@/components/eval-dict"

/**
 * The level scheme as a figure: one vertical excitation-energy axis, a column
 * per J^pi (ordered by spin, then parity), the particle thresholds across the
 * frame, and the centre-of-mass energy of the entrance channel on the right.
 *
 * The axis is broken where a long empty stretch would otherwise squash the
 * levels (between bound states and the resonance window, and below the
 * background poles), so the interesting range fills the height. Labels are
 * never dropped: crowded ones are pushed apart and tied back with leaders, and
 * the axis can be zoomed by dragging along it.
 *
 * Below ~600 px (or when the columns would be narrower than a label) the same
 * axis is drawn as one column with a list of levels and thresholds beside it,
 * each row tied to its energy by a leader.
 *
 * The SVG is drawn at the container's pixel width rather than scaled from a
 * fixed viewBox, so text is always set at its nominal size (never below 11 px).
 */

export interface LevelDiagramProps {
  levels: SchemeLevel[]
  /** The scheme's particle pairs: thresholds and channel species come from them. */
  pairs?: SchemePair[]
  /** Thresholds supplied by the caller; derived from `pairs` when absent. */
  thresholds?: ThresholdInput[]
  /** Key of the selected level (`levelKey`: "<jgroup>-<level>"). Uncontrolled when undefined. */
  selectedLevel?: string | null
  onSelectLevel?: (key: string | null) => void
  /** Hover / keyboard focus, for linking a table row or slider group. */
  onHoverLevel?: (key: string | null) => void
  /** Excitation-energy range of the fitted data, MeV (see dataRangeFromSegments). */
  dataRange?: { min: number; max: number } | null
  /** Keys of levels whose parameters have been edited: drawn with a halo. */
  editedLevels?: string[]
}

/** Below this container width the columns give way to the list layout. */
const LIST_BELOW = 600
/** Least column width for the column layout. */
const MIN_COLUMN = 84
const LABEL_W = 40
const BAR_W = 12
const ROW_GAP = 12
const LIST_ROW = 26

const SPECIES_HUES = ["var(--viz-series-2)", "var(--viz-series-3)", "var(--viz-series-1)"]

/* -- text in SVG -------------------------------------------------------------- */

const SUPERS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "−",
}
const SUBS: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
}
/** Brackets a run to be set as a subscript (`S` + SUB_OPEN + `p` + SUB_CLOSE). */
const SUB_OPEN = "⁣"
const SUB_CLOSE = "⁤"

/**
 * Unicode super/subscripts (`¹²C`, `p₁`, `1/2⁺`) as shifted, smaller tspans:
 * the web fonts lack those glyphs, the same reason <Sci> exists for HTML.
 */
function svgSci(text: string, size: number): ReactNode[] {
  type Kind = "base" | "sup" | "sub"
  const runs: { kind: Kind; text: string }[] = []
  let forced = false
  for (const c of text) {
    if (c === SUB_OPEN) {
      forced = true
      continue
    }
    if (c === SUB_CLOSE) {
      forced = false
      continue
    }
    const kind: Kind = forced ? "sub" : c in SUPERS ? "sup" : c in SUBS ? "sub" : "base"
    const ch = SUPERS[c] ?? SUBS[c] ?? c
    const last = runs[runs.length - 1]
    if (last && last.kind === kind) last.text += ch
    else runs.push({ kind, text: ch })
  }
  const out: ReactNode[] = []
  let offset = 0
  runs.forEach((run, n) => {
    const target = run.kind === "sup" ? -0.4 * size : run.kind === "sub" ? 0.28 * size : 0
    out.push(
      <tspan key={n} dy={target - offset || undefined} fontSize={run.kind === "base" ? undefined : size * 0.74}>
        {run.text}
      </tspan>,
    )
    offset = target
  })
  if (offset !== 0) out.push(<tspan key="end" dy={-offset} />)
  return out
}

/** "E" with a subscript, for the axis titles. */
function sub(base: string, index: string, size: number) {
  return (
    <>
      <tspan fontStyle="italic">{base}</tspan>
      <tspan dy={0.28 * size} fontSize={size * 0.74}>
        {index}
      </tspan>
      <tspan dy={-0.28 * size}> </tspan>
    </>
  )
}

/* -- container width -------------------------------------------------------- */

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(Math.floor(el.getBoundingClientRect().width))
    const observer = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width)
      setWidth((current) => (Math.abs(current - w) >= 1 ? w : current))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/* -- the component ---------------------------------------------------------- */

interface Item {
  level: SchemeLevel
  key: string
  status: LevelStatus
  anc: boolean
  width: LevelWidth
  /** Why it may be an effective pole (lib/level-layout's poleNotes). */
  notes: PoleNote[]
  /** Drawn as an effective pole (dashed): far above the data or overlapping one of its J^pi. */
  effective: boolean
}

export function LevelDiagram({
  levels,
  pairs,
  thresholds: thresholdInput,
  selectedLevel,
  onSelectLevel,
  onHoverLevel,
  dataRange,
  editedLevels,
}: LevelDiagramProps) {
  const t = useEvalDict().levels
  const lang = useLang()
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const width = useWidth(wrapRef)

  // Selection is controlled when the caller passes it, local otherwise.
  const [localSelected, setLocalSelected] = useState<string | null>(null)
  const selected = selectedLevel !== undefined ? selectedLevel : localSelected
  const select = useCallback(
    (key: string | null) => {
      setLocalSelected(key)
      onSelectLevel?.(key)
    },
    [onSelectLevel],
  )
  const [hovered, setHovered] = useState<string | null>(null)
  const hover = useCallback(
    (key: string | null) => {
      setHovered(key)
      onHoverLevel?.(key)
    },
    [onHoverLevel],
  )
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  const [brush, setBrush] = useState<{ from: number; to: number } | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const nodes = useRef(new Map<string, SVGGElement>())

  const num = useCallback((s: string) => decimal(s, lang), [lang])

  /* -- data ------------------------------------------------------------- */

  const thresholds = useMemo<Threshold[]>(
    () => (thresholdInput ? normaliseThresholds(thresholdInput) : thresholdsFromPairs(pairs)),
    [thresholdInput, pairs],
  )
  const entrance = useMemo(() => entranceOf(thresholds), [thresholds])
  const background = useMemo(() => findBackground(levels), [levels])

  const items = useMemo<Item[]>(() => {
    const notes = poleNotes(levels, pairs, dataRange, entrance?.energy, background?.keys)
    return levels.map((level) => {
      const n = notes.get(levelKey(level)) ?? []
      return {
        level,
        key: levelKey(level),
        status: levelStatus(level),
        anc: hasAnc(level, entrance?.energy),
        width: levelWidth(level, pairs),
        notes: n,
        effective: n.some((x) => x.kind !== "photon"),
      }
    })
  }, [levels, pairs, dataRange, entrance, background])
  // Hues go to the species that actually carry a width, in pair order.
  const species = useMemo(() => {
    const carrying = new Set(items.flatMap((i) => i.width.parts.filter((p) => !p.photon).map((p) => p.species)))
    const list = speciesList(pairs).filter((s) => carrying.has(s))
    for (const s of carrying) if (!list.includes(s)) list.push(s)
    return list
  }, [pairs, items])
  const hueOf = useCallback(
    (name: string, photon: boolean) =>
      photon
        ? "var(--viz-text-muted)"
        : (SPECIES_HUES[Math.max(0, species.indexOf(name)) % SPECIES_HUES.length] ?? "var(--viz-axis)"),
    [species],
  )

  const main = useMemo(() => items.filter((item) => !background?.keys.has(item.key)), [items, background])
  const visible = useMemo(
    () => (zoom ? main.filter((i) => i.level.energy >= zoom[0] && i.level.energy <= zoom[1]) : main),
    [main, zoom],
  )
  const hiddenAbove = zoom ? main.filter((i) => i.level.energy > zoom[1]).length : 0
  const hiddenBelow = zoom ? main.filter((i) => i.level.energy < zoom[0]).length : 0

  const columns = useMemo(() => {
    const groups = new Map<string, Item[]>()
    for (const item of visible) {
      const list = groups.get(item.level.jpi) ?? []
      list.push(item)
      groups.set(item.level.jpi, list)
    }
    return [...groups.entries()]
      .sort((a, b) => jpiOrder(a[0]) - jpiOrder(b[0]))
      .map(([jpi, list]) => ({ jpi, items: [...list].sort((a, b) => a.level.energy - b.level.energy) }))
  }, [visible])

  /* -- layout ------------------------------------------------------------- */

  const padRight = entrance ? 58 : 18
  const list =
    width > 0 && (width < LIST_BELOW || (width - 62 - padRight) / Math.max(1, columns.length) < MIN_COLUMN)

  const shownThresholds = useMemo(
    () => (zoom ? thresholds.filter((th) => th.energy >= zoom[0] && th.energy <= zoom[1]) : thresholds),
    [thresholds, zoom],
  )

  const layout = useMemo(() => {
    if (width === 0) return null
    const W = width
    const bandH = background && !zoom ? 30 : 0
    const band = bandH ? bandH + BREAK_GAP : 0
    const pad = list
      ? { left: 40, right: 8, top: 12 + band + (hiddenAbove ? 16 : 0), bottom: 14 + (hiddenBelow ? 16 : 0) }
      : {
          left: 62,
          right: padRight,
          top: 14 + band + (hiddenAbove ? 14 : 0),
          bottom: 34 + (hiddenBelow ? 14 : 0),
        }
    // Height: enough for the most crowded column's labels (or every list
    // row), within limits that keep the figure on one screen on a desktop.
    const crowd = list
      ? (visible.length + shownThresholds.length) * LIST_ROW + 12
      : Math.max(0, ...columns.map((c) => c.items.length)) * (ROW_GAP + 2)
    const base = list ? 360 : Math.min(580, Math.max(440, W * 0.44))
    const plotH = Math.max(base - pad.top - pad.bottom, crowd)
    const H = plotH + pad.top + pad.bottom

    const core: number[] = visible.map((i) => i.level.energy)
    // The data range is an interval, not two points: sample it so no break
    // can open inside it.
    if (dataRange && !zoom) {
      for (let k = 0; k <= 24; k++) core.push(dataRange.min + ((dataRange.max - dataRange.min) * k) / 24)
    }
    if (entrance && !zoom) core.push(entrance.energy)
    const extra = shownThresholds.filter((th) => th !== entrance || zoom).map((th) => th.energy)
    const axis = buildAxis({
      core: core.length ? core : [0],
      extra,
      top: pad.top,
      bottom: pad.top + plotH,
      zoom,
    })
    return { W, H, pad, axis, bandH }
  }, [width, list, background, zoom, visible, shownThresholds, columns, dataRange, entrance, hiddenAbove, hiddenBelow, padRight])

  // Keyboard order: column by column (or by energy in the list), bottom up.
  const order = useMemo(() => {
    if (list) return [...visible].sort((a, b) => a.level.energy - b.level.energy).map((i) => i.key)
    return columns.flatMap((c) => c.items.map((i) => i.key))
  }, [list, visible, columns])

  const tabbable =
    focusKey && order.includes(focusKey) ? focusKey : selected && order.includes(selected) ? selected : order[0]

  const focusLevel = (key: string | undefined) => {
    if (!key) return
    setFocusKey(key)
    requestAnimationFrame(() => nodes.current.get(key)?.focus())
  }

  const onLevelKey = (event: KeyboardEvent<SVGGElement>, key: string) => {
    const at = order.indexOf(key)
    const item = visible.find((i) => i.key === key)
    if (!item) return
    let next: string | undefined
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      select(selected === key ? null : key)
      return
    }
    if (event.key === "Escape") {
      select(null)
      return
    }
    if (list || event.key === "Home" || event.key === "End") {
      if (event.key === "ArrowUp" || event.key === "ArrowRight") next = order[at + 1]
      if (event.key === "ArrowDown" || event.key === "ArrowLeft") next = order[at - 1]
      if (event.key === "Home") next = order[0]
      if (event.key === "End") next = order[order.length - 1]
    } else {
      const ci = columns.findIndex((c) => c.jpi === item.level.jpi)
      const col = columns[ci]
      const ri = col.items.findIndex((i) => i.key === key)
      if (event.key === "ArrowUp") next = col.items[ri + 1]?.key
      if (event.key === "ArrowDown") next = col.items[ri - 1]?.key
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const other = columns[ci + (event.key === "ArrowLeft" ? -1 : 1)]
        if (other) {
          next = [...other.items].sort(
            (a, b) => Math.abs(a.level.energy - item.level.energy) - Math.abs(b.level.energy - item.level.energy),
          )[0]?.key
        }
      }
    }
    if (next) {
      event.preventDefault()
      focusLevel(next)
    }
  }

  // A level selected elsewhere (table, sliders) must be visible: leave the zoom.
  useEffect(() => {
    if (!zoom || !selected) return
    const item = main.find((i) => i.key === selected)
    if (item && (item.level.energy < zoom[0] || item.level.energy > zoom[1])) setZoom(null)
  }, [selected, zoom, main])

  /* -- zoom by dragging along the axis ----------------------------------- */

  const dragging = useRef<{ id: number; from: number } | null>(null)
  const svgY = (event: ReactPointerEvent) => {
    const svg = svgRef.current
    if (!svg) return 0
    return event.clientY - svg.getBoundingClientRect().top
  }
  const onAxisDown = (event: ReactPointerEvent<SVGRectElement>) => {
    event.preventDefault()
    const y = svgY(event)
    dragging.current = { id: event.pointerId, from: y }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    setBrush({ from: y, to: y })
  }
  const onAxisMove = (event: ReactPointerEvent<SVGRectElement>) => {
    if (!dragging.current || dragging.current.id !== event.pointerId) return
    setBrush({ from: dragging.current.from, to: svgY(event) })
  }
  const onAxisUp = (event: ReactPointerEvent<SVGRectElement>) => {
    const drag = dragging.current
    dragging.current = null
    setBrush(null)
    if (!drag || !layout) return
    const to = svgY(event)
    if (Math.abs(to - drag.from) < 10) return
    const { axis } = layout
    const energyAt = (py: number) => {
      const y = Math.min(Math.max(py, axis.top), axis.bottom)
      const e = axis.invert(y)
      if (e !== null) return e
      // In a break: the nearer edge.
      let best = axis.segments[0]
      let dist = Infinity
      for (const s of axis.segments) {
        const d = Math.min(Math.abs(s.top - y), Math.abs(s.bottom - y))
        if (d < dist) {
          dist = d
          best = s
        }
      }
      return Math.abs(best.top - y) < Math.abs(best.bottom - y) ? best.hi : best.lo
    }
    const a = energyAt(drag.from)
    const b = energyAt(to)
    if (Math.abs(b - a) > 0.005) setZoom([Math.min(a, b), Math.max(a, b)])
  }

  /* -- export ------------------------------------------------------------- */

  const download = () => {
    const svg = svgRef.current
    if (!svg) return
    // The figure paints with CSS custom properties so it follows the theme;
    // bake the current values into the copy that is saved.
    const clone = svg.cloneNode(true) as SVGSVGElement
    const styles = getComputedStyle(document.documentElement)
    const resolve = (value: string) =>
      value.replace(/var\((--[\w-]+)\)/g, (_, name) => styles.getPropertyValue(name).trim() || "#000000")
    for (const node of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
      for (const attribute of ["fill", "stroke"]) {
        const value = node.getAttribute(attribute)
        if (value?.includes("var(")) node.setAttribute(attribute, resolve(value))
      }
      node.removeAttribute("tabindex")
      node.removeAttribute("class")
    }
    clone.querySelectorAll("[data-ui]").forEach((n) => n.remove())
    clone.setAttribute("font-family", "Inter, Helvetica, Arial, sans-serif")
    const source = new XMLSerializer().serializeToString(clone)
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', source], {
      type: "image/svg+xml;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "level-scheme.svg"
    link.click()
    URL.revokeObjectURL(url)
  }

  /* -- words -------------------------------------------------------------- */

  const widthText = (w: LevelWidth) =>
    w.parts
      .map((p) => {
        const q = formatQuantity(p.gamma * 1e6, "eV")
        return `Γ ${p.species} ${num(q.text)} ${q.unit}`
      })
      .join(", ")

  const ariaFor = (item: Item) =>
    t.levelAria(jpiPlain(item.level.jpi), num(formatLevelEnergy(item.level.energy)), t.status[item.status], widthText(item.width))

  const focusOn = hovered ?? selected
  const active = main.find((i) => i.key === focusOn) ?? items.find((i) => i.key === focusOn)
  const edited = new Set(editedLevels ?? [])

  if (levels.length === 0) return null

  /* -- drawing helpers ---------------------------------------------------- */

  // Energy fitted: series-1 at 2.5 px; widths only: series-1 at 1.5 px and
  // 80 % (3.1:1 on the light surface, 3.5:1 on the dark one); fixed: the muted grey.
  const lineColor = (s: LevelStatus) => (s === "fixed" ? "var(--viz-text-muted)" : "var(--viz-series-1)")
  const lineWidth = (s: LevelStatus) => (s === "free" ? 2.5 : 1.5)
  const lineOpacity = (s: LevelStatus) => (s === "partial" ? 0.8 : 1)

  /** Too wide to shade (Γ ≥ 15 % of the visible range): a ↕ mark and its value instead. */
  const tooWide = (axis: EnergyAxis, item: Item) => {
    const g = item.width.total
    const seg = axis.segmentOf(item.level.energy)
    return g > 0 && seg !== null && !seg.auxiliary && g >= 0.15 * (seg.hi - seg.lo)
  }
  const gammaText = (g: number) => {
    const q = formatQuantity(g * 1e6, "eV")
    return `${num(q.text)} ${q.unit}`
  }

  /** The ±Γ/2 band, kept inside the level's own axis segment. */
  const widthBand = (axis: EnergyAxis, item: Item, x1: number, x2: number) => {
    const g = item.width.total
    if (!(g > 0)) return null
    const seg = axis.segmentOf(item.level.energy)
    if (!seg || seg.auxiliary) return null
    if (tooWide(axis, item)) {
      const y = axis.y(item.level.energy)
      const x = x1 - 5
      return (
        <g key={`band-${item.key}`} pointerEvents="none" stroke={lineColor(item.status)} fill="none" strokeWidth={1}>
          <path d={`M${x},${y - 9}V${y + 9}M${x - 2.5},${y - 6.5}L${x},${y - 9}L${x + 2.5},${y - 6.5}M${x - 2.5},${y + 6.5}L${x},${y + 9}L${x + 2.5},${y + 6.5}`} />
        </g>
      )
    }
    const top = Math.max(seg.top, axis.y(Math.min(item.level.energy + g / 2, seg.hi)))
    const bottom = Math.min(seg.bottom, axis.y(Math.max(item.level.energy - g / 2, seg.lo)))
    if (bottom - top < 2.5) return null
    return (
      <rect
        key={`band-${item.key}`}
        x={x1}
        y={top}
        width={x2 - x1}
        height={bottom - top}
        fill={lineColor(item.status)}
        opacity={list ? 0.07 : 0.11}
        pointerEvents="none"
      />
    )
  }

  /** Stacked bar: one segment per channel species, sized by Γ_c/Γ. */
  const channelBar = (item: Item, x: number, y: number) => {
    const g = item.width.total
    if (!(g > 0)) return null
    let cursor = x
    return (
      <g pointerEvents="none">
        <rect x={x - 0.5} y={y - 3} width={BAR_W + 1} height={6} fill="var(--viz-surface)" />
        {item.width.parts.map((p) => {
          const w = (p.gamma / g) * BAR_W
          const rect = <rect key={p.species} x={cursor} y={y - 2.5} width={w} height={5} fill={hueOf(p.species, p.photon)} />
          cursor += w
          return rect
        })}
      </g>
    )
  }

  const levelLine = (item: Item, x1: number, x2: number, y: number, isSelected: boolean, isHovered: boolean) => (
    <>
      {(isSelected || isHovered || edited.has(item.key)) && (
        <line
          x1={x1}
          x2={x2}
          y1={y}
          y2={y}
          stroke={isSelected || isHovered ? "var(--viz-series-1)" : "var(--viz-series-2)"}
          strokeWidth={isSelected ? 10 : isHovered ? 8 : 6}
          strokeLinecap="round"
          opacity={isSelected ? 0.3 : 0.2}
          pointerEvents="none"
        />
      )}
      <line
        x1={item.anc ? x1 + 3.5 : x1}
        x2={x2}
        y1={y}
        y2={y}
        stroke={lineColor(item.status)}
        strokeWidth={lineWidth(item.status)}
        strokeOpacity={lineOpacity(item.status)}
        strokeDasharray={item.effective ? "6 3" : undefined}
      />
      {item.anc && <circle cx={x1} cy={y} r={3} fill="var(--viz-surface)" stroke={lineColor(item.status)} strokeWidth={1.5} />}
    </>
  )

  const levelProps = (item: Item, isSel: boolean, touchHover: boolean) => ({
    ref: (el: SVGGElement | null) => {
      if (el) nodes.current.set(item.key, el)
      else nodes.current.delete(item.key)
    },
    role: "button",
    "aria-pressed": isSel,
    "aria-label": ariaFor(item),
    tabIndex: item.key === tabbable ? 0 : -1,
    className: "cursor-pointer outline-none [&:focus-visible>.focus]:opacity-100",
    onClick: () => select(isSel ? null : item.key),
    onPointerEnter: (e: ReactPointerEvent) => (touchHover || e.pointerType === "mouse") && hover(item.key),
    onPointerLeave: (e: ReactPointerEvent) => (touchHover || e.pointerType === "mouse") && hover(null),
    onFocus: () => {
      setFocusKey(item.key)
      hover(item.key)
    },
    onBlur: () => hover(null),
    onKeyDown: (e: KeyboardEvent<SVGGElement>) => onLevelKey(e, item.key),
  })

  /* -- the figure ----------------------------------------------------------- */

  let figure: ReactNode = null
  let crowded = false

  if (layout) {
    const { W, H, pad, axis, bandH } = layout
    const plotL = pad.left
    const plotR = W - pad.right
    const segs = axis.segments
    const fmtTick = (v: number) => num(String(Math.abs(v) < 1e-9 ? 0 : v)).replace("-", "−")

    // Frame, ticks, breaks.
    const frame = (
      <g>
        {segs.map((s, i) => (
          <g key={i}>
            {s.auxiliary && (
              <rect x={plotL} y={s.top} width={(list ? plotL + 26 : plotR) - plotL} height={s.bottom - s.top} fill="var(--viz-grid)" opacity={0.35} />
            )}
            {!s.auxiliary &&
              segmentTicks(s).map((v) => (
                <g key={v}>
                  <line
                    x1={plotL}
                    x2={list ? plotL + 26 : plotR}
                    y1={axis.y(v)}
                    y2={axis.y(v)}
                    stroke="var(--viz-grid)"
                  />
                  <line x1={plotL - 4} x2={plotL} y1={axis.y(v)} y2={axis.y(v)} stroke="var(--viz-axis)" />
                  <text x={plotL - 7} y={axis.y(v) + 4} textAnchor="end" fontSize={11} fill="var(--viz-text-muted)">
                    {fmtTick(v)}
                  </text>
                </g>
              ))}
            <line x1={plotL} x2={plotL} y1={s.top} y2={s.bottom} stroke="var(--viz-axis)" />
            {!list && <line x1={plotR} x2={plotR} y1={s.top} y2={s.bottom} stroke="var(--viz-axis)" />}
            {i < segs.length - 1 &&
              [plotL, ...(list ? [] : [plotR])].map((x) => (
                <path
                  key={x}
                  d={`M ${x - 5} ${s.top - 1} l 10 -4 M ${x - 5} ${s.top - BREAK_GAP + 5} l 10 -4`}
                  stroke="var(--viz-text-muted)"
                  strokeWidth={1}
                  fill="none"
                />
              ))}
          </g>
        ))}
        {!list && (
          <>
            <line x1={plotL} x2={plotR} y1={segs[0].bottom} y2={segs[0].bottom} stroke="var(--viz-axis)" />
            <line x1={plotL} x2={plotR} y1={segs[segs.length - 1].top} y2={segs[segs.length - 1].top} stroke="var(--viz-axis)" />
          </>
        )}
        <text
          transform={`translate(13 ${(axis.top + axis.bottom) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={12}
          fill="var(--viz-text)"
        >
          {!list && <tspan>{t.excitation} </tspan>}
          {sub("E", "x", 12)}
          <tspan>(MeV)</tspan>
        </text>
      </g>
    )

    // Secondary axis: E_c.m. in the entrance channel.
    const cmAxis =
      !list && entrance ? (
        <g>
          {segs.map((s, i) =>
            s.auxiliary
              ? null
              : segmentTicks(s, entrance.energy)
                  .filter((v) => v >= -1e-9)
                  .map((v) => {
                    const y = axis.y(v + entrance.energy)
                    return (
                      <g key={`${i}-${v}`}>
                        <line x1={plotR} x2={plotR + 4} y1={y} y2={y} stroke="var(--viz-axis)" />
                        <text x={plotR + 7} y={y + 4} fontSize={11} fill="var(--viz-text-muted)">
                          {fmtTick(v)}
                        </text>
                      </g>
                    )
                  }),
          )}
          <text
            transform={`translate(${W - 12} ${(axis.top + axis.bottom) / 2}) rotate(90)`}
            textAnchor="middle"
            fontSize={12}
            fill="var(--viz-text)"
          >
            {sub("E", "c.m.", 12)}
            {svgSci(t.cm(entrance.pair), 12)}
            <tspan> (MeV)</tspan>
          </text>
        </g>
      ) : null

    // Fitted-data range: a 3 px rail on the c.m. (right-hand) axis, per segment.
    const dataBand =
      dataRange &&
      segs.map((s, i) => {
        if (s.auxiliary) return null
        const lo = Math.max(dataRange.min, s.lo)
        const hi = Math.min(dataRange.max, s.hi)
        if (hi <= lo) return null
        const y1 = axis.y(hi)
        const y2 = axis.y(lo)
        return <rect key={i} x={plotR - 1.5} y={y1} width={3} height={y2 - y1} fill="var(--viz-series-1)" pointerEvents="none" />
      })

    // Background poles: one band above the top break.
    const bgItems = background && !zoom ? items.filter((i) => background.keys.has(i.key)) : []
    const bandTop = axis.segments[axis.segments.length - 1].top - BREAK_GAP - bandH
    const bgEnergy = background ? num(String(Number(background.energy.toFixed(2)))) : ""
    const bgLabelStart = plotR - 8 - t.background(bgItems.length, bgEnergy).length * 6
    const bgBand =
      bgItems.length > 0 ? (
        <g>
          <rect x={plotL} y={bandTop} width={plotR - plotL} height={bandH} fill="var(--viz-grid)" opacity={0.5} />
          <line x1={plotL} x2={plotL} y1={bandTop} y2={bandTop + bandH} stroke="var(--viz-axis)" />
          {!list && <line x1={plotR} x2={plotR} y1={bandTop} y2={bandTop + bandH} stroke="var(--viz-axis)" />}
          {[plotL, ...(list ? [] : [plotR])].map((x) => (
            <path
              key={x}
              d={`M ${x - 5} ${bandTop + bandH + BREAK_GAP - 1} l 10 -4 M ${x - 5} ${bandTop + bandH + 5} l 10 -4`}
              stroke="var(--viz-text-muted)"
              fill="none"
            />
          ))}
          <text x={plotL - 7} y={bandTop + bandH / 2 + 4} textAnchor="end" fontSize={11} fill="var(--viz-text-muted)">
            {bgEnergy}
          </text>
          <text
            x={list ? plotL + 10 : plotR - 8}
            y={bandTop + bandH / 2 + 4}
            textAnchor={list ? "start" : "end"}
            fontSize={11}
            fill="var(--viz-text-muted)"
          >
            {list ? t.backgroundShort(bgItems.length, bgEnergy) : t.background(bgItems.length, bgEnergy)}
          </text>
        </g>
      ) : null

    // Threshold lines (and, in the column layout, their labels at the right).
    const thresholdRows = shownThresholds.filter((th) => axis.segmentOf(th.energy))
    const thresholdLabel = (th: Threshold) =>
      th.excitation > 1e-6
        ? `${th.pair}\u2003${num(formatLevelEnergy(th.energy))} MeV`
        : `${th.pair}\u2003S${SUB_OPEN}${th.particle}${SUB_CLOSE} = ${num(formatLevelEnergy(th.separation))} MeV`
    const thresholdLines = (
      <g pointerEvents="none">
        {thresholdRows.map((th) => (
          <line
            key={th.key}
            x1={plotL}
            x2={list ? plotL + 26 : plotR}
            y1={axis.y(th.energy)}
            y2={axis.y(th.energy)}
            stroke="var(--viz-text-muted)"
            strokeWidth={1}
            strokeDasharray="5 3"
          />
        ))}
      </g>
    )

    const zoomMarks =
      hiddenAbove || hiddenBelow ? (
        <g data-ui fontSize={11} fill="var(--viz-text-muted)">
          {hiddenAbove > 0 && (
            <text x={(plotL + plotR) / 2} y={axis.top - 7} textAnchor="middle">
              ▲ {t.moreAbove(hiddenAbove)}
            </text>
          )}
          {hiddenBelow > 0 && (
            <text x={(plotL + plotR) / 2} y={axis.bottom + 14} textAnchor="middle">
              ▼ {t.moreBelow(hiddenBelow)}
            </text>
          )}
        </g>
      ) : null

    const brushLayer = (
      <g data-ui>
        {brush && (
          <rect
            x={0}
            y={Math.min(brush.from, brush.to)}
            width={W}
            height={Math.abs(brush.to - brush.from)}
            fill="var(--viz-series-1)"
            opacity={0.1}
            pointerEvents="none"
          />
        )}
        <rect
          x={0}
          y={axis.top - 6}
          width={plotL + 2}
          height={axis.bottom - axis.top + 12}
          fill="transparent"
          style={{ cursor: "ns-resize", touchAction: "none" }}
          onPointerDown={onAxisDown}
          onPointerMove={onAxisMove}
          onPointerUp={onAxisUp}
          onPointerCancel={onAxisUp}
        />
      </g>
    )

    let body: ReactNode
    let overlay: ReactNode = null

    if (!list) {
      const placedThr = spreadLabels(
        thresholdRows.map((th) => ({ key: th.key, y: axis.y(th.energy) - 4 })),
        13,
        axis.top + 10,
        axis.bottom - 2,
      )
      overlay = (
        <g pointerEvents="none">
          {thresholdRows.map((th) => (
            <text
              key={th.key}
              x={plotR - 6}
              y={placedThr.get(th.key)}
              textAnchor="end"
              fontSize={11}
              fill="var(--viz-text-muted)"
              stroke="var(--viz-surface)"
              strokeWidth={3.5}
              paintOrder="stroke"
              strokeLinejoin="round"
            >
              {svgSci(thresholdLabel(th), 11)}
            </text>
          ))}
        </g>
      )

      const cw = (plotR - plotL) / Math.max(1, columns.length)
      const lineLen = Math.min(110, Math.max(18, cw - 14 - BAR_W - 3 - 8 - LABEL_W))
      const groupW = lineLen + BAR_W + 3 + 8 + LABEL_W
      // Room beside the energy for "· Γ 6.7 MeV" (a width too large to shade).
      const roomy = cw - groupW - Math.max(10, (cw - groupW) / 2) > 64
      body = columns.map((col, ci) => {
        const x0 = plotL + ci * cw
        const lineStart = x0 + Math.max(10, (cw - groupW) / 2)
        const lineEnd = lineStart + lineLen
        const barX = lineEnd + 3
        const labelX = barX + BAR_W + 8
        const placed = spreadLabels(
          col.items.map((i) => ({ key: i.key, y: axis.y(i.level.energy) })),
          ROW_GAP,
          axis.top + 6,
          axis.bottom - 4,
        )
        for (const i of col.items) if (Math.abs((placed.get(i.key) ?? 0) - axis.y(i.level.energy)) > 24) crowded = true
        return (
          <g key={col.jpi}>
            <text x={lineStart + lineLen / 2} y={H - 12} textAnchor="middle" fontSize={12.5} fill="var(--viz-text)">
              {svgSci(jpiPlain(col.jpi), 12.5)}
            </text>
            {col.items.map((item) => widthBand(axis, item, lineStart, lineEnd))}
            {col.items.map((item) => {
              const y = axis.y(item.level.energy)
              const ly = placed.get(item.key) ?? y
              const isSel = selected === item.key
              const isHov = hovered === item.key
              const moved = Math.abs(ly - y) > 1.5
              return (
                <g key={item.key} {...levelProps(item, isSel, true)}>
                  <rect
                    className="focus"
                    x={lineStart - 6}
                    y={Math.min(y, ly) - 7}
                    width={labelX + LABEL_W - lineStart + 8}
                    height={Math.abs(ly - y) + 14}
                    rx={3}
                    fill="none"
                    stroke="var(--viz-series-1)"
                    strokeWidth={1.5}
                    opacity={0}
                  />
                  <rect x={lineStart - 4} y={y - 5} width={lineLen + BAR_W + 8} height={10} fill="transparent" />
                  {levelLine(item, lineStart, lineEnd, y, isSel, isHov)}
                  {channelBar(item, barX, y)}
                  {moved && (
                    <polyline
                      points={`${barX + BAR_W + 1},${y} ${barX + BAR_W + 3},${y} ${labelX - 2},${ly}`}
                      fill="none"
                      stroke="var(--viz-text-muted)"
                      strokeWidth={0.75}
                    />
                  )}
                  <rect x={labelX - 2} y={ly - 6} width={LABEL_W} height={12} fill="transparent" />
                  <text
                    x={labelX}
                    y={ly + 3.8}
                    fontSize={11}
                    fontWeight={isSel || isHov ? 600 : 400}
                    fill={isSel || isHov ? "var(--viz-text)" : "var(--viz-text-muted)"}
                    stroke="var(--viz-surface)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    strokeLinejoin="round"
                  >
                    {num(formatLevelEnergy(item.level.energy))}
                    {Math.abs(item.level.energy) < 5e-4 && <tspan fontSize={10.5}> · {t.groundState}</tspan>}
                    {tooWide(axis, item) && roomy && <tspan fontSize={10.5}> · {t.wideWidth(gammaText(item.width.total))}</tspan>}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })

      // Background poles: a short grey line in the band for each column that has one.
      if (bgItems.length > 0) {
        overlay = (
          <>
            {overlay}
            {columns.map((col, ci) => {
              const x1 = plotL + ci * cw + Math.max(10, (cw - groupW) / 2)
              // Stop short of the band's label rather than run under it.
              const x2 = Math.min(x1 + lineLen, bgLabelStart - 10)
              return bgItems.some((b) => b.level.jpi === col.jpi) && x2 - x1 > 10 ? (
                <line
                  key={col.jpi}
                  x1={x1}
                  x2={x2}
                  y1={bandTop + bandH / 2}
                  y2={bandTop + bandH / 2}
                  stroke="var(--viz-text-muted)"
                  strokeWidth={1.5}
                  opacity={0.6}
                  pointerEvents="none"
                />
              ) : null
            })}
          </>
        )
      }
    } else {
      // The list layout: ticks on one axis, rows of text beside it.
      const tickX1 = plotL + 4
      const tickX2 = plotL + 24
      const rowX = plotL + 50
      type Row = { key: string; y: number; item?: Item; th?: Threshold }
      const rows: Row[] = [
        ...visible.map((item) => ({ key: item.key, y: axis.y(item.level.energy), item })),
        ...thresholdRows.map((th) => ({ key: th.key, y: axis.y(th.energy), th })),
      ]
      const placed = spreadLabels(rows, LIST_ROW, axis.top + 8, axis.bottom - 6)
      const rowW = W - rowX - 2

      body = (
        <g>
          {rows.filter((r) => r.item).map((r) => widthBand(axis, r.item!, tickX1, tickX2))}
          {rows.map((r) => {
            const ly = placed.get(r.key) ?? r.y
            if (r.th) {
              return (
                <g key={r.key} role="img" aria-label={t.thresholdAria(r.th.pair, num(formatLevelEnergy(r.th.energy)))}>
                  <polyline
                    points={`${tickX2 + 4},${r.y} ${tickX2 + 10},${r.y} ${rowX - 6},${ly}`}
                    fill="none"
                    stroke="var(--viz-text-muted)"
                    strokeWidth={0.75}
                    strokeDasharray="2 2"
                  />
                  <text x={rowX + 2} y={ly + 4} fontSize={11.5} fill="var(--viz-text-muted)">
                    {svgSci(thresholdLabel(r.th), 11.5)}
                  </text>
                </g>
              )
            }
            const item = r.item!
            const isSel = selected === item.key
            const isHov = hovered === item.key
            const g = item.width.total
            const q = g > 0 ? formatQuantity(g * 1e6, "eV") : null
            return (
              <g key={r.key} {...levelProps(item, isSel, false)}>
                <rect
                  x={rowX - 4}
                  y={ly - LIST_ROW / 2 + 1}
                  width={rowW}
                  height={LIST_ROW - 2}
                  rx={4}
                  fill={isSel || isHov ? "var(--viz-series-1)" : "transparent"}
                  opacity={isSel ? 0.13 : isHov ? 0.07 : 1}
                />
                <rect
                  className="focus"
                  x={rowX - 4}
                  y={ly - LIST_ROW / 2 + 1}
                  width={rowW}
                  height={LIST_ROW - 2}
                  rx={4}
                  fill="none"
                  stroke="var(--viz-series-1)"
                  strokeWidth={1.5}
                  opacity={0}
                />
                {levelLine(item, tickX1, tickX2, r.y, isSel, isHov)}
                <polyline
                  points={`${tickX2 + 4},${r.y} ${tickX2 + 10},${r.y} ${rowX - 6},${ly}`}
                  fill="none"
                  stroke="var(--viz-axis)"
                  strokeWidth={0.75}
                />
                <text x={rowX + 2} y={ly + 4.5} fontSize={12.5} fontWeight={600} fill="var(--viz-text)">
                  {svgSci(jpiPlain(item.level.jpi), 12.5)}
                </text>
                <text x={rowX + 46} y={ly + 4.5} fontSize={12.5} fill="var(--viz-text)" fontWeight={isSel ? 600 : 400}>
                  {num(formatLevelEnergy(item.level.energy))}
                </text>
                {channelBar(item, rowX + 100, ly)}
                {q && rowW > 190 && (
                  <text x={rowX + 100 + BAR_W + 6} y={ly + 4.5} fontSize={11.5} fill="var(--viz-text-muted)">
                    Γ {num(q.text)} {q.unit}
                  </text>
                )}
                {rowW > 360 && (
                  <text x={rowX + 236} y={ly + 4.5} fontSize={11.5} fill="var(--viz-text-muted)">
                    {t.status[item.status]}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      )
    }

    figure = (
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        xmlns="http://www.w3.org/2000/svg"
        role="group"
        aria-label={t.aria(main.length)}
        className="block select-none [font-variant-numeric:tabular-nums]"
      >
        <rect width={W} height={H} fill="var(--viz-surface)" />
        {dataBand}
        {frame}
        {cmAxis}
        {bgBand}
        {thresholdLines}
        {body}
        {overlay}
        {zoomMarks}
        {brushLayer}
      </svg>
    )
  }

  /* -- the card ------------------------------------------------------------- */

  const anyWidth = items.some((i) => i.width.total > 0)
  const wideItem = layout && !list ? main.find((i) => tooWide(layout.axis, i)) : undefined
  const anyWide = Boolean(wideItem)
  const anyAnc = items.some((i) => i.anc)
  const anyEffective = main.some((i) => i.effective)
  const legendSpecies = species.filter((s) => items.some((i) => i.width.parts.some((p) => p.species === s)))
  const anyPhoton = items.some((i) => i.width.parts.some((p) => p.photon))
  const bgList = background ? items.filter((i) => background.keys.has(i.key)) : []

  return (
    <Card data-level-diagram>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 p-4 sm:p-6">
        <div className="min-w-0 max-w-prose">
          <CardTitle role="heading" aria-level={3} className="text-base">
            {t.title}
          </CardTitle>
          <CardDescription className="mt-1.5">{list ? t.descriptionList : t.description}</CardDescription>
        </div>
        {!list && (
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {dataRange && !zoom && (
              <Button variant="outline" size="sm" onClick={() => setZoom([dataRange.min - 0.05, dataRange.max + 0.05])}>
                <ZoomIn className="mr-1.5 h-4 w-4" aria-hidden />
                {t.zoomData}
              </Button>
            )}
            {zoom && (
              <Button variant="outline" size="sm" onClick={() => setZoom(null)}>
                <Maximize2 className="mr-1.5 h-4 w-4" aria-hidden />
                {t.zoomReset}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={download}>
              <ImageDown className="mr-1.5 h-4 w-4" aria-hidden />
              SVG
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
        {/* The three line styles, at the figure's top right. */}
        {!list && (
          <ul className="mb-1.5 flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
            <li className="inline-flex items-center gap-1.5">
              <StatusSwatch status="free" />
              {t.keyEnergyFree}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <StatusSwatch status="partial" />
              {t.keyWidthsFree}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <StatusSwatch status="fixed" />
              {t.keyFixed}
            </li>
          </ul>
        )}
        <div ref={wrapRef} className="w-full" style={{ minHeight: layout ? undefined : 440 }}>
          {list ? (
            <LevelList
              items={main}
              background={bgList}
              backgroundEnergy={background?.energy ?? null}
              thresholds={thresholds}
              entrance={entrance}
              pairs={pairs}
              selected={selected}
              onSelect={select}
              hueOf={hueOf}
            />
          ) : (
            figure
          )}
        </div>

        {!list && (
          <p className="mt-2 text-xs text-muted-foreground print:hidden">
            {zoom
              ? `${t.zoomed(num(formatLevelEnergy(zoom[0])), num(formatLevelEnergy(zoom[1])))} · ${t.zoomHint}`
              : crowded
                ? t.crowded
                : t.zoomHint}
          </p>
        )}

        <Details item={active} entrance={entrance} pairs={pairs} selected={Boolean(active && active.key === selected)} hueOf={hueOf} onClear={() => select(null)} />

        <Legend
          list={list}
          anyWidth={anyWidth}
          anyWide={anyWide}
          wideExample={wideItem ? gammaText(wideItem.width.total) : ""}
          anyAnc={anyAnc}
          anyEffective={anyEffective}
          anyThreshold={thresholds.length > 0}
          anyData={Boolean(dataRange) && !list}
          species={legendSpecies}
          photon={anyPhoton}
          hueOf={hueOf}
        />
      </CardContent>
    </Card>
  )
}

/* -- small pieces ------------------------------------------------------------- */

function StatusSwatch({ status, dashed = false }: { status: LevelStatus; dashed?: boolean }) {
  return (
    <svg width={22} height={12} viewBox="0 0 22 12" aria-hidden className="shrink-0">
      <line
        x1={1}
        x2={21}
        y1={6}
        y2={6}
        stroke={status === "fixed" ? "var(--viz-text-muted)" : "var(--viz-series-1)"}
        strokeWidth={status === "free" ? 2.5 : 1.5}
        strokeOpacity={status === "partial" ? 0.8 : 1}
        strokeDasharray={dashed ? "6 3" : undefined}
      />
    </svg>
  )
}

/**
 * The levels as a list, for a narrow container: one row per level, in order
 * of energy, under a divider at each particle threshold that stays in view
 * while its levels scroll by. Columns J^pi · E_x · E_c.m. · Γ (keV), with
 * the decay shares as a small bar; background poles folded at the end.
 */
function LevelList({
  items,
  background,
  backgroundEnergy,
  thresholds,
  entrance,
  pairs,
  selected,
  onSelect,
  hueOf,
}: {
  items: Item[]
  background: Item[]
  backgroundEnergy: number | null
  thresholds: Threshold[]
  entrance: Threshold | null
  pairs?: SchemePair[]
  selected: string | null
  onSelect: (key: string | null) => void
  hueOf: (species: string, photon: boolean) => string
}) {
  const t = useEvalDict().levels
  const lang = useLang()
  const num = (s: string) => decimal(s, lang)
  type Row = { energy: number; item?: Item; th?: Threshold }
  const rows: Row[] = [
    ...items.map((item): Row => ({ energy: item.level.energy, item })),
    ...thresholds.map((th): Row => ({ energy: th.energy, th })),
  ].sort((a, b) => a.energy - b.energy || (a.th ? -1 : 1))
  const grid = "grid grid-cols-[1rem_3rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2"
  const dot = (item: Item) => (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={
        item.status === "free"
          ? { background: "var(--viz-series-1)" }
          : item.status === "partial"
            ? { boxShadow: "inset 0 0 0 1.5px var(--viz-series-1)" }
            : { background: "var(--viz-text-muted)" }
      }
    />
  )
  const bar = (item: Item) => {
    const g = item.width.total
    if (!(g > 0)) return null
    return (
      <span className="ml-1.5 inline-flex h-1.5 w-3 shrink-0 overflow-hidden rounded-[1px] align-middle" aria-hidden>
        {item.width.parts.map((p) => (
          <span key={p.species} style={{ width: `${(p.gamma / g) * 100}%`, background: hueOf(p.species, p.photon) }} />
        ))}
      </span>
    )
  }
  const row = (item: Item) => {
    const isSel = selected === item.key
    const ecm = entrance ? item.level.energy - entrance.energy : null
    const g = item.width.total
    const ground = Math.abs(item.level.energy) < 5e-4
    const sub = [
      ground ? t.groundState : null,
      item.anc
        ? t.ancIn(ancChannels(item.level).map((c) => pairs?.find((p) => p.number === c.pair)?.label_plain ?? texPlain(c.label)).join(", "))
        : null,
      item.effective ? t.effective : null,
    ].filter(Boolean)
    return (
      <li key={item.key}>
        <button
          type="button"
          aria-pressed={isSel}
          aria-label={t.levelAria(jpiPlain(item.level.jpi), num(formatLevelEnergy(item.level.energy)), t.status[item.status], "")}
          onClick={() => onSelect(isSel ? null : item.key)}
          className={`${grid} min-h-11 w-full rounded-md px-2 py-1.5 text-left text-sm tabular-nums transition-colors hover:bg-muted/50 ${
            isSel ? "bg-[color-mix(in_srgb,var(--viz-series-1)_12%,transparent)]" : ""
          }`}
        >
          {dot(item)}
          <span className={`font-semibold ${item.effective ? "text-muted-foreground" : ""}`}>
            <Sci>{jpiPlain(item.level.jpi)}</Sci>
          </span>
          <span className="text-right">{num(formatLevelEnergy(item.level.energy))}</span>
          <span className="text-right text-muted-foreground">{ecm !== null && ecm > 0 ? num(formatLevelEnergy(ecm)) : "—"}</span>
          <span className="flex items-center justify-end text-right text-muted-foreground">
            {g > 0 ? <Sci>{numberText(g * 1e3, lang, 3)}</Sci> : "—"}
            {bar(item)}
          </span>
          {sub.length > 0 && (
            <span className="col-span-4 col-start-2 -mt-0.5 text-xs font-normal text-muted-foreground">
              <Sci>{sub.join(" · ")}</Sci>
            </span>
          )}
        </button>
      </li>
    )
  }
  return (
    <div className="text-sm">
      <div className={`${grid} border-b px-2 pb-1.5 text-xs text-muted-foreground`}>
        <span />
        <span>
          J<sup>π</sup>
        </span>
        <span className="text-right">
          <i>E</i>
          <sub>x</sub> (MeV)
        </span>
        <span className="text-right">
          <i>E</i>
          <sub>c.m.</sub> (MeV)
        </span>
        <span className="text-right">{t.columnWidth}</span>
      </div>
      <ul>
        {rows.map((r) =>
          r.th ? (
            <li
              key={r.th.key}
              className="sticky top-[var(--header-h,4rem)] z-10 border-b border-dashed border-border bg-card px-2 py-1.5 text-xs text-muted-foreground"
            >
              <Sci>{t.above(r.th.pair, num(formatLevelEnergy(r.th.energy)))}</Sci>
            </li>
          ) : (
            row(r.item!)
          ),
        )}
      </ul>
      {background.length > 0 && backgroundEnergy !== null && (
        <details className="mt-1 border-t px-2 pt-1.5 text-xs text-muted-foreground">
          <summary className="flex min-h-10 cursor-pointer select-none items-center">
            {t.backgroundRow(background.length, num(String(Number(backgroundEnergy.toFixed(2)))))}
          </summary>
          <ul className="-mx-2">{background.map(row)}</ul>
        </details>
      )}
      <p className="mt-2 px-2 text-xs text-muted-foreground">{t.listLegend}</p>
    </div>
  )
}

function Details({
  item,
  entrance,
  pairs,
  selected,
  hueOf,
  onClear,
}: {
  item: Item | undefined
  entrance: Threshold | null
  pairs?: SchemePair[]
  selected: boolean
  hueOf: (species: string, photon: boolean) => string
  onClear: () => void
}) {
  const t = useEvalDict().levels
  const lang = useLang()
  const num = (s: string) => decimal(s, lang)
  if (!item) {
    return <p className="mt-2 min-h-[3.5rem] text-sm text-muted-foreground print:hidden">{t.prompt}</p>
  }
  const { level, width } = item
  const ecm = entrance ? level.energy - entrance.energy : null
  const g = width.total
  const total = g > 0 ? formatQuantity(g * 1e6, "eV") : null
  const ancs = ancChannels(level)
  const pairName = (c: SchemeLevel["channels"][number]) => {
    const pair = pairs?.find((p) => p.number === c.pair)
    return pair?.label_plain ?? texPlain(c.label)
  }
  const eV = (v: number) => {
    const q = formatQuantity(v * 1e6, "eV")
    return `${num(q.text)} ${q.unit}`
  }
  return (
    <div className="mt-2 min-h-[3.5rem] rounded-md border bg-muted/30 px-3 py-2 text-sm print:hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold">
          <Sci>{jpiPlain(level.jpi)}</Sci>
        </span>
        <span className="tabular-nums">
          <i>E</i>
          <sub>x</sub> = {num(formatLevelEnergy(level.energy))} MeV
          {Math.abs(level.energy) < 5e-4 && <span className="text-muted-foreground"> ({t.groundState})</span>}
        </span>
        {entrance && ecm !== null && ecm > 0 && (
          <span className="tabular-nums text-muted-foreground">
            <i>E</i>
            <sub>c.m.</sub> = {num(formatLevelEnergy(ecm))} MeV (<Sci>{entrance.pair}</Sci>)
          </span>
        )}
        <span className="text-muted-foreground">{t.status[item.status]}</span>
        {selected && (
          <button type="button" onClick={onClear} className="ml-auto text-xs text-link underline-offset-4 hover:underline">
            {t.clearSelection}
          </button>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {total ? (
          <>
            <span className="tabular-nums text-foreground">
              Γ = {num(total.text)} {total.unit}
            </span>
            {width.parts.map((p) => {
              const q = formatQuantity(p.gamma * 1e6, "eV")
              const share = p.gamma / g
              return (
                <span key={p.species} className="inline-flex items-baseline gap-1 tabular-nums">
                  <span
                    className="inline-block h-2 w-2 self-center rounded-[1px]"
                    style={{ background: hueOf(p.species, p.photon) }}
                    aria-hidden
                  />
                  <span>
                    Γ<sub>
                      <Sci>{p.species}</Sci>
                    </sub>{" "}
                    {num(q.text)} {q.unit} ({share > 0.999 ? "100" : share < 0.001 ? "<0.1" : num((share * 100).toPrecision(2))}%)
                  </span>
                </span>
              )
            })}
          </>
        ) : (
          ancs.length === 0 && <span>{t.noWidth}</span>
        )}
        {ancs.map((c, i) => {
          const q = formatQuantity(c.width, c.unit)
          return (
            <span key={i} className="tabular-nums">
              {t.anc} <i>C</i>
              <sub>
                <Sci>{texPlain(c.label)}</Sci>
              </sub>{" "}
              (<Sci>{pairName(c)}</Sci>, ℓ = {c.L}) = {num(q.text).replace("-", "−")} <Unit unit={q.unit} />
            </span>
          )
        })}
      </div>
      {item.notes.length > 0 && (
        <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-muted-foreground">
          {item.notes.map((n, i) => (
            <li key={i}>
              <Sci>
                {n.kind === "above"
                  ? t.noteAbove(num(formatLevelEnergy(n.dataMax)))
                  : n.kind === "overlap"
                    ? t.noteOverlap(jpiPlain(n.jpi), num(formatLevelEnergy(n.energy)))
                    : t.notePhoton(eV(n.particle), eV(n.photon))}
              </Sci>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Legend({
  list,
  anyWidth,
  anyWide,
  wideExample,
  anyAnc,
  anyEffective,
  anyThreshold,
  anyData,
  species,
  photon,
  hueOf,
}: {
  list: boolean
  anyWidth: boolean
  anyWide: boolean
  wideExample: string
  anyAnc: boolean
  anyEffective: boolean
  anyThreshold: boolean
  anyData: boolean
  species: string[]
  photon: boolean
  hueOf: (species: string, photon: boolean) => string
}) {
  const t = useEvalDict().levels
  const lang = useLang()
  const g = (anchor: string) => (
    <>
      {" "}
      (
      <Link href={`${localePath(lang, "/glossary")}#${anchor}`} className="text-link underline-offset-4 hover:underline">
        {t.glossary}
      </Link>
      )
    </>
  )
  const swatch = (children: ReactNode) => (
    <svg width={22} height={12} viewBox="0 0 22 12" aria-hidden className="mt-0.5 shrink-0">
      {children}
    </svg>
  )
  const entry = (key: string, icon: ReactNode, label: ReactNode) => (
    <li key={key} className="flex items-start gap-2">
      {icon}
      <span>{label}</span>
    </li>
  )
  return (
    <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-xs leading-snug text-muted-foreground md:grid-cols-2">
      {anyThreshold &&
        !list &&
        entry(
          "thr",
          swatch(<line x1={1} x2={21} y1={6} y2={6} stroke="var(--viz-text-muted)" strokeDasharray="5 3" />),
          <>
            {t.plainThreshold}
            {g("threshold")}
          </>,
        )}
      {anyWidth &&
        !list &&
        entry(
          "width",
          swatch(
            <>
              <rect x={1} y={1} width={20} height={10} fill="var(--viz-series-1)" opacity={0.15} />
              <line x1={1} x2={21} y1={6} y2={6} stroke="var(--viz-series-1)" strokeWidth={1.5} />
            </>,
          ),
          <>
            {t.plainWidth}
            {g("resonance")}
          </>,
        )}
      {anyWide &&
        entry(
          "wide",
          swatch(
            <path d="M11,1V11M8.5,3.5L11,1L13.5,3.5M8.5,8.5L11,11L13.5,8.5" stroke="var(--viz-series-1)" fill="none" strokeWidth={1} />,
          ),
          t.plainWideWidth(wideExample),
        )}
      {anyData && entry("data", swatch(<rect x={9.5} y={0} width={3} height={12} fill="var(--viz-series-1)" />), t.plainData)}
      {anyAnc &&
        !list &&
        entry(
          "anc",
          swatch(
            <>
              <line x1={8} x2={21} y1={6} y2={6} stroke="var(--viz-series-1)" strokeWidth={1.5} />
              <circle cx={5} cy={6} r={3} fill="var(--viz-surface)" stroke="var(--viz-series-1)" strokeWidth={1.5} />
            </>,
          ),
          <>
            {t.plainAnc}
            {g("anc")}
          </>,
        )}
      {anyEffective && entry("effective", <StatusSwatch status="partial" dashed />, t.plainEffective)}
      {anyWidth && (species.length > 0 || photon) && (
        <li className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex h-2.5 w-[22px] shrink-0 overflow-hidden rounded-[1px]" aria-hidden>
            {species.slice(0, 2).map((s) => (
              <span key={s} className="flex-1" style={{ background: hueOf(s, false) }} />
            ))}
            {photon && <span className="flex-1" style={{ background: hueOf("γ", true) }} />}
          </span>
          <span>
            {t.plainBar}:{" "}
            {species.map((s, i) => (
              <span key={s} className="inline-flex items-center gap-1 whitespace-nowrap">
                {i > 0 && ", "}
                <span className="inline-block h-2 w-2 rounded-[1px]" style={{ background: hueOf(s, false) }} aria-hidden />
                <span>
                  <Sci>{s}</Sci>
                </span>
              </span>
            ))}
            {photon && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                {species.length > 0 && ", "}
                <span className="inline-block h-2 w-2 rounded-[1px]" style={{ background: hueOf("γ", true) }} aria-hidden />γ
              </span>
            )}
          </span>
        </li>
      )}
    </ul>
  )
}
