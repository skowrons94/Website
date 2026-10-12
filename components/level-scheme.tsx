"use client"

import { Fragment, useMemo, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Lock,
  Unlock,
  X,
} from "lucide-react"
import { Tex, Unit } from "@/components/tex"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { LevelDiagram } from "@/components/level-diagram"
import {
  evaluationDownloadUrl,
  schemeExportUrl,
  downloadLink,
  type Evaluation,
  type Scheme,
  type SchemeLevel,
} from "@/lib/api"
import {
  formatQuantity,
  quantityName,
  quantitySymbol,
} from "@/lib/viz"
import { useLang } from "@/components/lang-context"
import { findBackground, formatLevelEnergy } from "@/lib/level-layout"
import { useEvalDict } from "@/components/eval-dict"
import { decimal } from "@/lib/i18n-eval"

/**
 * The level scheme, built to stay readable when the model is crowded.
 *
 * A 23Na-sized scheme has dozens of levels and hundreds of channels, so the
 * levels are a compact table whose channels expand on demand, and the J^pi /
 * energy filters drive both the table and the diagram at once — narrowing the
 * spin-parity is the fastest way to make an overlapping diagram legible.
 */

interface Props {
  scheme: Scheme
  /** Null while only the shipped snapshot is drawn (the session's metadata not in yet). */
  evaluation: Evaluation | null
  evaluationId: string
  /** Null until the session is open: the scheme export waits for it. */
  sessionId: string | null
  /** The selected level ("<jgroup>-<level>"), shared with the plot's sliders. */
  selectedLevel?: string | null
  onSelectLevel?: (key: string | null) => void
  /** Open the selected level's sliders (in the plot view). */
  onEditLevel?: (key: string) => void
}

/** The key a level is selected by: "<jgroup>-<level>" (lib/level-layout's levelKey). */
const levelKey = (level: Pick<SchemeLevel, "jgroup" | "level">) => `${level.jgroup}-${level.level}`

/** Sort J^pi labels by spin, then parity: 1/2- before 1/2+ before 3/2-. */
function jpiOrder(jpi: string): number {
  const match = jpi.match(/^(\d+)(?:\/(\d+))?([+-])$/)
  if (!match) return 0
  const spin = Number(match[1]) / (match[2] ? Number(match[2]) : 1)
  return spin * 2 + (match[3] === "+" ? 1 : 0)
}

function jpiLatex(jpi: string): string {
  return jpi.replace(/([+-])$/, "^{$1}")
}

