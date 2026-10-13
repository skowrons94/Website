"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, ChevronDown } from "lucide-react"

import { GapMap, type MapRow, type MapWindow } from "@/components/data/gap-map"
import { dec, energy, kev, percent, temperature } from "@/lib/data/format"
import { fill } from "@/lib/data/fill"
import { GROUPS, GROUP_SYMBOL } from "@/lib/data/quantity"
import type { DataExpertStrings } from "@/lib/i18n"
import type { Lang } from "@/lib/locale"

export interface PanelWindow extends MapWindow {
  network: string
  width: number
  unmeasured: number
  widths: number | null
  below: number | null
}

export interface PanelProps {
  strings: DataExpertStrings
  lang: Lang
  rows: MapRow[]
  windows: PanelWindow[]
  lowest: { E: number; id: string; y: number | null; a: string } | null
  counts: string
  macs: { n: number; lo: number; hi: number } | null
  threshold: number | null
  neutron: boolean
  /** the first window shown */
  initial?: number
  /** heading level and id, for the atlas page or the data page */
  heading?: "h2" | "h3"
  id?: string
  title?: string
  links?: React.ReactNode
  children?: React.ReactNode
}

/**
 * "Measurements (EXFOR)": the gap map of a reaction and its three numbers
 * (lowest measured energy, its distance from the Gamow peak in window
 * widths, the share of the rate from unmeasured energies), for each of the
 * reaction's temperatures. Everything is computed at build time from the
 * committed index (lib/data/build.ts); the page only switches temperature.
 */
