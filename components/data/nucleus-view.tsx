"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"

import { useWidth } from "@/components/rates/chart-kit"
import { Sci } from "@/components/sci"
import { loadShard } from "@/lib/data/client"
import { dec, kev, sig } from "@/lib/data/format"
import { fill } from "@/lib/data/fill"
import { levelsInWindow, strengthsOf, type Strength } from "@/lib/data/resonances"
import type { Ensdf, EnsdfLevel } from "@/lib/data/types"
import type { DataExpertStrings } from "@/lib/i18n"
import type { Lang } from "@/lib/locale"

export interface NucleusEntrance {
  atlas: string
  label: string
  key: string | null
  slug: string | null
  /** keV: the entrance threshold in the compound nucleus */
  S: number
  particle: string
  windows: { label: string; T9: number; E0: number; lo: number; hi: number }[]
}

const PARTICLE: Record<string, string> = { "1H": "p", "4He": "α", n: "n", "2H": "d", "3He": "³He", "3H": "t" }
const pName = (code: string) => PARTICLE[code] ?? code.replace(/^(\d+)/, (m) => m.replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]))

/** T½ or Γ of a level, as ENSDF gives it. */
function lifetime(l: EnsdfLevel, lang: Lang): string {
  if (l.width_eV !== undefined) {
    const w = l.width_eV
    const s =
      w >= 1e6 ? `${sig(w / 1e6, 3)} MeV` : w >= 1e3 ? `${sig(w / 1e3, 3)} keV` : w >= 1 ? `${sig(w, 3)} eV` : `${sig(w * 1e3, 3)} meV`
    return `Γ = ${l.limit === "LT" ? "< " : l.limit === "GT" ? "> " : ""}${dec(s, lang)}`
  }
  if (l.t_half_s !== undefined) {
    const t = l.t_half_s
    const s =
      t >= 1
        ? `${sig(t, 3)} s`
        : t >= 1e-3
          ? `${sig(t * 1e3, 3)} ms`
          : t >= 1e-6
            ? `${sig(t * 1e6, 3)} µs`
            : t >= 1e-9
              ? `${sig(t * 1e9, 3)} ns`
              : t >= 1e-12
                ? `${sig(t * 1e12, 3)} ps`
                : `${sig(t * 1e15, 3)} fs`
    return `T½ = ${l.limit === "LT" ? "< " : l.limit === "GT" ? "> " : ""}${dec(s, lang)}`
  }
  return l.text ?? ""
}

/**
 * The compound nucleus' levels (ENSDF) with the particle thresholds and the
 * Gamow window of the chosen entrance channel drawn across them; under it,
 * the levels in the window with their measured ωγ, and every level in a
 * table.
 */