export function LevelScheme({ scheme, evaluation, evaluationId, sessionId, selectedLevel: shared, onSelectLevel, onEditLevel }: Props) {
  const lang = useLang()
  const t = useEvalDict().workspace
  const l = useEvalDict().levels
  const live = useEvalDict().live
  // Controlled by the workspace when it passes a selection, else local.
  const [localSelection, setLocalSelection] = useState<string | null>(null)
  const selectedLevel = shared !== undefined ? shared : localSelection
  const selectLevel = (key: string | null) => {
    setLocalSelection(key)
    onSelectLevel?.(key)
  }
  // The excitation-energy range of the fitted data, from the API's pairs.
  const dataRange = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const p of scheme.pairs) {
      if (p.data_ex_min != null) min = Math.min(min, p.data_ex_min)
      if (p.data_ex_max != null) max = Math.max(max, p.data_ex_max)
    }
    return Number.isFinite(min) ? { min, max } : null
  }, [scheme.pairs])
  // Levels with an edited parameter (drawn with a halo).
  const editedLevels = useMemo(
    () =>
      scheme.levels
        .filter((l) => l.energy !== l.initial_energy || l.channels.some((c) => c.width !== c.initial_width))
        .map(levelKey),
    [scheme.levels],
  )
  const selected = scheme.levels.find((l) => levelKey(l) === selectedLevel)
  const selectedFree = selected
    ? (selected.energy_fixed ? 0 : 1) + selected.channels.filter((c) => !c.fixed).length
    : 0
  const [showFixed, setShowFixed] = useState(true)
  const [selectedJpi, setSelectedJpi] = useState<string[]>([])
  const [energyMin, setEnergyMin] = useState("")
  const [energyMax, setEnergyMax] = useState("")
  const [expanded, setExpanded] = useState<string[]>([])

  const allJpi = useMemo(() => {
    const seen = new Map<string, number>()
    for (const level of scheme.levels) {
      if (!seen.has(level.jpi)) seen.set(level.jpi, level.jgroup)
    }
    return [...seen.keys()].sort((a, b) => jpiOrder(a) - jpiOrder(b))
  }, [scheme.levels])

  const filtered = useMemo(() => {
    const min = energyMin === "" ? -Infinity : Number(energyMin)
    const max = energyMax === "" ? Infinity : Number(energyMax)
    return scheme.levels
      .filter(
        (level) =>
          (selectedJpi.length === 0 || selectedJpi.includes(level.jpi)) &&
          level.energy >= min &&
          level.energy <= max,
      )
      .sort((a, b) => a.energy - b.energy)
  }, [scheme.levels, selectedJpi, energyMin, energyMax])

  const freeCount = useMemo(
    () =>
      scheme.levels.reduce(
        (total, level) =>
          total +
          (level.energy_fixed ? 0 : 1) +
          level.channels.filter((c) => !c.fixed).length,
        0,
      ),
    [scheme.levels],
  )

  const filtering =
    selectedJpi.length > 0 || energyMin !== "" || energyMax !== ""

  const toggleJpi = (jpi: string) =>
    setSelectedJpi((current) =>
      current.includes(jpi)
        ? current.filter((j) => j !== jpi)
        : [...current, jpi],
    )

  const keyOf = (level: SchemeLevel) => `${level.jgroup}-${level.level}`

  const toggleExpanded = (key: string) =>
    setExpanded((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    )

  const clearFilters = () => {
    setSelectedJpi([])
    setEnergyMin("")
    setEnergyMax("")
  }

  const channelList = (channels: SchemeLevel["channels"]) =>
    channels.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                {t.noFreeChannels}
                              </p>
                            ) : (
                              <ul className="space-y-1.5">
                                {channels.map((channel, i) => (
                                  <li
                                    key={i}
                                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                                  >
                                    <span className="flex items-baseline gap-2">
                                      <Tex
                                        math={quantitySymbol(
                                          channel.quantity,
                                          channel.label,
                                        )}
                                      />
                                      <span className="text-xs text-muted-foreground">
                                        L={channel.L}, S={channel.S}
                                        {channel.radiation_type &&
                                          channel.radiation_type !== "P" &&
                                          ` · ${channel.radiation_type}${channel.L}`}
                                        {channel.quantity !== "width" && (
                                          <span className="ml-1.5">
                                            · {quantityName(channel.quantity, lang)}
                                          </span>
                                        )}
                                      </span>
                                    </span>
                                    <span className="flex items-baseline gap-2 tabular-nums">
                                      {formatQuantity(channel.width, channel.unit).text.replace("-", "\u2212")}{" "}
                                      <Unit unit={formatQuantity(channel.width, channel.unit).unit} />
                                      {channel.fixed ? (
                                        <Lock className="h-3 w-3 text-muted-foreground" />
                                      ) : (
                                        <Unlock className="h-3 w-3 text-muted-foreground" />
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )

  // keV precision, as in the diagram and the sliders.
  const energyText = (v: number) => decimal(formatLevelEnergy(v), lang)
  // Background poles fold away at the end of the table, as in the diagram.
  const background = useMemo(() => findBackground(scheme.levels), [scheme.levels])
  const shownLevels = filtered.filter((level) => !background?.keys.has(keyOf(level)))
  const bgLevels = filtered.filter((level) => background?.keys.has(keyOf(level)))

  const phoneRow = (level: SchemeLevel) => {
    const key = keyOf(level)
    const open = expanded.includes(key)
    const channels = showFixed ? level.channels : level.channels.filter((c) => !c.fixed)
    const free = (level.energy_fixed ? 0 : 1) + level.channels.filter((c) => !c.fixed).length
    return (
      <li key={key} className={selectedLevel === key ? "bg-muted/60" : undefined}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            toggleExpanded(key)
            selectLevel(key)
          }}
          className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-left text-sm"
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
          <span className="w-12 shrink-0">
            <Tex math={jpiLatex(level.jpi)} />
          </span>
          <span className="min-w-0 tabular-nums">
          {energyText(level.energy)} MeV
          {Math.abs(level.energy) < 5e-4 && <span className="ml-1.5 text-xs text-muted-foreground">{l.groundState}</span>}
        </span>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            {level.energy_fixed ? <Lock className="h-3 w-3" aria-hidden /> : <Unlock className="h-3 w-3" aria-hidden />}
            {free > 0 ? live.nFreeParams(free) : t.fixedWord}
          </span>
        </button>
        {open && <div className="px-4 pb-3 pl-11 text-sm">{channelList(channels)}</div>}
      </li>
    )
  }

  const tableRow = (level: SchemeLevel) => {
    const key = keyOf(level)
    const open = expanded.includes(key)
    const channels = showFixed
      ? level.channels
      : level.channels.filter((c) => !c.fixed)
    const free =
      (level.energy_fixed ? 0 : 1) +
      level.channels.filter((c) => !c.fixed).length

    return (
      <Fragment key={key}>
        <tr
          onClick={() => {
            toggleExpanded(key)
            selectLevel(key)
          }}
          className={`cursor-pointer border-b hover:bg-muted/40 ${selectedLevel === key ? "bg-muted/60" : ""}`}
        >
          <td className="px-1 py-1 text-muted-foreground">
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${level.jpi} ${formatLevelEnergy(level.energy)} MeV`}
              onClick={(event) => {
                event.stopPropagation()
                toggleExpanded(key)
              }}
              className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted"
            >
              {open ? (
                <ChevronDown className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden />
              )}
            </button>
          </td>
          <td className="px-2 py-2">
            <Tex math={jpiLatex(level.jpi)} />
          </td>
          <td className="px-2 py-2 text-right tabular-nums">
            {energyText(level.energy)}
            {Math.abs(level.energy) < 5e-4 && <span className="ml-1.5 text-xs text-muted-foreground">{l.groundState}</span>}
            {level.energy !== level.initial_energy && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                {t.was(energyText(level.initial_energy))}
              </span>
            )}
          </td>
          <td className="px-2 py-2">
            {level.energy_fixed ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" /> {t.fixedWord}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs">
                <Unlock className="h-3 w-3" /> {t.freeWord}
              </span>
            )}
          </td>
          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
            {level.channels.length}
          </td>
          <td className="px-2 py-2 text-right tabular-nums">
            {free > 0 ? (
              free
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </td>
        </tr>

        {open && (
          <tr className="border-b bg-muted/20">
            <td />
            <td colSpan={5} className="px-2 py-3">
              {channelList(channels)}
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <h2 className="text-2xl font-semibold tracking-tight">{t.levelScheme}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.schemeSummary(scheme.levels.length, scheme.pairs.length, freeCount)}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {sessionId ? (
            <Button asChild variant="outline" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal">
              <a {...downloadLink(schemeExportUrl(sessionId), `${evaluationId}_level_scheme.txt`)}>
                <FileText className="mr-2 h-4 w-4" />
                {t.exportScheme}
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal" disabled>
              <FileText className="mr-2 h-4 w-4" />
              {t.exportScheme}
            </Button>
          )}
          <Button asChild size="sm" className="h-auto min-h-9 max-w-full whitespace-normal [overflow-wrap:anywhere]">
            <a href={evaluationDownloadUrl(evaluationId, evaluation?.filename ?? `${evaluationId}.azr`)} download>
              <Download className="mr-2 h-4 w-4" />
              {t.downloadFile(evaluation?.filename ?? `${evaluationId}.azr`)}
            </a>
          </Button>
        </div>
      </div>

      {/* Props of the round-3 diagram, asserted so that this file compiles
          against either version of it. */}
      <LevelDiagram
        {...({
          levels: filtered,
          pairs: scheme.pairs,
          selectedLevel,
          onSelectLevel: selectLevel,
          dataRange,
          editedLevels,
        } as unknown as React.ComponentProps<typeof LevelDiagram>)}
      />

      {selected && onEditLevel && selectedFree > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-4 py-2.5 text-sm">
          <span>
            <Tex math={jpiLatex(selected.jpi)} /> {formatLevelEnergy(selected.energy)} MeV ·{" "}
            <span className="text-muted-foreground">{t.nParameters(selectedFree)}</span>
          </span>
          <Button size="sm" onClick={() => onEditLevel(levelKey(selected))}>
            {t.editLevel}
          </Button>
        </div>
      )}

      {/* Filters drive the diagram and the table together; folded, below the picture. */}
      <details open={filtering || undefined} className="min-w-0 rounded-lg border bg-card">
        <summary className="flex min-h-11 cursor-pointer select-none flex-wrap items-center gap-x-2 px-4 py-2 text-sm font-semibold">
          {l.filters}
          <span className="text-xs font-normal text-muted-foreground">· {l.filtersSummary(filtered.length, scheme.levels.length)}</span>
        </summary>
        <div className="space-y-3 border-t px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium text-muted-foreground">
              J<sup>π</sup>
            </span>
            {allJpi.map((jpi) => {
              const active = selectedJpi.includes(jpi)
              const count = scheme.levels.filter((l) => l.jpi === jpi).length
              return (
                <button
                  key={jpi}
                  onClick={() => toggleJpi(jpi)}
                  aria-pressed={active}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "hover:bg-muted"
                  }`}
                >
                  <Tex math={jpiLatex(jpi)} />
                  <span className="ml-1.5 opacity-60">{count}</span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="emin" className="text-xs">
                {t.energyMin}
              </Label>
              <Input
                id="emin"
                value={energyMin}
                onChange={(event) => setEnergyMin(event.target.value)}
                placeholder="—"
                className="h-8 w-28"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emax" className="text-xs">
                {t.energyMax}
              </Label>
              <Input
                id="emax"
                value={energyMax}
                onChange={(event) => setEnergyMax(event.target.value)}
                placeholder="—"
                className="h-8 w-28"
                inputMode="decimal"
              />
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Switch
                id="show-fixed"
                checked={showFixed}
                onCheckedChange={setShowFixed}
              />
              <Label htmlFor="show-fixed" className="text-sm">
                {t.showFixed}
              </Label>
            </div>
            {filtering && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="pb-1"
              >
                <X className="mr-1 h-3.5 w-3.5" />
                {t.clear}
              </Button>
            )}
          </div>
        </div>
      </details>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle role="heading" aria-level={3} className="text-base">{t.levels}</CardTitle>
          <CardDescription>{t.selectRow}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Phones: one card per level, channels on tap. */}
          <ul className="divide-y sm:hidden">
            {shownLevels.map(phoneRow)}
          </ul>
          {bgLevels.length > 0 && (
            <details className="border-t sm:hidden">
              <summary className="flex min-h-11 cursor-pointer select-none items-center px-4 text-xs text-muted-foreground">
                {l.backgroundRow(bgLevels.length, energyText(background!.energy))}
              </summary>
              <ul className="divide-y">{bgLevels.map(phoneRow)}</ul>
            </details>
          )}
          <div className="overflow-x-auto max-sm:hidden">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  <th className="w-8 px-2 py-2" />
                  <th className="px-2 py-2 font-medium normal-case">
                    J<sup>π</sup>
                  </th>
                  <th className="px-2 py-2 text-right font-medium">
                    {t.energyMeV}
                  </th>
                  <th className="px-2 py-2 font-medium">{t.energy}</th>
                  <th className="px-2 py-2 text-right font-medium">{t.channels}</th>
                  <th className="px-2 py-2 text-right font-medium">{t.free}</th>
                </tr>
              </thead>
              <tbody>
                {shownLevels.map(tableRow)}
                {bgLevels.length > 0 && (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <details className="text-sm">
                        <summary className="flex min-h-10 cursor-pointer select-none items-center px-3 text-xs text-muted-foreground">
                          {l.backgroundRow(bgLevels.length, energyText(background!.energy))}
                        </summary>
                        <table className="w-full text-sm">
                          <tbody>{bgLevels.map(tableRow)}</tbody>
                        </table>
                      </details>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t.noLevels}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle role="heading" aria-level={3} className="text-base">{t.pairs}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Phones: one block per pair, so nothing is cut off at the edge. */}
          <ul className="divide-y text-sm sm:hidden">
            {scheme.pairs.map((pair) => (
              <li key={pair.number} className="py-2.5 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">{pair.number}</span>
                  <Tex math={pair.label} />
                  <span className="text-xs text-muted-foreground">{pair.is_photon ? t.photon : t.particle}</span>
                  {pair.is_entrance && (
                    <Badge variant="secondary" className="text-xs">
                      {t.entrance}
                    </Badge>
                  )}
                </div>
                <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                  {!pair.is_photon && (
                    <>
                      <dt>{t.separation}</dt>
                      <dd className="text-right text-foreground">{energyText(pair.separation_energy)}</dd>
                    </>
                  )}
                  <dt>{t.excitation}</dt>
                  <dd className="text-right text-foreground">{energyText(pair.excitation)}</dd>
                  {pair.channel_radius > 0 && (
                    <>
                      <dt>{t.radius}</dt>
                      <dd className="text-right text-foreground">{decimal(pair.channel_radius.toFixed(2), lang)}</dd>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto max-sm:hidden">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  <th className="px-2 py-2 font-medium">{t.pair}</th>
                  <th className="px-2 py-2 font-medium">{t.channel}</th>
                  <th className="px-2 py-2 font-medium">{t.type}</th>
                  <th className="px-2 py-2 text-right font-medium">
                    {t.separation}
                  </th>
                  <th className="px-2 py-2 text-right font-medium">
                    {t.excitation}
                  </th>
                  <th className="px-2 py-2 text-right font-medium">
                    {t.radius}
                  </th>
                </tr>
              </thead>
              <tbody>
                {scheme.pairs.map((pair) => (
                  <tr key={pair.number} className="border-b last:border-0">
                    <td className="px-2 py-2 tabular-nums text-muted-foreground">
                      {pair.number}
                    </td>
                    <td className="px-2 py-2">
                      <Tex math={pair.label} />
                      {pair.is_entrance && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {t.entrance}
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {pair.is_photon ? t.photon : t.particle}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {pair.is_photon ? "—" : energyText(pair.separation_energy)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {energyText(pair.excitation)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {pair.channel_radius > 0
                        ? decimal(pair.channel_radius.toFixed(2), lang)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
