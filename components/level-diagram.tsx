"use client"

import { useMemo, useRef } from "react"
import { ImageDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { SchemeLevel } from "@/lib/api"
import { formatEnergy } from "@/lib/viz"
import { linearTicks, tickLabel } from "@/lib/ticks"
import { useDict, useLang } from "@/components/lang-provider"

/**
 * A conventional nuclear energy-level diagram: one horizontal line per level,
 * placed at its energy, grouped into a column per J^pi.
 *
 * Columns exist because levels of the same spin-parity form one R-matrix
 * J-group, and because it stops labels of nearby levels from colliding — which
 * a single stacked column cannot avoid when background poles sit tens of MeV
 * above the resonances.
 */

const WIDTH = 860
const HEIGHT = 460
const PAD = { top: 32, right: 24, bottom: 44, left: 68 }
const PLOT_W = WIDTH - PAD.left - PAD.right
const PLOT_H = HEIGHT - PAD.top - PAD.bottom

interface Props {
  levels: SchemeLevel[]
}

export function LevelDiagram({ levels }: Props) {
  const t = useDict().workspace
  const lang = useLang()
  const svgRef = useRef<SVGSVGElement>(null)

  const { columns, scale, ticks } = useMemo(() => {
    const groups = new Map<string, SchemeLevel[]>()
    for (const level of levels) {
      const list = groups.get(level.jpi) ?? []
      list.push(level)
      groups.set(level.jpi, list)
    }

    const ordered = [...groups.entries()].sort(
      (a, b) => (a[1][0]?.jgroup ?? 0) - (b[1][0]?.jgroup ?? 0),
    )

    const energies = levels.map((l) => l.energy)
    const min = Math.min(...energies, 0)
    const max = Math.max(...energies, 1)
    // Round ticks (0, 5, 10 MeV), with the frame on the outermost ones; pad
    // first so the topmost level isn't drawn on the frame.
    const span = max - min || 1
    const axis = linearTicks(min - span * 0.03, max + span * 0.03, 6)
    const [lo, hi] = axis.domain

    const y = (energy: number) =>
      PAD.top + PLOT_H - ((energy - lo) / (hi - lo)) * PLOT_H

    const tickValues = axis.ticks

    return { columns: ordered, scale: y, ticks: tickValues }
  }, [levels])

  const columnWidth = columns.length > 0 ? PLOT_W / columns.length : PLOT_W

  const download = () => {
    const svg = svgRef.current
    if (!svg) return

    // The diagram paints itself with CSS custom properties so it follows the
    // page theme, but those resolve to nothing once the file is opened outside
    // the page. Bake the current computed values into the copy being saved.
    const clone = svg.cloneNode(true) as SVGSVGElement
    const styles = getComputedStyle(document.documentElement)
    const resolve = (value: string) =>
      value.replace(/var\((--[\w-]+)\)/g, (_, name) =>
        styles.getPropertyValue(name).trim() || "#000000",
      )

    for (const node of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
      for (const attribute of ["fill", "stroke"]) {
        const value = node.getAttribute(attribute)
        if (value?.includes("var(")) {
          node.setAttribute(attribute, resolve(value))
        }
      }
    }

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

  if (levels.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle role="heading" aria-level={3} className="text-base">{t.levelDiagram}</CardTitle>
          <CardDescription>{t.diagramText}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={download}>
          <ImageDown className="mr-2 h-4 w-4" />
          SVG
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            width="100%"
            className="min-w-[42rem]"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={t.diagramLabel(levels.length)}
          >
            <rect width={WIDTH} height={HEIGHT} fill="var(--viz-surface)" />

            {/* energy axis */}
            {ticks.map((value, i) => {
              const y = scale(value)
              return (
                <g key={i}>
                  <line
                    x1={PAD.left}
                    x2={WIDTH - PAD.right}
                    y1={y}
                    y2={y}
                    stroke="var(--viz-grid)"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 10}
                    y={y + 4}
                    textAnchor="end"
                    fontSize={11}
                    fill="var(--viz-text-muted)"
                  >
                    {tickLabel(value, false, lang)}
                  </text>
                </g>
              )
            })}

            <text
              transform={`translate(16 ${PAD.top + PLOT_H / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize={12}
              fill="var(--viz-text)"
            >
              {t.excitationAxis}
            </text>

            {columns.map(([jpi, group], columnIndex) => {
              const x0 = PAD.left + columnIndex * columnWidth
              const lineStart = x0 + columnWidth * 0.18
              const lineEnd = x0 + columnWidth * 0.82

              return (
                <g key={jpi}>
                  <text
                    x={(lineStart + lineEnd) / 2}
                    y={HEIGHT - 14}
                    textAnchor="middle"
                    fontSize={12}
                    fill="var(--viz-text)"
                  >
                    {jpi.replace(/[+-]$/, "")}
                    <tspan baselineShift="super" fontSize={9}>
                      {jpi.endsWith("-") ? "\u2212" : jpi.endsWith("+") ? "+" : ""}
                    </tspan>
                  </text>

                  {group.map((level) => {
                    const y = scale(level.energy)
                    const free = !level.energy_fixed
                    return (
                      <g key={`${level.jgroup}-${level.level}`}>
                        <line
                          x1={lineStart}
                          x2={lineEnd}
                          y1={y}
                          y2={y}
                          stroke={
                            free ? "var(--viz-series-1)" : "var(--viz-text-muted)"
                          }
                          strokeWidth={free ? 2.5 : 1.5}
                          strokeDasharray={free ? undefined : "5 3"}
                          strokeLinecap="round"
                        />
                        <text
                          x={lineEnd + 5}
                          y={y + 3.5}
                          fontSize={10}
                          fill="var(--viz-text-muted)"
                        >
                          {formatEnergy(level.energy)}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )
            })}

            {/* frame */}
            <rect
              x={PAD.left}
              y={PAD.top}
              width={PLOT_W}
              height={PLOT_H}
              fill="none"
              stroke="var(--viz-axis)"
              strokeWidth={1}
            />
          </svg>
        </div>
      </CardContent>
    </Card>
  )
}
