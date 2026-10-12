"use client"

import { Sci } from "@/components/sci"
import type { Lang } from "@/lib/locale"
import { ratesDict } from "@/lib/rates/i18n"
import type { Network, Reaction } from "@/lib/rates/schema"
import { C, SERIES, useWidth } from "./chart-kit"
import { NB, sig2, temperature } from "./format"

const ALPHA = 1 / 137.035999
const AMU_KEV = 931494.1
const K_KEV = 86.17333 // keV per GK

/** The Gamow energy E_G = 2 μc² (π α Z₁Z₂)², keV, of a charged pair; null otherwise. */
export function gamowEnergy(network: Network, r: Reaction): number | null {
  if (r.reactants.length !== 2) return null
  const [a, b] = r.reactants.map((i) => network.nuclei[i])
  if (a.Z === 0 || b.Z === 0) return null
  const mu = ((a.A * b.A) / (a.A + b.A)) * AMU_KEV
  return 2 * mu * (Math.PI * ALPHA * a.Z * b.Z) ** 2
}

/** E₀ = (E_G (kT)²/4)^(1/3) and the 1/e width Δ = 4 (E₀ kT / 3)^(1/2), keV. */
export function gamowPeak(EG: number, T9: number): { E0: number; width: number; kT: number } {
  const kT = K_KEV * T9
  const E0 = Math.cbrt((EG * kT * kT) / 4)
  return { E0, width: 4 * Math.sqrt((E0 * kT) / 3), kT }
}

/**
 * The Gamow peak of one charged-particle reaction at the current
 * temperature: the Maxwell–Boltzmann factor e^(−E/kT), the tunnelling factor
 * e^(−√(E_G/E)) and their product, each scaled to its own maximum over the
 * window shown (non-resonant, s-wave; the shape, not the rate). It follows
 * the temperature handle of the rate chart.
 */
export function GamowPanel({
  network,
  reaction,
  slot,
  T9,
  lang,
}: {
  network: Network
  reaction: Reaction | null
  slot: number
  T9: number
  lang: Lang
}) {
  const t = ratesDict(lang)
  const [box, width, k] = useWidth<HTMLDivElement>(300)
  const EG = reaction ? gamowEnergy(network, reaction) : null
  if (!reaction || EG === null)
    return (
      <div ref={box} className="text-sm text-muted-foreground">
        {t.gamowNone}
      </div>
    )
  const { E0, width: dE, kT } = gamowPeak(EG, T9)
  const Emax = E0 + 2.2 * dE
  const height = 150
  const m = { l: 8, r: 8, t: 10, b: 30 }
  const N = 120
  const Es = Array.from({ length: N }, (_, i) => (Emax * (i + 0.5)) / N)
  const mb = Es.map((E) => Math.exp(-E / kT))
  const tun = Es.map((E) => Math.exp(-Math.sqrt(EG / E)))
  const prod = Es.map((_, i) => mb[i] * tun[i])
  const norm = (a: number[]) => {
    const mx = Math.max(...a)
    return a.map((v) => v / mx)
  }
  const px = (E: number) => m.l + (E / Emax) * (width - m.l - m.r)
  const py = (v: number) => height - m.b - v * (height - m.t - m.b)
  const path = (vs: number[]) =>
    vs.map((v, i) => `${i ? "L" : "M"}${px(Es[i]).toFixed(1)},${py(v).toFixed(1)}`).join("")
  const fmt = (e: number) => `${sig2(e, lang)}${NB}keV`
  const ticks = [0, E0, Emax].map((e) => Math.round(e))

  return (
    <div ref={box}>
      <p className="text-sm leading-relaxed text-muted-foreground">
        <Sci>{t.gamowLead(reaction.label)}</Sci>
      </p>
      <svg
        role="img"
        aria-label={t.gamowLabel(reaction.label, temperature(T9, lang))}
        width={width * k}
        height={height * k}
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 block"
      >
        <rect
          x={px(Math.max(0, E0 - dE / 2))}
          y={m.t}
          width={px(E0 + dE / 2) - px(Math.max(0, E0 - dE / 2))}
          height={height - m.t - m.b}
          fill={C.grid}
        />
        <text
          x={px(E0)}
          y={m.t + 11}
          textAnchor="middle"
          fontSize={10}
          fill={C.muted}
          stroke={C.surface}
          strokeWidth={3}
          paintOrder="stroke"
        >
          {t.gamowWindow}
        </text>
        <path d={path(norm(mb))} fill="none" stroke={C.base} strokeWidth={1.5} />
        <path d={path(norm(tun))} fill="none" stroke={C.base} strokeWidth={1.5} strokeDasharray="4 3" />
        <path
          d={`${path(norm(prod))}L${px(Es[N - 1])},${py(0)}L${px(Es[0])},${py(0)}Z`}
          fill={SERIES[slot] ?? C.ink}
          opacity={0.25}
        />
        <path d={path(norm(prod))} fill="none" stroke={SERIES[slot] ?? C.ink} strokeWidth={2.25} />
        <line x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} stroke={C.base} />
        {ticks.map((e, i) => (
          <text
            key={i}
            x={px(e)}
            y={height - m.b + 14}
            textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
            fontSize={10.5}
            fill={C.muted}
          >
            {e}
          </text>
        ))}
        <text x={width / 2} y={height - 3} textAnchor="middle" fontSize={11} fill={C.muted}>
          {t.gamowAxis}
        </text>
      </svg>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden>
            <line x1="1" x2="17" y1="4" y2="4" stroke={C.base} strokeWidth="1.5" />
          </svg>
          {t.gamowMB}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden>
            <line x1="1" x2="17" y1="4" y2="4" stroke={C.base} strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          {t.gamowTunnel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden>
            <line x1="1" x2="17" y1="4" y2="4" stroke={SERIES[slot] ?? C.ink} strokeWidth="2.25" />
          </svg>
          {t.gamowProduct}
        </span>
      </p>
      <p className="tabular mt-2 text-sm font-medium">
        <Sci>{t.gamowPeak(fmt(E0), fmt(dE / 2))}</Sci>
        <span className="font-normal text-muted-foreground"> · kT = {fmt(kT)}</span>
      </p>
    </div>
  )
}
