"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { Sci } from "@/components/sci"
import { elideItalian } from "@/lib/localize.mjs"
import { localePath, type Lang } from "@/lib/locale"
import { loadNetwork, runBurn, type Baseline } from "@/lib/rates/client"
import { ratesDict } from "@/lib/rates/i18n"
import { networkProvider } from "@/lib/rates/rate-provider"
import { compiled, scenarioRequest, type RunRequest, type RunResult } from "@/lib/rates/run"
import type { Network, Reaction, Scenario } from "@/lib/rates/schema"
import { lifetimes } from "@/lib/rates/solver"
import { ChangeBars, type ChangeRow } from "./change-bars"
import { Figure, Fold, Formula, SERIES, Segmented } from "./chart-kit"
import { EvolutionChart, type EvolutionSeries } from "./evolution-chart"
import { density, duration, sci, sig2, temperature } from "./format"
import { LifetimeBars, type LifeRow } from "./lifetime-bars"
import { LogSlider } from "./log-slider"
import { RateChart, type Marker } from "./rate-chart"

export interface NetworkTab {
  id: string
  title: string
}

interface Conditions {
  T9: number
  rho: number
  time_s: number
  /** stop on the scenario's (or the fuel's) condition */
  until: boolean
  metals: number
  screening: boolean
}

const fromScenario = (s: Scenario): Conditions => ({
  T9: s.T9,
  rho: s.rho,
  time_s: s.time_s,
  until: Boolean(s.until),
  metals: 1,
  screening: true,
})

const same = (a: Conditions, b: Conditions) =>
  a.T9 === b.T9 &&
  a.rho === b.rho &&
  a.time_s === b.time_s &&
  a.until === b.until &&
  a.metals === b.metals &&
  a.screening === b.screening

/** The scenario's composition with its metals (Z > 2) scaled, helium taking up the difference. */
function composition(network: Network, s: Scenario, metals: number): Record<string, number> {
  if (metals === 1) return s.X
  const X: Record<string, number> = { ...s.X }
  let delta = 0
  for (const n of network.nuclei) {
    if (n.Z > 2 && X[n.name]) {
      delta += X[n.name] * (1 - metals)
      X[n.name] *= metals
    }
  }
  if ("he4" in X) X.he4 = Math.max(0, X.he4 + delta)
  return X
}

function request(network: Network, s: Scenario, c: Conditions, scale: Record<string, number>): RunRequest {
  const base = scenarioRequest(network, s, c.screening)
  const fuel = s.until?.nucleus ?? network.ui.fuel
  return {
    ...base,
    history: { kind: "constant", T9: c.T9, rho: c.rho },
    X0: composition(network, s, c.metals),
    tEnd_s: c.time_s,
    until: c.until && fuel ? { nucleus: fuel, fraction: s.until?.fraction ?? 0.01 } : null,
    scale: Object.fromEntries(Object.entries(scale).filter(([, v]) => v !== 1)),
  }
}

const isTwoBody = (r: Reaction) => r.reactants.length === 2 && r.densExp === 1

function unitOf(r: Reaction, t: ReturnType<typeof ratesDict>) {
  const n = r.reactants.length
  if (n === 1) return t.units1
  if (n === 2 && r.densExp === 1) return t.units2
  return t.units3
}

