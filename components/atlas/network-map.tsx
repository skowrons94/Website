"use client"

import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, Maximize2, Minimize2, X } from "lucide-react"

import { LunaBadge, StatusBadge, StatusLegend } from "@/components/atlas/status-badge"
import { linkTerms } from "@/components/atlas/linked-text"
import { Term } from "@/components/atlas/term"
import { useDict, useLang } from "@/components/lang-provider"
import { Sci } from "@/components/sci"
import type { MapCell, MapData, MapReaction } from "@/lib/atlas"
import { formatGamow, formatQ, formatTemperature, kindLabel } from "@/lib/atlas-format"
import { decimal, localePath, withoutArticle } from "@/lib/i18n"
import { OVERLAY_LIMIT } from "@/lib/viz"
import { cn } from "@/lib/utils"

/**
 * The network map: a chart of the light nuclides, N across and Z up, with an
 * arrow for every reaction and decay of the atlas.
 *
 * One family of processes is in colour at a time and everything else is grey.
 * Within the family each network takes one of the three validated chart hues,
 * in file order; a fourth network (the pp family, with hep, and the CNO family) is drawn in ink
 * with a dashed line, so identity never rests on a fourth hue the palette does
 * not have. Colour follows the network, not its position among the ones that
 * are switched on, so toggling CNO-II off does not repaint CNO-III.
 *
 * Everything is in cell units: a nuclide's cell is centred on (N, maxZ − Z).
 * Strokes and type are specified in screen pixels and divided by the current
 * scale, so a line is the same weight whether the view is zoomed onto the pp
 * chains or shows the whole chart.
 */

/* -- geometry -------------------------------------------------------------- */

type Box = { x: number; y: number; w: number; h: number }

const CELL = 0.88 // cell side, of the 1-unit pitch
const AXIS_LEFT = 1.15 // band for the element symbols
const AXIS_BOTTOM = 0.85 // band for the neutron numbers
const MIN_SPAN = 5 // never zoom closer than this many cells across

/** Line weight from `importance`, in px. */
const WEIGHT = { key: 3.25, major: 2.1, minor: 1.35 } as const

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Expand `box` about its centre until it has the frame's aspect ratio. */
function fitAspect(box: Box, aspect: number): Box {
  if (box.w / box.h > aspect) {
    const h = box.w / aspect
    return { ...box, y: box.y - (h - box.h) / 2, h }
  }
  const w = box.h * aspect
  return { ...box, x: box.x - (w - box.w) / 2, w }
}

/** The region the nuclides of `reactions` occupy, with the axis bands added. */
function regionOf(reactions: MapReaction[], maxZ: number): Box {
  let n0 = Infinity
  let n1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const r of reactions) {
    for (const end of [r.from, r.to]) {
      n0 = Math.min(n0, end.N)
      n1 = Math.max(n1, end.N)
      z0 = Math.min(z0, end.Z)
      z1 = Math.max(z1, end.Z)
    }
  }
  if (!Number.isFinite(n0)) return { x: -AXIS_LEFT - 0.5, y: -0.5, w: maxZ + 2, h: maxZ + 2 }
  // Grow to the minimum span symmetrically, so a small family sits centred.
  const grow = (lo: number, hi: number) => {
    const missing = Math.max(0, MIN_SPAN - 1 - (hi - lo))
    return [lo - missing / 2, hi + missing / 2]
  }
  ;[n0, n1] = grow(n0, n1)
  ;[z0, z1] = grow(z0, z1)
  const pad = 0.75
  return {
    x: n0 - pad - AXIS_LEFT,
    y: maxZ - z1 - pad,
    w: n1 - n0 + 2 * pad + AXIS_LEFT,
    h: z1 - z0 + 2 * pad + AXIS_BOTTOM,
  }
}

type Arrow = {
  r: MapReaction
  d: string
  head: string
  mid: { x: number; y: number }
}

/**
 * Quadratic Bézier from target to product, pulled back to the cell edges.
 * Reactions that join the same two nuclides (p + p and pep; d(p,γ) and d(d,n))
 * fan out symmetrically instead of being drawn on top of each other.
 */
