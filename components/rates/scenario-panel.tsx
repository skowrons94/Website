"use client"

import { useId, useState } from "react"
import { Settings2 } from "lucide-react"

import { Sci } from "@/components/sci"
import { elideItalian } from "@/lib/localize.mjs"
import type { Lang } from "@/lib/locale"
import { composition, metalsMax, METALS_RANGE, metalFraction } from "@/lib/rates/composition"
import { ratesDict } from "@/lib/rates/i18n"
import { historyOf, scenarioRequest, type RunRequest } from "@/lib/rates/run"
import type { Network, Scenario } from "@/lib/rates/schema"
import { density, duration, NB, sig2, tShort, temperature } from "./format"
import { LogSlider } from "./log-slider"

export { composition }

/** What the reader can change about a scenario. */
export interface Conditions {
  T9: number
  rho: number
  time_s: number
  /** stop on the scenario's (or the fuel's) condition */
  until: boolean
  /** scale of the metals (Z > 2) */
  metals: number
  screening: boolean
  /** scale of single initial abundances (the ¹³C of a pocket) */
  knobs: Record<string, number>
}

export const fromScenario = (s: Scenario): Conditions => ({
  T9: s.T9,
  rho: s.rho,
  time_s: s.time_s,
  until: Boolean(s.until),
  metals: 1,
  screening: true,
  knobs: {},
})

export const sameConditions = (a: Conditions, b: Conditions) =>
  a.T9 === b.T9 &&
  a.rho === b.rho &&
  a.time_s === b.time_s &&
  a.until === b.until &&
  a.metals === b.metals &&
  a.screening === b.screening &&
  Object.entries(a.knobs).every(([k, v]) => v === (b.knobs[k] ?? 1)) &&
  Object.entries(b.knobs).every(([k, v]) => v === (a.knobs[k] ?? 1))

/** The worker request for a scenario under the reader's conditions and rate scaling. */
export function conditionsRequest(
  network: Network,
  s: Scenario,
  c: Conditions,
  scale: Record<string, number>,
  alternatives: string[] = [],
): RunRequest {
  const base = scenarioRequest(network, s, c.screening)
  const fuel = s.until?.nucleus ?? network.ui.fuel
  return {
    ...base,
    history: historyOf(s, c.T9, c.rho),
    X0: composition(network, s, c),
    tEnd_s: c.time_s,
    until: c.until && fuel ? { nucleus: fuel, fraction: s.until?.fraction ?? 0.01 } : null,
    scale: Object.fromEntries(Object.entries(scale).filter(([, v]) => v !== 1)),
    ...(alternatives.length ? { alternatives } : {}),
  }
}

export const shortName = (s: Scenario, lang: Lang) => (lang === "it" ? (s.short_it ?? s.name_it) : (s.short ?? s.name))

/**
 * The control bar at the top of an explorer: the networks (when given), the
 * sites as one row of chips, the conditions in one line with a gear that
 * opens their sliders, and the sources of the numbers.
 */
