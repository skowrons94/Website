import fs from "node:fs"
import path from "node:path"

import type { Metadata } from "next"
import Link from "next/link"
import yaml from "js-yaml"
import { ArrowRight, ArrowUpRight, FlaskConical } from "lucide-react"

import { Breadcrumbs } from "@/components/breadcrumbs"
import { Container } from "@/components/page-header"
import { Sci } from "@/components/sci"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { localize } from "@/lib/localize.mjs"
import { pageMetadata } from "@/lib/metadata"

/**
 * /software/webdaq: a guide to WebDAQ, the LUNA data acquisition, for readers
 * who have never sat a shift. A static server component with no JavaScript of
 * its own: the prose is in content/webdaq.yaml, the labels in lib/i18n.ts
 * (the `webdaq` block), the drawings are inline SVG in the chart tokens, so
 * they follow the theme.
 *
 * Screenshots of the demo are optional: scripts/webdaq-screens.mjs writes
 * public/images/webdaq/screen-<id>.{avif,webp} once the demo exists, and each
 * capability shows its screenshot when the file is there and a small drawing
 * otherwise.
 */

/* -- content ------------------------------------------------------------- */

interface Capability {
  id: string
  name: string
  text: string
  shot: string
}

interface FairRow {
  letter: string
  name: string
  now: string[]
  later: string[]
}

interface WebdaqContent {
  lead: string
  demoNote: string
  hero: { alt: string; caption: string }
  why: { title: string; paragraphs: string[] }
  architecture: { title: string; intro: string; alt: string; items: string[] }
  capabilities: { title: string; items: Capability[] }
  shift: { title: string; intro: string; steps: { lead: string; text: string }[] }
  fair: { title: string; intro: string; rows: FairRow[]; example: string; exampleCaption: string }
  demo: { title: string; text: string; phone: string }
  outlook: string
  links: { label: string; href: string }[]
  licence: { text: string; cite: string; pending: string }
}

function getWebdaq(lang: Lang): WebdaqContent {
  const file = path.join(process.cwd(), "content", "webdaq.yaml")
  return localize(yaml.load(fs.readFileSync(file, "utf8")), lang) as WebdaqContent
}

export const webdaqMetadata = (lang: Lang): Metadata =>
  pageMetadata(dict(lang).webdaq.metaTitle, dict(lang).webdaq.description, lang)

const BASE = process.env.BASE_PATH ?? ""

/** The demo is a separate static app (webdaq-demo/), not a Next route: a plain link, with the base path and the language. */
export const demoHref = (lang: Lang) => `${BASE}/webdaq-demo/${lang === "it" ? "?lang=it" : ""}`

const SCREEN_DIR = path.join(process.cwd(), "public", "images", "webdaq")
const hasScreen = (id: string) =>
  fs.existsSync(path.join(SCREEN_DIR, `screen-${id}.webp`)) && fs.existsSync(path.join(SCREEN_DIR, `screen-${id}.avif`))

/* -- small pieces ---------------------------------------------------------- */

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={`${id}-heading`} className="font-serif text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
      {children}
    </h2>
  )
}

function Section({ id, title, children, className = "" }: { id: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={`scroll-mt-24 border-t border-border/70 pt-12 ${className}`}>
      <SectionTitle id={id}>
        <Sci>{title}</Sci>
      </SectionTitle>
      {children}
    </section>
  )
}

function DemoButton({ lang, label }: { lang: Lang; label: string }) {
  return (
    <a
      href={demoHref(lang)}
      className="group inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      <FlaskConical className="h-4 w-4" aria-hidden />
      {label}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
    </a>
  )
}

function Num({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[0.6875rem] font-semibold text-background"
    >
      {n}
    </span>
  )
}

/* -- the architecture diagram ---------------------------------------------- */

type BoxKey = "browser" | "server" | "caendaq" | "digitizers" | "runDir" | "rureader" | "graphite" | "picoammeter" | "elog" | "alerts"

/** Marker number of each box: the order of `architecture.items` in the YAML. */
const MARK: Record<BoxKey, number> = {
  browser: 1,
  server: 2,
  caendaq: 3,
  digitizers: 4,
  runDir: 5,
  rureader: 6,
  graphite: 7,
  picoammeter: 8,
  elog: 9,
  alerts: 10,
}

