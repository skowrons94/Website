"use client"

import { useRef, useState } from "react"

import { Sci } from "@/components/sci"
import type { Lang } from "@/lib/locale"
import { ratesDict } from "@/lib/rates/i18n"
import type { Network } from "@/lib/rates/schema"
import { dec } from "./format"

export interface SensitivityTable {
  nuclei: string[]
  reactions: string[]
  /** s[reaction][nucleus] = ln(X_×2 / X) / ln 2 */
  s: number[][]
  /** the same s for the burn's mean power, its fuel time (null: not reached) and each neutrino source */
  energy?: number[]
  fuel?: (number | null)[]
  nu?: Record<string, (number | null)[]>
}

/**
 * The sensitivity map: reactions down, nuclei across, each cell how much the
 * nucleus's final abundance follows the rate (precomputed by
 * scripts/rates/sensitivity.mjs, every rate ×2 in turn). Violet: more of the
 * nucleus, brown: less, the intensity |s| up to 1 (a nucleus that doubles
 * with the rate); the value is written in the cell when it is at least 0.1.
 * Rows are ordered by reach (Σ min(1, |s|) over the nuclei shown), so a rate
 * that moves many nuclei comes before a decay that only sets its own parent.
 * A cell is a button: it tries that rate ×2. The grid is one tab stop (a
 * roving tabindex): the arrow keys, Home and End move between the cells.
 * After the nuclei, set apart, the energy columns (lib/rates/energy.ts):
 * the mean power, the fuel time and the neutrino sources a detector names.
 */
