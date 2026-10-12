"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react"
import { Tex, Unit, texPlain, unitPlain } from "@/components/tex"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import type { Scheme } from "@/lib/api"
import { decimal } from "@/lib/i18n-eval"
import { formatLevelEnergy, jpiPlain, levelKey } from "@/lib/level-layout"
import { formatQuantity, quantitySymbol, significant } from "@/lib/viz"
import { useLang } from "@/components/lang-context"
import { useEvalDict } from "@/components/eval-dict"

/**
 * Sliders for every free R-matrix parameter, driving a live recalculation.
 *
 * One collapsible panel per level, so a model with dozens of free parameters
 * can be explored a level at a time; the panel of the level selected in the
 * diagram opens and scrolls into view.
 *
 * Energies move on a linear slider (±20 % of the starting value). Widths and
 * ANCs span orders of magnitude and carry a sign (that of the reduced-width
 * amplitude), so they get a slider on log10|value| — six decades around the
 * starting value — with a separate sign toggle. Every parameter also has a
 * numeric field that takes and keeps an exact value, including zero.
 */

interface Control {
  freeIndex: number
  kind: "energy" | "channel"
  latex: string
  name: string
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
  /** A reset of its own; the plot view has one "Reset all" beside the χ² instead. */
  onReset?: () => void
  disabled?: boolean
  /** The level whose panel opens first (the plotted resonance), else the first level. */
  defaultOpen?: string | null
  /** Level selected elsewhere (diagram, table): its panel opens and scrolls into view. */
  selectedLevel?: string | null
  /** Opening a level's panel selects it. */
  onSelectLevel?: (key: string | null) => void
  /** χ² change per free parameter index since the shipped fit, when known. */
  deltaChi2?: Record<number, number>
}

/** ±20 % for energies (at least ±50 keV). */
function energyBounds(control: Control): [number, number] {
  const base = control.initial || control.value || 1
  const span = Math.max(Math.abs(base) * 0.2, 0.05)
  return [base - span, base + span]
}

/** Six decades of log10|value|: three below and three above the starting magnitude. */
function logBounds(control: Control, value: number): [number, number] {
  const ref = Math.abs(control.initial) || Math.abs(value) || 1
  const centre = Math.log10(ref)
  let lo = Math.floor(centre) - 3
  let hi = Math.ceil(centre) + 3
  // A value typed outside the range widens it rather than being clamped.
  if (value !== 0) {
    const at = Math.log10(Math.abs(value))
    lo = Math.min(lo, Math.floor(at))
    hi = Math.max(hi, Math.ceil(at))
  }
  return [lo, hi]
}

/**
 * The unit a channel value is shown and typed in: eV widths are rescaled once,
 * from the starting value, so the field does not jump between keV and MeV
 * while the slider moves.
 */
function displayScale(control: Control): { factor: number; unit: string } {
  if (control.unit !== "eV") return { factor: 1, unit: control.unit }
  const m = Math.abs(control.initial) || Math.abs(control.value)
  if (m >= 1e6) return { factor: 1e6, unit: "MeV" }
  if (m >= 1e3) return { factor: 1e3, unit: "keV" }
  return { factor: 1, unit: "eV" }
}

/** A unit, set properly: `fm^(-1/2)` → fm<sup>−1/2</sup>, `nm` (nuclear magnetons) → μ<sub>N</sub>. */
function UnitText({ unit }: { unit: string }) {
  if (unit === "nm") {
    return (
      <span className="whitespace-nowrap">
        μ<sub>N</sub>
      </span>
    )
  }
  return <Unit unit={unit} />
}

function unitText(unit: string): string {
  return unit === "nm" ? "μN" : unitPlain(unit)
}

/** Up to 10 significant digits, without float noise: the exact value as typed or stored. */
function exact(value: number): string {
  if (!Number.isFinite(value)) return ""
  if (value === 0) return "0"
  const text = Number(value.toPrecision(10)).toString()
  return text.replace("-", "−")
}

