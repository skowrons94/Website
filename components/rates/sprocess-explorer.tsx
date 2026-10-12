"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { Sci } from "@/components/sci"
import { elideItalian } from "@/lib/localize.mjs"
import { localePath, type Lang } from "@/lib/locale"
import { decayMap, decayed, macs, neutronsPerSeed } from "@/lib/rates/analysis"
import { loadNetwork, runBurn, type Baseline } from "@/lib/rates/client"
import { ratesDict } from "@/lib/rates/i18n"
import { networkProvider } from "@/lib/rates/rate-provider"
import type { RunResult } from "@/lib/rates/run"
import type { Network } from "@/lib/rates/schema"
import { ChangeBars, type ChangeRow } from "./change-bars"
import { Figure, Fold, Formula, Segmented } from "./chart-kit"
import { DistributionChart, type DistPoint } from "./distribution-chart"
import { EvolutionChart } from "./evolution-chart"
import { FactorSlider } from "./factor-slider"
import { duration, sci, sig2 } from "./format"
import { ScenarioPanel, composition, conditionsRequest, fromScenario, sameConditions, type Conditions } from "./scenario-panel"

const NETWORK = "sprocess"

/**
 * The s-process, iron to bismuth: pick a site, scale the neutron sources,
 * the poisons, the seed and a few branch points, and see the neutron
 * exposure and the distribution of the heavy isotopes change. The burn runs
 * in the rates Web Worker, on the network of public/rates/sprocess.json.
 */
