"use client"

import { Sci } from "@/components/sci"
import { elideItalian } from "@/lib/localize.mjs"
import type { Lang } from "@/lib/locale"
import { ratesDict } from "@/lib/rates/i18n"
import { scenarioRequest, type RunRequest } from "@/lib/rates/run"
import type { Network, Scenario } from "@/lib/rates/schema"
import { Fold } from "./chart-kit"
import { density, duration, sig2, temperature } from "./format"
import { LogSlider } from "./log-slider"

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

/**
 * The scenario's composition with its metals (Z > 2) and the knobs' nuclei
 * scaled; ⁴He (or, without it, the most abundant nucleus) takes up the
 * difference so the mass fractions still add up.
 */
export function composition(network: Network, s: Scenario, c: Pick<Conditions, "metals" | "knobs">): Record<string, number> {
  const knobs = Object.entries(c.knobs).filter(([, v]) => v !== 1)
  if (c.metals === 1 && !knobs.length) return s.X
  const X: Record<string, number> = { ...s.X }
  let delta = 0
  for (const n of network.nuclei) {
    const f = (n.Z > 2 ? c.metals : 1) * (c.knobs[n.name] ?? 1)
    if (f !== 1 && X[n.name]) {
      delta += X[n.name] * (1 - f)
      X[n.name] *= f
    }
  }
  const sink = "he4" in X && X.he4 + delta >= 0 ? "he4" : Object.entries(X).sort((a, b) => b[1] - a[1])[0][0]
  X[sink] = Math.max(0, X[sink] + delta)
  return X
}

/** The worker request for a scenario under the reader's conditions and rate scaling. */
export function conditionsRequest(network: Network, s: Scenario, c: Conditions, scale: Record<string, number>): RunRequest {
  const base = scenarioRequest(network, s, c.screening)
  const fuel = s.until?.nucleus ?? network.ui.fuel
  return {
    ...base,
    history: { kind: "constant", T9: c.T9, rho: c.rho },
    X0: composition(network, s, c),
    tEnd_s: c.time_s,
    until: c.until && fuel ? { nucleus: fuel, fraction: s.until?.fraction ?? 0.01 } : null,
    scale: Object.fromEntries(Object.entries(scale).filter(([, v]) => v !== 1)),
  }
}

/** The scenario cards, the conditions line, the controls and the sources. */
export function ScenarioPanel({
  network,
  scenario,
  onScenario,
  cond,
  setCond,
  lang,
  tRange = [0.005, 2],
  metals = true,
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
  /** more controls, inside the fold */
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
  const fuelLabel = fuel === "p" ? (it ? "l'idrogeno" : "hydrogen") : fuel === "he4" ? (it ? "l'elio" : "helium") : (nuc?.label ?? "")
  const hasMetals = metals && network.nuclei.some((n) => n.Z > 2)

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.where}</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {network.scenarios.map((s, i) => {
            const on = s.id === scenario.id
            return (
              <label
                key={s.id}
                className={`relative flex cursor-pointer gap-3 rounded-md border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring ${
                  on ? "border-foreground/60 bg-accent/40" : "border-border hover:border-foreground/30"
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
                <span
                  className={`tabular mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.7rem] ${
                    on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"
                  }`}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug">
                    <Sci>{sName(s)}</Sci>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    <Sci>{`${temperature(s.T9, lang)} · ${density(s.rho, lang)}`}</Sci>
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <p className="mt-4 text-pretty text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{t.conditions}:</span>{" "}
        <Sci>{`${temperature(cond.T9, lang)} (T₉ = ${sig2(cond.T9, lang)}), ${density(cond.rho, lang)}, ${t.burnTime.toLowerCase()} ${duration(cond.time_s, lang)}`}</Sci>
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
      {outOfRange && (
        <p role="status" className="mt-2 rounded-md bg-secondary px-3 py-2 text-sm">
          <Sci>{t.validity(temperature(cond.T9, lang))}</Sci>
        </p>
      )}

      <Fold title={t.adjust} className="mt-4 bg-background">
        <div className="grid gap-x-8 gap-y-5 pt-2 md:grid-cols-2">
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
            <LogSlider
              label={t.metals}
              value={cond.metals}
              min={0.01}
              max={10}
              onChange={(v) => setCond({ ...cond, metals: Number(v.toPrecision(3)) })}
              valueText={`×${sig2(cond.metals, lang)} ${t.metalsHint}`}
            />
          )}
          {fuel && (
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={cond.until}
                onChange={(e) => setCond({ ...cond, until: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-[hsl(var(--link))]"
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
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--link))]"
            />
            <span>
              {t.screening}
              <span className="block text-xs text-muted-foreground">{t.screeningHint}</span>
            </span>
          </label>
        </div>
        {children}
      </Fold>

      <details className="group mt-3 text-sm">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-link underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
          {t.sourceOf}
        </summary>
        <div className="mt-2 space-y-2 text-pretty leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">{t.source}:</span>{" "}
            <Sci>{it ? scenario.source_it : scenario.source}</Sci>
          </p>
          {(it ? scenario.note_it : scenario.note) && (
            <p>
              <Sci>{(it ? scenario.note_it : scenario.note) ?? ""}</Sci>
            </p>
          )}
        </div>
      </details>
    </div>
  )
}