type Box = { key: BoxKey; x: number; y: number; w: number; h: number; title: string[]; sub?: string; mono?: boolean; data?: boolean }
type Edge = { d: string; data?: boolean; start?: boolean; end?: boolean }
type Label = { x: number; y: number; text: string; anchor?: "start" | "middle" | "end" }

interface Layout {
  w: number
  h: number
  title: number
  sub: number
  outer: { x: number; y: number; w: number; h: number }
  boxes: Box[]
  edges: Edge[]
  bus: string
  labels: Label[]
}

function layouts(t: ReturnType<typeof dict>["webdaq"]["diagram"]): { wide: Layout; tall: Layout } {
  const wide: Layout = {
    w: 800,
    h: 360,
    title: 15,
    sub: 12.5,
    outer: { x: 184, y: 104, w: 452, h: 120 },
    boxes: [
      { key: "elog", x: 200, y: 14, w: 120, h: 48, title: [t.elog] },
      { key: "picoammeter", x: 340, y: 14, w: 120, h: 48, title: [t.picoammeter] },
      { key: "alerts", x: 480, y: 14, w: 120, h: 48, title: t.alertsShort },
      { key: "browser", x: 8, y: 124, w: 152, h: 80, title: [t.browser], sub: t.browserSub },
      { key: "server", x: 200, y: 124, w: 200, h: 80, title: [t.server], sub: t.serverSub },
      { key: "caendaq", x: 440, y: 124, w: 180, h: 80, title: [t.caendaq], sub: t.caendaqSub },
      { key: "digitizers", x: 664, y: 124, w: 124, h: 80, title: t.digitizersShort, data: true },
      { key: "graphite", x: 200, y: 280, w: 180, h: 64, title: [t.graphite] },
      { key: "runDir", x: 440, y: 280, w: 180, h: 64, title: [t.runDir], sub: t.runDirSub, mono: true, data: true },
      { key: "rureader", x: 664, y: 280, w: 124, h: 64, title: [t.rureader], sub: t.rureaderSub, data: true },
    ],
    bus: "M260,62 V84 M400,62 V84 M540,62 V84 M260,84 H540 M300,84 V122",
    edges: [
      { d: "M162,164 H198", start: true, end: true },
      { d: "M402,164 H438", start: true, end: true },
      { d: "M622,164 H662", data: true, start: true, end: true },
      { d: "M530,206 V278", data: true, end: true },
      { d: "M470,206 V244 H290 V278", end: true },
      { d: "M622,312 H662", data: true, end: true },
    ],
    labels: [
      { x: 180, y: 156, text: t.http, anchor: "middle" },
      { x: 380, y: 238, text: t.rates, anchor: "middle" },
    ],
  }
  const tall: Layout = {
    w: 360,
    h: 592,
    title: 16,
    sub: 13,
    outer: { x: 6, y: 172, w: 348, h: 226 },
    boxes: [
      { key: "elog", x: 12, y: 12, w: 80, h: 48, title: [t.elog] },
      { key: "picoammeter", x: 104, y: 12, w: 144, h: 48, title: [t.picoammeter] },
      { key: "alerts", x: 260, y: 12, w: 88, h: 48, title: t.alertsShort },
      { key: "browser", x: 12, y: 94, w: 196, h: 56, title: [t.browser], sub: t.browserSub },
      { key: "server", x: 22, y: 196, w: 316, h: 70, title: [t.server], sub: t.serverSub },
      { key: "caendaq", x: 22, y: 308, w: 316, h: 74, title: [t.caendaq], sub: t.caendaqSub },
      { key: "digitizers", x: 12, y: 442, w: 104, h: 60, title: t.digitizersShort, data: true },
      { key: "runDir", x: 128, y: 442, w: 104, h: 60, title: [t.runDir], mono: true, data: true },
      { key: "graphite", x: 244, y: 442, w: 104, h: 60, title: t.graphiteShort },
      { key: "rureader", x: 128, y: 532, w: 104, h: 52, title: [t.rureader], data: true },
    ],
    bus: "M52,60 V78 M176,60 V78 M304,60 V78 M52,78 H304 M304,78 V194",
    edges: [
      { d: "M100,152 V194", start: true, end: true },
      { d: "M180,268 V306", start: true, end: true },
      { d: "M64,384 V440", data: true, start: true, end: true },
      { d: "M180,384 V440", data: true, end: true },
      { d: "M296,384 V440", end: true },
      { d: "M180,504 V530", data: true, end: true },
    ],
    labels: [
      { x: 108, y: 178, text: t.http },
      { x: 304, y: 420, text: t.rates },
    ],
  }
  return { wide, tall }
}

