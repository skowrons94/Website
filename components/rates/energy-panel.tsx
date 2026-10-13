"use client"

import { memo } from "react"

import { Sci } from "@/components/sci"
import type { Lang } from "@/lib/locale"
import { energyChange, meanPower, type Power } from "@/lib/rates/energy"
import { ratesDict } from "@/lib/rates/i18n"
import type { RunResult } from "@/lib/rates/run"
import { EvolutionChart } from "./evolution-chart"
import { changeText, dec, duration, sci } from "./format"

/**
 * The energy of a burn in "What changes most" (lib/rates/energy.ts): its mean
 * power, the time its fuel takes to run down and the neutrinos a detector
 * would name, each as changed ÷ unchanged once a rate is changed, with the
 * unchanged value beside it. Always with what ε is not: the star's luminosity.
 * When the network leaves out the burning that powers the site (`missing`,
 * lib/rates/energy.ts: missingPower), it says that only this network's
 * reactions count and leaves out the fuel time, which that burning sets.
 */
export function EnergyLines({
  base,
  mod,
  changed,
  missing,
  lang,
}: {
  base: RunResult | null
  mod: RunResult | null
  changed: boolean
  missing: Power | null
  lang: Lang
}) {
  const t = ratesDict(lang)
  const e = t.energy
  if (!mod?.energy || !base?.energy) return null
  const b = base.energy
  const m = mod.energy
  const ch = changed ? energyChange(base, mod) : null
  const fuel = b.fuel && !missing ? e.fuelName[b.fuel] : null
  const fuelLabel = fuel ? (base.stopped === "until" || b.mark < 0.5 ? e.fuelUntil(fuel[0], b.mark) : e.fuelFirst(fuel[1])) : null
  const colour = (r: number) => (Math.abs(r - 1) < 0.005 ? undefined : r > 1 ? "var(--rates-up)" : "var(--rates-down)")
  const value = (r: number) => (
    <span className="tabular font-semibold" style={{ color: colour(r) }}>
      {changeText(r, lang)}
    </span>
  )
  const was = (v: string) => <span className="text-muted-foreground"> ({e.unchanged(v)})</span>
  const pBase = meanPower(b, base.tFinal)
  const pMod = meanPower(m, mod.tFinal)
  const shareOf = (x: typeof b) => (x.E + x.Enu > 0 ? x.Enu / (x.E + x.Enu) : 0)
  const share = `${dec((100 * shareOf(changed ? m : b)).toPrecision(2), lang)}%`
  const nuIds = Object.keys(b.nu)
  return (
    <div className="mt-4 border-t border-border/70 pt-3" data-energy>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{e.title}</p>
      <ul className="mt-1.5 space-y-1 text-sm">
        <li>
          <span>{e.output}: </span>
          {ch ? (
            <>
              {value(ch.power)}
              {was(e.mean(sci(pBase, lang)))}
            </>
          ) : (
            <span className="tabular font-semibold">
              <Sci>{e.mean(sci(pMod, lang))}</Sci>
            </span>
          )}
          <span className="text-muted-foreground">; {e.share(share)}</span>
        </li>
        {fuelLabel && (
          <li>
            <span>
              <Sci>{fuelLabel}</Sci>:{" "}
            </span>
            {ch ? (
              ch.fuel !== null ? (
                <>
                  {value(ch.fuel)}
                  {was(duration(b.tFuel!, lang))}
                </>
              ) : (
                <span className="text-muted-foreground">{e.notReached}</span>
              )
            ) : (
              <span className="tabular font-semibold">{m.tFuel !== null ? duration(m.tFuel, lang) : e.notReached}</span>
            )}
          </li>
        )}
        {ch && nuIds.length > 0 && (
          <li>
            <span className="text-muted-foreground">{e.nuLead}</span>
            <ul className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
              {nuIds.map((id) => (
                <li key={id} className="whitespace-nowrap">
                  <Sci>{e.nu[id] ?? id}</Sci>: {ch.nu[id] !== undefined ? value(ch.nu[id]) : "–"}
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>
      <p className="mt-2 text-pretty text-xs leading-relaxed text-muted-foreground">
        {e.note}
        {missing && ` ${e.noteNet(e.chain[missing])}`}
      </p>
    </div>
  )
}

/** ε(t) of the burn, changed (solid) and unchanged (dashed), on the abundance chart's axes. */
export const EnergyChart = memo(function EnergyChart({
  base,
  mod,
  changed,
  lang,
}: {
  base: RunResult | null
  mod: RunResult | null
  changed: boolean
  lang: Lang
}) {
  const t = ratesDict(lang)
  if (!mod?.eps) return null
  const pos = (xs: number[]) => xs.map((x) => (x > 0 ? x : 0))
  return (
    <div>
      <h3 className="font-serif text-lg font-semibold tracking-tight">{t.energy.chartTitle}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.energy.chartLead}
        {changed && ` ${t.evolutionChanged}`}
      </p>
      <div className="mt-3 rounded-lg border border-border p-2 sm:p-3" style={{ background: "var(--viz-surface)" }}>
        <EvolutionChart
          series={[
            {
              name: "eps",
              label: "ε",
              slot: 2,
              t: mod.t,
              X: pos(mod.eps),
              ...(changed && base?.eps ? { baseT: base.t, baseX: pos(base.eps) } : {}),
            },
          ]}
          lang={lang}
          label={t.energy.chartLabel}
          xLabel={t.time}
          yLabel={t.energy.axis}
          baseWord={t.baselineLabel}
          compact
        />
      </div>
    </div>
  )
})
