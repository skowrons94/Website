"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { Sci } from "@/components/sci"
import { elideItalian } from "@/lib/localize.mjs"
import { localePath, type Lang } from "@/lib/locale"
import { decayMap, decayed, macs, neutronsPerSeed } from "@/lib/rates/analysis"
import { loadNetwork, loadSensitivity, runBurn, type Baseline, type SensitivityFile } from "@/lib/rates/client"
import { ratesDict } from "@/lib/rates/i18n"
import type { CuriosityCardData } from "@/lib/rates/curiosity-data"
import { CuriosityStrip } from "./curiosity-card"
import { parseRatesHash, ratesHash, showWhatIf } from "@/lib/rates/url"
import { networkProvider } from "@/lib/rates/rate-provider"
import type { RunResult } from "@/lib/rates/run"
import type { SProcessFirstView } from "@/lib/rates/first-view"
import type { Network, Reaction } from "@/lib/rates/schema"
import { ChangeBars, type ChangeRow } from "./change-bars"
import { BusyLine, Download, Figure, Fold, Formula, RATES_TOKENS, Segmented } from "./chart-kit"
import { DistributionChart, type DistPoint } from "./distribution-chart"
import { EvolutionChart } from "./evolution-chart"
import { FactorSlider } from "./factor-slider"
import { dec, density, duration, NB, sci, sig2, temperature, tShort } from "./format"
import {
  ScenarioPanel,
  composition,
  conditionsRequest,
  fromScenario,
  sameConditions,
  type Conditions,
} from "./scenario-panel"
import { ChangesList, ReactionPicker, ResultStrip, SourceCell, StatusLine, type PickGroup } from "./what-if"


// shown on request only: its code loads then
const SensitivityMap = dynamic(() => import("./sensitivity-map").then((m) => m.SensitivityMap), { ssr: false })
const NETWORK = "sprocess"
/** "about 15", "about 4.6": a number fit for "about" (the side card keeps 15.3). */
const about = (v: number, lang: Lang) => dec(String(v >= 10 ? Math.round(v) : Number(v.toPrecision(2))), lang)
const K_KEV = 86.17333 // keV per GK

/**
 * The s-process, iron to bismuth: pick a site, scale the neutron sources,
 * the poisons, the seed and a few branch points, and see the neutron
 * exposure and the distribution of the heavy isotopes change. The burn runs
 * in the rates Web Worker, on the network of public/rates/sprocess.json.
 * The page reads top-down: the site, what the burn made (the chart in the
 * first screen), then "what if" with one reaction at a time and its effect
 * in view, then the sensitivity map and the numbers.
 */