function DiagramSvg({ layout: L, id, alt }: { layout: Layout; id: string; alt: string }) {
  const data = "var(--viz-series-1)"
  const muted = "var(--viz-text-muted)"
  return (
    <svg viewBox={`0 0 ${L.w} ${L.h}`} role="img" aria-labelledby={`${id}-title`} className="block h-auto w-full">
      <title id={`${id}-title`}>{alt}</title>
      <defs>
        {[
          ["data", data],
          ["ctl", muted],
        ].map(([k, c]) => (
          <marker key={k} id={`${id}-${k}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 Z" fill={c} />
          </marker>
        ))}
      </defs>

      {/* the server process: Flask and CaenDAQ share it */}
      <rect x={L.outer.x} y={L.outer.y} width={L.outer.w} height={L.outer.h} rx={12} fill="var(--atlas-cell)" stroke={muted} strokeWidth={1} strokeDasharray="5 4" />

      <path d={L.bus} fill="none" stroke={muted} strokeWidth={1.4} />

      {L.edges.map((e, i) => (
        <path
          key={i}
          d={e.d}
          fill="none"
          stroke={e.data ? data : muted}
          strokeWidth={e.data ? 2.6 : 1.5}
          markerStart={e.start ? `url(#${id}-${e.data ? "data" : "ctl"})` : undefined}
          markerEnd={e.end ? `url(#${id}-${e.data ? "data" : "ctl"})` : undefined}
        />
      ))}

      {L.boxes.map((b) => {
        const lines = b.title.length + (b.sub ? 1 : 0)
        const lh = L.title * 1.25
        const top = b.y + b.h / 2 - ((lines - 1) * lh) / 2
        return (
          <g key={b.key}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={7}
              fill="var(--viz-surface)"
              stroke={b.data ? data : muted}
              strokeWidth={b.data ? 1.8 : 1.2}
            />
            {b.title.map((line, i) => (
              <text
                key={i}
                x={b.x + b.w / 2}
                y={top + i * lh}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={b.mono ? L.title - 2 : L.title}
                fontWeight={600}
                fontFamily={b.mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined}
                fill="var(--viz-text)"
              >
                {line}
              </text>
            ))}
            {b.sub && (
              <text
                x={b.x + b.w / 2}
                y={top + b.title.length * lh}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={L.sub}
                fill={muted}
              >
                {b.sub}
              </text>
            )}
            <circle cx={b.x + 2} cy={b.y + 2} r={10} fill="var(--viz-text)" />
            <text x={b.x + 2} y={b.y + 2.5} textAnchor="middle" dominantBaseline="central" fontSize={11.5} fontWeight={600} fill="var(--viz-surface)">
              {MARK[b.key]}
            </text>
          </g>
        )
      })}

      {L.labels.map((l, i) => (
        <text key={i} x={l.x} y={l.y} textAnchor={l.anchor ?? "start"} fontSize={L.sub} fill={muted}>
          {l.text}
        </text>
      ))}
    </svg>
  )
}

function Architecture({ lang, content }: { lang: Lang; content: WebdaqContent["architecture"] }) {
  const t = dict(lang).webdaq.diagram
  const { wide, tall } = layouts(t)
  return (
    <figure className="mt-6 rounded-lg border border-border p-3 sm:p-5" style={{ background: "var(--viz-surface)" }}>
      {/* Two drawings of the same picture: a wide one from lg up, a tall one
          below, so the words stay legible on a phone. Only one is displayed. */}
      <div className="hidden lg:block">
        <DiagramSvg layout={wide} id="webdaq-arch-wide" alt={content.alt} />
      </div>
      <div className="mx-auto max-w-[27rem] lg:hidden">
        <DiagramSvg layout={tall} id="webdaq-arch-tall" alt={content.alt} />
      </div>
      <figcaption className="mt-4 text-sm leading-relaxed text-muted-foreground">
        <p className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="inline-block h-[3px] w-6 rounded" style={{ background: "var(--viz-series-1)" }} />
            {t.legendData}
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="inline-block h-[2px] w-6 rounded" style={{ background: "var(--viz-text-muted)" }} />
            {t.legendControl}
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="inline-block h-3 w-6 rounded-sm border border-dashed" style={{ borderColor: "var(--viz-text-muted)", background: "var(--atlas-cell)" }} />
            {t.oneProcess}
          </span>
        </p>
        <ol className="grid gap-x-8 gap-y-2 md:grid-cols-2">
          {content.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-pretty">
              <Num n={i + 1} />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <Sci>{item}</Sci>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs">{t.note}</p>
      </figcaption>
    </figure>
  )
}

/* -- capability drawings ----------------------------------------------------- */

/** A γ-ray spectrum as an SVG path: peaks on a falling background, in a w×h box. */
function spectrumPath(w: number, h: number, peaks: [number, number, number][], x0 = 0, y0 = 0): string {
  const pts: string[] = []
  for (let i = 0; i <= 120; i++) {
    const x = i / 120
    let y = 0.32 * Math.exp(-3.2 * x) + 0.04
    for (const [c, a, s] of peaks) y += a * Math.exp(-((x - c) ** 2) / (2 * s * s))
    pts.push(`${(x0 + x * w).toFixed(1)},${(y0 + h - Math.min(y, 1) * h).toFixed(1)}`)
  }
  return `M${pts.join(" L")}`
}

const PEAKS: [number, number, number][] = [
  [0.36, 0.55, 0.012],
  [0.42, 0.5, 0.012],
  [0.18, 0.22, 0.015],
  [0.78, 0.12, 0.014],
]

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 240 132" aria-hidden focusable="false" className="block h-auto w-full">
      <rect x={0.5} y={0.5} width={239} height={131} rx={8} fill="var(--viz-surface)" stroke="var(--viz-grid)" />
      {children}
    </svg>
  )
}

const bar = (x: number, y: number, w: number, o = 1) => (
  <rect x={x} y={y} width={w} height={6} rx={3} fill="var(--viz-grid)" opacity={o} />
)

function Drawing({ id }: { id: string }) {
  const blue = "var(--viz-series-1)"
  const orange = "var(--viz-series-2)"
  const green = "var(--viz-series-3)"
  const muted = "var(--viz-text-muted)"
  const axis = "var(--viz-axis)"
  switch (id) {
    case "boards":
      return (
        <Frame>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x={18} y={18 + i * 32} width={150} height={24} rx={5} fill="none" stroke={axis} />
              <circle cx={32} cy={30 + i * 32} r={5} fill={i === 2 ? axis : green} />
              {bar(44, 27 + i * 32, 54)}
              {bar(104, 27 + i * 32, 52, 0.6)}
            </g>
          ))}
          <rect x={180} y={18} width={44} height={24} rx={12} fill={blue} />
          <path d="M196,30 h12 M202,24 v12" stroke="var(--viz-surface)" strokeWidth={2.4} strokeLinecap="round" />
          <rect x={180} y={50} width={44} height={56} rx={5} fill="none" stroke={axis} strokeDasharray="3 3" />
          {[0, 1, 2, 3].map((i) => bar(187, 58 + i * 11, 30, 0.7))}
        </Frame>
      )
    case "acquisition":
      return (
        <Frame>
          {[0, 1].map((i) => (
            <g key={i}>
              <rect x={16} y={24 + i * 50} width={56} height={34} rx={4} fill="none" stroke={axis} />
              {[0, 1, 2, 3].map((k) => (
                <circle key={k} cx={26 + k * 12} cy={41 + i * 50} r={2.6} fill={muted} />
              ))}
              <path d={`M74,${41 + i * 50} C110,${41 + i * 50} 110,66 146,66`} fill="none" stroke={blue} strokeWidth={2.2} />
            </g>
          ))}
          <path d="M150,34 h44 l16,16 v48 h-60 Z" fill="none" stroke={blue} strokeWidth={1.8} />
          <path d="M194,34 v16 h16" fill="none" stroke={blue} strokeWidth={1.4} />
          {[0, 1, 2].map((i) => bar(158, 60 + i * 11, 42, 0.8))}
          <path d="M44,12 v104" stroke={orange} strokeWidth={1.2} strokeDasharray="2 3" />
        </Frame>
      )
    case "tuning": {
      const pulse = Array.from({ length: 61 }, (_, i) => {
        const t = i / 60
        const y = t < 0.15 ? 0 : Math.exp(-(t - 0.15) * 5) * (1 - Math.exp(-(t - 0.15) * 60))
        return `${(18 + t * 204).toFixed(1)},${(64 - y * 40).toFixed(1)}`
      })
      return (
        <Frame>
          <path d={`M${pulse.join(" L")}`} fill="none" stroke={muted} strokeWidth={1.4} />
          <path d="M18,64 H56 L90,26 H128 L162,64 H222" fill="none" stroke={blue} strokeWidth={2.2} />
          {[0, 1].map((i) => (
            <g key={i}>
              <line x1={30} x2={210} y1={88 + i * 22} y2={88 + i * 22} stroke="var(--viz-grid)" strokeWidth={4} strokeLinecap="round" />
              <line x1={30} x2={i ? 150 : 96} y1={88 + i * 22} y2={88 + i * 22} stroke={blue} strokeWidth={4} strokeLinecap="round" />
              <circle cx={i ? 150 : 96} cy={88 + i * 22} r={6.5} fill="var(--viz-surface)" stroke={blue} strokeWidth={2} />
            </g>
          ))}
        </Frame>
      )
    }
    case "monitoring":
      return (
        <Frame>
          <path d={spectrumPath(140, 92, PEAKS, 14, 18)} fill="none" stroke={blue} strokeWidth={1.6} />
          <line x1={14} y1={110} x2={154} y2={110} stroke={axis} />
          {[
            [0.82, blue],
            [0.3, orange],
            [0.12, muted],
            [0.06, green],
          ].map(([v, c], i) => (
            <rect key={i} x={170 + i * 14} y={110 - (v as number) * 88} width={10} height={(v as number) * 88} rx={2} fill={c as string} />
          ))}
          <line x1={166} y1={110} x2={226} y2={110} stroke={axis} />
        </Frame>
      )
    case "rois":
      return (
        <Frame>
          <rect x={14 + 0.39 * 212} y={14} width={0.06 * 212} height={96} fill={orange} opacity={0.18} />
          <line x1={14 + 0.39 * 212} x2={14 + 0.39 * 212} y1={14} y2={110} stroke={orange} strokeWidth={1.2} />
          <line x1={14 + 0.45 * 212} x2={14 + 0.45 * 212} y1={14} y2={110} stroke={orange} strokeWidth={1.2} />
          <path d={spectrumPath(212, 92, PEAKS, 14, 18)} fill="none" stroke={blue} strokeWidth={1.6} />
          <line x1={14} y1={110} x2={226} y2={110} stroke={axis} />
          <rect x={136} y={18} width={88} height={24} rx={5} fill="var(--viz-surface)" stroke={orange} />
          <circle cx={148} cy={30} r={4} fill={orange} />
          {bar(158, 27, 58)}
        </Frame>
      )
    case "slowcontrol": {
      const pts = Array.from({ length: 81 }, (_, i) => {
        const t = i / 80
        const trip = t > 0.55 && t < 0.62 ? 0.08 : 1
        const y = (0.62 + 0.04 * Math.sin(t * 40)) * trip
        return [14 + t * 212, 110 - y * 84] as const
      })
      const line = `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")}`
      return (
        <Frame>
          <path d={`${line} L226,110 L14,110 Z`} fill={green} opacity={0.14} />
          <path d={line} fill="none" stroke={green} strokeWidth={1.8} />
          <line x1={14} y1={110} x2={226} y2={110} stroke={axis} />
          <path d="M20,22 L120,22" stroke={muted} strokeWidth={1.2} strokeDasharray="3 3" />
          <path d="M20,30 C80,30 140,18 220,14" fill="none" stroke={orange} strokeWidth={1.6} />
        </Frame>
      )
    }
    case "bookkeeping":
      return (
        <Frame>
          <path d="M60,12 h96 l20,20 v90 h-116 Z" fill="none" stroke={axis} strokeWidth={1.4} />
          <path d="M156,12 v20 h20" fill="none" stroke={axis} />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <g key={i}>
              <rect x={72} y={38 + i * 11} width={30} height={5} rx={2.5} fill={i < 2 ? blue : muted} opacity={i < 2 ? 0.9 : 0.55} />
              <rect x={108} y={38 + i * 11} width={18 + ((i * 17) % 40)} height={5} rx={2.5} fill="var(--viz-grid)" />
            </g>
          ))}
          <rect x={186} y={50} width={40} height={18} rx={9} fill={green} opacity={0.85} />
          <path d="M197,59 l5,5 l9,-10" stroke="var(--viz-surface)" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Frame>
      )
    case "watching":
      return (
        <Frame>
          <line x1={18} x2={222} y1={72} y2={72} stroke={axis} strokeWidth={2} />
          {[30, 66, 102, 174, 210].map((x) => (
            <circle key={x} cx={x} cy={72} r={5} fill={green} />
          ))}
          <circle cx={138} cy={72} r={9} fill={orange} />
          <path d="M138,66 v7 M138,77 v0.5" stroke="var(--viz-surface)" strokeWidth={2.4} strokeLinecap="round" />
          <path d="M138,58 V40" stroke={orange} strokeWidth={1.2} />
          <rect x={100} y={18} width={76} height={24} rx={5} fill="none" stroke={orange} />
          {bar(108, 27, 60)}
          <rect x={112} y={92} width={52} height={20} rx={10} fill="none" stroke={blue} strokeWidth={1.4} />
          {bar(122, 99, 32, 0.9)}
        </Frame>
      )
    default:
      return null
  }
}