function arrowPath(
  r: MapReaction,
  index: number,
  siblings: number,
  maxZ: number,
  headPx: number,
  scale: number,
): Omit<Arrow, "r"> {
  const ax = r.from.N
  const ay = maxZ - r.from.Z
  const bx = r.to.N
  const by = maxZ - r.to.Z
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  // A straight line through a cell in between (α captures, a step of two in
  // N and Z) would run over that cell's label: bow it to one side.
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
  const bow = gcd(Math.abs(dx), Math.abs(dy)) > 1 ? 0.9 : 0
  const offset = (index - (siblings - 1) / 2) * 0.42 + bow
  const cx = (ax + bx) / 2 + nx * offset
  const cy = (ay + by) / 2 + ny * offset

  const pull = (px: number, py: number, towardX: number, towardY: number, dist: number) => {
    const ux = towardX - px
    const uy = towardY - py
    const l = Math.hypot(ux, uy) || 1
    return { x: px + (ux / l) * dist, y: py + (uy / l) * dist }
  }
  const start = pull(ax, ay, cx, cy, 0.34)
  const tip = pull(bx, by, cx, cy, 0.38)

  // Arrowhead: a small triangle at the tip, along the curve's final tangent.
  const tx = tip.x - cx
  const ty = tip.y - cy
  const tl = Math.hypot(tx, ty) || 1
  const ux = tx / tl
  const uy = ty / tl
  const length = headPx / scale
  const half = length * 0.55
  const baseX = tip.x - ux * length
  const baseY = tip.y - uy * length
  const head = `M${tip.x},${tip.y} L${baseX - uy * half},${baseY + ux * half} L${baseX + uy * half},${baseY - ux * half} Z`
  // The line stops inside the head, so its round cap does not poke past the tip.
  const end = { x: tip.x - ux * length * 0.6, y: tip.y - uy * length * 0.6 }

  // Midpoint of the curve, for the keyboard tooltip.
  const mid = { x: 0.25 * start.x + 0.5 * cx + 0.25 * end.x, y: 0.25 * start.y + 0.5 * cy + 0.25 * end.y }
  return { d: `M${start.x},${start.y} Q${cx},${cy} ${end.x},${end.y}`, head, mid }
}

/* -- colour ---------------------------------------------------------------- */

/** Slot style for the n-th network of a family. */
function slotStyle(slot: number) {
  if (slot < OVERLAY_LIMIT) return { color: `var(--viz-series-${slot + 1})`, dashed: false }
  return { color: "var(--viz-text)", dashed: true }
}

function LineKey({ slot, muted = false }: { slot: number; muted?: boolean }) {
  const { color, dashed } = muted ? { color: "var(--viz-axis)", dashed: false } : slotStyle(slot)
  return (
    <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden className="shrink-0">
      <line
        x1="1"
        y1="4"
        x2="21"
        y2="4"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={dashed ? "5 3.5" : undefined}
      />
    </svg>
  )
}

/* -- the component --------------------------------------------------------- */

