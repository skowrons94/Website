"use client"

import { useMemo, useState } from "react"
import { ArrowUpDown } from "lucide-react"
import { InlineMath } from "react-katex"
import "katex/dist/katex.min.css"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { DataSegment } from "@/lib/api"
import { formatEnergy, observableLabel } from "@/lib/viz"
import { useDict, useLang } from "@/components/lang-provider"

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
    const withChi2 = data.filter((s) => s.chi2 !== null)
    const points = data.reduce((sum, s) => sum + s.n_points, 0)
    const mean =
      withChi2.length > 0
        ? withChi2.reduce((sum, s) => sum + (s.chi2 ?? 0), 0) / withChi2.length
        : null
    return { points, mean, active: data.filter((s) => s.active).length }
  }, [data])

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAscending(!ascending)
    else {
      setSortKey(key)
      setAscending(true)
    }
  }

  const header = (key: SortKey, label: string, align = "left") => (
    <th className={`px-2 py-2 font-medium text-${align}`}>
      <button
        onClick={() => sortBy(key)}
        className="inline-flex items-center gap-1 hover:text-foreground"
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
            {totals.mean !== null && t.meanChi2(totals.mean.toFixed(2))}
          </p>
        </div>
        <Input
          placeholder={t.filterDatasets}
          aria-label={t.filterDatasets}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="w-64"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {header("key", "#")}
                  {header("name", t.dataset)}
                  <th className="px-2 py-2 font-medium">{t.reaction}</th>
                  {header("observable", t.observable)}
                  <th className="px-2 py-2 text-right font-medium">
                    {t.energyMeV}
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
                      <span className="font-medium">{segment.name}</span>
                      {!segment.active && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {t.inactive}
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <InlineMath math={segment.entrance} />
                      {" → "}
                      <InlineMath math={segment.exit} />
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {observableLabel(segment.observable, lang)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                      {formatEnergy(segment.energy_min)}–
                      {formatEnergy(segment.energy_max)}
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
                    <td className="px-2 py-2 text-right tabular-nums">
                      {segment.norm.toFixed(3)}
                      {segment.vary_norm && (
                        <span
                          className="ml-1 text-muted-foreground"
                          title={t.normFree}
                        >
                          *
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {segment.chi2 === null ? "—" : segment.chi2.toFixed(2)}
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
