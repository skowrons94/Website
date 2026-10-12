"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { Sci } from "@/components/sci"
import { elideItalian } from "@/lib/localize.mjs"
import { localePath, type Lang } from "@/lib/locale"
import {
  loadNetwork,
  loadSensitivity,
  primeNetwork,
  runBurn,
  type Baseline,
  type SensitivityFile,
} from "@/lib/rates/client"
import { closes, dominantPath, integratedFlows, slowest } from "@/lib/rates/flow"
import { ratesDict } from "@/lib/rates/i18n"
import { networkProvider } from "@/lib/rates/rate-provider"
import { compiled, requestKey, type RunResult } from "@/lib/rates/run"
import type { Network, Reaction, Scenario } from "@/lib/rates/schema"
import { lifetimes } from "@/lib/rates/solver"
import { ChangeBars, type ChangeRow } from "./change-bars"
import { BusyLine, C, Download, Figure, Fold, Formula, RATES_TOKENS, SERIES, Segmented, Swatch } from "./chart-kit"
import { EvolutionChart, type EvolutionSeries } from "./evolution-chart"
import { FlowRing } from "./flow-ring"
import { dec, duration, sci, sig2, temperature, YEAR_S } from "./format"
import { GamowPanel, gamowEnergy } from "./gamow-panel"
import { LifetimeBars, type LifeRow } from "./lifetime-bars"
import { LogSlider } from "./log-slider"
import { RateChart, type Marker } from "./rate-chart"
import {
  ScenarioPanel,
  composition,
  conditionsRequest,
  fromScenario,
  sameConditions,
  shortName,
  type Conditions,
} from "./scenario-panel"
import { ChangesList, ReactionPicker, ResultStrip, SourceCell, StatusLine } from "./what-if"

export interface NetworkTab {
  id: string
  title: string
}


// shown on request only: its code loads then
const SensitivityMap = dynamic(() => import("./sensitivity-map").then((m) => m.SensitivityMap), { ssr: false })
const isTwoBody = (r: Reaction) => r.reactants.length === 2 && r.densExp === 1
const SUN_AGE_S = 4.57e9 * YEAR_S

function unitOf(r: Reaction, t: ReturnType<typeof ratesDict>) {
  if (r.ye) return t.unitsEC
  const n = r.reactants.length
  if (n === 1) return t.units1
  if (n === 2 && r.densExp === 1) return t.units2
  return t.units3
}

/** Three colour slots; a pick takes the first free one and keeps it. */
const toggleSlot = (slots: (string | null)[], id: string): (string | null)[] => {
  const i = slots.indexOf(id)
  if (i >= 0) return slots.map((s) => (s === id ? null : s))
  const free = slots.indexOf(null)
  if (free < 0) return slots
  const out = [...slots]
  out[free] = id
  return out
}
/** A [lo, hi] pair with one identity per value, so the rate chart's memo holds. */
const ranges = new Map<string, [number, number]>()
const rangeOf = (lo: number, hi: number): [number, number] => {
  const k = `${lo},${hi}`
  let r = ranges.get(k)
  if (!r) {
    if (ranges.size > 200) ranges.clear()
    r = [lo, hi]
    ranges.set(k, r)
  }
  return r
}
const fill3 = (ids: string[]): (string | null)[] => [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null]