export function ScenarioPanel({
  network,
  scenario,
  onScenario,
  cond,
  setCond,
  lang,
  tRange = [0.005, 2],
  metals = true,
  tabs,
  children,
}: {
  network: Network
  scenario: Scenario
  onScenario: (s: Scenario) => void
  cond: Conditions
  setCond: (c: Conditions) => void
  lang: Lang
  tRange?: [number, number]
  /** offer the metallicity slider */
  metals?: boolean
  /** the network tabs, above the sites */
  tabs?: React.ReactNode
  /** more controls, inside the conditions panel */
  children?: React.ReactNode
}) {
  const t = ratesDict(lang)
  const it = lang === "it"
  const L = (s: string) => (it ? elideItalian(s) : s)
  const sName = (s: Scenario) => (it ? s.name_it : s.name)
  const custom = !sameConditions(cond, fromScenario(scenario))
  const outOfRange = cond.T9 < 0.01 || cond.T9 > 10
  const fuel = scenario.until?.nucleus ?? network.ui.fuel
  const nuc = network.nuclei.find((n) => n.name === fuel)
  const fuelLabel =
    fuel === "p" ? (it ? "l'idrogeno" : "hydrogen") : fuel === "he4" ? (it ? "l'elio" : "helium") : (nuc?.label ?? "")
  const hasMetals = metals && metalFraction(network, scenario) > 1e-4
  const mMax = hasMetals ? metalsMax(network, scenario) : 1
  const [open, setOpen] = useState(false)
  const [srcOpen, setSrcOpen] = useState(false)
  const panelId = useId()
  const srcId = useId()

  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        {tabs}
        {tabs && <span className="hidden h-7 w-px bg-border lg:block" aria-hidden />}
        <fieldset className="min-w-0">
          <legend className="sr-only">{t.where}</legend>
          <div className="relative -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {network.scenarios.map((s) => {
              const on = s.id === scenario.id
              return (
                <label
                  key={s.id}
                  title={sName(s)}
                  className={`inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring ${
                    on ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"
                  }`}
                >
                  <input
                    type="radio"
                    name={`scenario-${network.id}`}
                    value={s.id}
                    checked={on}
                    onChange={() => onScenario(s)}
                    className="sr-only"
                  />
                  <span className="font-medium">
                    <Sci>{shortName(s, lang)}</Sci>
                  </span>
                  <span className={`tabular text-xs ${on ? "text-background/75" : "text-muted-foreground"}`}>
                    {temperature(s.T9, lang)}
                  </span>
                  <span className="sr-only">
                    <Sci>{sName(s)}</Sci>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <p className="min-w-0 text-pretty text-muted-foreground">
          <span className="font-medium text-foreground">
            <Sci>{sName(scenario)}</Sci>
          </span>
          <span className="tabular">
            {" · "}
            <Sci>{`${tShort(cond.T9, lang)} · ${density(cond.rho, lang)} · ${duration(cond.time_s, lang)}`}</Sci>
          </span>
          {custom && (
            <button
              type="button"
              onClick={() => setCond(fromScenario(scenario))}
              className="ml-2 text-link underline-offset-4 hover:underline"
            >
              {t.resetConditions}
            </button>
          )}
        </p>
        <span className="ml-auto flex flex-wrap gap-x-3 gap-y-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen(!open)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              open || custom
                ? "border-foreground/50 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings2 className="h-4 w-4" aria-hidden />
            <span className="sm:hidden">{t.conditions}</span>
            <span className="hidden sm:inline">{t.adjust}</span>
          </button>
          <button
            type="button"
            aria-expanded={srcOpen}
            aria-controls={srcId}
            onClick={() => setSrcOpen(!srcOpen)}
            className="min-h-9 text-sm text-link underline-offset-4 hover:underline"
          >
            <span className="sm:hidden">{t.sources}</span>
            <span className="hidden sm:inline">{t.sourceOf}</span>
          </button>
        </span>
      </div>
      {outOfRange && (
        <p role="status" className="mt-2 rounded-md bg-secondary px-3 py-2 text-sm">
          <Sci>{t.validity(temperature(cond.T9, lang))}</Sci>
        </p>
      )}

      {srcOpen && (
        <div
          id={srcId}
          className="mt-3 space-y-2 border-t border-border/70 pt-3 text-sm leading-relaxed text-muted-foreground"
        >
          <p className="text-pretty">
            <span className="font-medium text-foreground">{t.source}:</span>{" "}
            <Sci>{it ? scenario.source_it : scenario.source}</Sci>
          </p>
          {(it ? scenario.note_it : scenario.note) && (
            <p className="text-pretty">
              <Sci>{(it ? scenario.note_it : scenario.note) ?? ""}</Sci>
            </p>
          )}
        </div>
      )}

      {open && (
        <div id={panelId} className="mt-3 border-t border-border/70 pt-3">
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            <LogSlider
              label={t.temperature}
              value={cond.T9}
              min={tRange[0]}
              max={tRange[1]}
              onChange={(v) => setCond({ ...cond, T9: Number(v.toPrecision(3)) })}
              valueText={temperature(cond.T9, lang)}
            />
            <LogSlider
              label={t.density}
              value={cond.rho}
              min={0.01}
              max={1e6}
              onChange={(v) => setCond({ ...cond, rho: Number(v.toPrecision(3)) })}
              valueText={density(cond.rho, lang)}
            />
            <LogSlider
              label={t.burnTime}
              value={cond.time_s}
              min={1}
              max={3e17}
              onChange={(v) => setCond({ ...cond, time_s: Number(v.toPrecision(3)) })}
              valueText={duration(cond.time_s, lang)}
            />
            {hasMetals && (
              <div>
                <LogSlider
                  label={t.metals}
                  value={cond.metals}
                  min={METALS_RANGE[0]}
                  max={mMax}
                  onChange={(v) =>
                    setCond({
                      ...cond,
                      metals: Math.min(mMax, Number(v.toPrecision(2))),
                    })
                  }
                  valueText={t.metalsHint(sig2(cond.metals, lang))}
                />
                {mMax < METALS_RANGE[1] && (
                  <p className="mt-1 text-xs text-muted-foreground">{t.metalsCap(sig2(mMax, lang))}</p>
                )}
              </div>
            )}
            {fuel && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={cond.until}
                  onChange={(e) => setCond({ ...cond, until: e.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-[var(--viz-text)]"
                />
                <span>
                  <Sci>{L(t.stopOnFuel(fuelLabel, scenario.until?.fraction ?? 0.01))}</Sci>
                </span>
              </label>
            )}
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={cond.screening}
                onChange={(e) => setCond({ ...cond, screening: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-[var(--viz-text)]"
              />
              <span>
                {t.screening}
                <span className="block text-xs text-muted-foreground">{t.screeningHint}</span>
              </span>
            </label>
          </div>
          {children}
        </div>
      )}
    </div>
  )
}