export function SProcessExplorer({
  lang,
  sOnly,
  firstView,
  curiosities,
}: {
  lang: Lang
  sOnly: string[]
  firstView?: SProcessFirstView | null
  /** the s-process curiosities (lib/rates/curiosity-data.ts), and how many there are in all */
  curiosities?: { items: CuriosityCardData[]; total: number }
}) {
  const t = ratesDict(lang)
  const sp = t.sp
  const it = lang === "it"
  const L = (s: string) => (it ? elideItalian(s) : s)
  const [data, setData] = useState<{
    network: Network
    baseline: Baseline | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scenarioId, setScenarioId] = useState<string | null>(null)
  const [cond, setCond] = useState<Conditions | null>(null)
  // the burns and the results follow a deferred copy: a drag stays smooth
  const condD = useDeferredValue(cond)
  const [scale, setScale] = useState<Record<string, number>>({})
  const [base, setBase] = useState<RunResult | null>(null)
  const [mod, setMod] = useState<RunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [allChanges, setAllChanges] = useState(false)
  const [heavyOnly, setHeavyOnly] = useState<"heavy" | "light">("heavy")
  const [active, setActive] = useState<string | null>(null)
  const [sensOpen, setSensOpen] = useState(false)
  const [sens, setSens] = useState<SensitivityFile | null>(null)

  // a setting from the address (#site=massive-he-core&s=…): on load, and
  // when the address changes on the page (back/forward, a curiosity's "Try it")
  const applyHash = (n: Network) => {
    const h = parseRatesHash(window.location.hash)
    const s = n.scenarios.find((x) => x.id === h.site) ?? n.scenarios[0]
    const sc = Object.fromEntries(Object.entries(h.scale).filter(([id]) => n.reactions.some((r) => r.id === id)))
    setScenarioId(s.id)
    setCond(fromScenario(s))
    setScale(sc)
    setActive(Object.keys(sc)[0] ?? n.ui.groups?.[0]?.reactions[0] ?? null)
    if (h.focus) showWhatIf()
  }
  const applyRef = useRef(applyHash)
  applyRef.current = applyHash

  useEffect(() => {
    let live = true
    loadNetwork(NETWORK)
      .then((d) => {
        if (!live) return
        setData(d)
        applyRef.current(d.network)
      })
      .catch((e) => live && setError(String(e)))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!data) return
    const on = () => applyRef.current(data.network)
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [data])

  const network = data?.network ?? null
  const scenario = network?.scenarios.find((s) => s.id === scenarioId) ?? null
  const provider = useMemo(() => (network ? networkProvider(network) : null), [network])
  const decays = useMemo(() => (network && provider ? decayMap(network, provider) : null), [network, provider])
  const changed = Object.values(scale).some((v) => v !== 1)

  // keep the address in step (replace, so the back button leaves the page)
  useEffect(() => {
    if (!network || !scenario) return
    const h = ratesHash({ site: scenario.id !== network.scenarios[0].id ? scenario.id : null, scale })
    if (window.location.hash !== h && (h || window.location.hash))
      window.history.replaceState(null, "", h || window.location.pathname + window.location.search)
  }, [network, scenario, scale])

  const seq = useRef(0)
  useEffect(() => {
    if (!network || !scenario || !condD) return
    const my = ++seq.current
    setBusy(true)
    setRunError(null)
    const timer = setTimeout(async () => {
      try {
        const b = await runBurn(network, conditionsRequest(network, scenario, condD, {}), data?.baseline)
        const m = changed
          ? await runBurn(network, conditionsRequest(network, scenario, condD, scale), data?.baseline)
          : b
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
    }, 60)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, scenario, condD, scale])

  useEffect(() => {
    if (!sensOpen) return
    let live = true
    loadSensitivity(NETWORK).then((f) => live && setSens(f))
    return () => {
      live = false
    }
  }, [sensOpen])

  // the results, rebuilt only when a burn result (or a choice of view) changes
  const results = useMemo(() => {
    if (!network || !scenario || !condD || !decays) return null
    const X0map = composition(network, scenario, condD)
    const X0 = network.nuclei.map((n) => X0map[n.name] ?? 0)
    const sOnlySet = new Set(sOnly)
    const notModelled = network.ui.not_modelled ?? {}
    const baseDec = base ? decayed(network, base.final, decays) : null
    const modDec = mod ? decayed(network, mod.final, decays) : null
    const X0dec = decayed(network, X0, decays)
    const points: DistPoint[] = []
    if (baseDec) {
      network.nuclei.forEach((n, i) => {
        if (n.Z < 26 || X0dec[i] <= 0 || decays.branches.has(i)) return
        points.push({
          name: n.name,
          label: n.label,
          A: n.A,
          Z: n.Z,
          base: baseDec[i] / X0dec[i],
          changed: modDec ? modDec[i] / X0dec[i] : null,
          sOnly: sOnlySet.has(n.code),
          notModelled: n.name in notModelled,
        })
      })
    }
    const changes: ChangeRow[] = []
    if (baseDec && modDec && changed) {
      network.nuclei.forEach((n, i) => {
        const a = baseDec[i]
        const b = modDec[i]
        if (decays.branches.has(i) || Math.max(a, b) < 1e-14 || n.Z === 0 || n.name in notModelled) return
        if ((heavyOnly === "heavy") !== n.Z >= 26) return
        const ratio = a > 0 ? b / a : Infinity
        if (Math.abs(Math.log10(ratio)) < 1e-3) return
        changes.push({ name: n.name, label: n.label, ratio })
      })
      changes.sort((a, b) => Math.abs(Math.log10(b.ratio)) - Math.abs(Math.log10(a.ratio)))
    }
    return { X0, sOnlySet, notModelled, baseDec, modDec, points, changes }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, scenario, decays, base, mod, changed, heavyOnly, sOnly])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!network || !scenario || !cond || !provider || !decays || !results || (!base && !runError)) {
    // until the first burn is in, the server's first view stands in for it
    if (firstView) return <FirstView view={firstView} lang={lang} />
    return (
      <div className="flex min-h-[32rem] items-center justify-center text-muted-foreground" aria-busy="true">
        <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
      </div>
    )
  }

  const byId = new Map(network.reactions.map((r) => [r.id, r]))
  const custom = !sameConditions(cond, fromScenario(scenario))
  const altered = changed || custom
  const { X0, sOnlySet, notModelled, baseDec, modDec, points, changes } = results

  const stat = (r: RunResult | null) =>
    r
      ? {
          tau: (r.exposure?.tau_cm2 ?? 0) * 1e-27,
          peak: r.exposure?.peak_cm3 ?? 0,
          nc: neutronsPerSeed(network, X0, r.final),
          time: r.tFinal,
        }
      : null
  const sb = stat(base)
  const sm = stat(mod)
  const NA = network.screening.NA
  const neutronSeries = (r: RunResult) => {
    const col = r.track ? r.track.indexOf("n") : network.nuclei.findIndex((n) => n.name === "n")
    return r.X.map((x) => x[col] * cond.rho * NA)
  }

  const setFactor = (id: string, v: number) => setScale((s) => ({ ...s, [id]: Number(v.toPrecision(3)) }))
  const groups = network.ui.groups ?? []
  const knobs = network.ui.knobs ?? []
  const nucLabel = (name: string) => network.nuclei.find((n) => n.name === name)?.label ?? name
  const runTime = mod ? duration(mod.tFinal, lang) : ""
  const baseTime = base ? duration(base.tFinal, lang) : ""
  const fuel = scenario.until?.nucleus ?? ""
  const fuelLabel = fuel === "he4" ? (it ? "l'elio" : "helium") : it ? `il ${nucLabel(fuel)}` : nucLabel(fuel)
  const T9 = cond.T9
  const kT = K_KEV * T9
  const sig3 = (v: number) => dec(String(Number(v.toPrecision(3))), lang)
  const sName = it ? scenario.name_it : scenario.name

  const pickGroups: PickGroup[] = groups.map((g) => {
    const [title, lead] = sp.groups[g.id] ?? [g.id, ""]
    return {
      id: g.id,
      title,
      lead,
      reactions: g.reactions.map((id) => byId.get(id)).filter((r): r is Reaction => Boolean(r)),
    }
  })
  const activeR = (active && byId.get(active)) || pickGroups[0]?.reactions[0] || null
  const activeGroup = groups.find((g) => activeR && g.reactions.includes(activeR.id))
  const tryRate = (id: string) => {
    setActive(id)
    setFactor(id, 2)
    document.getElementById("what-if")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const statRow = (label: string, hint: string | null, a: string, b: string | null) => (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">
        {label}
        {hint && (
          <span className="mt-0.5 block text-[0.7rem] leading-snug">
            <Sci>{hint}</Sci>
          </span>
        )}
      </dt>
      <dd className="tabular mt-1 font-serif text-xl font-semibold">
        <Sci>{b !== null && b !== a ? b : a}</Sci>
      </dd>
      {b !== null && b !== a && (
        <dd className="tabular text-xs text-muted-foreground">
          <Sci>{`${sp.unchangedWord}: ${a}`}</Sci>
        </dd>
      )}
    </div>
  )

  // the sensitivity map's columns: iron, the s-only isotopes, the peaks
  const sensCols = network.nuclei
    .filter(
      (n) => n.name === "fe56" || sOnlySet.has(n.code) || ["sr88", "zr90", "ba138", "ce140", "pb208"].includes(n.name),
    )
    .filter((n) => !(n.name in notModelled))
    .map((n) => n.name)
  const sensTable = sens?.scenarios[scenario.id] ?? null

  const csv = () => {
    const rows = [
      [
        "nucleus",
        "Z",
        "A",
        "X_initial",
        "X_final_unchanged",
        "X_final_changed",
        "after_decay_unchanged",
        "after_decay_changed",
      ].join(","),
    ]
    network.nuclei.forEach((n, i) => {
      rows.push(
        [
          n.name,
          n.Z,
          n.A,
          X0[i],
          base?.final[i] ?? "",
          mod?.final[i] ?? "",
          baseDec?.[i]?.toPrecision(6) ?? "",
          modDec?.[i]?.toPrecision(6) ?? "",
        ].join(","),
      )
    })
    return `data:text/csv;charset=utf-8,${encodeURIComponent(rows.join("\n"))}`
  }

  const headline = sb ? (
    <p className="max-w-[52rem] text-pretty leading-relaxed sm:text-[1.0625rem]">
      <Sci>
        {sp.headline(sName, about(sm && changed ? sm.nc : sb.nc, lang))}
      </Sci>
    </p>
  ) : null

  return (
    <div className={`space-y-14 ${RATES_TOKENS}`}>
      {/* -- above the fold: the site, the answer, the chart ------------------------ */}
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
          tRange={[0.05, 2]}
          metals={false}
        >
          {knobs.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-medium">{sp.knobsTitle}</h3>
              <ul className="mt-1 grid gap-x-8 divide-y divide-border/70 md:grid-cols-2 md:divide-y-0">
                {knobs.map((k) => (
                  <FactorSlider
                    as="li"
                    key={k}
                    label={sp.knob(nucLabel(k))}
                    value={cond.knobs[k] ?? 1}
                    onChange={(v) => setCond({ ...cond, knobs: { ...cond.knobs, [k]: v } })}
                    lang={lang}
                    note={`X₀ = ${sci(scenario.X[k] ?? 0, lang)}`}
                  />
                ))}
              </ul>
            </div>
          )}
        </ScenarioPanel>

        {headline && <div className="hidden sm:block">{headline}</div>}

        <section id="distribution" aria-labelledby="distribution-title" className="scroll-mt-24">
          <h2
            id="distribution-title"
            className="flex items-baseline gap-2.5 text-balance font-serif text-xl font-semibold tracking-tight sm:text-2xl"
          >
            <span className="tabular inline-flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full border border-border font-sans text-xs font-medium">
              1
            </span>
            {sp.distTitle}
          </h2>
          <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0">
              <div
                className="relative rounded-lg border border-border p-2 sm:p-3"
                style={{ background: "var(--viz-surface)" }}
              >
                <BusyLine busy={busy} />
                <div className={`transition-opacity motion-reduce:transition-none ${busy ? "opacity-55" : ""}`}>
                  <DistributionChart
                    points={points}
                    lang={lang}
                    label={sp.distLabel}
                    xLabel={sp.massNumber}
                    yLabel={sp.productionFactor}
                    shellLabel={sp.shell}
                    sOnlyLabel={sp.sOnly}
                    baseLabel={changed ? t.baselineLabel : null}
                    changedLabel={changed ? t.changedLabel : sp.isotope}
                    belowLabel={sp.below}
                    changed={changed}
                    notModelledLabel={sp.notModelled}
                  />
                </div>
              </div>
              {headline && <div className="mt-4 sm:hidden">{headline}</div>}
              <p className="mt-2 max-w-[46rem] text-pretty text-sm text-muted-foreground">
                {sp.distLead} {sp.peaks}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                <Sci>{sp.decayNote}</Sci>
                {Object.entries(notModelled).map(([name, note]) => (
                  <span key={name} className="block">
                    <Sci>{`${nucLabel(name)}: ${note[lang]}.`}</Sci>
                  </span>
                ))}
              </p>
            </div>
            {sb && (
              <dl className="grid content-start gap-2 min-[420px]:grid-cols-3 lg:grid-cols-1">
                {statRow(
                  sp.exposure,
                  sp.exposureHint,
                  `${sig3(sb.tau)}${NB}mb⁻¹`,
                  sm && changed ? `${sig3(sm.tau)}${NB}mb⁻¹` : null,
                )}
                {statRow(
                  sp.peak,
                  null,
                  `${sci(sb.peak, lang)}${NB}cm⁻³`,
                  sm && changed ? `${sci(sm.peak, lang)}${NB}cm⁻³` : null,
                )}
                {statRow(sp.perSeed, sp.perSeedHint, sig3(sb.nc), sm && changed ? sig3(sm.nc) : null)}
              </dl>
            )}
          </div>
        </section>
      </div>

      {curiosities && curiosities.items.length > 0 && (
        <CuriosityStrip
          key={scenario.id}
          items={curiosities.items}
          first={curiosities.items.filter((c) => c.site === scenario.id).map((c) => c.id)}
          lang={lang}
          allHref={localePath(lang, "/atlas/rates/curiosities")}
          total={curiosities.total}
        />
      )}

      <Figure id="what-if" step={{ n: 2, label: t.step3 }} title={t.whatIfTitle} lead={sp.whatIfLead}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-10">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <ReactionPicker
              groups={pickGroups}
              active={activeR}
              setActive={setActive}
              scale={scale}
              setFactor={setFactor}
              lang={lang}
            />
            {activeGroup && (
              <p className="mt-2 text-xs text-muted-foreground">
                <Sci>{sp.groups[activeGroup.id]?.[1] ?? ""}</Sci>
              </p>
            )}
            <ChangesList scale={scale} byId={byId} setFactor={setFactor} reset={() => setScale({})} lang={lang} />
          </div>

          <div id="sprocess-results" className="min-w-0 scroll-mt-24 space-y-8">
            <StatusLine
              busy={busy}
              error={runError}
              lang={lang}
              done={
                mod ? (
                  <span>
                    {mod.stopped === "until"
                      ? L(t.stoppedUntil(fuelLabel, runTime, scenario.until?.fraction))
                      : t.stoppedTime(runTime)}{" "}
                    {altered ? t.calculated(mod.ms, mod.steps) : t.precomputed}
                  </span>
                ) : null
              }
            />
            <div className={`space-y-8 transition-opacity motion-reduce:transition-none ${busy ? "opacity-55" : ""}`}>
              <div id="sprocess-changes" className="relative rounded-lg border border-border bg-card p-3 sm:p-4">
                <BusyLine busy={busy} />
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-lg font-semibold tracking-tight">{t.changedTitle}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t.changedLead(runTime, changed ? baseTime : undefined)}
                    </p>
                  </div>
                  <Segmented
                    label={t.changedTitle}
                    value={heavyOnly}
                    onChange={setHeavyOnly}
                    options={[
                      { value: "heavy", label: sp.heavy },
                      { value: "light", label: sp.light },
                    ]}
                  />
                </div>
                <div className="mt-3">
                  {changes.length ? (
                    <>
                      <ChangeBars
                        rows={allChanges ? changes : changes.slice(0, 10)}
                        lang={lang}
                        label={t.changeChartLabel}
                        more={t.more}
                        less={t.less}
                      />
                      {changes.length > 10 && (
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

              {mod && (
                <div>
                  <h3 className="font-serif text-lg font-semibold tracking-tight">{sp.neutronTitle}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {sp.neutronLead}
                    {changed && ` ${t.evolutionChanged}`}
                  </p>
                  <div
                    className="mt-3 rounded-lg border border-border p-2 sm:p-3"
                    style={{ background: "var(--viz-surface)" }}
                  >
                    <EvolutionChart
                      series={[
                        {
                          name: "n",
                          label: "n",
                          slot: 0,
                          t: mod.t,
                          X: neutronSeries(mod),
                          ...(changed && base ? { baseT: base.t, baseX: neutronSeries(base) } : {}),
                        },
                      ]}
                      lang={lang}
                      label={sp.neutronLabel}
                      xLabel={t.time}
                      yLabel={sp.neutronAxis}
                      baseWord={t.baselineLabel}
                    />
                  </div>
                </div>
              )}
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
          <p className="mt-1 max-w-[46rem] text-pretty text-sm text-muted-foreground">
            {t.sensLead} {sp.sensNuclei}.
          </p>
          {sensOpen && (
            <div id="sprocess-sens-map" className="mt-4">
              {custom && <p className="mb-2 text-xs text-muted-foreground">{t.sensCustom}</p>}
              {sensTable ? (
                <SensitivityMap network={network} table={sensTable} lang={lang} columns={sensCols} onTry={tryRate} />
              ) : (
                <Loader2
                  className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none"
                  aria-hidden
                />
              )}
            </div>
          )}
        </div>
        <ResultStrip
          rows={changes}
          busy={busy}
          href="#sprocess-results"
          lang={lang}
          active={changed || altered}
          watch="sprocess-changes sprocess-sens-map"
          rev={sensOpen && sens !== null}
        />
      </Figure>

      {/* -- for specialists -------------------------------------------------------- */}
      <Fold title={t.forExperts}>
        {() => (
          <div className="space-y-6 text-sm">
            <p className="text-pretty leading-relaxed text-muted-foreground">
              {t.provenance(`${network.provenance.library} ${network.provenance.snapshot}`, network.provenance.tool)}.{" "}
              {sp.networkNote(network.nuclei.length, network.reactions.length)} {t.dataNote} {t.screenNote}
            </p>
            <ul className="space-y-1.5 font-mono text-[0.8rem] leading-relaxed">
              <li>
                <Formula>{t.equationRate}</Formula>
              </li>
              <li>
                <Formula>{t.equationYdot}</Formula>
              </li>
              <li>
                <Formula>
                  {`${sp.exposureFormula},  n_n = ρ N_A Y_n,  v_T = (2kT/m_n)^(1/2);  MACS = N_A⟨σv⟩ / (N_A v_T)`}
                </Formula>
              </li>
            </ul>
            <div
              className="overflow-x-auto overscroll-x-contain rounded-md border border-border [scrollbar-width:thin]"
              tabIndex={0}
              role="region"
              aria-label={t.expertTable}
            >
              <table className="w-full min-w-[56rem] text-left text-xs">
                <thead className="bg-secondary/60 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t.colReaction}</th>
                    <th className="px-3 py-2 font-medium">{t.colSet}</th>
                    <th className="px-3 py-2 text-right font-medium">
                      <Formula>{`${t.colRate} = ${sig2(T9, lang)} GK`}</Formula>
                    </th>
                    <th className="px-3 py-2 text-right font-medium">{sp.macsCol(`${sig2(kT, lang)}${NB}keV`)}</th>
                    <th className="px-3 py-2 text-right font-medium">{sp.macs30}</th>
                    <th className="px-3 py-2 text-right font-medium">{t.colScale}</th>
                    <th className="px-3 py-2 font-medium">{t.colSource}</th>
                    <th className="px-3 py-2 font-medium">{t.colNote}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {groups
                    .flatMap((g) => g.reactions)
                    .map((id) => byId.get(id))
                    .filter((r): r is Reaction => Boolean(r))
                    .map((r) => {
                      const m = macs(network, provider, r.id, T9)
                      const m30 = macs(network, provider, r.id, 30 / K_KEV)
                      return (
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
                            {r.rate.kind === "reaclib"
                              ? r.rate.sets.map((s) => `${s.set}${s.flag}`).join(" ")
                              : "table"}
                          </td>
                          <td className="tabular px-3 py-1.5 text-right">
                            <Sci>{sci(provider.rate(r.id, T9), lang, 4)}</Sci>
                          </td>
                          <td className="tabular px-3 py-1.5 text-right">{m === null ? "—" : sig2(m, lang)}</td>
                          <td className="tabular px-3 py-1.5 text-right">{m30 === null ? "—" : sig2(m30, lang)}</td>
                          <td className="tabular px-3 py-1.5 text-right">{dec(String(scale[r.id] ?? 1), lang)}</td>
                          <td className="px-3 py-1.5">
                            <SourceCell sources={r.sources} />
                          </td>
                          <td className="max-w-[18rem] px-3 py-1.5 text-muted-foreground">
                            {network.ui.newer?.[r.id] && <Sci>{network.ui.newer[r.id][lang]}</Sci>}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
            <p className="flex flex-wrap gap-x-6 gap-y-2">
              <Download make={csv} filename={`sprocess-${scenario.id}-abundances.csv`}>
                {t.download}: {t.colNucleus} (CSV)
              </Download>
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

/**
 * What the page shows before the network file has arrived: the first site's
 * precomputed burn (lib/rates/first-view.ts), laid out as the explorer lays
 * it out, so the chart is there at once and nothing moves when the
 * controls arrive.
 */
function FirstView({ view, lang }: { view: SProcessFirstView; lang: Lang }) {
  const t = ratesDict(lang)
  const sp = t.sp
  const it = lang === "it"
  const sig3 = (v: number) => dec(String(Number(v.toPrecision(3))), lang)
  const s = view.scenario
  const headline = (
    <p className="max-w-[52rem] text-pretty leading-relaxed sm:text-[1.0625rem]">
      <Sci>{sp.headline(it ? s.name_it : s.name, about(view.stats.nc, lang))}</Sci>
    </p>
  )
  const stat = (label: string, hint: string | null, v: string) => (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">
        {label}
        {hint && (
          <span className="mt-0.5 block text-[0.7rem] leading-snug">
            <Sci>{hint}</Sci>
          </span>
        )}
      </dt>
      <dd className="tabular mt-1 font-serif text-xl font-semibold">
        <Sci>{v}</Sci>
      </dd>
    </div>
  )
  return (
    <div className={`space-y-5 ${RATES_TOKENS}`} aria-busy="true">
      <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
        <div className="relative -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {view.sites.map((x, i) => (
            <span
              key={x.id}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm ${
                i === 0 ? "border-foreground bg-foreground text-background" : "border-border"
              }`}
            >
              <span className="font-medium">
                <Sci>{it ? x.short_it : x.short}</Sci>
              </span>
              <span className={`tabular text-xs ${i === 0 ? "text-background/75" : "text-muted-foreground"}`}>
                {tShort(x.T9, lang)}
              </span>
            </span>
          ))}
        </div>
        <p className="mt-3 flex min-h-9 flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            <Sci>{it ? s.name_it : s.name}</Sci>
          </span>
          <span className="tabular">
            <Sci>{`${temperature(s.T9, lang)} · ${density(s.rho, lang)} · ${duration(s.time_s, lang)}`}</Sci>
          </span>
          <Loader2 className="ml-auto h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        </p>
      </div>
      <div className="hidden sm:block">{headline}</div>
      <section aria-labelledby="distribution-title-0">
        <h2
          id="distribution-title-0"
          className="flex items-baseline gap-2.5 text-balance font-serif text-xl font-semibold tracking-tight sm:text-2xl"
        >
          <span className="tabular inline-flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full border border-border font-sans text-xs font-medium">
            1
          </span>
          {sp.distTitle}
        </h2>
        <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0">
            <div
              className="relative rounded-lg border border-border p-2 sm:p-3"
              style={{ background: "var(--viz-surface)" }}
            >
              <DistributionChart
                points={view.points}
                lang={lang}
                label={sp.distLabel}
                xLabel={sp.massNumber}
                yLabel={sp.productionFactor}
                shellLabel={sp.shell}
                sOnlyLabel={sp.sOnly}
                baseLabel={null}
                changedLabel={sp.isotope}
                belowLabel={sp.below}
                notModelledLabel={sp.notModelled}
              />
            </div>
            <div className="mt-4 sm:hidden">{headline}</div>
            <p className="mt-2 max-w-[46rem] text-pretty text-sm text-muted-foreground">
              {sp.distLead} {sp.peaks}
            </p>
          </div>
          <dl className="grid content-start gap-2 min-[420px]:grid-cols-3 lg:grid-cols-1">
            {stat(sp.exposure, sp.exposureHint, `${sig3(view.stats.tau)}${NB}mb⁻¹`)}
            {stat(sp.peak, null, `${sci(view.stats.peak, lang)}${NB}cm⁻³`)}
            {stat(sp.perSeed, sp.perSeedHint, sig3(view.stats.nc))}
          </dl>
        </div>
      </section>
    </div>
  )
}