export function NetworkMap({ data }: { data: MapData }) {
  const { families, networks, reactions, cells, maxZ, maxN } = data
  const lang = useLang()
  const t = useDict().atlas

  const [familyId, setFamilyId] = useState(families[0]?.id ?? "")
  const [disabled, setDisabled] = useState<Set<string>>(() => new Set())
  const [whole, setWhole] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // A nuclide tapped on the chart: the drawer lists its reactions, which helps
  // where the arrows are short and close together (a phone).
  const [cellCode, setCellCode] = useState<string | null>(null)
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null)

  const frameRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<string | null>(null)
  // Only a change the reader asked for is animated; the first measurement of
  // the frame, or a window resize, simply snaps.
  const animateRef = useRef(false)
  const [size, setSize] = useState({ w: 720, h: 540 })

  const family = families.find((f) => f.id === familyId) ?? families[0]
  const familyNetworks = useMemo(
    () => (family ? family.networks.map((id) => networks.find((n) => n.id === id)!).filter(Boolean) : []),
    [family, networks],
  )
  const byId = useMemo(() => new Map(reactions.map((r) => [r.id, r])), [reactions])
  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const selectedCell = !selected && cellCode ? cells.find((c) => c.code === cellCode) ?? null : null
  const cellReactions = useMemo(
    () => (cellCode ? reactions.filter((r) => r.from.code === cellCode || r.to.code === cellCode) : []),
    [cellCode, reactions],
  )
  const involved = useMemo(() => {
    const set = new Set<string>()
    for (const r of reactions) {
      set.add(r.from.code)
      set.add(r.to.code)
    }
    return set
  }, [reactions])

  // The phone drawer is a modal dialog; on a wide screen the panel is a column.
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)")
    const update = () => setWide(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  /* -- deep links: /atlas#cno -------------------------------------------- */

  useEffect(() => {
    const read = () => {
      const hash = window.location.hash.slice(1)
      if (hash && families.some((f) => f.id === hash)) {
        animateRef.current = true
        setFamilyId(hash)
      }
    }
    read()
    window.addEventListener("hashchange", read)
    return () => window.removeEventListener("hashchange", read)
  }, [families])

  const chooseFamily = useCallback((id: string) => {
    animateRef.current = true
    setFamilyId(id)
    setTip(null)
    try {
      window.history.replaceState(null, "", `#${id}`)
    } catch {
      // A sandboxed frame may refuse; the map works without the hash.
    }
  }, [])

  /* -- frame size -------------------------------------------------------- */

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => {
      const w = frame.clientWidth
      // A frame that is momentarily unlaid-out (0 wide) would give a NaN
      // aspect ratio and NaN geometry; keep the last good size instead.
      if (w <= 0) return
      // Taller than wide on a phone, where the frame is narrow and the page
      // scrolls anyway; landscape on a desktop, where height is the scarce side.
      const h = Math.round(Math.min(w < 560 ? w * 1.08 : w * 0.72, 680))
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  /* -- which arrows are in colour ------------------------------------------ */

  // The slot of each reaction in the active family: the first switched-on
  // network of the family that contains it. -1 for grey.
  const slotOf = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of reactions) {
      let slot = -1
      familyNetworks.forEach((n, i) => {
        if (slot < 0 && !disabled.has(n.id) && n.reactions.includes(r.id)) slot = i
      })
      map.set(r.id, slot)
    }
    return map
  }, [reactions, familyNetworks, disabled])

  const familyReactions = useMemo(
    () => reactions.filter((r) => familyNetworks.some((n) => n.reactions.includes(r.id))),
    [reactions, familyNetworks],
  )

  // Keyboard order: the reactions of the switched-on networks, network by
  // network, in the order a nucleus meets them. One arrow is in the Tab order
  // at a time (a roving tabindex); the arrow keys move along this chain.
  const chain = useMemo(() => {
    const ids: string[] = []
    for (const n of familyNetworks) {
      if (disabled.has(n.id)) continue
      for (const id of n.reactions) if (byId.has(id) && !ids.includes(id)) ids.push(id)
    }
    return ids
  }, [familyNetworks, disabled, byId])
  const [rovingId, setRovingId] = useState<string | null>(null)
  const tabStop = rovingId && chain.includes(rovingId) ? rovingId : chain[0] ?? null

  /* -- view box, with a short tween between families -------------------------- */

  const aspect = size.w / size.h
  const target = useMemo(() => {
    const region = whole
      ? {
          x: -0.5 - AXIS_LEFT - 0.25,
          y: -0.75,
          w: maxN + 1.5 + AXIS_LEFT,
          h: maxZ + 1.5 + AXIS_BOTTOM,
        }
      : regionOf(familyReactions, maxZ)
    return fitAspect(region, aspect)
  }, [whole, familyReactions, maxZ, maxN, aspect])

  const [view, setView] = useState<Box>(target)
  const viewRef = useRef(view)
  viewRef.current = view

  useEffect(() => {
    const from = viewRef.current
    const animate = animateRef.current
    animateRef.current = false
    if (!animate || prefersReducedMotion()) {
      setView(target)
      return
    }
    let frame = 0
    const start = performance.now()
    const duration = 380
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      setView({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e,
      })
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target])

  // px per cell unit; guarded for the first render, before the frame is measured
  const scale = size.w > 0 && view.w > 0 ? size.w / view.w : 1
  const px = (n: number) => n / scale
  // Every cell is labelled when the cells are large enough; on a phone, with a
  // wide process on show, only the nuclides of the process are.
  const showLabels = scale * CELL >= 17
  const labelAll = scale * CELL >= 25
  const labelSize = Math.min(Math.max(scale * 0.27, labelAll ? 9.5 : 8.5), 13.5)

  /* -- arrows ---------------------------------------------------------------- */

  // Fan-out index among reactions joining the same two nuclides. Computed over
  // every reaction, so it does not change with the family on show.
  const fan = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const r of reactions) {
      const key = [r.from.code, r.to.code].sort().join("|")
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r.id)
    }
    const out = new Map<string, { index: number; of: number }>()
    for (const ids of groups.values()) ids.forEach((id, index) => out.set(id, { index, of: ids.length }))
    return out
  }, [reactions])

  const arrows = useMemo(() => {
    const list: (Arrow & { slot: number })[] = reactions.map((r) => {
      const slot = slotOf.get(r.id) ?? -1
      const weight = slot >= 0 ? WEIGHT[r.importance] : 1.1
      const f = fan.get(r.id) ?? { index: 0, of: 1 }
      return { r, slot, ...arrowPath(r, f.index, f.of, maxZ, 5.5 + weight * 1.4, scale) }
    })
    // Grey underneath, then colour by importance, so key reactions sit on top.
    const rank = { minor: 0, major: 1, key: 2 }
    return list.sort((a, b) =>
      a.slot < 0 !== b.slot < 0 ? (a.slot < 0 ? -1 : 1) : rank[a.r.importance] - rank[b.r.importance],
    )
  }, [reactions, slotOf, fan, maxZ, scale])

  const activeCodes = useMemo(() => {
    const set = new Set<string>()
    for (const r of reactions) {
      if ((slotOf.get(r.id) ?? -1) >= 0) {
        set.add(r.from.code)
        set.add(r.to.code)
      }
    }
    return set
  }, [reactions, slotOf])

  /* -- selection, tooltip, keyboard ----------------------------------------- */

  const select = useCallback(
    (r: MapReaction) => {
      if ((slotOf.get(r.id) ?? -1) < 0 && r.families[0] && !r.families.includes(familyId)) {
        chooseFamily(r.families[0])
      }
      returnFocusRef.current = r.id
      setSelectedId(r.id)
      setCellCode(null)
      setTip(null)
    },
    [slotOf, familyId, chooseFamily],
  )

  const focusArrow = useCallback((id: string) => {
    setRovingId(id)
    const el = frameRef.current?.querySelector<SVGGElement>(`[data-reaction="${CSS.escape(id)}"]`)
    el?.focus({ preventScroll: true })
  }, [])

  const close = useCallback(() => {
    setSelectedId(null)
    setCellCode(null)
    const id = returnFocusRef.current
    if (id) {
      const el = frameRef.current?.querySelector<SVGGElement>(`[data-reaction="${CSS.escape(id)}"]`)
      el?.focus({ preventScroll: true })
    }
  }, [])

  const panelOpen = Boolean(selectedId || cellCode)
  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [panelOpen, close])

  useEffect(() => {
    if (selectedId || cellCode) panelRef.current?.focus({ preventScroll: true })
  }, [selectedId, cellCode])

  // On a phone the open drawer is modal: the page behind does not scroll, and
  // Tab cycles inside the drawer.
  const modal = panelOpen && !wide
  useEffect(() => {
    if (!modal) return
    const body = document.body
    const before = body.style.overflow
    body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return
      const panel = panelRef.current
      if (!panel) return
      const items = [...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])")]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      body.style.overflow = before
      document.removeEventListener("keydown", onKey)
    }
  }, [modal])

  const showTipAt = (id: string, clientX: number, clientY: number) => {
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect) return
    setTip({ id, x: clientX - rect.left, y: clientY - rect.top })
  }
  const showTipFor = (a: Arrow) => {
    setTip({ id: a.r.id, x: (a.mid.x - view.x) * scale, y: (a.mid.y - view.y) * scale })
  }

  const tipReaction = tip ? byId.get(tip.id) : null

  /* -- one arrow ------------------------------------------------------------- */

  const renderArrow = (a: (typeof arrows)[number]) => {
    const active = a.slot >= 0
    const style = active ? slotStyle(a.slot) : { color: "var(--viz-axis)", dashed: false }
    const isSelected = a.r.id === selectedId
    const isHover = tip?.id === a.r.id
    const weight = (active ? WEIGHT[a.r.importance] : 1.1) + (isSelected || isHover ? 1 : 0)
    return (
      <g
        key={a.r.id}
        data-reaction={a.r.id}
        className="atlas-arrow cursor-pointer"
        role="button"
        tabIndex={active && a.r.id === tabStop ? 0 : -1}
        aria-label={`${a.r.label}. ${a.r.line}`}
        aria-pressed={isSelected}
        onClick={() => {
          if (active) setRovingId(a.r.id)
          select(a.r)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            select(a.r)
            return
          }
          const i = chain.indexOf(a.r.id)
          if (i < 0) return
          let next: number | null = null
          if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(chain.length - 1, i + 1)
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, i - 1)
          else if (e.key === "Home") next = 0
          else if (e.key === "End") next = chain.length - 1
          if (next === null) return
          e.preventDefault()
          focusArrow(chain[next])
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse") showTipAt(a.r.id, e.clientX, e.clientY)
        }}
        onPointerLeave={() => setTip((t) => (t?.id === a.r.id ? null : t))}
        onFocus={() => {
          if (active) setRovingId(a.r.id)
          showTipFor(a)
        }}
        onBlur={() => setTip((t) => (t?.id === a.r.id ? null : t))}
      >
        {/* generous hit area, and a surface halo so crossing arrows stay legible */}
        <path d={a.d} fill="none" stroke="transparent" strokeWidth={px(18)} />
        {active && (
          <path
            d={a.d}
            fill="none"
            stroke="var(--viz-surface)"
            strokeWidth={px(weight + 4)}
            strokeLinecap="round"
          />
        )}
        <path
          className="atlas-focus"
          d={a.d}
          fill="none"
          strokeWidth={px(weight + 7)}
          strokeLinecap="round"
        />
        <path
          d={a.d}
          fill="none"
          stroke={style.color}
          strokeWidth={px(weight)}
          strokeLinecap="round"
          strokeDasharray={style.dashed ? `${px(6)} ${px(4)}` : undefined}
        />
        <path d={a.head} fill={style.color} stroke={style.color} strokeWidth={px(0.75)} strokeLinejoin="round" />
      </g>
    )
  }

  /* -- render ---------------------------------------------------------------- */

  const rows: number[] = []
  for (let Z = Math.max(0, Math.ceil(maxZ - (view.y + view.h))); Z <= Math.min(maxZ, Math.floor(maxZ - view.y)); Z++) rows.push(Z)
  const cols: number[] = []
  for (let N = Math.max(0, Math.ceil(view.x)); N <= Math.min(maxN, Math.floor(view.x + view.w)); N++) cols.push(N)
  const ELEMENT = new Map(cells.map((c) => [c.Z, c.symbol]))

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0">
        {/* -- process picker ------------------------------------------------ */}
        <div className="relative -mx-5 sm:mx-0">
        <div
          role="group"
          aria-label={t.process}
          className="flex scroll-mt-24 snap-x scroll-px-5 gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden"
        >
          {families.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={f.id === family?.id}
              onClick={() => chooseFamily(f.id)}
              className={cn(
                "min-h-10 shrink-0 snap-start whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.8125rem] sm:min-h-0 transition-colors sm:px-3 sm:py-1.5 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                f.id === family?.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
            >
              <Sci>{withoutArticle(f.name)}</Sci>
            </button>
          ))}
        </div>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent sm:hidden" />
        </div>

        {/* -- networks of the family: toggles, and the legend ------------------ */}
        <div className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-1.5">
          {familyNetworks.length > 1 ? (
            <div role="group" aria-label={t.networksShown} className="flex flex-wrap gap-1.5">
              {familyNetworks.map((n, i) => {
                const on = !disabled.has(n.id)
                return (
                  <button
                    key={n.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setDisabled((prev) => {
                        const next = new Set(prev)
                        if (next.has(n.id)) next.delete(n.id)
                        else next.add(n.id)
                        return next
                      })
                    }
                    className={cn(
                      "inline-flex min-h-10 items-center gap-2 rounded-md border px-2.5 py-1 text-[0.8125rem] sm:min-h-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on
                        ? "border-border bg-card text-foreground"
                        : "border-dashed border-border text-muted-foreground line-through decoration-muted-foreground/60",
                    )}
                  >
                    <LineKey slot={i} muted={!on} />
                    <Sci>{n.name}</Sci>
                  </button>
                )
              })}
            </div>
          ) : (
            familyNetworks.map((n) => (
              <span key={n.id} className="inline-flex items-center gap-2 px-1 py-1 text-[0.8125rem]">
                <LineKey slot={0} />
                <Sci>{n.name}</Sci>
              </span>
            ))
          )}

          <button
            type="button"
            onClick={() => {
              animateRef.current = true
              setWhole((v) => !v)
            }}
            aria-pressed={whole}
            className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 py-1 sm:min-h-0 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {whole ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {whole ? t.zoomToProcess : t.wholeChart}
          </button>
        </div>

        {/* -- the chart ------------------------------------------------------ */}
        <div
          ref={frameRef}
          className="relative mt-3 overflow-hidden rounded-lg border border-border"
          style={{ height: size.h, background: "var(--viz-surface)" }}
        >
          <svg
            width={size.w}
            height={size.h}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            className="block select-none"
            role="group"
            aria-label={t.chartLabel(family?.name ?? t.theAtlas)}
          >
            {/* cells, then grey arrows, then the cell labels, then colour: a
                label is never crossed by another process's arrow, only by one
                of the process on show */}
            <g aria-hidden>
              {cells.map((c) => {
                const active = activeCodes.has(c.code)
                const clickable = involved.has(c.code)
                return (
                  <rect
                    key={c.code}
                    className={clickable ? "cursor-pointer" : undefined}
                    onClick={
                      clickable
                        ? () => {
                            returnFocusRef.current = null
                            setSelectedId(null)
                            setCellCode(c.code)
                            setTip(null)
                          }
                        : undefined
                    }
                    x={c.N - CELL / 2}
                    y={maxZ - c.Z - CELL / 2}
                    width={CELL}
                    height={CELL}
                    rx={px(3)}
                    fill={c.stable ? (active ? "var(--atlas-cell-strong)" : "var(--atlas-cell)") : "var(--viz-surface)"}
                    // Dimmed by colour, not opacity: hundreds of translucent
                    // rects leave tiling artefacts in some rasterisers.
                    stroke={active ? "var(--viz-text-muted)" : whole ? "var(--viz-axis)" : "var(--atlas-cell-edge)"}
                    strokeWidth={px(active ? 1.25 : 0.85)}
                  />
                )
              })}
            </g>
            <g>{arrows.filter((a) => a.slot < 0).map(renderArrow)}</g>
            {showLabels && (
              <g aria-hidden>
                {cells.map((c) => {
                  const x = c.N
                  const y = maxZ - c.Z
                  // Cells half under an axis band would show a clipped label.
                  if (x < view.x + AXIS_LEFT + 0.2 || y > view.y + view.h - AXIS_BOTTOM) return null
                  const active = activeCodes.has(c.code)
                  if (!labelAll && !active) return null
                  return (
                    <text
                      key={c.code}
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={px(labelSize)}
                      fill={active ? "var(--viz-text)" : "var(--viz-text-muted)"}
                      fontWeight={active ? 500 : 400}
                    >
                      {c.Z === 0 ? (
                        "n"
                      ) : (
                        <>
                          <tspan fontSize={px(labelSize * 0.7)} dy={px(-labelSize * 0.3)}>
                            {c.A}
                          </tspan>
                          <tspan dy={px(labelSize * 0.3)}>{c.symbol}</tspan>
                        </>
                      )}
                    </text>
                  )
                })}
              </g>
            )}
            <g>{arrows.filter((a) => a.slot >= 0).map(renderArrow)}</g>

            {/* axes, on opaque bands so cells scrolled under them do not show through */}
            <g aria-hidden>
              <rect x={view.x} y={view.y} width={AXIS_LEFT - 0.15} height={view.h} fill="var(--viz-surface)" />
              <rect
                x={view.x}
                y={view.y + view.h - AXIS_BOTTOM + 0.12}
                width={view.w}
                height={AXIS_BOTTOM}
                fill="var(--viz-surface)"
              />
              <line
                x1={view.x + AXIS_LEFT - 0.15}
                x2={view.x + AXIS_LEFT - 0.15}
                y1={view.y}
                y2={view.y + view.h - AXIS_BOTTOM + 0.12}
                stroke="var(--viz-grid)"
                strokeWidth={px(1)}
              />
              <line
                x1={view.x + AXIS_LEFT - 0.15}
                x2={view.x + view.w}
                y1={view.y + view.h - AXIS_BOTTOM + 0.12}
                y2={view.y + view.h - AXIS_BOTTOM + 0.12}
                stroke="var(--viz-grid)"
                strokeWidth={px(1)}
              />
              {rows.map((Z) => {
                const y = maxZ - Z
                // The top row would meet the HTML caption "↑ protons Z".
                if ((y - view.y) * scale < 30 || y > view.y + view.h - AXIS_BOTTOM) return null
                return (
                  <text
                    key={Z}
                    x={view.x + (AXIS_LEFT - 0.15) / 2}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={px(Math.min(12, Math.max(9, scale * 0.3)))}
                    fill="var(--viz-text-muted)"
                  >
                    {Z === 0 ? "n" : ELEMENT.get(Z) ?? Z}
                  </text>
                )
              })}
              {cols.map((N) => {
                if (N < view.x + AXIS_LEFT || N > view.x + view.w - 0.2) return null
                // Thin the tick labels when the cells are small.
                if (scale < 26 && N % 2 === 1) return null
                return (
                  <text
                    key={N}
                    x={N}
                    y={view.y + view.h - AXIS_BOTTOM / 2 + 0.06}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={px(Math.min(11.5, Math.max(9, scale * 0.28)))}
                    fill="var(--viz-text-muted)"
                    className="tabular"
                  >
                    {N}
                  </text>
                )
              })}
            </g>
          </svg>

          {/* axis caption, in HTML so it keeps its size at any zoom; the N
              caption sits under the frame, where it cannot meet a tick label */}
          <p className="pointer-events-none absolute left-1.5 top-1.5 text-[0.6875rem] text-muted-foreground">
            {t.protonsAxis}
          </p>

          {/* tooltip */}
          {tip && tipReaction && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 w-max max-w-[16rem] rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md"
              style={{
                left: Math.max(8, Math.min(tip.x + 12, size.w - 264)),
                top: tip.y + 14 > size.h - 80 ? Math.max(tip.y - 84, 4) : tip.y + 14,
              }}
            >
              <p className="font-serif text-[0.95rem] font-semibold leading-snug">
                <Sci>{tipReaction.label}</Sci>
              </p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                {tipReaction.line ? <Sci>{tipReaction.line}</Sci> : t.tipPending}
              </p>
            </div>
          )}
        </div>

        <p className="mt-1 text-right text-[0.6875rem] text-muted-foreground">{t.neutronsAxis}</p>

        {/* -- legend --------------------------------------------------------- */}
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <svg width="40" height="10" aria-hidden>
              {[3.25, 2.1, 1.35].map((w, i) => (
                <line key={i} x1={1 + i * 13} x2={11 + i * 13} y1="5" y2="5" stroke="var(--viz-text-muted)" strokeWidth={w} strokeLinecap="round" />
              ))}
            </svg>
            {t.legendWeight}
          </span>
          <span className="inline-flex items-center gap-2">
            <LineKey slot={0} muted />
            {t.legendOther}
          </span>
          <span className="inline-flex items-center gap-2">
            <svg width="26" height="12" aria-hidden>
              <rect x="0.5" y="0.5" width="11" height="11" rx="2" fill="var(--atlas-cell-strong)" stroke="var(--viz-text-muted)" />
              <rect x="14.5" y="0.5" width="11" height="11" rx="2" fill="var(--viz-surface)" stroke="var(--viz-text-muted)" />
            </svg>
            {t.legendStable}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="[@media(hover:none)]:hidden">{t.mapHelp}</span>
          <span className="hidden [@media(hover:none)]:inline">{t.mapHelpTouch}</span>
        </p>
        <StatusLegend lang={lang} className="mt-4 border-t border-border/70 pt-3" />
      </div>

      {/* -- side panel; a drawer below lg ------------------------------------- */}
      <aside className="lg:sticky lg:top-24">
        {selected || selectedCell ? (
          <>
            <button
              type="button"
              aria-label={t.closeDetails}
              tabIndex={-1}
              className="fixed inset-0 z-40 bg-black/50 dark:bg-black/70 lg:hidden"
              onClick={close}
            />
            <div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal={modal ? true : undefined}
              aria-label={selected ? selected.label : selectedCell ? cellName(selectedCell) : undefined}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[78vh] overflow-y-auto overscroll-contain rounded-t-xl border-t border-border bg-background px-5 pb-8 pt-3 shadow-2xl outline-none lg:static lg:z-auto lg:max-h-[calc(100vh-8rem)] lg:rounded-lg lg:border lg:bg-card lg:p-6 lg:shadow-none"
            >
              <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/40 lg:hidden" />
              {selected ? (
                <ReactionPanel reaction={selected} networks={networks} onClose={close} />
              ) : (
                selectedCell && (
                  <CellPanel
                    cell={selectedCell}
                    reactions={cellReactions}
                    onPick={(r) => select(r)}
                    onClose={close}
                  />
                )
              )}
            </div>
          </>
        ) : (
          <div className="hidden rounded-lg border border-dashed border-border p-6 text-sm leading-relaxed text-muted-foreground lg:block">
            <p className="font-serif text-base font-semibold text-foreground">
              <Sci>{family?.name}</Sci>
            </p>
            <p className="mt-2">
              <Sci>{family?.summary}</Sci>
            </p>
            <p className="mt-4">{t.selectArrow}</p>
          </div>
        )}
      </aside>

      {/* -- the family in words: the table view of the map -------------------- */}
      <section className="mt-12 lg:col-span-2" aria-labelledby="family-heading">
        <h2 id="family-heading" className="font-serif text-2xl font-semibold tracking-tight">
          <Sci>{family?.name}</Sci>
        </h2>
        <p className="mt-3 max-w-3xl text-pretty leading-relaxed text-muted-foreground">
          <Sci>{family?.summary}</Sci>
        </p>
        <div className="mt-8 grid gap-x-10 gap-y-10 md:grid-cols-2">
          {familyNetworks.map((n, i) => (
            <div key={n.id}>
              <h3 className="flex items-center gap-2.5 font-serif text-lg font-semibold tracking-tight">
                <LineKey slot={i} />
                <Sci>{n.name}</Sci>
              </h3>
              <p className="mt-2 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
                <Sci>{n.summary}</Sci>
              </p>
              {n.temperatures.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {n.temperatures.map((temp) => `${temp.label}, ${formatTemperature(temp.T9, lang)}`).join(" · ")}
                </p>
              )}
              <ol className="mt-4 divide-y divide-border/70 border-y border-border/70">
                {n.reactions.map((id, j) => {
                  const r = byId.get(id)
                  return (
                    <li key={id}>
                      <Link
                        href={localePath(lang, `/atlas/${id}`)}
                        className="group flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-[0.95rem]"
                      >
                        <span className="tabular w-5 shrink-0 text-xs text-muted-foreground">{j + 1}.</span>
                        <span className="font-serif font-semibold group-hover:text-link">
                          <Sci>{r?.label ?? id}</Sci>
                        </span>
                        <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                          {r?.luna && <LunaBadge />}
                          {r && r.kind !== "decay" && <StatusBadge status={r.status} pending={!r.hasFile} lang={lang} />}
                          {r && r.kind === "decay" && (
                            <span className="text-xs text-muted-foreground">
                              {r.halfLife ? `t½ ${r.halfLife}` : t.decay}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/* -- the panel ------------------------------------------------------------- */

function Fact({ label, term, children }: { label: string; term?: string; children: React.ReactNode }) {
  const lang = useLang()
  return (
    <div className="py-2.5 sm:grid sm:grid-cols-[7.5rem_1fr] sm:gap-3 lg:block xl:grid">
      <dt className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
        {term ? (
          <Term id={term} lang={lang}>
            {label}
          </Term>
        ) : (
          label
        )}
      </dt>
      <dd className="mt-0.5 text-sm sm:mt-0 lg:mt-0.5 xl:mt-0">{children}</dd>
    </div>
  )
}

function ReactionPanel({
  reaction: r,
  networks,
  onClose,
}: {
  reaction: MapReaction
  networks: MapData["networks"]
  onClose: () => void
}) {
  const lang = useLang()
  const t = useDict().atlas
  const names = r.networks.map((id) => networks.find((n) => n.id === id)?.name ?? id)
  // Glossary links, once each in the panel; the fact labels link their own.
  const seen = new Set<string>(["gamow", "q"])
  const summary = linkTerms(r.summary, lang, seen)
  const role = linkTerms(r.role, lang, seen)
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{kindLabel(r.kind, lang)}</p>
          <h3 className="mt-1 font-serif text-2xl font-semibold tracking-tight">
            <Sci>{r.label}</Sci>
          </h3>
          {r.plain && <p className="mt-1 text-pretty text-sm leading-snug text-muted-foreground">{r.plain}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-[1.125rem] w-[1.125rem]" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {r.kind !== "decay" && <StatusBadge status={r.status} pending={!r.hasFile} lang={lang} link />}
        {r.luna && <LunaBadge label={t.measuredAtLuna} />}
      </div>

      {r.summary ? (
        <p className="mt-4 text-pretty text-[0.95rem] leading-relaxed">{summary}</p>
      ) : (
        <p className="mt-4 text-[0.95rem] leading-relaxed text-muted-foreground">
          {t.panelPending}
        </p>
      )}
      {r.role && (
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">{role}</p>
      )}

      <dl className="mt-5 divide-y divide-border/70 border-y border-border/70">
        <Fact label={t.networks}>
          <Sci>{names.join(", ")}</Sci>
        </Fact>
        {r.q && (
          <Fact label={t.qValue} term="q-value">
            <span className="tabular">{formatQ(r.q, lang)}</span>{" "}
            <span className="text-xs text-muted-foreground">· {r.q.value < 0 ? t.qNeeded : t.qReleased}</span>
            {r.q.annihilation && (
              <span className="block text-xs leading-snug text-muted-foreground">
                {t.qShort(decimal(r.q.kinetic.toFixed(3), lang))}
              </span>
            )}
          </Fact>
        )}
        {r.halfLife && (
          <Fact label={t.halfLife} term="half-life">
            <span className="tabular">
              <Sci>{r.halfLife}</Sci>
            </span>
          </Fact>
        )}
        {r.gamow.length > 0 && (
          <Fact label={t.gamow} term="gamow-window">
            <ul className="space-y-0.5">
              {r.gamow.map((g) => (
                <li key={`${g.T9}-${g.label}`}>
                  <span className="tabular">{formatGamow(g, lang)}</span>
                  {g.thresholdLimited && g.threshold !== undefined && (
                    <span className="text-xs">
                      {" "}
                      <Term id="threshold" lang={lang}>
                        {t.thresholdLimited(decimal((g.threshold / 1000).toFixed(2), lang))}
                      </Term>
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    {linkTerms(g.label, lang, seen)}, {linkTerms(formatTemperature(g.T9, lang), lang, seen)}
                  </span>
                </li>
              ))}
            </ul>
          </Fact>
        )}
        {r.windowNote && r.kind !== "decay" && r.gamow.length === 0 && (
          <Fact label={t.energies}>
            <span className="text-xs leading-snug text-muted-foreground">
              <Sci>{r.windowNote}</Sci>
            </span>
          </Fact>
        )}
        {r.kind !== "decay" && (
          <Fact label={t.measurements}>
            <span className="tabular">{r.measurements === 0 ? t.noneYet : r.measurements}</span>
          </Fact>
        )}
        {r.rmatrix.length > 0 && (
          <Fact label={t.rmatrix}>
            {r.rmatrix.map((ev) => (
              <Link key={ev} href={localePath(lang, `/evaluations/${ev}`)} className="mr-3 text-link hover:underline">
                {t.interactive}
              </Link>
            ))}
          </Fact>
        )}
      </dl>

      {(r.statusPlain || r.statusNote) && (
        <p className="mt-4 text-pretty text-xs leading-relaxed text-muted-foreground">
          {linkTerms(r.statusPlain || r.statusNote, lang, seen)}
        </p>
      )}

      <Link
        href={localePath(lang, `/atlas/${r.id}`)}
        className="group mt-6 inline-flex items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
      >
        {r.hasFile ? t.fullEntry : t.soFar}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  )
}

/* -- a nuclide's reactions ---------------------------------------------------- */

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹"
/** `¹⁴N`; the neutron is `n`. */
function cellName(c: MapCell): string {
  if (c.Z === 0) return "n"
  return `${String(c.A).replace(/\d/g, (d) => SUP[Number(d)])}${c.symbol}`
}

function CellPanel({
  cell,
  reactions,
  onPick,
  onClose,
}: {
  cell: MapCell
  reactions: MapReaction[]
  onPick: (r: MapReaction) => void
  onClose: () => void
}) {
  const lang = useLang()
  const t = useDict().atlas
  const name = cellName(cell)
  const into = reactions.filter((r) => r.to.code === cell.code)
  const outOf = reactions.filter((r) => r.from.code === cell.code)
  const list = (items: MapReaction[]) => (
    <ul className="mt-2 divide-y divide-border/70 border-y border-border/70">
      {items.map((r) => (
        <li key={r.id} className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onPick(r)}
            className="flex min-h-11 min-w-0 flex-1 flex-col items-start py-2 text-left"
          >
            <span className="font-serif text-[0.95rem] font-semibold hover:text-link">
              <Sci>{r.label}</Sci>
            </span>
            {r.line && (
              <span className="text-pretty text-xs leading-snug text-muted-foreground">
                <Sci>{r.line}</Sci>
              </span>
            )}
          </button>
          <Link
            href={localePath(lang, `/atlas/${r.id}`)}
            aria-label={`${t.fullEntry}: ${r.label}`}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-link"
          >
            <ArrowRight className="h-4 w-4" />
          </Link>
        </li>
      ))}
    </ul>
  )
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{t.nuclide}</p>
          <h3 className="mt-1 font-serif text-2xl font-semibold tracking-tight">
            <Sci>{name}</Sci>
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {cell.stable ? t.stableNuclide : `${t.radioactive}${cell.halfLife ? `, t½ = ` : ""}`}
            {!cell.stable && cell.halfLife && <Sci>{cell.halfLife}</Sci>}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-[1.125rem] w-[1.125rem]" />
        </button>
      </div>
      {outOf.length > 0 && (
        <section className="mt-5">
          <h4 className="text-xs uppercase tracking-[0.1em] text-muted-foreground"><Sci>{t.cellFrom(name)}</Sci></h4>
          {list(outOf)}
        </section>
      )}
      {into.length > 0 && (
        <section className="mt-5">
          <h4 className="text-xs uppercase tracking-[0.1em] text-muted-foreground"><Sci>{t.cellTo(name)}</Sci></h4>
          {list(into)}
        </section>
      )}
      {reactions.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{t.cellNone}</p>}
    </div>
  )
}