export function NucleusView({
  strings,
  lang,
  nuclide,
  levels,
  separation,
  entrances,
}: {
  strings: DataExpertStrings
  lang: Lang
  nuclide: string
  levels: EnsdfLevel[]
  separation: Ensdf["separation"]
  entrances: NucleusEntrance[]
}) {
  const t = strings.nucleus
  const [ei, setEi] = useState(0)
  const [wi, setWi] = useState(0)
  // a short scheme reads best whole
  const [zoom, setZoom] = useState<"threshold" | "all">(levels.length <= 30 ? "all" : "threshold")
  const ent = entrances[ei]
  const win = ent?.windows[Math.min(wi, Math.max(0, (ent?.windows.length ?? 1) - 1))] ?? null
  const [strengths, setStrengths] = useState<Strength[] | null>(null)
  const cn = nuclide.replace(/^(\d+)/, (m) => m.replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]))

  useEffect(() => {
    setStrengths(null)
    if (!ent?.slug) {
      setStrengths([])
      return
    }
    let live = true
    loadShard(ent.slug).then(
      ({ shard }) => live && setStrengths(strengthsOf(shard)),
      () => live && setStrengths([]),
    )
    return () => {
      live = false
    }
  }, [ent?.slug])

  const top = win ? Math.max(win.hi, 50) : 1000
  const inWindow = useMemo(() => (ent ? levelsInWindow(levels, ent.S, top, strengths ?? []) : []), [levels, ent, top, strengths])

  const thresholds = [
    { x: "n", S: separation.S_n },
    { x: "p", S: separation.S_p },
    { x: "α", S: separation.S_a },
    ...entrances.filter((e) => !["1H", "4He", "n"].includes(e.particle)).map((e) => ({ x: pName(e.particle), S: e.S / 1000 })),
  ].filter((x): x is { x: string; S: number } => typeof x.S === "number" && x.S > 0)

  return (
    <>
      <section className="mt-14" aria-labelledby="levels">
        <h2 id="levels" className="font-serif text-2xl font-semibold tracking-tight">
          {t.levels}
        </h2>
        <p className="mt-3 max-w-prose text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
          <Sci>{fill(t.levelsIntro, { cn })}</Sci>
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3">
          {entrances.length > 1 && (
            <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t.entranceChannel}
              <select
                value={ei}
                onChange={(e) => {
                  setEi(Number(e.target.value))
                  setWi(0)
                }}
                className="h-10 w-full max-w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {entrances.map((e, i) => (
                  <option key={e.atlas} value={i}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {ent && ent.windows.length > 0 && (
            <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs font-medium text-muted-foreground">
              {strings.panel.temperature}
              <select
                value={wi}
                onChange={(e) => setWi(Number(e.target.value))}
                className="h-10 w-full max-w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ent.windows.map((w, i) => (
                  <option key={i} value={i}>
                    {w.label}, T₉ = {dec(String(w.T9), lang)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">{t.levels}</legend>
            {(["threshold", "all"] as const).map((z) => (
              <label
                key={z}
                className={`inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${zoom === z ? "border-foreground/60 bg-foreground text-background" : "border-border bg-card hover:border-foreground/30"}`}
              >
                <input type="radio" className="sr-only" name="zoom" checked={zoom === z} onChange={() => setZoom(z)} />
                {z === "threshold" ? t.zoomThreshold : fill(t.all, { n: levels.length })}
              </label>
            ))}
          </fieldset>
        </div>
        <div className="mt-5 rounded-lg border border-border bg-[var(--viz-surface)] p-3 sm:p-4">
          <LevelScheme
            levels={levels}
            thresholds={thresholds}
            entrance={ent ? { S: ent.S / 1000, x: pName(ent.particle) } : null}
            window={
              win && ent
                ? {
                    lo: (ent.S + win.lo) / 1000,
                    hi: (ent.S + win.hi) / 1000,
                    label: `${strings.gap.window}, T₉ = ${dec(String(win.T9), lang)}`,
                  }
                : null
            }
            zoom={zoom}
            measured={new Set(inWindow.filter((l) => l.strengths.length).map((l) => l.level.E_keV))}
            strings={strings}
            lang={lang}
            cn={cn}
          />
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <svg aria-hidden width="18" height="6">
                <line x1="0" x2="18" y1="3" y2="3" stroke="var(--viz-series-1)" strokeWidth="2" />
              </svg>
              {t.legendMeasured}
            </li>
            <li className="flex items-center gap-1.5">
              <svg aria-hidden width="18" height="6">
                <line x1="0" x2="18" y1="3" y2="3" stroke="var(--viz-series-2)" strokeWidth="2" />
              </svg>
              {t.legendNone}
            </li>
            <li>{t.tentative}</li>
          </ul>
        </div>
      </section>

      {ent && (
        <section className="mt-12" aria-labelledby="resonances">
          <h2 id="resonances" className="font-serif text-2xl font-semibold tracking-tight">
            {t.resonances}
          </h2>
          <p className="mt-3 max-w-prose text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
            <Sci>
              {fill(t.resonancesIntro, {
                pair: ent.label,
                S: kev(ent.S, lang, 5),
                T: win ? `T₉ = ${dec(String(win.T9), lang)}` : "–",
                top: kev(top, lang),
              })}
            </Sci>
          </p>
          {strengths === null && (
            <p className="mt-3 animate-pulse text-sm text-muted-foreground" role="status">
              {t.loadingStrengths}
            </p>
          )}
          <div className="mt-4 overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-labelledby="resonances">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{t.resonances}</caption>
              <thead className="bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {t.energy}
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {t.Er}
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                    {t.jpi}
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                    {t.halfLife}
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                    {t.wg}
                  </th>
                </tr>
              </thead>
              <tbody>
                {inWindow.map(({ level, Er, strengths: s }) => (
                  <tr key={level.E_keV} className="border-t border-border/60 align-top">
                    <td className="px-3 py-2 text-right tabular">
                      {kev(level.E_keV, lang, 6)}
                      {level.dE_keV !== undefined && <span className="text-muted-foreground"> ± {dec(String(level.dE_keV), lang)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{kev(Er, lang, 4)}</td>
                    <td className={`px-3 py-2 ${level.firm === false ? "italic text-muted-foreground" : ""}`}>{level.J ?? "–"}</td>
                    <td className="px-3 py-2 text-xs">{lifetime(level, lang) || "–"}</td>
                    <td className="px-3 py-2">
                      {s.length ? (
                        <ul className="space-y-0.5 text-xs">
                          {s.slice(0, 6).map((x, i) => (
                            <li key={i} className="tabular">
                              <span className="font-medium">
                                {x.limit === "upper" ? "< " : x.limit === "lower" ? "> " : ""}
                                {dec(sig(x.value, 3), lang)} eV
                              </span>
                              {x.err ? <span className="text-muted-foreground"> ± {dec(sig(x.err, 2), lang)}</span> : null}
                              <span className="text-muted-foreground">
                                {" "}
                                · {x.author} {x.year ?? ""} ·{" "}
                                <a
                                  href={`https://nds.iaea.org/EXFOR/${x.id.split(".")[0]}`}
                                  className="font-mono text-link hover:underline"
                                >
                                  {x.id}
                                </a>
                              </span>
                            </li>
                          ))}
                          {s.length > 6 && <li className="text-muted-foreground">+{s.length - 6}</li>}
                        </ul>
                      ) : strengths === null ? (
                        "…"
                      ) : (
                        <span className="inline-flex rounded border border-[var(--viz-series-2)] px-1.5 text-xs font-medium">
                          {t.noMeasurement}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {inWindow.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-5 text-center text-muted-foreground">
                      {t.noLevels}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t.method}</p>
        </section>
      )}

      <details className="group mt-10 rounded-lg border border-border/80">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span>
            <Sci>{`${fill(t.tableCaption, { cn })} (${levels.length})`}</Sci>
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="max-h-[70vh] overflow-auto px-2 pb-3" tabIndex={0} role="region" aria-label={fill(t.tableCaption, { cn })}>
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{fill(t.tableCaption, { cn })}</caption>
            <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  {t.energy}
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                  {t.jpi}
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                  {t.halfLife}
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                  {t.gammas}
                </th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l, i) => (
                <tr key={i} className="border-t border-border/60 align-top">
                  <th scope="row" className="px-3 py-1.5 text-right font-normal tabular">
                    {kev(l.E_keV, lang, 6)}
                  </th>
                  <td className={`px-3 py-1.5 ${l.firm === false ? "italic text-muted-foreground" : ""}`}>{l.J ?? "–"}</td>
                  <td className="px-3 py-1.5 text-xs">{lifetime(l, lang) || "–"}</td>
                  <td className="px-3 py-1.5 text-xs tabular">
                    {(l.gammas ?? [])
                      .filter((g) => g.E_final_keV !== undefined)
                      .map(
                        (g) =>
                          `${fill(t.gammaTo, { E: kev(g.E_final_keV as number, lang, 5) })}${g.BR !== undefined ? ` (${dec(sig(g.BR, 2), lang)} %)` : ""}`,
                      )
                      .join(", ") || "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}

/** The level scheme: energy up, a line per level, thresholds dashed, the window shaded. */
function LevelScheme({
  levels,
  thresholds,
  entrance,
  window: w,
  zoom,
  measured,
  strings,
  lang,
  cn,
}: {
  levels: EnsdfLevel[]
  thresholds: { x: string; S: number }[]
  entrance: { S: number; x: string } | null
  window: { lo: number; hi: number; label: string } | null
  zoom: "threshold" | "all"
  measured: Set<number>
  strings: DataExpertStrings
  lang: Lang
  cn: string
}) {
  const [ref, width, k] = useWidth<HTMLDivElement>(720)
  const S = entrance?.S ?? 0
  const all = levels.map((l) => l.E_keV / 1000)
  // near the threshold: at least the nearest level on either side of it
  const below = Math.max(0, ...all.filter((E) => E < S))
  const above = Math.min(...all.filter((E) => E > S), Infinity)
  const lo = zoom === "all" ? 0 : Math.max(0, Math.min(S - 0.4, below - 0.05))
  const hiData = Math.max(...all, S + 1)
  const hi = zoom === "all" ? hiData : Math.min(hiData, Math.max(S + 0.5, (w?.hi ?? S) + 0.25, Number.isFinite(above) ? above + 0.05 : 0))
  const shown = levels.filter((l) => l.E_keV / 1000 >= lo && l.E_keV / 1000 <= hi)
  const LABEL = 13
  const height = Math.max(380, Math.min(1400, shown.length * LABEL + 60))
  const m = { t: 18, b: 18 }
  const ph = height - m.t - m.b
  const y = (E: number) => m.t + ph - ((E - lo) / (hi - lo)) * ph
  const narrow = width < 520
  const x0 = narrow ? 92 : 150
  const x1 = width - (narrow ? 100 : 200)
  // labels pushed apart, keeping order
  const ys = shown.map((l) => y(l.E_keV / 1000))
  const lab = [...ys]
  for (let i = lab.length - 2; i >= 0; i--) if (lab[i] - lab[i + 1] < LABEL) lab[i] = lab[i + 1] + LABEL
  for (let i = 1; i < lab.length; i++) if (lab[i - 1] - lab[i] < LABEL) lab[i] = lab[i - 1] - LABEL
  const summary = `${cn}: ${shown.length} ${strings.nucleus.level}; ${thresholds.map((t) => `S(${t.x}) = ${dec(t.S.toFixed(3), lang)} MeV`).join(", ")}${w ? `; ${w.label}` : ""}`

  return (
    <div ref={ref} className="w-full">
      <svg
        role="img"
        aria-label={summary}
        width={width * k}
        height={height * k}
        viewBox={`0 0 ${width} ${height}`}
        className="block max-w-full"
      >
        {w && w.hi > lo && (
          <g>
            <rect
              x={x0 - 4}
              width={x1 - x0 + 8}
              y={y(Math.min(w.hi, hi))}
              height={Math.max(2, y(Math.max(w.lo, lo)) - y(Math.min(w.hi, hi)))}
              fill="var(--viz-series-2)"
              fillOpacity={0.16}
            />
            <text
              x={(x0 + x1) / 2}
              y={y(Math.min(w.hi, hi)) - 4}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="var(--viz-text)"
              paintOrder="stroke"
              stroke="var(--viz-surface)"
              strokeWidth={3}
            >
              {w.label}
            </text>
          </g>
        )}
        {thresholds.map((t) =>
          t.S >= lo && t.S <= hi ? (
            <g key={t.x}>
              <line
                x1={x0 - 10}
                x2={x1 + 10}
                y1={y(t.S)}
                y2={y(t.S)}
                stroke="var(--viz-text)"
                strokeDasharray="6 4"
                strokeWidth={entrance && t.x === entrance.x ? 1.6 : 1}
              />
              <text
                x={x0 + 4}
                y={y(t.S) + 13}
                fontSize={11}
                fontWeight={entrance && t.x === entrance.x ? 700 : 500}
                fill="var(--viz-text)"
                paintOrder="stroke"
                stroke="var(--viz-surface)"
                strokeWidth={3}
              >
                {fill(strings.nucleus.thresholdLabel, { x: t.x, S: dec(t.S.toFixed(3), lang) })}
              </text>
            </g>
          ) : null,
        )}
        {shown.map((l, i) => {
          const E = l.E_keV / 1000
          const yy = ys[i]
          const has = measured.has(l.E_keV)
          const inWin = w && E >= w.lo && E <= w.hi
          return (
            <g key={`${l.E_keV}-${i}`}>
              <line
                x1={x0}
                x2={x1}
                y1={yy}
                y2={yy}
                stroke={inWin ? (has ? "var(--viz-series-1)" : "var(--viz-series-2)") : "var(--viz-text-muted)"}
                strokeWidth={inWin ? 2 : 1}
              />
              <path d={`M${x0} ${yy}L${x0 - 8} ${lab[i]}H${x0 - 12}`} fill="none" stroke="var(--viz-grid)" />
              <text x={x0 - 14} y={lab[i] + 4} textAnchor="end" fontSize={10.5} fill="var(--viz-text)" className="tabular-nums">
                {dec(E.toFixed(E < 10 ? 3 : 2), lang)}
              </text>
              <path d={`M${x1} ${yy}L${x1 + 8} ${lab[i]}`} fill="none" stroke="var(--viz-grid)" />
              {!narrow || i % 1 === 0 ? (
                <text
                  x={x1 + 10}
                  y={lab[i] + 4}
                  fontSize={10.5}
                  fill="var(--viz-text)"
                  fontStyle={l.firm === false ? "italic" : "normal"}
                  opacity={l.firm === false ? 0.75 : 1}
                >
                  {l.J ?? ""}
                </text>
              ) : null}
            </g>
          )
        })}
        <text x={4} y={12} fontSize={11} fill="var(--viz-text-muted)">
          E (MeV)
        </text>
      </svg>
    </div>
  )
}