export function SensitivityMap({
  network,
  table,
  lang,
  columns,
  noFuel = false,
  onTry,
}: {
  network: Network
  table: SensitivityTable
  lang: Lang
  /** the nuclei to show (all of the table's when absent), in this order */
  columns?: string[]
  /** leave out the fuel time: the network lacks the burning that sets it (lib/rates/energy.ts: missingPower) */
  noFuel?: boolean
  onTry?: (reactionId: string) => void
}) {
  const t = ratesDict(lang)
  const [all, setAll] = useState(false)
  const label = (name: string) => network.nuclei.find((n) => n.name === name)?.label ?? name
  const rlabel = (id: string) => network.reactions.find((r) => r.id === id)?.label ?? id
  const nucCols = (columns ?? table.nuclei).map((n) => table.nuclei.indexOf(n)).filter((j) => j >= 0)
  // every column: the nuclei, then the energy's
  type Col = { key: string; label: string; get: (i: number) => number | null; extra?: boolean }
  const cols: Col[] = nucCols.map((j) => ({ key: table.nuclei[j], label: label(table.nuclei[j]), get: (i) => table.s[i][j] }))
  const extra: Col[] = []
  if (table.energy) extra.push({ key: "energy", label: t.energy.sensEnergy, get: (i) => table.energy![i], extra: true })
  if (!noFuel && table.fuel?.some((v) => v !== null)) extra.push({ key: "fuel", label: t.energy.sensFuel, get: (i) => table.fuel![i], extra: true })
  for (const [g, v] of Object.entries(table.nu ?? {})) extra.push({ key: `nu-${g}`, label: t.energy.nu[g] ?? g, get: (i) => v[i], extra: true })
  cols.push(...extra)
  const rows = table.reactions
    .map((id, i) => ({
      id,
      i,
      max: Math.max(0, ...nucCols.map((j) => Math.abs(table.s[i][j]))),
      // how much the rate moves across all the nuclei (capped per nucleus)
      reach: nucCols.reduce((a, j) => a + Math.min(1, Math.abs(table.s[i][j])), 0),
    }))
    .filter((r) => r.max >= 0.01)
    .sort((a, b) => b.reach - a.reach)
  const shown = all ? rows : rows.slice(0, 8)
  const [focus, setFocus] = useState<[number, number]>([0, 0])
  const tableRef = useRef<HTMLTableElement>(null)
  const fr = Math.min(focus[0], shown.length - 1)
  const fc = Math.min(focus[1], cols.length - 1)
  const move = (e: React.KeyboardEvent) => {
    let [r, c] = [fr, fc]
    if (e.key === "ArrowRight") c = Math.min(cols.length - 1, c + 1)
    else if (e.key === "ArrowLeft") c = Math.max(0, c - 1)
    else if (e.key === "ArrowDown") r = Math.min(shown.length - 1, r + 1)
    else if (e.key === "ArrowUp") r = Math.max(0, r - 1)
    else if (e.key === "Home") c = 0
    else if (e.key === "End") c = cols.length - 1
    else return
    e.preventDefault()
    setFocus([r, c])
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${r}-${c}"]`)?.focus()
  }
  const fmt = (v: number) =>
    dec((v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(Math.abs(v) >= 10 ? 0 : 1), lang)

  return (
    <div>
      <div
        className="overflow-x-auto overscroll-x-contain rounded-md border border-border [scrollbar-width:thin]"
        role="region"
        aria-label={t.sensLabel}
      >
        <table ref={tableRef} className="border-collapse text-xs" onKeyDown={move}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left font-medium text-muted-foreground">×2</th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  title={c.extra ? t.energy.sensGroup : undefined}
                  className={
                    c.extra
                      ? `min-w-[3.4rem] max-w-[5.5rem] px-1 py-1.5 text-center align-bottom text-[0.66rem] font-medium leading-tight ${c === extra[0] ? "border-l-2 border-border" : ""}`
                      : "min-w-[2.6rem] px-0.5 py-1.5 text-center font-serif font-semibold"
                  }
                >
                  <Sci>{c.label}</Sci>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ id, i }, ri) => (
              <tr key={id} className="border-t border-border/50">
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-1 text-left font-serif font-semibold"
                >
                  <Sci>{rlabel(id)}</Sci>
                </th>
                {cols.map((col, ci) => {
                  const raw = col.get(i)
                  const v = raw ?? 0
                  const a = Math.min(1, Math.abs(v)) ** 0.7
                  const hue = v > 0 ? "var(--rates-up)" : "var(--rates-down)"
                  const strong = a > 0.55
                  return (
                    <td key={col.key} className={`p-0.5 ${col === extra[0] ? "border-l-2 border-border" : ""}`}>
                      <button
                        type="button"
                        data-cell={`${ri}-${ci}`}
                        tabIndex={ri === fr && ci === fc ? 0 : -1}
                        onFocus={() => setFocus([ri, ci])}
                        onClick={() => onTry?.(id)}
                        title={t.sensCell(rlabel(id), col.label, raw === null ? "–" : fmt(v))}
                        aria-label={t.sensCell(rlabel(id), col.label, raw === null ? "–" : fmt(v))}
                        className="tabular flex h-7 w-full min-w-[2.4rem] items-center justify-center rounded-sm text-[0.68rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        style={{
                          background:
                            Math.abs(v) < 0.01
                              ? "transparent"
                              : `color-mix(in srgb, ${hue} ${(a * 100).toFixed(0)}%, transparent)`,
                          color: strong ? "var(--viz-surface)" : "var(--viz-text-muted)",
                        }}
                      >
                        {raw === null ? "–" : Math.abs(v) >= 0.1 ? fmt(v) : ""}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm" style={{ background: "var(--rates-up)" }} aria-hidden />
          +1 {t.sensMore}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm" style={{ background: "var(--rates-down)" }} aria-hidden />
          −1 {t.sensLess}
        </span>
        {onTry && <span>{t.sensTry}</span>}
        {rows.length > 8 && (
          <button
            type="button"
            onClick={() => setAll(!all)}
            className="min-h-8 text-link underline-offset-4 hover:underline"
          >
            {all ? t.sensTop : `${t.sensAll} (${rows.length})`}
          </button>
        )}
      </div>
    </div>
  )
}
