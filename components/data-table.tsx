"use client"

import { useMemo, useState } from "react"
import { ArrowUpDown } from "lucide-react"
import { Tex } from "@/components/tex"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Sci } from "@/components/sci"
import type { DataSegment } from "@/lib/api"
import { datasetName, qualifier } from "@/lib/eval-plot"
import { formatEnergy, observableLabel } from "@/lib/viz"
import { useDict, useLang } from "@/components/lang-provider"
import { decimal } from "@/lib/i18n"

/**
 * Every data segment with its provenance and fit quality.
 *
 * This is also the table view that the color guidance requires as relief for
 * the plot: identity is available here as text, never color alone.
 */

type SortKey = "key" | "name" | "observable" | "n_points" | "chi2" | "norm"

interface Props {
  data: DataSegment[]
}

export function DataTable({ data }: Props) {
  const lang = useLang()
  const t = useDict().workspace
  const [filter, setFilter] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("key")
  const [ascending, setAscending] = useState(true)

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const filtered = needle
      ? data.filter(
          (segment) =>
            segment.name.toLowerCase().includes(needle) ||
            datasetName(segment).toLowerCase().includes(needle) ||
            segment.observable.toLowerCase().includes(needle) ||
            segment.data_file.toLowerCase().includes(needle),
        )
      : data

    return [...filtered].sort((a, b) => {
      const left = a[sortKey]
      const right = b[sortKey]
      // Segments without a chi-squared sort last regardless of direction.
      if (left === null) return 1
      if (right === null) return -1
      const order =
        typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right)
          : Number(left) - Number(right)
      return ascending ? order : -order
    })
  }, [data, filter, sortKey, ascending])

  const totals = useMemo(() => {
    const points = data.reduce((sum, s) => sum + s.n_points, 0)
    // Pooled over points, as a fit is judged: Σχ² / ΣN, not the mean of the
    // per-segment values (which would weigh a 7-point segment like a
    // 300-point one).
    let chi2 = 0
    let counted = 0
    let penalty = 0
    for (const s of data) {
      if (!s.active || s.chi2 === null) continue
      const n = s.chi2_points ?? s.n_points
      chi2 += s.chi2_sum ?? s.chi2 * n
      counted += n
      penalty += s.norm_penalty ?? 0
    }
    const active = data.filter((s) => s.active)
    const free = active.filter((s) => s.vary_norm)
    return {
      points,
      chi2: counted > 0 ? chi2 : null,
      counted,
      penalty,
      active: active.length,
      free: free.length,
      constrained: free.filter((s) => s.norm_error > 0).length,
      fixed: active.length - free.length,
    }
  }, [data])

  const range = (segment: DataSegment) => {
    const e = (segment.energies ?? []).filter((v): v is number => v !== null && Number.isFinite(v))
    if (e.length === 0) return `${formatEnergy(segment.energy_min)}–${formatEnergy(segment.energy_max)}`
    return `${formatEnergy(Math.min(...e))}–${formatEnergy(Math.max(...e))}`
  }

  const normStatus = (segment: DataSegment) =>
    !segment.vary_norm
      ? t.normFixed
      : segment.norm_error > 0
        ? t.normFreeSigma(decimal(String(Number(segment.norm_error.toFixed(2))), lang))
        : t.normFreeNone

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAscending(!ascending)
    else {
      setSortKey(key)
      setAscending(true)
    }
  }

  const header = (key: SortKey, label: string, align = "left") => (
    <th
      className={`px-2 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={sortKey === key ? (ascending ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => sortBy(key)}
        className="inline-flex min-h-8 items-center gap-1 hover:text-foreground"
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      </button>
    </th>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t.data}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.dataSummary(data.length, totals.active, totals.points)}
          </p>
          <div className="mt-3 max-w-3xl space-y-1.5 text-sm leading-relaxed">
            {totals.chi2 !== null && (
              <p className="font-medium">
                {t.chi2Total(
                  Math.round(totals.chi2).toLocaleString(lang === "it" ? "it-IT" : "en-GB"),
                  totals.counted,
                  decimal((totals.chi2 / totals.counted).toFixed(2), lang),
                )}
                {totals.penalty > 0 && t.penaltyText(decimal(totals.penalty.toFixed(2), lang))}
              </p>
            )}
            <p className="text-muted-foreground">
              {t.normSummary(totals.free, totals.constrained, totals.fixed)} {t.chi2Explain}
            </p>
          </div>
        </div>
        <Input
          placeholder={t.filterDatasets}
          aria-label={t.filterDatasets}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="w-full sm:w-64"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  {header("key", "#")}
                  {header("name", t.dataset)}
                  <th className="px-2 py-2 font-medium">{t.reaction}</th>
                  {header("observable", t.observable)}
                  <th className="px-2 py-2 text-right font-medium">
                    {t.energyAxis}
                  </th>
                  <th className="px-2 py-2 text-right font-medium">{t.angle}</th>
                  {header("n_points", t.points, "right")}
                  {header("norm", t.norm, "right")}
                  {header("chi2", "χ²/N", "right")}
                </tr>
              </thead>
              <tbody>
                {rows.map((segment) => (
                  <tr
                    key={segment.index}
                    className="border-b last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-2 py-2 tabular-nums text-muted-foreground">
                      {segment.key}
                    </td>
                    <td className="px-2 py-2">
                      <span className="font-medium">{datasetName(segment)}</span>
                      {qualifier(segment) && (
                        <span className="text-muted-foreground"> · {qualifier(segment)}</span>
                      )}
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {segment.data_file.replace(/^.*\//, "")}
                      </span>
                      {!segment.active && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {t.inactive}
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {segment.reaction ? (
                        <Sci>{segment.reaction}</Sci>
                      ) : (
                        <>
                          <Tex math={segment.entrance} />
                          {" → "}
                          <Tex math={segment.exit} />
                        </>
                      )}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {observableLabel(segment.observable, lang)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                      {range(segment)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                      {segment.observable.startsWith("differential")
                        ? segment.angle_min === segment.angle_max
                          ? segment.angle_min.toFixed(1)
                          : `${segment.angle_min.toFixed(0)}–${segment.angle_max.toFixed(0)}`
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {segment.n_points}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                      {decimal(segment.norm.toFixed(3), lang)}
                      <span className="block text-[11px] text-muted-foreground">
                        {normStatus(segment)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {segment.chi2 === null ? "—" : decimal(segment.chi2.toFixed(2), lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t.noMatch(filter)}
        </p>
      )}
    </div>
  )
}