/** #cno&site=nova&s=N14_p_to_O15_reaclib:2 — a setting as an address. */
function parseHash(h: string) {
  const [net, ...rest] = h.replace(/^#/, "").split("&")
  const params = new Map(rest.map((p) => p.split("=") as [string, string]))
  const scale: Record<string, number> = {}
  for (const pair of (params.get("s") ?? "").split(",").filter(Boolean)) {
    const [id, f] = pair.split(":")
    const v = Number(f)
    if (id && v > 0 && v !== 1) scale[decodeURIComponent(id)] = Math.min(10, Math.max(0.1, v))
  }
  return { net, site: params.get("site") ?? null, scale }
}

/** Everything the explorer shows first for a network, from its files alone (no worker). */
function initState(n: Network, baseline: Baseline | null, h: ReturnType<typeof parseHash> | null) {
  const s = n.scenarios.find((x) => x.id === h?.site) ?? n.scenarios[0]
  const scale = Object.fromEntries(
    Object.entries(h?.scale ?? {}).filter(([id]) => n.reactions.some((r) => r.id === id)),
  )
  const plotted = (n.ui.key ?? []).filter((id) => {
    const r = n.reactions.find((x) => x.id === id)
    return r && isTwoBody(r)
  })
  const cond = fromScenario(s)
  const stored = baseline?.runs[s.id]
  const fresh = stored && stored.key === requestKey(conditionsRequest(n, s, cond, {})) ? stored : null
  return {
    scenarioId: s.id,
    cond,
    scale,
    refId: n.ui.reference,
    slots: fill3(plotted.slice(0, 3)),
    shown: fill3((n.ui.show ?? []).slice(0, 3)),
    active: Object.keys(scale)[0] ?? n.ui.key?.[0] ?? null,
    base: fresh,
    mod: Object.keys(scale).length ? null : fresh,
  }
}

export function RatesExplorer({
  lang,
  tabs,
  initial,
  sProcess = false,
  preload,
}: {
  lang: Lang
  tabs: NetworkTab[]
  initial: string
  /** link the s-process explorer (when its network file exists) */
  sProcess?: boolean
  /** the first network and its baseline, sent with the page: the first view renders on the server */
  preload?: { network: Network; baseline: Baseline | null }
}) {
  if (preload) primeNetwork(preload.network.id, preload)
  const [init0] = useState(() =>
    preload && preload.network.id === initial ? initState(preload.network, preload.baseline, null) : null,
  )
  const t = ratesDict(lang)
  const it = lang === "it"
  const L = useCallback((s: string) => (it ? elideItalian(s) : s), [it])
  const [netId, setNetId] = useState(initial)
  const [data, setData] = useState<{
    network: Network
    baseline: Baseline | null
  } | null>(init0 ? preload! : null)
  const [error, setError] = useState<string | null>(null)
  const [scenarioId, setScenarioId] = useState<string | null>(init0?.scenarioId ?? null)
  const [cond, setCond] = useState<Conditions | null>(init0?.cond ?? null)
  // what follows a drag at once (the rate chart, its handle, the Gamow peak)
  // reads `cond`; everything that waits for a burn or recomputes the network
  // reads this deferred copy, which React renders when it has time
  const condD = useDeferredValue(cond)
  const [scale, setScale] = useState<Record<string, number>>(init0?.scale ?? {})
  const [mode, setMode] = useState<"absolute" | "relative">("absolute")
  const [refId, setRefId] = useState<string | null>(init0?.refId ?? null)
  const [slots, setSlots] = useState<(string | null)[]>(init0?.slots ?? [null, null, null])
  const [allRates, setAllRates] = useState(false)
  const [allSteps, setAllSteps] = useState(false)
  const [shown, setShown] = useState<(string | null)[]>(init0?.shown ?? [null, null, null])
  const [base, setBase] = useState<RunResult | null>(init0?.base ?? null)
  const [mod, setMod] = useState<RunResult | null>(init0?.mod ?? null)
  const [busy, setBusy] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [allChanges, setAllChanges] = useState(false)
  const [active, setActive] = useState<string | null>(init0?.active ?? null)
  const [sensOpen, setSensOpen] = useState(false)
  const [sens, setSens] = useState<SensitivityFile | null>(null)
  const pending = useRef<ReturnType<typeof parseHash> | null>(null)

  // the network in the address: /atlas/rates#cno (and a shared setting)
  useEffect(() => {
    const fromHash = () => {
      const h = parseHash(window.location.hash)
      if (tabs.some((x) => x.id === h.net)) {
        pending.current = h
        setNetId(h.net)
        setData((d) => (d && d.network.id === h.net ? { ...d } : d))
      }
    }
    fromHash()
    window.addEventListener("hashchange", fromHash)
    return () => window.removeEventListener("hashchange", fromHash)
  }, [tabs])

  useEffect(() => {
    let live = true
    setError(null)
    loadNetwork(netId)
      .then((d) => {
        if (!live) return
        const n = d.network
        const h = pending.current && pending.current.net === n.id ? pending.current : null
        pending.current = null
        const st = initState(n, d.baseline, h)
        setData(d)
        setScenarioId(st.scenarioId)
        setCond(st.cond)
        setScale(st.scale)
        setRefId(st.refId)
        setSlots(st.slots)
        setShown(st.shown)
        setActive(st.active)
        setBase(st.base)
        setMod(st.mod)
        setSens(null)
      })
      .catch((e) => live && setError(String(e)))
    return () => {
      live = false
    }
  }, [netId])

  const network = data?.network?.id === netId ? data.network : null
  const scenario = network?.scenarios.find((s) => s.id === scenarioId) ?? null
  const provider = useMemo(() => (network ? networkProvider(network) : null), [network])
  const byId = useMemo(() => new Map(network?.reactions.map((r) => [r.id, r]) ?? []), [network])
  const changed = Object.values(scale).some((v) => v !== 1)

  // keep the address in step (replace, so the back button leaves the page)
  useEffect(() => {
    if (!network || !scenario) return
    const s = Object.entries(scale)
      .filter(([, v]) => v !== 1)
      .map(([id, v]) => `${id}:${v}`)
      .join(",")
    const h = `#${network.id}${scenario.id !== network.scenarios[0].id ? `&site=${scenario.id}` : ""}${s ? `&s=${s}` : ""}`
    if (window.location.hash !== h) window.history.replaceState(null, "", h)
  }, [network, scenario, scale])

  // -- the burns, in the worker (debounced; a newer request supersedes) ------
  const seq = useRef(0)
  useEffect(() => {
    if (!network || !scenario || !condD) return
    const my = ++seq.current
    const baseReq = conditionsRequest(network, scenario, condD, {})
    const modReq = conditionsRequest(network, scenario, condD, scale)
    setBusy(true)
    setRunError(null)
    const timer = setTimeout(async () => {
      try {
        const b = await runBurn(network, baseReq, data?.baseline)
        const m = changed ? await runBurn(network, modReq, data?.baseline) : b
        if (my !== seq.current) return
        // a result redraws much of the page: as a transition, React renders it
        // in slices and a drag in progress keeps the main thread
        startTransition(() => {
          if (b) setBase(b)
          if (m) setMod(m)
          setBusy(false)
        })
      } catch (e) {
        if (my !== seq.current) return
        setRunError(e instanceof Error ? e.message : String(e))
        setBusy(false)
      }
    }, 40)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, scenario, condD, scale])

  // -- waiting times and the path of the flow at the chosen conditions ---------
  const life = useMemo(() => {
    if (!network || !scenario || !condD) return null
    const c = compiled(network)
    const opts = {
      history: { kind: "constant" as const, T9: condD.T9, rho: condD.rho },
      screening: condD.screening,
    }
    const X = composition(network, scenario, condD)
    const taus = lifetimes(c, { ...opts, scale }, X)
    const taus0 = changed ? lifetimes(c, opts, X) : taus
    const first = network.ui.cycle?.[0]
    const start = first ? network.reactions.find((r) => r.id === first)?.target : undefined
    const path = start === undefined ? [] : dominantPath(c, taus, start)
    return { taus, taus0, path, closed: closes(c, path), slow: slowest(path) }
  }, [network, scenario, condD, scale, changed])

  const flows = useMemo(() => {
    if (!network || !condD || !mod || !base) return null
    const c = compiled(network)
    const opts = {
      history: { kind: "constant" as const, T9: condD.T9, rho: condD.rho },
      screening: condD.screening,
    }
    if (mod.track || base.track) return null
    return {
      now: integratedFlows(c, { ...opts, scale }, mod.t, mod.X),
      base: changed ? integratedFlows(c, opts, base.t, base.X) : null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, mod, base])

  useEffect(() => {
    if (!sensOpen || !network) return
    let live = true
    loadSensitivity(network.id).then((f) => live && setSens(f))
    return () => {
      live = false
    }
  }, [sensOpen, network])

  // the results' rows, rebuilt only when a result or a pick changes (the
  // charts that show them are memoised, so a drag does not redraw them)
  const derived = useMemo(() => {
    if (!network || !life) return null
    const nucleus = (i: number) => network.nuclei[i]
    const keyIds = network.ui.key ?? []
    const pathIds = life.path.map((p) => network.reactions[p.reaction].id)
    const stepIds = allSteps
      ? network.reactions.map((r) => r.id)
      : [...new Set([...pathIds, ...(network.ui.cycle ?? []), ...keyIds])]
    const slowId = life.slow ? network.reactions[life.slow.reaction].id : null
    const lifeRows: LifeRow[] = stepIds
      .map((id) => network.reactions.findIndex((r) => r.id === id))
      .filter((i) => i >= 0)
      .map((i) => {
        const r = network.reactions[i]
        return {
          id: r.id,
          label: r.label,
          target: nucleus(r.target).label,
          tau: life.taus[i],
          ...(changed && life.taus0[i] !== life.taus[i] ? { tau0: life.taus0[i] } : {}),
          atlas: r.atlas,
          bottleneck: r.id === slowId,
          slot: slots.indexOf(r.id),
          scaled: scale[r.id],
        }
      })
    const pathText = life.path.map((p) => nucleus(p.nucleus).label).join(" → ")
    const changes: ChangeRow[] = []
    if (base && mod && changed) {
      network.nuclei.forEach((n, i) => {
        const a = base.final[i]
        const b = mod.final[i]
        if (Math.max(a, b) < 1e-20) return
        const ratio = a > 0 ? b / a : b > 0 ? Infinity : 1
        if (Math.abs(Math.log10(ratio)) < 4.3e-4) return
        changes.push({ name: n.name, label: n.label, ratio })
      })
      changes.sort((a, b) => Math.abs(Math.log10(b.ratio)) - Math.abs(Math.log10(a.ratio)))
    }
    const evo: EvolutionSeries[] = []
    if (mod) {
      shown.forEach((name, slot) => {
        if (!name) return
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
    return { lifeRows, pathText, changes, evo }
  }, [network, life, allSteps, slots, scale, changed, base, mod, shown])
  const lifeRefs = useMemo(
    () => [
      { t: mod?.tFinal ?? condD?.time_s ?? 0, label: t.burnRef },
      { t: SUN_AGE_S, label: t.sunRef },
    ],
    [mod, condD, t],
  )
  const waits = useCallback((n: string) => L(t.waits(n)), [L, t])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!network || !scenario || !cond || !provider || !life || !derived) {
    return (
      <div className="flex min-h-[32rem] items-center justify-center text-muted-foreground" aria-busy="true">
        <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
      </div>
    )
  }

  const { lifeRows, pathText, changes, evo } = derived
  const sName = (s: Scenario) => (it ? s.name_it : s.name)
  const custom = !sameConditions(cond, fromScenario(scenario))

  // -- rates plot ------------------------------------------------------------------
  const plotted = network.reactions.filter(isTwoBody)
  const keyIds = network.ui.key ?? []
  const picked = slots.filter((s): s is string => s !== null)
  const ratesShown = allRates
    ? plotted
    : plotted.filter((r) => keyIds.includes(r.id) || picked.includes(r.id) || (scale[r.id] ?? 1) !== 1)
  const reference = (refId && byId.get(refId)) || null
  const sT = network.scenarios.map((s) => s.T9)
  const T9range = rangeOf(Math.min(Math.max(0.003, Math.min(...sT) / 2.5), cond.T9), Math.max(Math.min(10, Math.max(...sT) * 4), cond.T9))
  const handleRange: [number, number] = [Math.max(0.003, Math.min(...sT) / 2.5), Math.min(10, Math.max(...sT) * 4)]
  const markers: Marker[] = network.scenarios.map((s) => ({
    T9: s.T9,
    label: shortName(s, lang),
  }))
  markers.push({ T9: cond.T9, label: t.now, current: true })
  const full = picked.length >= 3
  const setT = (T9: number) => setCond({ ...cond, T9: Math.min(handleRange[1], Math.max(handleRange[0], T9)) })
  const gamowReaction = picked.map((id) => byId.get(id)!).find((r) => r && gamowEnergy(network, r) !== null) ?? null

  const runTime = mod ? duration(mod.tFinal, lang) : ""
  const baseTime = base ? duration(base.tFinal, lang) : ""
  const fuelLabel =
    (scenario.until?.nucleus ?? network.ui.fuel) === "p"
      ? it
        ? "l'idrogeno"
        : "hydrogen"
      : (network.nuclei.find((n) => n.name === (scenario.until?.nucleus ?? network.ui.fuel))?.label ?? "")

  const setFactor = (id: string, v: number) => setScale((s) => ({ ...s, [id]: Number(v.toPrecision(3)) }))
  const keyReactions = keyIds.map((id) => byId.get(id)!).filter(Boolean)
  const otherReactions = network.reactions.filter((r) => !keyIds.includes(r.id))
  const activeR = (active && byId.get(active)) || keyReactions[0] || null
  const tryRate = (id: string) => {
    setActive(id)
    setFactor(id, 2)
    document.getElementById("what-if")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

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
          `"${unitOf(r, ratesDict("en"))}"`,
          scale[r.id] ?? 1,
          life.taus[i].toExponential(6),
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
          request: conditionsRequest(network, scenario, cond, scale),
          nuclei: network.nuclei.map((n) => n.name),
          unchanged: base,
          changed: mod,
        },
        null,
        1,
      ),
    )}`

  const tabBar = (
    <nav aria-label={t.networks} className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <a
              href={`#${tab.id}`}
              aria-current={tab.id === netId ? "page" : undefined}
              onClick={() => setNetId(tab.id)}
              className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-md border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                tab.id === netId
                  ? "border-foreground/70 bg-secondary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <Sci>{tab.title}</Sci>
            </a>
          </li>
        ))}
        {sProcess && (
          <li>
            <Link
              href={localePath(lang, "/atlas/rates/s-process")}
              className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md border border-dashed border-border px-3.5 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              {t.sProcessTab} →
            </Link>
          </li>
        )}
      </ul>
    </nav>
  )

  const sensTable = sens?.scenarios[scenario.id] ?? null
  const headline =
    life.slow && Number.isFinite(life.slow.tau) ? (
      <p className="max-w-[52rem] text-pretty leading-relaxed sm:text-[1.0625rem]">
        <span className="mr-2 rounded bg-foreground px-1.5 py-0.5 text-xs font-medium uppercase tracking-[0.1em] text-background">
          {t.headlineShort}
        </span>
        <Sci>
          {L(t.headline(sName(scenario), network.reactions[life.slow.reaction].label, duration(life.slow.tau, lang)))}
        </Sci>{" "}
        <a
          href="#what-if"
          onClick={() => setActive(network.reactions[life.slow!.reaction].id)}
          className="text-link underline-offset-4 hover:underline"
        >
          {t.tryIt} ↓
        </a>
      </p>
    ) : null

  return (
    <div className={`space-y-14 ${RATES_TOKENS}`}>
      {/* -- above the fold: the controls, the answer, the chart ------------------ */}
      <div className="space-y-5">
        <ScenarioPanel
          network={network}
          scenario={scenario}
          onScenario={(s) => {
            setScenarioId(s.id)
            setCond(fromScenario(s))
          }}
          cond={cond}
          setCond={setCond}
          lang={lang}
          tabs={tabBar}
        />

        {headline && <div className="hidden sm:block">{headline}</div>}

        <section id="rates-vs-temperature" aria-labelledby="rates-vs-temperature-title" className="scroll-mt-24">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                <h2
                  id="rates-vs-temperature-title"
                  className="flex items-baseline gap-2.5 text-balance font-serif text-xl font-semibold tracking-tight sm:text-2xl"
                >
                  <span
                    className="tabular inline-flex h-6 w-6 shrink-0 translate-y-[-0.1em] items-center justify-center self-center rounded-full border border-border font-sans text-xs font-medium"
                    title={t.step1}
                  >
                    1<span className="sr-only"> · {t.step1}</span>
                  </span>
                  {t.ratesTitle}
                </h2>
                <Segmented
                  label={t.plotMode}
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "absolute", label: t.absolute },
                    { value: "relative", label: t.relative },
                  ]}
                />
              </div>
              {mode === "relative" && (
                <label className="mb-2 flex flex-wrap items-center gap-2 text-sm">
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
                  slots={slots}
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
                  fasterLabel={t.faster}
                  onTemperature={setT}
                />
                <LogSlider
                  className="px-1 pt-1 sm:px-2"
                  label={t.temperature}
                  value={cond.T9}
                  min={handleRange[0]}
                  max={handleRange[1]}
                  onChange={(v) => setT(Number(v.toPrecision(3)))}
                  valueText={temperature(cond.T9, lang)}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t.scrubHint}</p>
              {headline && <div className="mt-4 sm:hidden">{headline}</div>}
            </div>

            <aside className="min-w-0 space-y-5 lg:pt-12">
              <div>
                <p className="text-xs text-muted-foreground">{full ? t.pickFull : t.pickHint}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5 lg:flex-col lg:items-stretch" aria-label={t.highlight}>
                  {ratesShown.map((r) => {
                    const slot = slots.indexOf(r.id)
                    const v = provider.rate(r.id, cond.T9) * (scale[r.id] ?? 1)
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          aria-pressed={slot >= 0}
                          aria-disabled={slot < 0 && full}
                          onClick={() => setSlots((s) => toggleSlot(s, r.id))}
                          className={`flex min-h-8 w-full items-center gap-2 rounded-md border px-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            slot >= 0
                              ? "border-foreground/40 text-foreground"
                              : full
                                ? "cursor-not-allowed border-border text-muted-foreground/70"
                                : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {slot >= 0 ? <Swatch slot={slot} /> : <Swatch slot={0} color={C.base} />}
                          <span className="min-w-0 flex-1">
                            <Sci>{r.label}</Sci>
                          </span>
                          <span className="tabular hidden text-muted-foreground lg:inline">
                            <Sci>{sci(v, lang, 2)}</Sci>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <button
                  type="button"
                  onClick={() => setAllRates(!allRates)}
                  className="mt-2 min-h-8 text-xs text-link underline-offset-4 hover:underline"
                >
                  {allRates ? t.showKey : t.showAll}
                </button>
              </div>
              <div className="border-t border-border/70 pt-4">
                <h3 className="font-serif text-base font-semibold">{t.gamowTitle}</h3>
                <div className="mt-1.5">
                  <GamowPanel
                    network={network}
                    reaction={gamowReaction}
                    slot={gamowReaction ? slots.indexOf(gamowReaction.id) : 0}
                    T9={cond.T9}
                    lang={lang}
                  />
                </div>
              </div>
            </aside>
          </div>
          <div className="mt-4 max-w-[46rem] space-y-1.5 text-sm text-muted-foreground">
            <p className="text-pretty">
              <Sci>{t.notation}</Sci>
            </p>
            <p className="text-pretty text-xs">
              <Sci>{t.decaysNote}</Sci>
            </p>
          </div>
        </section>
      </div>

      {/* -- 2. who is slowest ---------------------------------------------------------- */}
      <Figure
        id="waiting-times"
        step={{ n: 2, label: t.step2 }}
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
        <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div className="min-w-0">
            <LifetimeBars
              rows={lifeRows}
              lang={lang}
              label={t.lifeChartLabel}
              waits={waits}
              bottleneckWord={t.bottleneck}
              never={t.never}
              unscaledWord={t.unscaled}
              refs={lifeRefs}
            />
            <p className="mt-3 max-w-[46rem] text-pretty text-xs text-muted-foreground">
              <Sci>{`${pathText ? `${t.pathNote(pathText)} ` : ""}${t.lifeFine}`}</Sci>
            </p>
          </div>
          {life.path.length > 1 && (
            <div className="min-w-0">
              <h3 className="font-serif text-lg font-semibold tracking-tight">{t.ringTitle}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.ringLead}</p>
              <div
                className="relative mt-3 rounded-lg border border-border p-2"
                style={{ background: "var(--viz-surface)" }}
              >
                <BusyLine busy={busy} />
                <div className={`transition-opacity motion-reduce:transition-none ${busy ? "opacity-55" : ""}`}>
                  <FlowRing
                    network={network}
                    path={life.path}
                    closed={life.closed}
                    flows={flows?.now ?? null}
                    flowsBase={flows?.base ?? null}
                    slowest={life.slow?.reaction ?? null}
                    label={t.ringLabel(pathText)}
                    slowestWord={t.ringSlowest}
                  />
                </div>
              </div>
              {changed && <p className="mt-2 text-xs text-muted-foreground">{t.ringChangedKey}</p>}
            </div>
          )}
        </div>
      </Figure>

      {/* -- 3. what if -------------------------------------------------------------- */}
      <Figure id="what-if" step={{ n: 3, label: t.step3 }} title={t.whatIfTitle} lead={t.whatIfLead}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-10">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <ReactionPicker
              groups={[{ id: "key", reactions: keyReactions }]}
              others={otherReactions}
              active={activeR}
              setActive={setActive}
              scale={scale}
              setFactor={setFactor}
              lang={lang}
            />
            <ChangesList scale={scale} byId={byId} setFactor={setFactor} reset={() => setScale({})} lang={lang} />
          </div>

          <div id="what-if-results" className="relative min-w-0 scroll-mt-24 space-y-8">
            <StatusLine
              busy={busy}
              error={runError}
              lang={lang}
              done={
                mod ? (
                  <span>
                    {mod.stopped === "until" ? L(t.stoppedUntil(fuelLabel, runTime)) : t.stoppedTime(runTime)}{" "}
                    {changed || custom ? t.calculated(mod.ms, mod.steps) : t.precomputed}
                  </span>
                ) : null
              }
            />
            <div className={`space-y-8 transition-opacity motion-reduce:transition-none ${busy ? "opacity-55" : ""}`}>
              <div className="relative rounded-lg border border-border bg-card p-3 sm:p-4">
                <BusyLine busy={busy} />
                <h3 className="font-serif text-lg font-semibold tracking-tight">{t.changedTitle}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t.changedLead(runTime, changed ? baseTime : undefined)}
                </p>
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
                          {allChanges ? t.showKeyNuclei : t.showAllNuclei}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                      {t.noChange}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold tracking-tight">{t.evolutionTitle}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t.evolutionLead}
                  {changed && ` ${t.evolutionChanged}`}
                </p>
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
                    baseWord={t.baselineLabel}
                  />
                </div>
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t.pickNuclei}>
                  {network.nuclei.map((n) => {
                    const slot = shown.indexOf(n.name)
                    const fullN = shown.every((s) => s !== null)
                    return (
                      <li key={n.name}>
                        <button
                          type="button"
                          aria-pressed={slot >= 0}
                          aria-disabled={slot < 0 && fullN}
                          onClick={() => setShown((s) => toggleSlot(s, n.name))}
                          className={`inline-flex min-h-8 min-w-10 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            slot >= 0
                              ? "border-foreground/50 text-foreground"
                              : fullN
                                ? "cursor-not-allowed border-border text-muted-foreground/60"
                                : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {slot >= 0 && <Swatch slot={slot} />}
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
        </div>

        <div className="mt-10 border-t border-border/70 pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-serif text-lg font-semibold tracking-tight">{t.sensTitle}</h3>
            <button
              type="button"
              aria-expanded={sensOpen}
              onClick={() => setSensOpen(!sensOpen)}
              className="min-h-9 rounded-md border border-border px-3 text-sm transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {sensOpen ? t.sensHide : t.sensButton}
            </button>
          </div>
          <p className="mt-1 max-w-[46rem] text-pretty text-sm text-muted-foreground">{t.sensLead}</p>
          {sensOpen && (
            <div className="mt-4">
              {custom && <p className="mb-2 text-xs text-muted-foreground">{t.sensCustom}</p>}
              {sensTable ? (
                <SensitivityMap network={network} table={sensTable} lang={lang} onTry={tryRate} />
              ) : (
                <Loader2
                  className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none"
                  aria-hidden
                />
              )}
            </div>
          )}
        </div>
        <ResultStrip rows={changes} busy={busy} href="#what-if-results" lang={lang} />
      </Figure>

      {/* -- for specialists ------------------------------------------------------------- */}
      <Fold title={t.forExperts}>
        {() => (
          <div className="space-y-6 text-sm">
            <p className="text-pretty leading-relaxed text-muted-foreground">
              {t.provenance(`${network.provenance.library} ${network.provenance.snapshot}`, network.provenance.tool)}.{" "}
              {t.dataNote} {t.screenNote}
              {network.ui.notes && (
                <>
                  {" "}
                  <Sci>{network.ui.notes[lang]}</Sci>
                </>
              )}
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
              <table className="w-full min-w-[52rem] text-left text-xs">
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
                    <th className="px-3 py-2 font-medium">{t.colNote}</th>
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
                            <Sci>{r.label}</Sci>
                          </Link>
                        ) : (
                          <Sci>{r.label}</Sci>
                        )}
                        <span className="block font-mono text-[0.7rem] text-muted-foreground">{r.id}</span>
                      </td>
                      <td className="px-3 py-1.5 font-mono">
                        {r.rate.kind === "reaclib" ? r.rate.sets.map((s) => `${s.set}${s.flag}`).join(" ") : "table"}
                      </td>
                      <td className="tabular px-3 py-1.5 text-right">{dec(r.Q_MeV.toFixed(3), lang)}</td>
                      <td className="tabular px-3 py-1.5 text-right">
                        <Sci>{sci(provider.rate(r.id, cond.T9), lang, 4)}</Sci>
                      </td>
                      <td className="px-3 py-1.5">
                        <Formula>{unitOf(r, t)}</Formula>
                      </td>
                      <td className="tabular px-3 py-1.5 text-right">
                        <Sci>{sci(life.taus[i], lang, 3)}</Sci>
                      </td>
                      <td className="tabular px-3 py-1.5 text-right">{dec(String(scale[r.id] ?? 1), lang)}</td>
                      <td className="px-3 py-1.5">
                        <SourceCell sources={r.sources} />
                      </td>
                      <td className="max-w-[18rem] px-3 py-1.5 text-muted-foreground">
                        {network.ui.newer?.[r.id] && <Sci>{network.ui.newer[r.id][lang]}</Sci>}
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
                          <Sci>{n.label}</Sci>
                        </td>
                        <td className="tabular px-3 py-1.5 text-right">
                          <Sci>{sci(composition(network, scenario, cond)[n.name] ?? 0, lang, 4)}</Sci>
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
              <Download make={csv} filename={`${network.id}-rates-T9-${cond.T9}.csv`}>
                {t.download}: {t.downloadCsv}
              </Download>
              {mod && (
                <Download make={runJson} filename={`${network.id}-${scenario.id}-burn.json`}>
                  {t.download}: {t.downloadRun}
                </Download>
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
        )}
      </Fold>
    </div>
  )
}