function Screen({ id, alt }: { id: string; alt: string }) {
  const src = `${BASE}/images/webdaq/screen-${id}`
  return (
    <picture>
      <source type="image/avif" srcSet={`${src}.avif`} />
      <img
        src={`${src}.webp`}
        alt={alt}
        width={960}
        height={600}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full rounded-md border border-border"
      />
    </picture>
  )
}

/* -- the page ---------------------------------------------------------------- */

export function WebdaqPage({ lang }: { lang: Lang }) {
  const c = getWebdaq(lang)
  const t = dict(lang).webdaq
  const nav = dict(lang).nav
  const to = (p: string) => localePath(lang, p)

  const sections = [
    { id: "why", title: c.why.title },
    { id: "architecture", title: c.architecture.title },
    { id: "capabilities", title: c.capabilities.title },
    { id: "shift", title: c.shift.title },
    { id: "fair", title: c.fair.title },
    { id: "demo", title: c.demo.title },
    { id: "links", title: t.linksTitle },
  ]

  return (
    <Container wide>
      <Breadcrumbs
        label={nav.breadcrumb}
        className="-mt-4 mb-8"
        items={[
          { label: nav.home, href: to("/") },
          { label: nav.software, href: to("/software") },
          { label: t.title },
        ]}
      />

      {/* -- opening ----------------------------------------------------------- */}
      <header className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-12">
        <div className="min-w-0">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{nav.software}</p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{t.title}</h1>
          <p className="mt-2 text-pretty font-medium text-muted-foreground">{t.tagline}</p>
          <p className="mt-5 max-w-2xl text-pretty text-[1.0625rem] leading-relaxed">
            <Sci>{c.lead}</Sci>
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <DemoButton lang={lang} label={t.tryDemo} />
            <a
              href="https://skowrons94.github.io/WebDAQ/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 max-w-full items-center gap-1.5 whitespace-normal rounded-md border border-input-strong px-4 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent"
            >
              {t.readDocs}
              <ArrowUpRight className="h-4 w-4 opacity-70" aria-hidden />
            </a>
          </div>
          <p className="mt-3 max-w-xl text-pretty text-sm text-muted-foreground">{c.demoNote}</p>
        </div>

        <figure className="mt-10 min-w-0 lg:mt-0">
          <picture>
            <source
              type="image/avif"
              srcSet={`${BASE}/images/webdaq/dashboard-800.avif 800w, ${BASE}/images/webdaq/dashboard-1440.avif 1440w`}
              sizes="(min-width: 1024px) 560px, 100vw"
            />
            <img
              src={`${BASE}/images/webdaq/dashboard-800.webp`}
              srcSet={`${BASE}/images/webdaq/dashboard-800.webp 800w, ${BASE}/images/webdaq/dashboard-1440.webp 1440w`}
              sizes="(min-width: 1024px) 560px, 100vw"
              width={1440}
              height={900}
              alt={c.hero.alt}
              fetchPriority="high"
              decoding="async"
              className="block h-auto w-full rounded-lg border border-border shadow-sm"
            />
          </picture>
          <figcaption className="mt-2 text-pretty text-xs leading-relaxed text-muted-foreground">{c.hero.caption}</figcaption>
        </figure>
      </header>

      <nav aria-label={t.onThisPage} className="mb-14 mt-12 text-sm">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.onThisPage}</h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-flex min-h-10 items-center text-muted-foreground underline-offset-4 transition-colors hover:text-link hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-16">
        {/* -- why ----------------------------------------------------------- */}
        <Section id="why" title={c.why.title}>
          <div className="mt-5 max-w-3xl space-y-4 text-pretty leading-[1.75] text-foreground/90">
            {c.why.paragraphs.map((p, i) => (
              <p key={i}>
                <Sci>{p}</Sci>
              </p>
            ))}
          </div>
        </Section>

        {/* -- architecture -------------------------------------------------- */}
        <Section id="architecture" title={c.architecture.title}>
          <p className="mt-3 max-w-3xl text-pretty leading-relaxed text-muted-foreground">
            <Sci>{c.architecture.intro}</Sci>
          </p>
          <Architecture lang={lang} content={c.architecture} />
        </Section>

        {/* -- capabilities -------------------------------------------------- */}
        <Section id="capabilities" title={c.capabilities.title}>
          <ul className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {c.capabilities.items.map((cap) => {
              const screen = hasScreen(cap.id)
              return (
                <li key={cap.id} className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-4 [overflow-wrap:anywhere]">
                  <figure>
                    {screen ? <Screen id={cap.id} alt={cap.shot} /> : <Drawing id={cap.id} />}
                    {screen && <figcaption className="mt-1.5 text-xs text-muted-foreground">{t.screenshot}</figcaption>}
                  </figure>
                  <h3 className="mt-4 font-serif text-lg font-semibold tracking-tight">
                    <Sci>{cap.name}</Sci>
                  </h3>
                  <p className="mt-1.5 text-pretty text-[0.925rem] leading-relaxed text-muted-foreground">
                    <Sci>{cap.text}</Sci>
                  </p>
                </li>
              )
            })}
          </ul>
        </Section>

        {/* -- a shift ------------------------------------------------------- */}
        <Section id="shift" title={c.shift.title}>
          <p className="mt-3 max-w-3xl text-pretty leading-relaxed text-muted-foreground">
            <Sci>{c.shift.intro}</Sci>
          </p>
          <ol className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-7 md:grid-cols-2 xl:grid-cols-3">
            {c.shift.steps.map((step, i) => (
              <li key={i} className="flex min-w-0 gap-4">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card font-serif text-base font-semibold"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold">
                    <span className="sr-only">{i + 1}. </span>
                    <Sci>{step.lead}</Sci>
                  </h3>
                  <p className="mt-1 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                    <Sci>{step.text}</Sci>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* -- FAIR ---------------------------------------------------------- */}
        <Section id="fair" title={c.fair.title}>
          <p className="mt-3 max-w-3xl text-pretty leading-relaxed text-muted-foreground">
            <Sci>{c.fair.intro}</Sci>
          </p>

          {/* A table from md up; one card per letter below, where three
              columns of prose would be a few words wide. */}
          <div className="mt-7 hidden md:block">
            {/* One row group per letter: the letter and its name as a
                header across both columns, then what exists and what is next. */}
            <table className="w-full table-fixed border-collapse text-left text-[0.925rem] leading-relaxed">
              <colgroup>
                <col />
                <col className="w-[40%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  <th scope="col" className="py-2 pr-8 font-medium">
                    {t.fairNow}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {t.fairLater}
                  </th>
                </tr>
              </thead>
              {c.fair.rows.map((row) => (
                <tbody key={row.letter} className="border-b border-border/70">
                  <tr>
                    <th scope="rowgroup" colSpan={2} className="pb-1 pt-6 font-normal">
                      <span className="font-serif text-3xl font-semibold leading-none">{row.letter}</span>
                      <span className="ml-3 text-sm text-muted-foreground">{row.name}</span>
                    </th>
                  </tr>
                  <tr className="align-top">
                    <td className="pb-6 pr-8 pt-2">
                      <ul className="space-y-2">
                        {row.now.map((x, i) => (
                          <li key={i} className="flex gap-2.5">
                            <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--viz-series-3)" }} />
                            <span className="min-w-0 text-pretty [overflow-wrap:anywhere]">
                              <Sci>{x}</Sci>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="pb-6 pt-2 text-muted-foreground">
                      <ul className="space-y-2">
                        {row.later.map((x, i) => (
                          <li key={i} className="flex gap-2.5">
                            <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full border border-muted-foreground" />
                            <span className="min-w-0 text-pretty [overflow-wrap:anywhere]">
                              <Sci>{x}</Sci>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                </tbody>
              ))}
            </table>
          </div>

          <div className="mt-7 space-y-4 md:hidden">
            {c.fair.rows.map((row) => (
              <section key={row.letter} aria-label={row.name} className="rounded-lg border border-border bg-card p-4 [overflow-wrap:anywhere]">
                <h3 className="flex items-baseline gap-3">
                  <span className="font-serif text-3xl font-semibold leading-none" aria-hidden>
                    {row.letter}
                  </span>
                  <span className="font-medium">{row.name}</span>
                </h3>
                <h4 className="mt-4 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">{t.fairNow}</h4>
                <ul className="mt-2 space-y-2 text-[0.925rem] leading-relaxed">
                  {row.now.map((x, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--viz-series-3)" }} />
                      <span className="min-w-0 text-pretty">
                        <Sci>{x}</Sci>
                      </span>
                    </li>
                  ))}
                </ul>
                <h4 className="mt-4 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">{t.fairLater}</h4>
                <ul className="mt-2 space-y-2 text-[0.925rem] leading-relaxed text-muted-foreground">
                  {row.later.map((x, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full border border-muted-foreground" />
                      <span className="min-w-0 text-pretty">
                        <Sci>{x}</Sci>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-10">
            <div className="max-w-xl">
              <p className="text-pretty leading-relaxed">
                <Sci>{t.fairTry}</Sci>
              </p>
              <div className="mt-5">
                <DemoButton lang={lang} label={t.tryDemo} />
              </div>
            </div>
            <figure className="mt-8 min-w-0 lg:mt-0">
              <figcaption className="mb-2 text-sm text-muted-foreground">
                <Sci>{c.fair.exampleCaption}</Sci>
              </figcaption>
              <pre
                tabIndex={0}
                aria-label={`${t.example}: metadata.json`}
                lang="en"
                className="max-h-[26rem] overflow-auto rounded-md border border-border bg-muted px-4 py-3 font-mono text-[0.78rem] leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <code>{c.fair.example}</code>
              </pre>
            </figure>
          </div>
        </Section>

        {/* -- demo ---------------------------------------------------------- */}
        <Section id="demo" title={c.demo.title}>
          <div className="mt-6 rounded-lg border border-border bg-card p-5 sm:p-8 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10">
            <div className="min-w-0 max-w-3xl">
              <p className="text-pretty text-[1.0625rem] leading-relaxed">
                <Sci>{c.demo.text}</Sci>
              </p>
              <p className="mt-3 text-pretty text-sm text-muted-foreground">
                <Sci>{c.demoNote}</Sci> <Sci>{c.demo.phone}</Sci>
              </p>
            </div>
            <div className="mt-6 lg:mt-0">
              <DemoButton lang={lang} label={t.demoOpen} />
            </div>
          </div>
        </Section>

        {/* -- links, licence, citation --------------------------------------- */}
        <Section id="links" title={t.linksTitle}>
          <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <div>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.links}</h3>
              <ul className="space-y-0.5 text-sm">
                {c.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="group inline-flex min-h-8 items-center gap-1 text-link underline-offset-4 hover:underline"
                    >
                      {link.label}
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0 space-y-6">
              <div>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.licence}</h3>
                <p className="text-pretty text-[0.95rem] leading-relaxed">
                  <Sci>{c.licence.text}</Sci>
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-4 py-3.5 sm:px-5">
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.cite}</h3>
                <p lang={lang === "en" ? undefined : "en"} className="break-words text-pretty text-[0.95rem] leading-relaxed">
                  {c.licence.cite}
                </p>
                <p className="mt-2 text-pretty text-sm text-muted-foreground">
                  <Sci>{c.licence.pending}</Sci>
                </p>
              </div>
              <p className="text-pretty leading-relaxed text-muted-foreground">
                <Sci>{c.outlook}</Sci>{" "}
                <Link href={to("/research#outlook")} className="text-link underline-offset-4 hover:underline">
                  {t.outlookLink}
                </Link>
              </p>
            </div>
          </div>
        </Section>
      </div>
    </Container>
  )
}
