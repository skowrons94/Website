import { Sci } from "@/components/sci"
import { dict, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Why LUNA is underground, as one schematic picture: cosmic-ray muons rain on
 * the mountain, about 1400 m of rock (3800 m w.e.) stops all but about one in
 * a million, and in the halls below two accelerators (LUNA 400 kV and the
 * 3.5 MV machine of the Bellotti Ion Beam Facility, BIBF) send their beams onto a
 * target surrounded by a detector. Numbers as in facilities.yaml and the
 * glossary; not to scale. The numbered labels are explained in an HTML list
 * under the picture, which stays legible on a phone; the colours are the
 * chart tokens, so the drawing follows the theme.
 *
 * The words in the picture are set in CSS pixels per breakpoint: on a phone
 * the 640-unit drawing is about half size, so they are drawn twice as large
 * there to stay at 11 px or more. `compact` draws the picture alone (no
 * numbered markers and no list), always with the large labels, for a small
 * place such as the home page.
 */

const MOUNTAIN =
  "M0,300 L60,262 L110,228 L160,178 L215,128 L262,82 L300,46 L338,72 L382,104 L430,140 L486,182 L548,226 L600,252 L640,266 L640,360 L0,360 Z"

// Muons: [x0, y0, x1, y1, through]; the last one reaches the halls.
const MUONS: [number, number, number, number, boolean][] = [
  [118, 4, 150, 214, false],
  [214, 4, 236, 150, false],
  [292, 4, 282, 120, false],
  [452, 4, 420, 196, false],
  [560, 4, 520, 246, false],
  [372, 4, 344, 304, true],
]

function Marker({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={11} fill="var(--viz-text)" className="[r:15px] sm:[r:12.5px]" />
      <text
        x={x}
        y={y + 0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13}
        fontWeight={600}
        fill="var(--viz-surface)"
        className="[font-size:20px] sm:[font-size:15px]"
      >
        {n}
      </text>
    </g>
  )
}

export function LunaFigure({ lang, className, compact = false }: { lang: Lang; className?: string; compact?: boolean }) {
  const a = dict(lang).atlas
  const t = a.lunaFigure
  const muon = "var(--viz-series-2)"
  const beam = "var(--viz-series-1)"
  const id = compact ? "luna-figure-compact" : "luna-figure"
  // Label sizes: large on a phone (and always when compact), smaller from sm up.
  const big = compact ? "[font-size:22px]" : "[font-size:22px] sm:[font-size:17px]"
  const depth = compact ? "[font-size:24px]" : "[font-size:24px] sm:[font-size:19px]"
  return (
    <figure className={cn("rounded-lg border border-border p-3 sm:p-4", className)} style={{ background: "var(--viz-surface)" }}>
      <svg viewBox="0 0 640 360" role="img" aria-labelledby={`${id}-title`} className="block h-auto w-full">
        <title id={`${id}-title`}>{t.alt}</title>
        <defs>
          <marker id={`${id}-muon-head`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 Z" fill={muon} />
          </marker>
          <marker id={`${id}-depth-head`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 Z" fill="var(--viz-text-muted)" />
          </marker>
        </defs>

        {/* the mountain, named */}
        <path d={MOUNTAIN} fill="var(--atlas-cell-strong)" stroke="var(--viz-text-muted)" strokeWidth={1.2} />
        <text x={575} y={282} textAnchor="middle" fontSize={15} fontWeight={600} fill="var(--viz-text)" className={big}>
          {a.lunaMountain}
        </text>
        <text x={575} y={304} textAnchor="middle" fontSize={14} fill="var(--viz-text-muted)" className={big}>
          {t.rock}
        </text>

        {/* muons: most stop in the rock, about one in a million reaches the halls */}
        {MUONS.map(([x0, y0, x1, y1, through], i) => (
          <g key={i}>
            <line
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke={muon}
              strokeWidth={through ? 1.6 : 2}
              strokeDasharray={through ? "5 4" : undefined}
              markerEnd={`url(#${id}-muon-head)`}
            />
            {!through && (
              <g stroke={muon} strokeWidth={2}>
                <line x1={x1 - 5} y1={y1 + 6} x2={x1 + 5} y2={y1 + 16} />
                <line x1={x1 + 5} y1={y1 + 6} x2={x1 - 5} y2={y1 + 16} />
              </g>
            )}
          </g>
        ))}
        {!compact && <Marker x={88} y={30} n={1} />}

        {/* depth */}
        <line
          x1={300}
          y1={52}
          x2={300}
          y2={292}
          stroke="var(--viz-text-muted)"
          strokeWidth={1.4}
          markerStart={`url(#${id}-depth-head)`}
          markerEnd={`url(#${id}-depth-head)`}
        />
        <rect x={236} y={172} width={128} height={36} rx={4} fill="var(--atlas-cell-strong)" />
        <text x={300} y={191} textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={600} fill="var(--viz-text)" className={depth}>
          ≈ 1400 m
        </text>
        {!compact && <Marker x={218} y={190} n={2} />}

        {/* the motorway tunnel and the halls */}
        <line x1={0} y1={338} x2={168} y2={338} stroke="var(--viz-text-muted)" strokeWidth={1.2} strokeDasharray="7 5" />
        <line x1={492} y1={338} x2={640} y2={338} stroke="var(--viz-text-muted)" strokeWidth={1.2} strokeDasharray="7 5" />
        <rect x={168} y={298} width={324} height={54} rx={8} fill="var(--viz-surface)" stroke="var(--viz-text-muted)" strokeWidth={1.2} />

        {/* LUNA 400 kV */}
        <rect x={180} y={311} width={46} height={28} rx={4} fill={beam} />
        <line x1={226} y1={325} x2={268} y2={325} stroke={beam} strokeWidth={2.5} />
        <circle cx={278} cy={325} r={10} fill="none" stroke="var(--viz-text)" strokeWidth={2} />
        <circle cx={278} cy={325} r={2.5} fill="var(--viz-text)" />
        {!compact && <Marker x={203} y={288} n={3} />}

        {/* the MV machine, Bellotti Ion Beam Facility (BIBF) */}
        <rect x={326} y={307} width={84} height={36} rx={5} fill={beam} />
        <line x1={410} y1={325} x2={456} y2={325} stroke={beam} strokeWidth={2.5} />
        <circle cx={466} cy={325} r={10} fill="none" stroke="var(--viz-text)" strokeWidth={2} />
        <circle cx={466} cy={325} r={2.5} fill="var(--viz-text)" />
        {!compact && <Marker x={368} y={288} n={4} />}
        {!compact && <Marker x={466} y={288} n={5} />}

        {/* the tunnel, named under its line on the left */}
        <text x={6} y={356} fontSize={12} fill="var(--viz-text-muted)" className={compact ? "[font-size:20px]" : "[font-size:20px] sm:[font-size:15px]"}>
          {t.tunnelShort}
        </text>
      </svg>

      {!compact && (
        <figcaption className="mt-3 text-sm leading-relaxed text-muted-foreground">
          <ol className="space-y-1.5">
            {t.items.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-pretty">
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[0.6875rem] font-semibold text-background"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <Sci>{item}</Sci>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs">{t.note}</p>
        </figcaption>
      )}
    </figure>
  )
}
