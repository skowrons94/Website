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
/** Height of the background-pole band at the top of the frame. */
const BAND = 34
/** Least vertical distance between two energy labels in a column. */
const LABEL_GAP = 11

interface Props {
  levels: SchemeLevel[]
}

export function LevelDiagram({ levels }: Props) {
  const t = useDict().workspace
  const lang = useLang()
  const svgRef = useRef<SVGSVGElement>(null)

  const { columns, scale, ticks, background } = useMemo(() => {
    const groups = new Map<string, SchemeLevel[]>()
    for (const level of levels) {
      const list = groups.get(level.jpi) ?? []
      list.push(level)
      groups.set(level.jpi, list)
    }

    const ordered = [...groups.entries()].sort(
      (a, b) => (a[1][0]?.jgroup ?? 0) - (b[1][0]?.jgroup ?? 0),
    )

    // Background poles: the usual R-matrix device of one fixed, distant level
    // per J^pi, all at the same energy (20 MeV in most of these models), far
    // above the resonances. Drawn to scale they squash every real level into
    // the bottom of the frame and pile identical labels on top of each other,
    // so they get one band above an axis break and one label.
    const top = Math.max(...levels.map((l) => l.energy))
    const atTop = levels.filter((l) => Math.abs(l.energy - top) < 1e-6)
    const rest = levels.filter((l) => Math.abs(l.energy - top) >= 1e-6)
    const restMax = rest.length ? Math.max(...rest.map((l) => l.energy)) : -Infinity
    const isBand =
      atTop.length >= 2 && atTop.every((l) => l.energy_fixed) && rest.length > 0 && top > restMax + 1
    const background = isBand ? { energy: top, count: atTop.length } : null
    const shown = isBand ? rest : levels

    const energies = shown.map((l) => l.energy)
    const min = Math.min(...energies, 0)
    const max = Math.max(...energies, min + 1)
    // Round ticks fitted to the levels drawn, with a margin so the topmost
    // level isn't on the frame.
    const span = max - min || 1
    const axis = linearTicks(min - span * 0.03, max + span * 0.05, 6)
    const [lo, hi] = axis.domain

    const bottom = PAD.top + PLOT_H
    const roof = PAD.top + (isBand ? BAND : 0)
    const y = (energy: number) =>
      isBand && Math.abs(energy - top) < 1e-6
        ? PAD.top + BAND / 2
        : bottom - ((energy - lo) / (hi - lo)) * (bottom - roof)

    return { columns: ordered, scale: y, ticks: axis.ticks, background }
  }, [levels])

  /**
   * Label positions in one column: at their levels where there is room,
   * pushed apart (and tied back with a short leader) where levels are closer
   * than a line of text.
   */
  const labelPositions = (group: SchemeLevel[]) => {
    const items = group
      .filter((l) => !(background && Math.abs(l.energy - background.energy) < 1e-6))
      .map((l) => ({ key: `${l.jgroup}-${l.level}`, y: scale(l.energy) }))
      .sort((a, b) => b.y - a.y)
    const placed = new Map<string, number>()
    let last = Infinity
    for (const item of items) {
      const y = Math.min(item.y, last - LABEL_GAP)
      placed.set(item.key, y)
      last = y
    }
    // If the stack ran off the top of the frame, shift it back down.
    const minY = Math.min(...placed.values())
    const floor = PAD.top + (background ? BAND + 8 : 6)
    if (minY < floor) {
      const shift = floor - minY
      for (const [k, v] of placed) placed.set(k, v + shift)
    }
    return placed
  }

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

            {background && (
              <g>
                <rect
                  x={PAD.left}
                  y={PAD.top}
                  width={PLOT_W}
                  height={BAND}
                  fill="var(--viz-grid)"
                  opacity={0.35}
                />
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={PAD.top + BAND}
                  y2={PAD.top + BAND}
                  stroke="var(--viz-axis)"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
                {/* axis break */}
                <path
                  d={`M ${PAD.left - 6} ${PAD.top + BAND + 3} l 12 -6 M ${PAD.left - 6} ${PAD.top + BAND + 8} l 12 -6`}
                  stroke="var(--viz-axis)"
                  strokeWidth={1}
                  fill="none"
                />
                <text
                  x={PAD.left - 10}
                  y={PAD.top + BAND / 2 + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="var(--viz-text-muted)"
                >
                  {tickLabel(background.energy, false, lang)}
                </text>
                <text
                  x={WIDTH - PAD.right}
                  y={PAD.top - 10}
                  textAnchor="end"
                  fontSize={10}
                  fill="var(--viz-text-muted)"
                >
                  {t.backgroundPoles(formatEnergy(background.energy), background.count)}
                </text>
              </g>
            )}

            {columns.map(([jpi, group], columnIndex) => {
              const x0 = PAD.left + columnIndex * columnWidth
              const lineStart = x0 + columnWidth * 0.18
              const lineEnd = x0 + columnWidth * 0.82
              const labels = labelPositions(group)

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
                    const key = `${level.jgroup}-${level.level}`
                    const labelY = labels.get(key)
                    return (
                      <g key={key}>
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
                        {labelY !== undefined && (
                          <>
                            {Math.abs(labelY - y) > 1 && (
                              <line
                                x1={lineEnd + 1}
                                x2={lineEnd + 5}
                                y1={y}
                                y2={labelY}
                                stroke="var(--viz-text-muted)"
                                strokeWidth={0.75}
                              />
                            )}
                            <text
                              x={lineEnd + 6}
                              y={labelY + 3.5}
                              fontSize={10}
                              fill="var(--viz-text-muted)"
                            >
                              {formatEnergy(level.energy)}
                            </text>
                          </>
                        )}
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