export function RatesExplorer({
  lang,
  tabs,
  initial,
  sProcess = false,
}: {
  lang: Lang
  tabs: NetworkTab[]
  initial: string
  /** link the s-process explorer (when its network file exists) */
  sProcess?: boolean
}) {
  const t = ratesDict(lang)
  const it = lang === "it"
  const L = useCallback((s: string) => (it ? elideItalian(s) : s), [it])
  const [netId, setNetId] = useState(initial)
  const [data, setData] = useState<{
    network: Network
    baseline: Baseline | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scenarioId, setScenarioId] = useState<string | null>(null)
  const [cond, setCond] = useState<Conditions | null>(null)
  const [scale, setScale] = useState<Record<string, number>>({})
  const [mode, setMode] = useState<"absolute" | "relative">("absolute")
  const [refId, setRefId] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string[]>([])
  const [allRates, setAllRates] = useState(false)
  const [allSteps, setAllSteps] = useState(false)
  const [shown, setShown] = useState<string[]>([])
  const [base, setBase] = useState<RunResult | null>(null)
  const [mod, setMod] = useState<RunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [allChanges, setAllChanges] = useState(false)

  // the network in the address: /atlas/rates#cno
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1)
      if (tabs.some((x) => x.id === h)) setNetId(h)
    }
    fromHash()
    window.addEventListener("hashchange", fromHash)
    return () => window.removeEventListener("hashchange", fromHash)
  }, [tabs])

  useEffect(() => {
    let live = true
    setData(null)
    setError(null)
    loadNetwork(netId)
      .then((d) => {
        if (!live) return
        const n = d.network
        setData(d)
        const s = n.scenarios[0]
        setScenarioId(s.id)
        setCond(fromScenario(s))
        setScale({})
        setRefId(n.ui.reference)
        const plotted = (n.ui.key ?? []).filter((id) => {
          const r = n.reactions.find((x) => x.id === id)
          return r && isTwoBody(r)
        })
        setHighlighted(plotted.slice(0, 3))
        setShown((n.ui.show ?? []).slice(0, 3))
        setBase(null)
        setMod(null)
      })
      .catch((e) => live && setError(String(e)))
    return () => {
      live = false
    }
  }, [netId])

  const network = data?.network ?? null
  const scenario = network?.scenarios.find((s) => s.id === scenarioId) ?? null
  const provider = useMemo(() => (network ? networkProvider(network) : null), [network])
  const byId = useMemo(() => new Map(network?.reactions.map((r) => [r.id, r]) ?? []), [network])
  const changed = Object.values(scale).some((v) => v !== 1)

  // -- the burns, in the worker (debounced; a newer request supersedes) ------
  const seq = useRef(0)
  useEffect(() => {
    if (!network || !scenario || !cond) return
    const my = ++seq.current
    const baseReq = request(network, scenario, cond, {})
    const modReq = request(network, scenario, cond, scale)
    setBusy(true)
    setRunError(null)
    const timer = setTimeout(async () => {
      try {
        const b = await runBurn(network, baseReq, data?.baseline)
        const m = changed ? await runBurn(network, modReq, data?.baseline) : b
        if (my !== seq.current) return
        if (b) setBase(b)
        if (m) setMod(m)
        setBusy(false)
      } catch (e) {
        if (my !== seq.current) return
        setRunError(e instanceof Error ? e.message : String(e))
        setBusy(false)
      }
    }, 90)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, scenario, cond, scale])

  // -- waiting times at the chosen conditions -------------------------------------
  const taus = useMemo(() => {
    if (!network || !scenario || !cond) return null
    return lifetimes(
      compiled(network),
      {
        history: { kind: "constant", T9: cond.T9, rho: cond.rho },
        scale,
        screening: cond.screening,
      },
      composition(network, scenario, cond.metals),
    )
  }, [network, scenario, cond, scale])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!network || !scenario || !cond || !provider) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center text-muted-foreground" aria-busy="true">
        <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
      </div>
    )
  }

  const nucleus = (i: number) => network.nuclei[i]
  const nucLabel = (name: string) => network.nuclei.find((n) => n.name === name)?.label ?? name
  const sName = (s: Scenario) => (it ? s.name_it : s.name)
  const custom = !same(cond, fromScenario(scenario))
  const outOfRange = cond.T9 < 0.01 || cond.T9 > 10

  // -- rates plot ------------------------------------------------------------------
  const plotted = network.reactions.filter(isTwoBody)
  const keyIds = network.ui.key ?? []
  const ratesShown = allRates ? plotted : plotted.filter((r) => keyIds.includes(r.id) || highlighted.includes(r.id))
  const reference = (refId && byId.get(refId)) || null
  const temps = [...network.scenarios.map((s) => s.T9), cond.T9]
  const T9range: [number, number] = [Math.max(0.003, Math.min(...temps) / 2.5), Math.min(10, Math.max(...temps) * 4)]
  const markers: Marker[] = []
  network.scenarios.forEach((s, i) => {
    if (Math.abs(s.T9 / cond.T9 - 1) > 0.02) markers.push({ T9: s.T9, label: String(i + 1) })
  })
  markers.push({ T9: cond.T9, label: t.now, current: true })
  const toggleHighlight = (id: string) =>
    setHighlighted((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id].slice(-3)))

  // -- waiting times -----------------------------------------------------------------
  const cycle = network.ui.cycle ?? []
  const stepIds = allSteps
    ? network.reactions.map((r) => r.id)
    : [...cycle, ...keyIds.filter((id) => !cycle.includes(id))]
  const tauOf = (id: string) => taus?.[network.reactions.findIndex((r) => r.id === id)] ?? Infinity
  const bottleneck = cycle.length ? cycle.reduce((a, b) => (tauOf(b) > tauOf(a) ? b : a), cycle[0]) : null
  const lifeRows: LifeRow[] = stepIds
    .map((id) => byId.get(id)!)
    .filter(Boolean)
    .map((r) => ({
      id: r.id,
      label: r.label,
      target: nucleus(r.target).label,
      tau: tauOf(r.id),
      atlas: r.atlas,
      bottleneck: r.id === bottleneck,
      scaled: scale[r.id],
    }))

  // -- what changed -------------------------------------------------------------------
  const changes: ChangeRow[] = []
  if (base && mod && changed) {
    network.nuclei.forEach((n, i) => {
      const a = base.final[i]
      const b = mod.final[i]
      if (Math.max(a, b) < 1e-20) return
      const ratio = a > 0 ? b / a : b > 0 ? Infinity : 1
      if (Math.abs(Math.log10(ratio)) < 1e-4) return
      changes.push({ name: n.name, label: n.label, ratio })
    })
    changes.sort((a, b) => Math.abs(Math.log10(b.ratio)) - Math.abs(Math.log10(a.ratio)))
  }
  const evo: EvolutionSeries[] = []
  if (mod) {
    shown.forEach((name, slot) => {
      const i = network.nuclei.findIndex((n) => n.name === name)
      if (i < 0) return
      evo.push({
        name,
        label: network.nuclei[i].label,
        slot,
        t: mod.t,
        X: mod.X.map((x) => x[i]),
        ...(changed && base ? { baseT: base.t, baseX: base.X.map((x) => x[i]) } : {}),
      })
    })
  }
  const toggleShown = (name: string) =>
    setShown((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name].slice(-3)))

  const runTime = mod ? duration(mod.tFinal, lang) : ""
  const fuelLabel =
    (scenario.until?.nucleus ?? network.ui.fuel) === "p"
      ? it
        ? "l'idrogeno"
        : "hydrogen"
      : nucLabel(scenario.until?.nucleus ?? network.ui.fuel ?? "")

  const setFactor = (id: string, v: number) => setScale((s) => ({ ...s, [id]: Number(v.toPrecision(3)) }))
  const slider = (r: Reaction) => {
    const v = scale[r.id] ?? 1
    return (
      <li key={r.id} className="py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-serif text-[0.95rem] font-semibold">
            {r.atlas ? (
              <Link
                href={localePath(lang, `/atlas/${r.atlas}`)}
                className="text-link underline-offset-4 hover:underline"
              >
                <span>
                  <Sci>{r.label}</Sci>
                </span>
              </Link>
            ) : (
              <span>
                <Sci>{r.label}</Sci>
              </span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <span
              className={`tabular mr-1 text-sm ${v !== 1 ? "font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              ×{sig2(v, lang)}
            </span>
            {[0.5, 2].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFactor(r.id, Math.min(10, Math.max(0.1, v * f)))}
                className="min-h-8 rounded border border-border px-2 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${f === 0.5 ? t.half : t.double} ${r.label}`}
              >
                {f === 0.5 ? t.half : t.double}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFactor(r.id, 1)}
              disabled={v === 1}
              className="min-h-8 rounded px-2 text-xs text-link disabled:text-muted-foreground/50"
            >
              {t.reset}
            </button>
          </span>
        </div>
        <LogSlider
          label={<Sci>{`${r.label}, ${t.factor}`}</Sci>}
          hideLabel
          value={v}
          min={0.1}
          max={10}
          onChange={(x) => setFactor(r.id, x)}
          valueText={`×${sig2(v, lang)}`}
        />
      </li>
    )
  }

  const keyReactions = keyIds.map((id) => byId.get(id)!).filter(Boolean)
  const otherReactions = network.reactions.filter((r) => !keyIds.includes(r.id))

  // -- exports -------------------------------------------------------------------------
  const csv = () => {
    const rows = [
      ["reaction", "id", "atlas", "sets", "Q_MeV", "T9", "rate", "unit", "scale", "tau_s", "target"].join(","),
    ]
    network.reactions.forEach((r, i) => {
      rows.push(
        [
          `"${r.label}"`,
          r.id,
          r.atlas ?? "",
          r.rate.kind === "reaclib" ? r.rate.sets.map((s) => s.set + s.flag).join(" ") : "table",
          r.Q_MeV,
          cond.T9,
          provider.rate(r.id, cond.T9).toExponential(6),
          unitOf(r, ratesDict("en")),
          scale[r.id] ?? 1,
          taus ? taus[i].toExponential(6) : "",
          network.nuclei[r.target].name,
        ].join(","),
      )
    })
    return `data:text/csv;charset=utf-8,${encodeURIComponent(rows.join("\n"))}`
  }
  const runJson = () =>
    `data:application/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(
        {
          network: network.id,
          provenance: network.provenance,
          scenario: scenario.id,
          request: request(network, scenario, cond, scale),
          nuclei: network.nuclei.map((n) => n.name),
          unchanged: base,
          changed: mod,
        },
        null,
        1,
      ),
    )}`

  const metalNames = network.nuclei.filter((n) => n.Z > 2).length > 0

  return (
    <div className="space-y-14">
      {/* -- network and scenario ----------------------------------------------- */}
      <div className="space-y-6">
        <nav aria-label={t.networks} className="-mx-1 flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <a
              key={tab.id}
              href={`#${tab.id}`}
              aria-current={tab.id === netId ? "page" : undefined}
              onClick={() => setNetId(tab.id)}
              className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                tab.id === netId
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              }`}
            >
              <span>
                <Sci>{tab.title}</Sci>
              </span>
            </a>
          ))}
          {sProcess && (
            <Link
              href={localePath(lang, "/atlas/rates/s-process")}
              className="inline-flex min-h-10 items-center rounded-full border border-dashed border-border px-4 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              {t.sProcessTab} →
            </Link>
          )}
        </nav>

        <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.where}</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {network.scenarios.map((s, i) => {
                const on = s.id === scenarioId
                return (
                  <label
                    key={s.id}
                    className={`relative flex cursor-pointer gap-3 rounded-md border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring ${
                      on ? "border-foreground/60 bg-accent/40" : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="scenario"
                      value={s.id}
                      checked={on}
                      onChange={() => {
                        setScenarioId(s.id)
                        setCond(fromScenario(s))
                      }}
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
                min={0.005}
                max={2}
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
              {metalNames && (
                <LogSlider
                  label={t.metals}
                  value={cond.metals}
                  min={0.01}
                  max={10}
                  onChange={(v) => setCond({ ...cond, metals: Number(v.toPrecision(3)) })}
                  valueText={`×${sig2(cond.metals, lang)} ${t.metalsHint}`}
                />
              )}
              {network.ui.fuel && (
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={cond.until}
                    onChange={(e) => setCond({ ...cond, until: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-[hsl(var(--link))]"
                  />
                  <span>{L(t.stopOnFuel(fuelLabel))}</span>
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
      </div>

      {/* -- 1. rates against temperature ---------------------------------------- */}
      <Figure
        id="rates-vs-temperature"
        title={t.ratesTitle}
        lead={t.ratesLead}
        actions={
          <Segmented
            label={t.plotMode}
            value={mode}
            onChange={setMode}
            options={[
              { value: "absolute", label: t.absolute },
              { value: "relative", label: t.relative },
            ]}
          />
        }
      >
        {mode === "relative" && (
          <label className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t.relativeTo}</span>
            <select
              value={refId ?? ""}
              onChange={(e) => setRefId(e.target.value)}
              className="min-h-9 max-w-full rounded-md border border-border bg-card px-2 text-sm"
            >
              {plotted.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="rounded-lg border border-border p-2 sm:p-3" style={{ background: "var(--viz-surface)" }}>
          <RateChart
            reactions={ratesShown}
            highlighted={highlighted}
            provider={provider}
            scale={scale}
            mode={mode}
            reference={reference}
            T9range={T9range}
            markers={markers}
            lang={lang}
            label={t.ratesChartLabel(ratesShown.length)}
            axisLabel={t.tAxis}
            axisLabelY={t.rateAxis}
            ratioLabel={t.ratioAxis(reference?.label ?? "")}
          />
        </div>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">{t.pickHint}</p>
          <ul className="flex flex-wrap gap-1.5" aria-label={t.highlight}>
            {ratesShown.map((r) => {
              const slot = highlighted.indexOf(r.id)
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-pressed={slot >= 0}
                    onClick={() => toggleHighlight(r.id)}
                    className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      slot >= 0
                        ? "border-foreground/50 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span
                      className="inline-block h-0.5 w-4 rounded"
                      style={{
                        background: slot >= 0 ? SERIES[slot] : "var(--viz-axis)",
                      }}
                      aria-hidden
                    />
                    <span>
                      <Sci>{r.label}</Sci>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => setAllRates(!allRates)}
              className="min-h-8 text-link underline-offset-4 hover:underline"
            >
              {allRates ? t.showKey : t.showAll}
            </button>
            <span>
              {t.sites}:{" "}
              {network.scenarios.map((s, i) => (
                <span key={s.id} className="mr-3 whitespace-nowrap">
                  <span className="tabular font-medium text-foreground">{i + 1}</span> <Sci>{sName(s)}</Sci>
                </span>
              ))}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{t.decaysNote}</p>
        </div>
      </Figure>

      {/* -- 2. how long a nucleus waits ------------------------------------------- */}
      <Figure
        id="waiting-times"
        title={t.lifeTitle}
        lead={t.lifeLead}
        actions={
          <button
            type="button"
            onClick={() => setAllSteps(!allSteps)}
            className="min-h-8 text-sm text-link underline-offset-4 hover:underline"
          >
            {allSteps ? t.showKey : t.showAll}
          </button>
        }
      >
        {bottleneck && Number.isFinite(tauOf(bottleneck)) && (
          <p className="mb-4 max-w-[46rem] text-pretty rounded-md bg-secondary/60 px-4 py-3 text-[0.975rem] leading-relaxed">
            <Sci>{L(t.bottleneckSentence(byId.get(bottleneck)!.label, duration(tauOf(bottleneck), lang)))}</Sci>
          </p>
        )}
        <LifetimeBars
          rows={lifeRows}
          lang={lang}
          label={t.lifeChartLabel}
          waits={(n) => L(t.waits(n))}
          bottleneckWord={t.bottleneck}
          never={t.never}
        />
      </Figure>

      {/* -- 3. what if -------------------------------------------------------------- */}
      <Figure id="what-if" title={t.whatIfTitle} lead={t.whatIfLead}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div>
            <ul className="divide-y divide-border/70 border-y border-border/70">{keyReactions.map(slider)}</ul>
            {otherReactions.length > 0 && (
              <Fold title={t.moreReactions} className="mt-4">
                <ul className="divide-y divide-border/70">{otherReactions.map(slider)}</ul>
              </Fold>
            )}
            <button
              type="button"
              onClick={() => setScale({})}
              disabled={!changed}
              className="mt-4 min-h-9 rounded-md border border-border px-3 text-sm transition-colors hover:border-foreground/40 disabled:opacity-50"
            >
              {t.resetAll}
            </button>
          </div>

          <div className="min-w-0 space-y-8">
            <p
              className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />{" "}
                  {t.calculating}
                </>
              ) : runError ? (
                <span className="text-destructive">
                  {t.failed} {runError}
                </span>
              ) : mod ? (
                <>
                  {mod.stopped === "until" ? L(t.stoppedUntil(fuelLabel, runTime)) : t.stoppedTime(runTime)}{" "}
                  {changed || custom ? t.calculated(mod.ms, mod.steps) : t.precomputed}
                </>
              ) : null}
            </p>
            <div>
              <h3 className="font-serif text-lg font-semibold tracking-tight">{t.changedTitle}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.changedLead(runTime)}</p>
              <div className="mt-3">
                {changes.length ? (
                  <>
                    <ChangeBars
                      rows={allChanges ? changes : changes.slice(0, 8)}
                      lang={lang}
                      label={t.changeChartLabel}
                      more={t.more}
                      less={t.less}
                    />
                    {changes.length > 8 && (
                      <button
                        type="button"
                        onClick={() => setAllChanges(!allChanges)}
                        className="mt-2 min-h-8 text-sm text-link underline-offset-4 hover:underline"
                      >
                        {allChanges ? t.showKey : t.showAll}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                    {t.noChange}
                  </p>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-serif text-lg font-semibold tracking-tight">{t.evolutionTitle}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.evolutionLead}</p>
              <div
                className="mt-3 rounded-lg border border-border p-2 sm:p-3"
                style={{ background: "var(--viz-surface)" }}
              >
                <EvolutionChart
                  series={evo}
                  lang={lang}
                  label={t.evolutionChartLabel}
                  xLabel={t.time}
                  yLabel={t.massFraction}
                />
              </div>
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t.pickNuclei}>
                {network.nuclei.map((n) => {
                  const slot = shown.indexOf(n.name)
                  return (
                    <li key={n.name}>
                      <button
                        type="button"
                        aria-pressed={slot >= 0}
                        onClick={() => toggleShown(n.name)}
                        className={`inline-flex min-h-8 min-w-10 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          slot >= 0
                            ? "border-foreground/50 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {slot >= 0 && (
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: SERIES[slot] }}
                            aria-hidden
                          />
                        )}
                        <span>
                          <Sci>{n.label}</Sci>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </div>
      </Figure>

      {/* -- for specialists ------------------------------------------------------------- */}
      <Fold title={t.forExperts}>
        <div className="space-y-6 text-sm">
          <p className="text-pretty leading-relaxed text-muted-foreground">
            {t.provenance(`${network.provenance.library} ${network.provenance.snapshot}`, network.provenance.tool)}.{" "}
            {t.dataNote}
          </p>
          <ul className="space-y-1.5 font-mono text-[0.8rem] leading-relaxed">
            <li>
              <Formula>{t.equationRate}</Formula>
            </li>
            <li>
              <Formula>{t.equationYdot}</Formula>
            </li>
            <li>
              <Formula>{t.equationLife}</Formula>
            </li>
          </ul>
          <div
            className="overflow-x-auto overscroll-x-contain rounded-md border border-border [scrollbar-width:thin]"
            tabIndex={0}
            role="region"
            aria-label={t.expertTable}
          >
            <table className="w-full min-w-[46rem] text-left text-xs">
              <thead className="bg-secondary/60 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t.colReaction}</th>
                  <th className="px-3 py-2 font-medium">{t.colSet}</th>
                  <th className="px-3 py-2 text-right font-medium">{t.colQ}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    <Formula>{`${t.colRate} = ${sig2(cond.T9, lang)} GK`}</Formula>
                  </th>
                  <th className="px-3 py-2 font-medium">{t.colRateUnit}</th>
                  <th className="px-3 py-2 text-right font-medium">{t.colLife}</th>
                  <th className="px-3 py-2 text-right font-medium">{t.colScale}</th>
                  <th className="px-3 py-2 font-medium">{t.colSource}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {network.reactions.map((r, i) => (
                  <tr key={r.id}>
                    <td className="px-3 py-1.5">
                      {r.atlas ? (
                        <Link
                          href={localePath(lang, `/atlas/${r.atlas}`)}
                          className="text-link underline-offset-4 hover:underline"
                        >
                          <span>
                            <Sci>{r.label}</Sci>
                          </span>
                        </Link>
                      ) : (
                        <span>
                          <Sci>{r.label}</Sci>
                        </span>
                      )}
                      <span className="block font-mono text-[0.7rem] text-muted-foreground">{r.id}</span>
                    </td>
                    <td className="px-3 py-1.5 font-mono">
                      {r.rate.kind === "reaclib" ? r.rate.sets.map((s) => `${s.set}${s.flag}`).join(" ") : "table"}
                    </td>
                    <td className="tabular px-3 py-1.5 text-right">{r.Q_MeV.toFixed(3)}</td>
                    <td className="tabular px-3 py-1.5 text-right">
                      <Sci>{sci(provider.rate(r.id, cond.T9), lang, 4)}</Sci>
                    </td>
                    <td className="px-3 py-1.5">
                      <Sci>{`${unitOf(r, t)}${r.densExp > 1 || r.ye ? " ×ρYe" : ""}`}</Sci>
                    </td>
                    <td className="tabular px-3 py-1.5 text-right">
                      <Sci>{taus ? sci(taus[i], lang, 3) : ""}</Sci>
                    </td>
                    <td className="tabular px-3 py-1.5 text-right">{scale[r.id] ?? 1}</td>
                    <td className="px-3 py-1.5">
                      {r.sources.map((s) => (
                        <span key={s.set} className="block">
                          {s.url ? (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-link underline-offset-4 hover:underline"
                            >
                              {s.author ? `${s.author} (${s.year})` : s.set}
                            </a>
                          ) : (
                            `${s.author ?? s.set}${s.year ? ` (${s.year})` : ""}`
                          )}
                          {s.ref && <span className="text-muted-foreground">, {s.ref}</span>}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {base && mod && (
            <div
              className="overflow-x-auto overscroll-x-contain rounded-md border border-border [scrollbar-width:thin]"
              tabIndex={0}
              role="region"
              aria-label={t.colNucleus}
            >
              <table className="w-full min-w-[34rem] text-left text-xs">
                <thead className="bg-secondary/60 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t.colNucleus}</th>
                    <th className="px-3 py-2 text-right font-medium">{t.colX0}</th>
                    <th className="px-3 py-2 text-right font-medium">{t.colXBase}</th>
                    <th className="px-3 py-2 text-right font-medium">{t.colXNew}</th>
                    <th className="px-3 py-2 text-right font-medium">{t.colRatio}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {network.nuclei.map((n, i) => (
                    <tr key={n.name}>
                      <td className="px-3 py-1.5 font-serif font-semibold">
                        <span>
                          <Sci>{n.label}</Sci>
                        </span>
                      </td>
                      <td className="tabular px-3 py-1.5 text-right">
                        <Sci>{sci(composition(network, scenario, cond.metals)[n.name] ?? 0, lang, 4)}</Sci>
                      </td>
                      <td className="tabular px-3 py-1.5 text-right">
                        <Sci>{sci(base.final[i], lang, 4)}</Sci>
                      </td>
                      <td className="tabular px-3 py-1.5 text-right">
                        <Sci>{sci(mod.final[i], lang, 4)}</Sci>
                      </td>
                      <td className="tabular px-3 py-1.5 text-right">
                        {base.final[i] > 0 ? sig2(mod.final[i] / base.final[i], lang) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="flex flex-wrap gap-x-6 gap-y-2">
            <a
              href={csv()}
              download={`${network.id}-rates-T9-${cond.T9}.csv`}
              className="text-link underline-offset-4 hover:underline"
            >
              {t.download}: {t.downloadCsv}
            </a>
            {mod && (
              <a
                href={runJson()}
                download={`${network.id}-${scenario.id}-burn.json`}
                className="text-link underline-offset-4 hover:underline"
              >
                {t.download}: {t.downloadRun}
              </a>
            )}
            <a
              href={`${process.env.BASE_PATH ?? ""}/rates/${network.id}.json`}
              download
              className="text-link underline-offset-4 hover:underline"
            >
              {t.download}: {t.downloadNetwork}
            </a>
          </p>
        </div>
      </Fold>
    </div>
  )
}
