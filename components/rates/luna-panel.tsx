"use client"

import Link from "next/link"

import { Sci } from "@/components/sci"
import { localePath, type Lang } from "@/lib/locale"
import { providerFor } from "@/lib/rates/run"
import type { Network } from "@/lib/rates/schema"
import { sig2, temperature } from "./format"

const en = {
  title: "Rates from LUNA measurements",
  toggle: "Use the LUNA/AZURE2 rates",
  toggleHint: "for ¹²C(p,γ)¹³N and ¹³C(p,γ)¹⁴N",
  lead: "LUNA measured the two proton captures on carbon deep underground, down to 60 keV (Skowronski et al. 2023). Switched on, the burn uses rates computed from the R-matrix evaluations of those data on this site, instead of REACLIB's.",
  ratio: (T: string) => `¹²C/¹³C in CN equilibrium at ${T}`,
  ratioHint: "number ratio, = rate of ¹³C(p,γ) ÷ rate of ¹²C(p,γ): what hydrogen burning leaves, the ratio astronomers measure in red giants",
  reaclib: "REACLIB",
  lunaWord: "LUNA/AZURE2",
  burn: "at the end of this burn",
  versus: (label: string, f: string) => `${label}: ${f} × REACLIB's rate here`,
  evaluations: "The evaluations",
  method:
    "N_A⟨σv⟩ integrated numerically (Maxwell–Boltzmann) from each evaluation's cross section at its published parameters, from 1 keV to 4 MeV, narrow resonances resolved.",
  on: "on",
  off: "off",
  builtBy:
    "Built by J. Skowronski; rates from his AZURE2 evaluations can be dropped in for REACLIB's, as ¹²C(p,γ) and ¹³C(p,γ) are here (What if ▸ LUNA/AZURE2 rates).",
  rateSource: "AZURE2 (LUNA)",
}

const it: typeof en = {
  title: "Tassi dalle misure di LUNA",
  toggle: "Usa i tassi LUNA/AZURE2",
  toggleHint: "per la ¹²C(p,γ)¹³N e la ¹³C(p,γ)¹⁴N",
  lead: "LUNA ha misurato sotto terra le due catture protoniche sul carbonio, fino a 60 keV (Skowronski et al. 2023). Attivando questa opzione, la combustione usa i tassi calcolati dalle valutazioni R-matrix di quei dati su questo sito, al posto di quelli di REACLIB.",
  ratio: (T: string) => `¹²C/¹³C all'equilibrio del ciclo CN a ${T}`,
  ratioHint: "rapporto tra numeri di nuclei, = tasso della ¹³C(p,γ) ÷ tasso della ¹²C(p,γ): ciò che lascia la combustione dell'idrogeno, il rapporto che gli astronomi misurano nelle giganti rosse",
  reaclib: "REACLIB",
  lunaWord: "LUNA/AZURE2",
  burn: "alla fine di questa combustione",
  versus: (label: string, f: string) => `${label}: ${f} × il tasso di REACLIB, qui`,
  evaluations: "Le valutazioni",
  method:
    "N_A⟨σv⟩ integrato numericamente (Maxwell–Boltzmann) dalla sezione d'urto di ciascuna valutazione ai parametri pubblicati, da 1 keV a 4 MeV, con le risonanze strette risolte.",
  on: "attivi",
  off: "spenti",
  builtBy:
    "Realizzato da J. Skowronski; i tassi delle sue valutazioni AZURE2 possono prendere il posto di quelli di REACLIB, come qui per la ¹²C(p,γ) e la ¹³C(p,γ) (E se ▸ tassi LUNA/AZURE2).",
  rateSource: "AZURE2 (LUNA)",
}

const LUNA_DICT: Record<Lang, typeof en> = { en, it }

/** The explorer's credit line while the switch is public: it names the switch. */
export function LunaCredit({ lang }: { lang: Lang }) {
  return <Sci>{LUNA_DICT[lang].builtBy}</Sci>
}

/** The rate's source in the rates table, for a reaction run with its evaluated rate. */
export function LunaRateSource({ lang }: { lang: Lang }) {
  return <>{LUNA_DICT[lang].rateSource}</>
}

/**
 * "Use the LUNA/AZURE2 rates": a switch that runs ¹²C(p,γ)¹³N and
 * ¹³C(p,γ)¹⁴N with the rates computed from the site's own R-matrix
 * evaluations of the LUNA data (scripts/rates/evaluated_rates.py; the
 * network file carries them as each reaction's `alternatives`), and what the
 * change does to the ¹²C/¹³C ratio: in CN equilibrium (the ratio of the two
 * rates, at the chosen temperature) and at the end of the burn.
 *
 * Hidden while LUNA_RATES_PUBLIC (lib/rates/features.ts) is false: the
 * explorer then never imports this module (rates-explorer.tsx loads it with
 * a dynamic import behind the flag), so neither the panel nor its words are
 * in any shipped chunk, and the network files carry no `alternatives`
 * (scripts/rates/rate_alternatives.py).
 */
