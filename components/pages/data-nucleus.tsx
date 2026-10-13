import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Attribution } from "@/components/data/attribution"
import { NucleusView, type NucleusEntrance } from "@/components/data/nucleus-view"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Sci } from "@/components/sci"
import { getReaction } from "@/lib/atlas"
import {
  atlasReactions,
  atlasWindows,
  channelOf,
  compoundNuclei,
  evaluationLinks,
  gapRows,
  prerenderedSlugs,
  reactionsInto,
  readEnsdf,
  readIndex,
} from "@/lib/data/build"
import { fill } from "@/lib/data/fill"
import { energy } from "@/lib/data/format"
import { GROUPS, GROUP_SYMBOL, type Group } from "@/lib/data/quantity"
import { rowGroup } from "@/lib/data/gap"
import { displayNuc, parseKey, reactionLabel } from "@/lib/data/nuclide"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const dataNucleusParams = () => [...compoundNuclei().keys()].map((nuclide) => ({ nuclide }))

export function dataNucleusMetadata(nuclide: string, lang: Lang): Metadata {
  const dx = dict(lang).dataExpert
  return pageMetadata(`${displayNuc(nuclide)} · ${dx.name}`, fill(dx.nucleus.channelsIntro, { cn: displayNuc(nuclide) }), lang)
}