export function SProcessExplorer({ lang, sOnly }: { lang: Lang; sOnly: string[] }) {
  const t = ratesDict(lang)
  const sp = t.sp
  const it = lang === "it"
  const L = (s: string) => (it ? elideItalian(s) : s)
  const [data, setData] = useState<{ network: Network; baseline: Baseline | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scenarioId, setScenarioId] = useState<string | null>(null)
  const [cond, setCond] = useState<Conditions | null>(null)
  const [scale, setScale] = useState<Record<string, number>>({})
  const [base, setBase] = useState<RunResult | null>(null)
  const [mod, setMod] = useState<RunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [allChanges, setAllChanges] = useState(false)
  const [heavyOnly, setHeavyOnly] = useState<"heavy" | "light">("heavy")

  useEffect(() => {
    let live = true
    loadNetwork(NETWORK)
      .then((d) => {
        if (!live) return
        setData(d)
        const s = d.network.scenarios[0]
        setScenarioId(s.id)
        setCond(fromScenario(s))
      })
      .catch((e) => live && setError(String(e)))
    return () => {
      live = false
    }
  }, [])

  const network = data?.network ?? null
  const scenario = network?.scenarios.find((s) => s.id === scenarioId) ?? null
  const provider = useMemo(() => (network ? networkProvider(network) : null), [network])
  const decays = useMemo(() => (network && provider ? decayMap(network, provider) : null), [network, provider])
  const changed = Object.values(scale).some((v) => v !== 1)

  const seq = useRef(0)
  useEffect(() => {
    if (!network || !scenario || !cond) return
    const my = ++seq.current
    setBusy(true)
    setRunError(null)
    const timer = setTimeout(async () => {
      try {
        const b = await runBurn(network, conditionsRequest(network, scenario, cond, {}), data?.baseline)
        const m = changed ? await runBurn(network, conditionsRequest(network, scenario, cond, scale), data?.baseline) : b
        if (my !== seq.current) return
        if (b) setBase(b)
        if (m) setMod(m)
        setBusy(false)
      } catch (e) {
        if (my !== seq.current) return
        setRunError(e instanceof Error ? e.message : String(e))
        setBusy(false)
      }
    }, 150)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, scenario, cond, scale])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!network || !scenario || !cond || !provider || !decays) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center text-muted-foreground" aria-busy="true">
        <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
      </div>
    )
  }

  const byId = new Map(network.reactions.map((r) => [r.id, r]))
  const custom = !sameConditions(cond, fromScenario(scenario))
  const X0map = composition(network, scenario, cond)
  const X0 = network.nuclei.map((n) => X0map[n.name] ?? 0)
  const sOnlySet = new Set(sOnly)

  // -- results ------------------------------------------------------------------
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
      })
    })
  }
  const changes: ChangeRow[] = []
  if (baseDec && modDec && changed) {
    network.nuclei.forEach((n, i) => {
      const a = baseDec[i]
      const b = modDec[i]
      if (decays.branches.has(i) || Math.max(a, b) < 1e-14 || n.Z === 0) return
      if ((heavyOnly === "heavy") !== n.Z >= 26) return
      const ratio = a > 0 ? b / a : Infinity
      if (Math.abs(Math.log10(ratio)) < 1e-3) return
      changes.push({ name: n.name, label: n.label, ratio })
    })
    changes.sort((a, b) => Math.abs(Math.log10(b.ratio)) - Math.abs(Math.log10(a.ratio)))
  }

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

  const setFactor = (id: string, v: number) => setScale((s) => ({ ...s, [id]: v }))
  const groups = network.ui.groups ?? []
  const knobs = network.ui.knobs ?? []
  const nucLabel = (name: string) => network.nuclei.find((n) => n.name === name)?.label ?? name
  const runTime = mod ? duration(mod.tFinal, lang) : ""
  const fuel = scenario.until?.nucleus ?? ""
  const fuelLabel = fuel === "he4" ? (it ? "l'elio" : "helium") : it ? `il ${nucLabel(fuel)}` : nucLabel(fuel)
  const T9 = cond.T9

  const sig3 = (v: number) => (it ? String(Number(v.toPrecision(3))).replace(".", ",") : String(Number(v.toPrecision(3))))
  const statRow = (label: string, hint: string | null, a: string, b: string | null) => (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">
        {label}
        {hint && (
          <span className="block text-[0.7rem]">
            <Formula>{hint}</Formula>
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

  const csv = () => {
    const rows = [["nucleus", "Z", "A", "X_initial", "X_final_unchanged", "X_final_changed", "after_decay_unchanged", "after_decay_changed"].join(",")]
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

  return (
    <div className="space-y-14">
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
          <div className="mt-6">
            <h3 className="text-sm font-medium">{sp.knobsTitle}</h3>
            <ul className="mt-1 grid gap-x-8 divide-y divide-border/70 md:grid-cols-2 md:divide-y-0">
              {knobs.map((k) => (
                <FactorSlider
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

      <Figure id="what-if" title={t.whatIfTitle} lead={t.whatIfLead}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          {/* -- the controls ------------------------------------------------- */}
          <div className="space-y-6">
            {groups.map((g) => {
              const [title, lead] = sp.groups[g.id] ?? [g.id, ""]
              const list = g.reactions.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r))
              const body = (
                <ul className="divide-y divide-border/70 border-y border-border/70">
                  {list.map((r) => (
                    <FactorSlider
                      key={r.id}
                      label={r.label}
                      href={r.atlas ? `/atlas/${r.atlas}` : null}
                      value={scale[r.id] ?? 1}
                      onChange={(v) => setFactor(r.id, v)}
                      lang={lang}
                    />
                  ))}
                </ul>
              )
              return g.id === "branches" || g.id === "competitors" || g.id === "seeds" ? (
                <Fold key={g.id} title={title}>
                  <p className="mb-2 text-sm text-muted-foreground">
                    <Sci>{lead}</Sci>
                  </p>
                  {body}
                </Fold>
              ) : (
                <div key={g.id}>
                  <h3 className="font-serif text-lg font-semibold tracking-tight">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <Sci>{lead}</Sci>
                  </p>
                  <div className="mt-2">{body}</div>
                </div>
              )
            })}
            <button
              type="button"
              onClick={() => setScale({})}
              disabled={!changed}
              className="min-h-9 rounded-md border border-border px-3 text-sm transition-colors hover:border-foreground/40 disabled:opacity-50"
            >
              {t.resetAll}
            </button>
            {/* on a phone the results are far below: their headline, and a way down */}
            {sb && (
              <a
                href="#sprocess-results"
                className="block rounded-md border border-border bg-secondary/50 px-4 py-3 text-sm lg:hidden"
              >
                <span className="text-muted-foreground">{sp.exposure}: </span>
                <span className="tabular font-medium">
                  <Sci>{`${sig3(sb.tau)}${sm && changed ? ` → ${sig3(sm.tau)}` : ""} mb⁻¹`}</Sci>
                </span>
                <span className="mt-1 block text-link">{sp.toResults} ↓</span>
              </a>
            )}
          </div>

          {/* -- the results ------------------------------------------------------ */}
          <div id="sprocess-results" className="min-w-0 scroll-mt-24 space-y-10">
            <div>
              <p className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> {t.calculating}
                  </>
                ) : runError ? (
                  <span className="text-destructive">
                    {t.failed} {runError}
                  </span>
                ) : mod ? (
                  <>
                    {mod.stopped === "until"
                      ? L(t.stoppedUntil(fuelLabel, runTime, scenario.until?.fraction))
                      : t.stoppedTime(runTime)}{" "}
                    {changed || custom ? t.calculated(mod.ms, mod.steps) : t.precomputed}
                  </>
                ) : null}
              </p>
              {sb && (
                <dl className="mt-3 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-3">
                  {statRow(
                    sp.exposure,
                    sp.exposureHint,
                    `${sig3(sb.tau)} mb⁻¹`,
                    sm && changed ? `${sig3(sm.tau)} mb⁻¹` : null,
                  )}
                  {statRow(
                    sp.peak,
                    null,
                    `${sci(sb.peak, lang)} cm⁻³`,
                    sm && changed ? `${sci(sm.peak, lang)} cm⁻³` : null,
                  )}
                  {statRow(sp.perSeed, sp.perSeedHint, sig3(sb.nc), sm && changed ? sig3(sm.nc) : null)}
                </dl>
              )}
            </div>

            <div>
              <h3 className="font-serif text-lg font-semibold tracking-tight">{sp.distTitle}</h3>
              <p className="mt-1 max-w-[46rem] text-pretty text-sm text-muted-foreground">{sp.distLead}</p>
              <div className="mt-3 rounded-lg border border-border p-2 sm:p-3" style={{ background: "var(--viz-surface)" }}>
                <DistributionChart
                  points={points}
                  lang={lang}
                  label={sp.distLabel}
                  xLabel={sp.massNumber}
                  yLabel={sp.productionFactor}
                  shellLabel={sp.shell}
                  sOnlyLabel={sp.sOnly}
                  baseLabel={t.baselineLabel}
                  changedLabel={changed ? t.changedLabel : `${t.changedLabel} = ${t.baselineLabel}`}
                  belowLabel={sp.below}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                <Sci>{sp.decayNote}</Sci>
              </p>
            </div>

            <div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="font-serif text-lg font-semibold tracking-tight">{t.changedTitle}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t.changedLead(runTime)}</p>
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
                        {allChanges ? t.showKey : t.showAll}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">{t.noChange}</p>
                )}
              </div>
            </div>

            {mod && (
              <div>
                <h3 className="font-serif text-lg font-semibold tracking-tight">{sp.neutronTitle}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{sp.neutronLead}</p>
                <div className="mt-3 rounded-lg border border-border p-2 sm:p-3" style={{ background: "var(--viz-surface)" }}>
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
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </Figure>

      {/* -- for specialists -------------------------------------------------------- */}
      <Fold title={t.forExperts}>
        <div className="space-y-6 text-sm">
          <p className="text-pretty leading-relaxed text-muted-foreground">
            {t.provenance(`${network.provenance.library} ${network.provenance.snapshot}`, network.provenance.tool)}.{" "}
            {sp.networkNote(network.nuclei.length, network.reactions.length)} {t.dataNote}
          </p>
          <ul className="space-y-1.5 font-mono text-[0.8rem] leading-relaxed">
            <li>
              <Formula>{t.equationRate}</Formula>
            </li>
            <li>
              <Formula>{t.equationYdot}</Formula>
            </li>
            <li>
              <Formula>{"τ = ∫ n_n v_T dt,  n_n = ρ N_A Y_n,  v_T = (2kT/m_n)^(1/2);  MACS = N_A⟨σv⟩ / (N_A v_T)"}</Formula>
            </li>
          </ul>
          <div
            className="overflow-x-auto overscroll-x-contain rounded-md border border-border [scrollbar-width:thin]"
            tabIndex={0}
            role="region"
            aria-label={t.expertTable}
          >
            <table className="w-full min-w-[44rem] text-left text-xs">
              <thead className="bg-secondary/60 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t.colReaction}</th>
                  <th className="px-3 py-2 font-medium">{t.colSet}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    <Formula>{`${t.colRate} = ${sig2(T9, lang)} GK`}</Formula>
                  </th>
                  <th className="px-3 py-2 text-right font-medium">{sp.macsCol}</th>
                  <th className="px-3 py-2 text-right font-medium">{t.colScale}</th>
                  <th className="px-3 py-2 font-medium">{t.colSource}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {groups
                  .flatMap((g) => g.reactions)
                  .map((id) => byId.get(id))
                  .filter((r): r is NonNullable<typeof r> => Boolean(r))
                  .map((r) => {
                    const m = macs(network, provider, r.id, T9)
                    return (
                      <tr key={r.id}>
                        <td className="px-3 py-1.5">
                          {r.atlas ? (
                            <Link href={localePath(lang, `/atlas/${r.atlas}`)} className="text-link underline-offset-4 hover:underline">
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
                        <td className="tabular px-3 py-1.5 text-right">
                          <Sci>{sci(provider.rate(r.id, T9), lang, 4)}</Sci>
                        </td>
                        <td className="tabular px-3 py-1.5 text-right">{m === null ? "—" : sig2(m, lang)}</td>
                        <td className="tabular px-3 py-1.5 text-right">{scale[r.id] ?? 1}</td>
                        <td className="px-3 py-1.5">
                          {r.sources.map((s) => (
                            <span key={s.set} className="block">
                              {s.url ? (
                                <a href={s.url} target="_blank" rel="noreferrer" className="text-link underline-offset-4 hover:underline">
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
                    )
                  })}
              </tbody>
            </table>
          </div>
          <p className="flex flex-wrap gap-x-6 gap-y-2">
            <a href={csv()} download={`sprocess-${scenario.id}-abundances.csv`} className="text-link underline-offset-4 hover:underline">
              {t.download}: {t.colNucleus} (CSV)
            </a>
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
