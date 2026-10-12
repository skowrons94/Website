"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react"
import { Tex, Unit, texPlain, unitPlain } from "@/components/tex"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import type { Scheme } from "@/lib/api"
import {
  formatEnergy,
  formatQuantity,
  quantitySymbol,
  significant,
} from "@/lib/viz"
import { useDict } from "@/components/lang-provider"

/**
 * Sliders for every free R-matrix parameter, driving a live recalculation.
 *
 * Laid out as one collapsible panel per resonance, so a model with dozens of
 * free parameters can be explored one level at a time instead of as a single
 * long list. Within a level the sliders flow into a responsive grid, which is
 * what makes the wide bottom placement pay off.
 *
 * Each control is bounded relative to the parameter's *initial* value rather
 * than by an absolute range: energies, widths and ANCs differ by many orders of
 * magnitude, so a fixed range would be unusable for one and meaningless for
 * another.
 */

interface Control {
  freeIndex: number
  kind: "energy" | "channel"
  latex: string
  ariaLabel: string
  value: number
  initial: number
  unit: string
  detail: string
}

interface LevelGroup {
  key: string
  jpi: string
  energy: number
  controls: Control[]
}

interface Props {
  scheme: Scheme
  onChange: (updates: Record<number, number>) => void
  onReset: () => void
  disabled?: boolean
}

/** +/-20% for energies; a decade either way for widths and ANCs. */
function bounds(control: Control): [number, number] {
  const base = control.initial || control.value || 1
  if (control.kind === "energy") {
    const span = Math.max(Math.abs(base) * 0.2, 0.05)
    return [base - span, base + span]
  }
  const magnitude = Math.abs(base) || 1
  return [-magnitude * 10, magnitude * 10]
}

function jpiLatex(jpi: string): string {
  return jpi.replace(/([+-])$/, "^{$1}")
}

export function LevelControls({ scheme, onChange, onReset, disabled }: Props) {
  const t = useDict().workspace
  const groups = useMemo<LevelGroup[]>(() => {
    const list: LevelGroup[] = []
    for (const level of scheme.levels) {
      const controls: Control[] = []

      if (level.energy_free_index !== null) {
        controls.push({
          freeIndex: level.energy_free_index,
          kind: "energy",
          latex: "E",
          ariaLabel: t.levelEnergy,
          value: level.energy,
          initial: level.initial_energy,
          unit: "MeV",
          detail: t.levelEnergy,
        })
      }

      for (const channel of level.channels) {
        if (channel.free_index === null) continue
        controls.push({
          freeIndex: channel.free_index,
          kind: "channel",
          latex: quantitySymbol(channel.quantity, channel.label),
          ariaLabel: `${texPlain(quantitySymbol(channel.quantity, channel.label))}, L=${channel.L}`,
          value: channel.width,
          initial: channel.initial_width,
          unit: channel.unit,
          detail: `L=${channel.L}, S=${channel.S}`,
        })
      }

      if (controls.length > 0) {
        list.push({
          key: `${level.jgroup}-${level.level}`,
          jpi: level.jpi,
          energy: level.energy,
          controls,
        })
      }
    }
    return list.sort((a, b) => a.energy - b.energy)
  }, [scheme, t])

  // Open the first resonance so the panel is never a wall of collapsed rows.
  const [open, setOpen] = useState<string[]>([])
  useEffect(() => {
    setOpen((current) =>
      current.length > 0 || groups.length === 0 ? current : [groups[0].key],
    )
  }, [groups])

  // Local values keep the slider responsive while the server catches up; they
  // resync whenever the authoritative scheme changes (including on reset).
  const [draft, setDraft] = useState<Record<number, number>>({})
  useEffect(() => {
    setDraft({})
  }, [scheme])

  // Recalculation is a round trip to AZURE2, so dragging is debounced; without
  // this a single drag would queue dozens of full R-matrix evaluations.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const handleSlide = (freeIndex: number, value: number) => {
    setDraft((current) => ({ ...current, [freeIndex]: value }))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange({ [freeIndex]: value }), 200)
  }

  const toggle = (key: string) =>
    setOpen((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    )

  const total = groups.reduce((sum, group) => sum + group.controls.length, 0)

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t.noFreeParameters}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">{t.interactiveLevels}</h2>
          <Badge variant="secondary" className="text-xs">
            {t.nFree(total)}
          </Badge>
          {scheme.modified && (
            <Badge variant="outline" className="text-xs">
              {t.modified}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setOpen(
                open.length === groups.length ? [] : groups.map((g) => g.key),
              )
            }
          >
            {open.length === groups.length ? t.collapseAll : t.expandAll}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={disabled || !scheme.modified}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            {t.reset}
          </Button>
        </div>
      </div>

      <div className="divide-y rounded-md border">
        {groups.map((group) => {
          const expanded = open.includes(group.key)
          const touched = group.controls.some(
            (control) =>
              Math.abs(
                (draft[control.freeIndex] ?? control.value) - control.initial,
              ) > 1e-12,
          )

          return (
            <div key={group.key}>
              <button
                type="button"
                onClick={() => toggle(group.key)}
                aria-expanded={expanded}
                aria-label={t.levelGroupAria(group.jpi, formatEnergy(group.energy))}
                className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-medium">
                  <Tex math={jpiLatex(group.jpi)} />
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatEnergy(group.energy)} MeV
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {touched && (
                    <Badge variant="outline" className="text-[10px]">
                      {t.changed}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {t.nParameters(group.controls.length)}
                  </span>
                </span>
              </button>

              {expanded && (
                <div className="grid gap-x-8 gap-y-5 border-t bg-muted/20 px-4 py-4 sm:grid-cols-2 lg:grid-cols-1">
                  {group.controls.map((control) => {
                    const value = draft[control.freeIndex] ?? control.value
                    const [min, max] = bounds(control)
                    const changed =
                      Math.abs(value - control.initial) > 1e-12
                    const shown = formatQuantity(value, control.unit)
                    const initial = formatQuantity(
                      control.initial,
                      control.unit,
                    )

                    return (
                      <div key={control.freeIndex} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="flex items-baseline gap-1.5 truncate">
                            <Tex math={control.latex} />
                            <span className="text-xs text-muted-foreground">
                              {control.detail}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {control.unit === "MeV" ? (
                              `${significant(value, 4)} MeV`
                            ) : (
                              <>
                                {shown.text.replace("-", "\u2212")} <Unit unit={shown.unit} />
                              </>
                            )}
                          </span>
                        </div>
                        <Slider
                          value={[value]}
                          min={min}
                          max={max}
                          step={(max - min) / 400}
                          /* Never disabled while recalculating: that would drop a keyboard user's focus mid-adjustment; edits are debounced instead. */
                          onValueChange={([next]) =>
                            handleSlide(control.freeIndex, next)
                          }
                          thumbLabel={`${t.levelGroupAria(group.jpi.replace(/-$/, "\u2212"), formatEnergy(group.energy))}: ${control.ariaLabel}`}
                          valueText={
                            control.unit === "MeV"
                              ? t.sliderValue(significant(value, 4), "MeV")
                              : t.sliderValue(shown.text.replace("-", "\u2212"), unitPlain(shown.unit))
                          }
                        />
                        {changed && (
                          <p className="text-[11px] text-muted-foreground">
                            {t.wasValue(initial.text.replace("-", "\u2212"))} <Unit unit={initial.unit} />
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