function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(/−/g, "-").replace(",", ".").replace(/\s/g, "")
  if (cleaned === "" || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

export function LevelControls({ scheme, onChange, onReset, disabled, selectedLevel, onSelectLevel, deltaChi2, defaultOpen }: Props) {
  const t = useEvalDict().workspace
  const l = useEvalDict().levels
  const lang = useLang()
  const num = (s: string) => decimal(s, lang)

  const groups = useMemo<LevelGroup[]>(() => {
    const list: LevelGroup[] = []
    for (const level of scheme.levels) {
      const controls: Control[] = []
      if (level.energy_free_index !== null) {
        controls.push({
          freeIndex: level.energy_free_index,
          kind: "energy",
          latex: "E_{x}",
          name: t.levelEnergy,
          value: level.energy,
          initial: level.initial_energy,
          unit: "MeV",
          detail: t.levelEnergy,
        })
      }
      for (const channel of level.channels) {
        if (channel.free_index === null || channel.fixed) continue
        const symbol = quantitySymbol(channel.quantity, channel.label)
        controls.push({
          freeIndex: channel.free_index,
          kind: "channel",
          latex: symbol,
          name: `${texPlain(symbol)}, ℓ=${channel.L}`,
          value: channel.width,
          initial: channel.initial_width,
          unit: channel.unit,
          detail: `ℓ = ${channel.L}, s = ${channel.S}`,
        })
      }
      if (controls.length > 0) {
        list.push({ key: levelKey(level), jpi: level.jpi, energy: level.energy, controls })
      }
    }
    return list.sort((a, b) => a.energy - b.energy)
  }, [scheme, t])

  // Open one level so the panel is never a wall of collapsed rows: the most
  // informative one (the resonance in the plotted range) when the plot says.
  const [open, setOpen] = useState<string[]>([])
  useEffect(() => {
    setOpen((current) => {
      if (current.length > 0 || groups.length === 0) return current
      const preferred = defaultOpen && groups.some((g) => g.key === defaultOpen) ? defaultOpen : groups[0].key
      return [preferred]
    })
  }, [groups, defaultOpen])

  // A level selected in the diagram: open its panel and bring it into view.
  const groupRefs = useRef(new Map<string, HTMLDivElement>())
  useEffect(() => {
    if (!selectedLevel) return
    if (!groups.some((g) => g.key === selectedLevel)) return
    setOpen((current) => (current.includes(selectedLevel) ? current : [...current, selectedLevel]))
    const id = requestAnimationFrame(() =>
      groupRefs.current.get(selectedLevel)?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    )
    return () => cancelAnimationFrame(id)
  }, [selectedLevel, groups])

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

  const setValue = (freeIndex: number, value: number, immediate = false) => {
    setDraft((current) => ({ ...current, [freeIndex]: value }))
    if (timer.current) clearTimeout(timer.current)
    if (immediate) onChange({ [freeIndex]: value })
    else timer.current = setTimeout(() => onChange({ [freeIndex]: value }), 200)
  }

  const toggle = (key: string) => {
    const opening = !open.includes(key)
    setOpen((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]))
    if (opening) onSelectLevel?.(key)
  }

  const total = groups.reduce((sum, group) => sum + group.controls.length, 0)

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">{t.noFreeParameters}</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
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
            onClick={() => setOpen(open.length === groups.length ? [] : groups.map((g) => g.key))}
          >
            {open.length === groups.length ? t.collapseAll : t.expandAll}
          </Button>
          {onReset && (
            <Button variant="outline" size="sm" onClick={onReset} disabled={disabled || !scheme.modified}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              {t.reset}
            </Button>
          )}
        </div>
      </div>

      <div className="divide-y rounded-md border">
        {groups.map((group) => {
          const expanded = open.includes(group.key)
          const isSelected = selectedLevel === group.key
          const touched = group.controls.some(
            (control) => Math.abs((draft[control.freeIndex] ?? control.value) - control.initial) > 1e-12,
          )
          const energyText = num(formatLevelEnergy(group.energy))

          return (
            <div
              key={group.key}
              ref={(el) => {
                if (el) groupRefs.current.set(group.key, el)
                else groupRefs.current.delete(group.key)
              }}
              className={`scroll-my-4 transition-colors ${isSelected ? "bg-[color-mix(in_srgb,var(--viz-series-1)_7%,transparent)] shadow-[inset_3px_0_0_var(--viz-series-1)]" : ""}`}
            >
              <button
                type="button"
                onClick={() => toggle(group.key)}
                aria-expanded={expanded}
                aria-label={t.levelGroupAria(jpiPlain(group.jpi), energyText)}
                className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-muted/50"
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="font-medium">
                  <Tex math={group.jpi.replace(/([+-])$/, "^{$1}")} />
                </span>
                <span className="tabular-nums text-muted-foreground">{energyText} MeV</span>
                <span className="ml-auto flex items-center gap-2">
                  {touched && (
                    <Badge variant="outline" className="text-[11px]">
                      {t.changed}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{t.nParameters(group.controls.length)}</span>
                </span>
              </button>

              {expanded && (
                <div className="grid gap-x-8 gap-y-5 border-t bg-muted/20 px-4 py-4 sm:grid-cols-2 lg:grid-cols-1">
                  {group.controls.map((control) => (
                    <ParameterControl
                      key={control.freeIndex}
                      control={control}
                      value={draft[control.freeIndex] ?? control.value}
                      groupLabel={t.levelGroupAria(jpiPlain(group.jpi), energyText)}
                      delta={deltaChi2?.[control.freeIndex]}
                      onSlide={(v) => setValue(control.freeIndex, v)}
                      onCommit={(v) => setValue(control.freeIndex, v, true)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <span className="sr-only" aria-live="polite">
        {selectedLevel && groups.some((g) => g.key === selectedLevel) ? l.levelInDiagram : ""}
      </span>
    </div>
  )
}

function ParameterControl({
  control,
  value,
  groupLabel,
  delta,
  onSlide,
  onCommit,
}: {
  control: Control
  value: number
  groupLabel: string
  delta?: number
  onSlide: (value: number) => void
  onCommit: (value: number) => void
}) {
  const t = useEvalDict().workspace
  const l = useEvalDict().levels
  const lang = useLang()
  const num = (s: string) => decimal(s, lang)

  const isEnergy = control.kind === "energy"
  const scale = isEnergy ? { factor: 1, unit: "MeV" } : displayScale(control)
  const changed = Math.abs(value - control.initial) > 1e-12 * Math.max(1, Math.abs(control.initial))
  const negative = value < 0 || (value === 0 && control.initial < 0)
  const [lo, hi] = isEnergy ? energyBounds(control) : logBounds(control, value)

  // The field shows the value in the display unit to four significant
  // figures; on focus it holds the exact value, and then what is typed.
  const shown = exact(value / scale.factor)
  const rounded = isEnergy ? formatLevelEnergy(value) : value === 0 ? "0" : significant(value / scale.factor, 4).replace("-", "−")
  const [text, setText] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const commitText = () => {
    if (text === null) return
    const parsed = parseNumber(text)
    if (parsed === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setText(null)
    const next = parsed * scale.factor
    if (next !== value) onCommit(next)
  }

  const sliderValue = isEnergy
    ? value
    : value === 0
      ? lo
      : Math.min(hi, Math.max(lo, Math.log10(Math.abs(value))))
  const fromSlider = (u: number) => (isEnergy ? u : (negative ? -1 : 1) * 10 ** u)

  const formatted = isEnergy
    ? { text: significant(value, 5), unit: "MeV" }
    : control.unit === "eV"
      ? formatQuantity(value, "eV")
      : { text: significant(value, 3), unit: control.unit }
  const was = isEnergy
    ? { text: significant(control.initial, 5), unit: "MeV" }
    : control.unit === "eV"
      ? formatQuantity(control.initial, "eV")
      : { text: significant(control.initial, 3), unit: control.unit }
  /** A slider end: 10^u in the parameter's own unit, read as a round number. */
  const endLabel = (u: number) => {
    if (control.unit === "eV" && u >= 0) {
      const prefix = u >= 6 ? "MeV" : u >= 3 ? "keV" : "eV"
      const n = 10 ** (u - (u >= 6 ? 6 : u >= 3 ? 3 : 0))
      return (
        <>
          {n} {prefix}
        </>
      )
    }
    if (u >= 0 && u <= 3) {
      return (
        <>
          {10 ** u} <UnitText unit={control.unit} />
        </>
      )
    }
    return (
      <>
        10<sup>{String(u).replace("-", "−")}</sup> <UnitText unit={control.unit} />
      </>
    )
  }
  const inputId = `param-${control.freeIndex}`

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <label htmlFor={inputId}>
            <Tex math={control.latex} />
          </label>
          <span className="truncate text-xs text-muted-foreground">{control.detail}</span>
          {changed && (
            <Badge variant="outline" className="self-center text-[11px] font-medium">
              {t.changed}
              {delta !== undefined && Number.isFinite(delta) && (
                <span className="ml-1 tabular-nums">
                  · {l.deltaChi2(`${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${num(significant(Math.abs(delta), 2))}`)}
                </span>
              )}
            </Badge>
          )}
        </span>
        <span className="ml-auto flex min-w-0 max-w-full items-center gap-1.5">
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            spellCheck={false}
            autoComplete="off"
            value={text ?? num(rounded)}
            title={invalid ? l.notANumber : num(shown)}
            onFocus={(e) => {
              setText(num(shown))
              e.currentTarget.select()
            }}
            onChange={(e) => {
              setText(e.target.value)
              setInvalid(false)
            }}
            onBlur={() => {
              commitText()
              setText(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitText()
              if (e.key === "Escape") {
                setText(null)
                setInvalid(false)
                e.currentTarget.blur()
              }
            }}
            aria-label={l.valueInput(`${groupLabel}: ${control.name}`, unitText(scale.unit))}
            aria-invalid={invalid || undefined}
            className={`h-8 w-[6.5rem] min-w-0 max-w-full rounded-md border bg-background px-2 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${invalid ? "border-destructive" : "border-input-strong"}`}
          />
          <span className="min-w-[2.5rem] text-xs text-muted-foreground">
            <UnitText unit={scale.unit} />
          </span>
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        {!isEnergy && (
          <button
            type="button"
            onClick={() => onCommit(value === 0 ? 0 : -value)}
            aria-label={l.flipSign(`${groupLabel}: ${control.name}`, negative)}
            aria-pressed={negative}
            title={l.flipSign(control.name, negative)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input-strong bg-background text-base font-medium tabular-nums hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {negative ? "−" : "+"}
          </button>
        )}
        <div className="min-w-0 flex-1 py-1">
          <Slider
            value={[sliderValue]}
            min={lo}
            max={hi}
            step={isEnergy ? (hi - lo) / 400 : 0.01}
            /* Never disabled while recalculating: that would drop a keyboard user's focus mid-adjustment; edits are debounced instead. */
            onValueChange={([next]) => onSlide(fromSlider(next))}
            thumbLabel={`${groupLabel}: ${control.name}${isEnergy ? "" : ` (${l.logSlider})`}`}
            valueText={t.sliderValue(num(formatted.text).replace("-", "−"), unitText(formatted.unit))}
          />
        </div>
      </div>

      <div className={`-mt-0.5 flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground ${isEnergy ? "" : "pl-[2.625rem]"}`}>
        {isEnergy ? (
          <>
            <span className="tabular-nums">{num(significant(lo, 4))}</span>
            <span className="tabular-nums">{num(significant(hi, 4))}</span>
          </>
        ) : (
          <>
            <span className="tabular-nums">
              {negative ? "−" : ""}
              {endLabel(lo)}
            </span>
            <span>{l.logSlider}</span>
            <span className="tabular-nums">
              {negative ? "−" : ""}
              {endLabel(hi)}
            </span>
          </>
        )}
      </div>

      {invalid && <p className="text-[11px] text-destructive">{l.notANumber}</p>}
      {changed && (
        <p className="text-[11px] text-muted-foreground">
          {t.wasValue(num(was.text).replace("-", "−"))} <UnitText unit={was.unit} />
        </p>
      )}
    </div>
  )
}