/** /data/nucleus/<nuclide>: a compound nucleus, its channels, levels and resonances. */
export function DataNucleusPage({ nuclide, lang }: { nuclide: string; lang: Lang }) {
  const entrances = compoundNuclei(lang).get(nuclide)
  if (!entrances) notFound()
  const ensdf = readEnsdf(nuclide)
  const t = dict(lang)
  const dx = t.dataExpert
  const to = (p: string) => localePath(lang, p)
  const cn = displayNuc(nuclide)
  const idx = readIndex()
  const pre = new Set(prerenderedSlugs())
  const href = (slug: string) => (pre.has(slug) ? to(`/data/reaction/${slug}`) : `${to("/data/reaction")}?r=${encodeURIComponent(slug)}`)
  const evals = evaluationLinks()

  /* -- channel matrix -- */
  const rs = reactionsInto(nuclide)
  const atlasKeys = new Set(entrances.map((e) => e.key).filter((k): k is string => Boolean(k)))
  const perReaction = new Map(rs.map((r) => [r, gapRows(idx, [r])]))
  const allRows = [...perReaction.values()].flat()
  const matrix = rs
    .map((r) => {
      const key = idx.reactions.key[r]
      const rows = perReaction.get(r) ?? []
      const cells = new Map<Group, { n: number; lo: number; hi: number }>()
      for (const x of rows) {
        const g = rowGroup(x)
        const lo = g === "macs" ? x.k0 : x.e0
        const hi = g === "macs" ? x.k1 : x.e1
        const c = cells.get(g) ?? { n: 0, lo: Infinity, hi: -Infinity }
        c.n++
        if (lo !== null && lo > 0) c.lo = Math.min(c.lo, lo * 1000)
        if (hi !== null && hi > 0) c.hi = Math.max(c.hi, hi * 1000)
        cells.set(g, c)
      }
      const k = parseKey(key)!
      return {
        key,
        slug: idx.reactions.slug[r],
        n: idx.reactions.n[r],
        cells,
        entrance: `${k.projectile}+${k.target}`,
        evals: evals.filter((e) => e.reactions.includes(key)).map((e) => e.id),
      }
    })
    // the atlas' own entrance reactions first, then by number of datasets
    .sort((a, b) => Number(atlasKeys.has(b.key)) - Number(atlasKeys.has(a.key)) || b.n - a.n || a.key.localeCompare(b.key))
  // light projectiles first (the channels of an R-matrix fit); heavy-ion reactions on request
  const LIGHT = new Set(["n", "p", "d", "t", "3He", "a", "g"])
  // ...and a single outgoing particle (or elastic/inelastic): the two-body channels
  const twoBody = (key: string) => {
    const k = parseKey(key)!
    return LIGHT.has(k.projectile) && (["el", "inl", "g"].includes(k.process) || /^(n|p|d|t|3He|a|\d+[A-Z][a-z]?)$/.test(k.process))
  }
  const light = matrix.filter((m) => twoBody(m.key))
  const heavy = matrix.filter((m) => !twoBody(m.key))
  const groups = GROUPS.filter((g) => matrix.some((m) => m.cells.has(g)))

  /* -- entrances, with their windows -- */
  const ents: NucleusEntrance[] = entrances.map((e) => {
    const r = getReaction(e.atlas, lang)!
    const rIdx = atlasReactions(e.atlas)
    const rows = gapRows(idx, rIdx)
    const ch = e.key ? channelOf(e.key) : null
    const windows = atlasWindows(r, rows, ch).map((w) => ({ label: w.label, T9: w.T9, E0: w.E0, lo: w.lo, hi: w.hi }))
    return {
      atlas: e.atlas,
      label: e.label,
      key: e.key,
      slug: e.key ? idx.reactions.slug[idx.reactions.key.indexOf(e.key)] : null,
      S: (e.separation ?? 0) * 1000,
      particle: e.projectile,
      windows,
    }
  })

  function MatrixTable({ rows, caption }: { rows: typeof matrix; caption: string }) {
    return (
      <div className="relative mt-5 overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label={caption}>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-card text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                {dx.nucleus.reaction}
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
                {dx.nucleus.total}
              </th>
              {groups.map((g) => (
                <th key={g} scope="col" className="whitespace-nowrap px-3 py-2 font-medium" title={dx.quantityShort[g]}>
                  {g === "other" ? dx.quantityShort.other : GROUP_SYMBOL[g]}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 font-medium">
                {dx.nucleus.usedBy}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.key} className="border-t border-border/60">
                <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-normal">
                  <Link href={href(m.slug)} className="font-medium text-link underline-offset-4 hover:underline">
                    <Sci>{reactionLabel(m.key)}</Sci>
                  </Link>
                </th>
                <td className="px-3 py-2 text-right tabular">{m.n}</td>
                {groups.map((g) => {
                  const c = m.cells.get(g)
                  return (
                    <td key={g} className="px-3 py-2 align-top">
                      {c ? (
                        <span className="block min-w-[5.5rem]">
                          <span className="font-medium tabular">{c.n}</span>
                          {Number.isFinite(c.lo) && (
                            <span className="block whitespace-nowrap text-xs text-muted-foreground tabular">
                              {energy(c.lo, lang, 2)}
                              {energy(c.hi, lang, 2) !== energy(c.lo, lang, 2) ? ` – ${energy(c.hi, lang, 2)}` : ""}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">
                          {dx.nucleus.noData}
                          <span className="sr-only"> (0)</span>
                        </span>
                      )}
                    </td>
                  )
                })}
                <td className="px-3 py-2">
                  {m.evals.map((id) => (
                    <Link
                      key={id}
                      href={to(`/evaluations/${id}`)}
                      className="mr-1 inline-flex items-center rounded-full border border-[var(--viz-series-2)] px-2 text-xs font-medium hover:bg-accent"
                    >
                      {id}
                    </Link>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  const pairs = [
    ...new Set(
      entrances.map(
        (e) => `${displayNuc(e.target)} + ${displayNuc(e.projectile === "4He" ? "a" : e.projectile === "1H" ? "p" : e.projectile)}`,
      ),
    ),
  ]

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 [overflow-wrap:anywhere] sm:px-8 xl:max-w-7xl">
      <Breadcrumbs
        label={t.nav.breadcrumb}
        items={[{ label: t.nav.home, href: to("/") }, { label: dx.name, href: to("/data") }, { label: cn }]}
      />
      <header className="mt-8 border-b border-border/70 pb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{dx.nucleus.eyebrow}</p>
        <h1 className="mt-3 font-serif text-[min(2.25rem,11vw)] font-semibold leading-tight tracking-tight sm:text-5xl">
          <Sci>{cn}</Sci>
        </h1>
        <p className="mt-3 max-w-prose text-pretty text-lg leading-snug text-muted-foreground">
          <Sci>{fill(dx.nucleus.intro, { cn, pairs: pairs.join(lang === "it" ? " o " : " or ") })}</Sci>
        </p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {entrances.map((e) => (
            <li key={e.atlas}>
              <Link
                href={to(`/atlas/${e.atlas}`)}
                className="inline-flex min-h-10 items-center rounded-md border border-border bg-card px-3.5 py-2 font-serif text-[0.95rem] font-semibold transition-colors hover:border-foreground/30 hover:text-link"
              >
                <Sci>{e.label}</Sci>
              </Link>
            </li>
          ))}
        </ul>
      </header>

      {/* -- channel matrix -- */}
      <section className="mt-12" aria-labelledby="channels">
        <h2 id="channels" className="font-serif text-2xl font-semibold tracking-tight">
          {dx.nucleus.channels}
        </h2>
        <p className="mt-3 max-w-prose text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
          <Sci>{fill(dx.nucleus.channelsIntro, { cn })}</Sci>
        </p>
        <MatrixTable rows={light} caption={fill(dx.nucleus.channelsIntro, { cn })} />
        {heavy.length > 0 && (
          <details className="mt-3">
            <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm text-link">
              {fill(dx.nucleus.heavy, { n: heavy.length })}
            </summary>
            <MatrixTable rows={heavy} caption={fill(dx.nucleus.heavy, { n: heavy.length })} />
          </details>
        )}
      </section>

      {ensdf?.ensdf ? (
        <NucleusView
          strings={dx}
          lang={lang}
          nuclide={nuclide}
          levels={ensdf.ensdf.levels}
          separation={ensdf.separation}
          entrances={ents}
        />
      ) : (
        <p className="mt-12 text-muted-foreground">{dx.nucleus.noEnsdf}</p>
      )}

      <Attribution
        lang={lang}
        entries={allRows.map((r) => r.id.split(".")[0])}
        ensdf={
          ensdf?.ensdf
            ? {
                nuclide: cn,
                citation: `${ensdf.ensdf.evaluation.authors}, ${ensdf.ensdf.evaluation.citation}`,
                cutoff: ensdf.ensdf.evaluation.cutoff,
              }
            : null
        }
        className="mt-14"
      />
    </div>
  )
}