export function LunaPanel({
  network,
  ids,
  on,
  setOn,
  T9,
  X,
  Xbase,
  lang,
}: {
  network: Network
  /** the reactions that have an evaluated rate */
  ids: string[]
  on: boolean
  setOn: (v: boolean) => void
  T9: number
  /** final mass fractions of the burn with the evaluated rates, when it has run */
  X: number[] | null
  /** final mass fractions of the unchanged burn */
  Xbase: number[] | null
  lang: Lang
}) {
  const l = LUNA_DICT[lang]
  const reaclib = providerFor(network)
  const luna = providerFor(network, ids)
  const c12 = "C12_p_to_N13_reaclib"
  const c13 = "C13_p_to_N14_reaclib"
  const has = ids.includes(c12) && ids.includes(c13)
  // CN equilibrium: Y(¹²C) λ₁₂ = Y(¹³C) λ₁₃ (¹³N decays at once), so the
  // number ratio is λ₁₃/λ₁₂; screening nearly cancels between the two
  const eq = (p: typeof reaclib) => p.rate(c13, T9) / p.rate(c12, T9)
  const i12 = network.nuclei.findIndex((n) => n.name === "c12")
  const i13 = network.nuclei.findIndex((n) => n.name === "c13")
  const burnRatio = (x: number[] | null) =>
    x && i12 >= 0 && i13 >= 0 && x[i13] > 0 ? x[i12] / 12 / (x[i13] / 13) : null
  const rBase = burnRatio(Xbase)
  const rLuna = burnRatio(X)
  const alt = network.reactions.find((r) => r.id === c12)?.alternatives?.[0]
  const evals = ids
    .map((id) => network.reactions.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r?.alternatives?.length))

  return (
    <section aria-labelledby="luna-title" className="mt-6 rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
      <h3 id="luna-title" className="font-serif text-base font-semibold">
        {l.title}
      </h3>
      <p className="mt-1 text-pretty text-sm text-muted-foreground">
        <Sci>{l.lead}</Sci>
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn(!on)}
        className="mt-3 flex min-h-10 w-full items-center gap-3 rounded-md border border-border px-3 text-left text-sm transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${
            on ? "bg-[var(--rates-changed)]" : "bg-[var(--viz-grid)]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--viz-surface)] shadow transition-[left] motion-reduce:transition-none ${
              on ? "left-[1.125rem]" : "left-0.5"
            }`}
          />
        </span>
        <span className="min-w-0">
          <span className="font-medium">{l.toggle}</span>{" "}
          <span className="text-muted-foreground">
            <Sci>{l.toggleHint}</Sci>
          </span>
        </span>
      </button>

      <ul className="mt-3 space-y-0.5 text-xs text-muted-foreground">
        {evals.map((r) => (
          <li key={r.id} className="tabular">
            <Sci>{l.versus(r.label, sig2(luna.rate(r.id, T9) / reaclib.rate(r.id, T9), lang))}</Sci>
          </li>
        ))}
      </ul>

      {has && (
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">
              <Sci>{l.ratio(temperature(T9, lang))}</Sci>
            </dt>
          </div>
          <div className={`rounded-md border px-2.5 py-1.5 ${on ? "border-border" : "border-foreground/40"}`}>
            <dt className="text-xs text-muted-foreground">{l.reaclib}</dt>
            <dd className="tabular font-serif text-lg font-semibold">{sig2(eq(reaclib), lang)}</dd>
            {rBase !== null && (
              <dd className="tabular text-[0.7rem] text-muted-foreground">
                {l.burn}: {sig2(rBase, lang)}
              </dd>
            )}
          </div>
          <div
            className={`rounded-md border px-2.5 py-1.5 ${on ? "border-[var(--rates-changed)]" : "border-border"}`}
          >
            <dt className="text-xs text-muted-foreground">{l.lunaWord}</dt>
            <dd className="tabular font-serif text-lg font-semibold">{sig2(eq(luna), lang)}</dd>
            {on && rLuna !== null && (
              <dd className="tabular text-[0.7rem] text-muted-foreground">
                {l.burn}: {sig2(rLuna, lang)}
              </dd>
            )}
          </div>
          <p className="col-span-2 text-[0.7rem] leading-snug text-muted-foreground">
            <Sci>{l.ratioHint}</Sci>
          </p>
        </dl>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {l.evaluations}:{" "}
        {evals.map((r, k) => (
          <span key={r.id}>
            {k > 0 && " · "}
            <Link
              href={localePath(lang, `/evaluations/${r.alternatives![0].evaluation}`)}
              className="text-link underline-offset-4 hover:underline"
            >
              <Sci>{r.label}</Sci>
            </Link>{" "}
            (
            <a
              href={`https://doi.org/${r.alternatives![0].fit.doi}`}
              target="_blank"
              rel="noreferrer"
              className="text-link underline-offset-4 hover:underline"
            >
              {r.alternatives![0].fit.journal}
            </a>
            )
          </span>
        ))}
        {alt && (
          <>
            {" · "}
            <a
              href={`https://doi.org/${alt.paper.doi}`}
              target="_blank"
              rel="noreferrer"
              className="text-link underline-offset-4 hover:underline"
            >
              LUNA: {alt.paper.journal}
            </a>
          </>
        )}
      </p>
      <p className="mt-1 text-[0.7rem] leading-snug text-muted-foreground">
        <Sci>{l.method}</Sci>
      </p>
    </section>
  )
}