export function MeasurementsPanel(p: PanelProps) {
  const { strings, lang, rows, windows, lowest, neutron } = p
  const t = strings.panel
  const [sel, setSel] = useState(Math.min(p.initial ?? 0, Math.max(0, windows.length - 1)))
  const w = windows[sel] ?? null
  const Heading = p.heading ?? "h2"
  const label = (x: PanelWindow) => (neutron && x.kT ? `${x.label}, kT = ${kev(x.kT, lang)} keV` : `${x.label}, ${temperature(x.T9, lang)}`)
  const groups = GROUPS.map((g) => ({ g, members: rows.filter((r) => r.g === g && r.e0 > 0) })).filter((x) => x.members.length)

  return (
    <section id={p.id ?? "exfor"} className="scroll-mt-24" aria-labelledby={`${p.id ?? "exfor"}-title`}>
      <Heading
        id={`${p.id ?? "exfor"}-title`}
        className={
          Heading === "h2" ? "font-serif text-2xl font-semibold tracking-tight" : "font-serif text-xl font-semibold tracking-tight"
        }
      >
        {p.title ?? t.title}
      </Heading>
      <p className="mt-3 max-w-prose text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">{t.intro}</p>
      <p className="mt-2 text-sm font-medium tabular">{p.counts}</p>

      {windows.length > 1 && (
        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.temperature}</legend>
          <div className="flex flex-wrap gap-2">
            {windows.map((x, i) => (
              <label
                key={`${x.T9}-${x.label}`}
                className={`inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 py-1 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                  i === sel ? "border-foreground/60 bg-foreground text-background" : "border-border bg-card hover:border-foreground/30"
                }`}
              >
                <input type="radio" name={`${p.id ?? "exfor"}-T`} className="sr-only" checked={i === sel} onChange={() => setSel(i)} />
                {label(x)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {windows.length === 1 && w && <p className="mt-4 text-sm text-muted-foreground">{label(w)}</p>}

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <Tile
          label={t.lowest}
          value={lowest ? energy(lowest.E, lang) : t.noLowest}
          sub={
            lowest
              ? `${fill(t.lowestSub, { who: lowest.a.replace(/\+$/, " et al."), year: lowest.y ?? "" })} · ${lowest.id}`
              : t.noLowestSub
          }
        />
        {!neutron ? (
          <Tile
            label={t.distance}
            value={
              !w || w.widths === null
                ? "–"
                : lowest && lowest.E >= w.lo && lowest.E <= w.hi
                  ? t.inside
                  : fill(w.widths >= 0 ? t.widthsAbove : t.widthsBelow, { n: kev(Math.abs(w.widths), lang, 2) })
            }
            sub={w ? fill(t.distanceSub, { E0: kev(w.E0, lang), lo: kev(w.lo, lang), hi: kev(w.hi, lang) }) : ""}
          />
        ) : (
          <Tile
            label={t.macsTitle}
            value={p.macs ? fill(t.macsValue, { n: p.macs.n }) : t.noMacs}
            sub={p.macs ? fill(t.macsSub, { lo: energy(p.macs.lo, lang), hi: energy(p.macs.hi, lang) }) : ""}
          />
        )}
        <Tile
          label={t.unmeasured}
          value={w ? percent(w.unmeasured, lang) : "–"}
          sub={
            w
              ? `${fill(t.unmeasuredSub, { T: neutron && w.kT ? `kT = ${kev(w.kT, lang)} keV` : `T₉ = ${dec(String(w.T9), lang)}` })}${
                  w.below !== null && w.below > 0.0001 && !neutron ? ` · ${fill(t.belowLowest, { share: percent(w.below, lang) })}` : ""
                }`
              : ""
          }
        />
      </dl>

      {w &&
        !neutron &&
        (() => {
          const n = rows.filter((r) => r.g === "strength" && r.counted && r.e0 <= w.hi && r.e1 >= w.lo).length
          return n > 0 ? <p className="mt-3 text-sm text-muted-foreground">{fill(t.strengthsInWindow, { n })}</p> : null
        })()}

      <div className="mt-6 rounded-lg border border-border bg-[var(--viz-surface)] p-3 sm:p-4">
        <GapMap
          rows={rows}
          window={w}
          others={windows.filter((_, i) => i !== sel)}
          lowest={lowest?.E ?? null}
          threshold={p.threshold}
          strings={strings}
          lang={lang}
        />
        <ul className="mt-3 space-y-1 text-xs leading-snug text-muted-foreground">
          <li className="flex items-start gap-2">
            <Swatch kind="hatch" />
            <span>
              {neutron ? fill(strings.gap.windowNeutron, { kT: w?.kT ? kev(w.kT, lang) : "" }) : strings.gap.window}
              {lowest && !neutron ? `, ${strings.gap.hatched}` : ""}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Swatch kind="hollow" />
            <span>{strings.gap.hollow}</span>
          </li>
          <li className="flex items-start gap-2">
            <Swatch kind="diamond" />
            <span>
              {strings.gap.single} {strings.gap.clipped}
            </span>
          </li>
        </ul>
      </div>

      <details className="group mt-4 rounded-lg border border-border/80">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          {strings.gap.tableCaption}
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="overflow-x-auto px-4 pb-3">
          <table className="w-full text-sm">
            <caption className="sr-only">{strings.gap.tableCaption}</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {strings.gap.quantity}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  {strings.gap.count}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {strings.gap.range}
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map(({ g, members }) => (
                <tr key={g} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-1.5 pr-4 text-left font-normal">
                    <span className="mr-2 inline-block w-12 font-medium">{GROUP_SYMBOL[g]}</span>
                    <span className="text-muted-foreground">{strings.quantityShort[g]}</span>
                  </th>
                  <td className="py-1.5 pr-4 text-right tabular">{members.length}</td>
                  <td className="py-1.5 tabular">
                    {energy(Math.min(...members.map((r) => r.e0)), lang)} – {energy(Math.max(...members.map((r) => r.e1)), lang)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="group mt-2 rounded-lg border border-border/80">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          {t.methodTitle}
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <p className="px-4 pb-4 text-pretty text-sm leading-relaxed text-muted-foreground">{t.method}</p>
      </details>

      {p.links && <div className="mt-5 flex flex-wrap gap-2">{p.links}</div>}
      {p.children}
    </section>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-serif text-2xl font-semibold tracking-tight tabular">{value}</dd>
      {sub && <dd className="mt-1 text-xs leading-snug text-muted-foreground">{sub}</dd>}
    </div>
  )
}

function Swatch({ kind }: { kind: "hatch" | "hollow" | "diamond" }) {
  return (
    <svg aria-hidden width="18" height="12" viewBox="0 0 18 12" className="mt-0.5 shrink-0">
      {kind === "hatch" && (
        <>
          <defs>
            <pattern id="swatch-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke="var(--viz-series-2)" strokeWidth="1.4" strokeOpacity="0.7" />
            </pattern>
          </defs>
          <rect x="0.5" y="0.5" width="17" height="11" fill="url(#swatch-hatch)" stroke="var(--viz-text-muted)" strokeDasharray="2 2" />
        </>
      )}
      {kind === "hollow" && <rect x="1" y="3" width="16" height="6" rx="1.5" fill="none" stroke="var(--viz-series-1)" />}
      {kind === "diamond" && <path d="M9 1 l5 5 l-5 5 l-5 -5z" fill="var(--viz-series-1)" />}
    </svg>
  )
}

/** A link styled as the panel's chips. */
export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-[0.95rem] font-medium text-link transition-colors hover:border-foreground/30"
    >
      {children}
      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}
