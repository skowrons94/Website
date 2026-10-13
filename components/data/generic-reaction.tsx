"use client"

import { useEffect, useMemo, useState } from "react"

import { MeasurementsPanel } from "@/components/data/measurements-panel"
import { ReactionExplorer } from "@/components/data/reaction-explorer"
import { Sci } from "@/components/sci"
import { NotBuilt, loadMasses, loadShard } from "@/lib/data/client"
import type { MassTable } from "@/lib/data/export"
import { fill } from "@/lib/data/fill"
import { years } from "@/lib/data/format"
import { K_T9_KEV, lowestMeasured, windowsAt, type ChannelLite } from "@/lib/data/gap"
import { mapRows } from "@/lib/data/map-rows"
import { compoundOf, nucCode, parseKey, parseNuc, reactionLabel } from "@/lib/data/nuclide"
import { rowGroup } from "@/lib/data/gap"
import { tableRows, type EvalLink } from "@/lib/data/shard-rows"
import type { Shard } from "@/lib/data/types"
import type { DataExpertStrings } from "@/lib/i18n"
import { localePath, type Lang } from "@/lib/locale"

const AMU = 931.49410242
const TEMPS = [0.015, 0.05, 0.1, 0.3, 1, 3].map((T9) => ({ label: `T₉ = ${T9}`, T9 }))
const TEMPS_N = [8, 25, 30, 90].map((kT) => ({ label: `kT = ${kT} keV`, T9: kT / K_T9_KEV }))

/** Z₁, Z₂, μ (AME2020) and the threshold of a reaction key, in the browser. */
export function channelFromKey(key: string, masses: MassTable): ChannelLite | null {
  const k = parseKey(key)
  if (!k) return null
  const t = parseNuc(k.target)
  const p = parseNuc(k.projectile)
  if (!t || !p || t.A === 0 || p.A === 0) return null
  const u = (A: number, Z: number) => {
    const d = masses(A, Z)
    return d === null ? A : A + d / AMU
  }
  const m1 = u(t.A, t.Z)
  const m2 = u(p.A, p.Z)
  let threshold = 0
  const e = parseNuc(k.process)
  const c = compoundOf(key)
  if (e && c && e.A > 0) {
    const cn = parseNuc(c)!
    const rA = cn.A - e.A
    const rZ = cn.Z - e.Z
    const d = [masses(t.A, t.Z), masses(p.A, p.Z), masses(rA, rZ), masses(e.A, e.Z)]
    if (rA > 0 && rZ >= 0 && d.every((x) => x !== null)) {
      const q = (d[0]! + d[1]! - d[2]! - d[3]!) * 1000
      if (q < 0) threshold = -q
    }
    void nucCode
  }
  return { z1: p.Z, z2: t.Z, mu: (m1 * m2) / (m1 + m2), threshold }
}

/**
 * /data/reaction?r=<slug>: a reaction outside the pre-rendered set (every
 * reaction of the index has a shard), with the gap map at standard
 * temperatures, built here from the shard.
 */
export function GenericReaction({
  strings,
  lang,
  prerendered,
  evaluations,
}: {
  strings: DataExpertStrings
  lang: Lang
  prerendered: string[]
  evaluations: EvalLink[]
}) {
  const [slug, setSlug] = useState<string | null>(null)
  const [shard, setShard] = useState<Shard | null>(null)
  const [masses, setMasses] = useState<MassTable | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("r")
    if (!r) {
      // nothing to show without ?r=: the search lists every reaction
      const base = process.env.BASE_PATH ?? ""
      const slash = process.env.TRAILING_SLASH ? "/" : ""
      window.location.replace(`${base}${localePath(lang, "/data/search")}${slash}`)
      return
    }
    if (prerendered.includes(r)) {
      const base = process.env.BASE_PATH ?? ""
      const slash = process.env.TRAILING_SLASH ? "/" : ""
      window.location.replace(`${base}${localePath(lang, `/data/reaction/${r}`)}${slash}`)
      return
    }
    setSlug(r)
    loadShard(r).then(
      ({ shard }) => setShard(shard),
      (e) => setError(e instanceof NotBuilt ? `${strings.reaction.notFound} ${strings.table.notBuilt}` : strings.table.failed),
    )
    // a mass table is a function: wrapped, or React would call it as an updater
    loadMasses().then(
      (m) => setMasses(() => m),
      () => setError(strings.table.failed),
    )
  }, [prerendered, lang, strings])

  const panel = useMemo(() => {
    if (!shard || !masses) return null
    const rows = tableRows(shard, evaluations).map((r) => r.gap)
    const ch = channelFromKey(shard.reaction.key, masses)
    const neutron = Boolean(ch && (ch.z1 === 0 || ch.z2 === 0))
    const windows = ch ? windowsAt(ch, rows, neutron ? TEMPS_N : TEMPS) : []
    const macs = rows.filter((r) => rowGroup(r) === "macs" && r.k0 !== null)
    const drawn = mapRows(rows)
    const entries = new Set(rows.map((r) => r.id.split(".")[0]))
    return {
      ch,
      neutron,
      windows,
      rows: drawn,
      lowest: lowestMeasured(rows),
      counts: fill(strings.panel.counts, { n: rows.length, e: entries.size, years: years(rows.map((r) => r.y)) }),
      macs: macs.length
        ? {
            n: macs.length,
            lo: Math.min(...macs.map((r) => r.k0 as number)) * 1000,
            hi: Math.max(...macs.map((r) => (r.k1 ?? r.k0) as number)) * 1000,
          }
        : null,
    }
  }, [shard, masses, evaluations, strings])

  if (error || !shard || !panel || !slug)
    return (
      <>
        <h1 className="mt-8 font-serif text-3xl font-semibold tracking-tight">{strings.reaction.anyTitle}</h1>
        {error ? (
          <p className="mt-6 rounded-lg border border-dashed border-border p-5 text-muted-foreground">{error}</p>
        ) : (
          <p className="mt-6 animate-pulse text-sm text-muted-foreground" role="status">
            {strings.table.loading}
          </p>
        )}
      </>
    )
  const label = reactionLabel(shard.reaction.key)
  const w0 = panel.windows[0]
  return (
    <>
      <header className="mt-8 border-b border-border/70 pb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{strings.reaction.eyebrow}</p>
        <h1 className="mt-3 font-serif text-[min(2.25rem,11vw)] font-semibold leading-tight tracking-tight sm:text-5xl">
          <Sci>{label}</Sci>
        </h1>
        <p className="mt-3 max-w-prose text-pretty text-lg leading-snug text-muted-foreground">
          {fill(strings.reaction.intro, { n: shard.datasets.length })}
        </p>
      </header>
      <div className="mt-10">
        <MeasurementsPanel
          strings={strings}
          lang={lang}
          rows={panel.rows}
          windows={panel.windows}
          lowest={panel.lowest}
          counts={panel.counts}
          macs={panel.macs}
          threshold={panel.ch && panel.ch.threshold > 0 ? panel.ch.threshold : null}
          neutron={panel.neutron}
          id="gap"
          title={strings.reaction.windowsTitle}
        />
      </div>
      <div className="mt-14">
        <ReactionExplorer
          slug={slug}
          strings={strings}
          lang={lang}
          channel={panel.ch ? { z1: panel.ch.z1, z2: panel.ch.z2, mu: panel.ch.mu } : null}
          evaluations={evaluations}
          window={w0 && !panel.neutron ? { lo: w0.lo, hi: w0.hi, E0: w0.E0, label: w0.label } : null}
        />
      </div>
    </>
  )
}
