import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Attribution } from "@/components/data/attribution"
import { MeasurementsPanel, PanelLink } from "@/components/data/measurements-panel"
import { ReactionExplorer } from "@/components/data/reaction-explorer"
import { GenericReaction } from "@/components/data/generic-reaction"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Sci } from "@/components/sci"
import { getReaction } from "@/lib/atlas"
import { compoundNuclei, evaluationLinks, prerenderedSlugs, readIndex } from "@/lib/data/build"
import { fill } from "@/lib/data/fill"
import { compoundOf, displayNuc, reactionLabel } from "@/lib/data/nuclide"
import { slugPanel } from "@/lib/data/panel"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const dataReactionParams = () => prerenderedSlugs().map((slug) => ({ slug }))

export function dataReactionMetadata(slug: string, lang: Lang): Metadata {
  const idx = readIndex()
  const r = idx.reactions.slug.indexOf(slug)
  if (r < 0) return {}
  const dx = dict(lang).dataExpert
  const label = reactionLabel(idx.reactions.key[r])
  return pageMetadata(`${label} · ${dx.name}`, fill(dx.reaction.intro, { n: idx.reactions.n[r] }), lang)
}

function Crumbs({ lang, label }: { lang: Lang; label: string }) {
  const t = dict(lang)
  return (
    <Breadcrumbs
      label={t.nav.breadcrumb}
      items={[{ label: t.nav.home, href: localePath(lang, "/") }, { label: t.dataExpert.name, href: localePath(lang, "/data") }, { label }]}
    />
  )
}

/** /data/reaction/<slug>: one reaction's EXFOR data for an expert. */
export function DataReactionPage({ slug, lang }: { slug: string; lang: Lang }) {
  const panel = slugPanel(slug, lang)
  if (!panel) notFound()
  const dx = dict(lang).dataExpert
  const to = (p: string) => localePath(lang, p)
  const idx = readIndex()
  const r = idx.reactions.slug.indexOf(slug)
  const key = idx.reactions.key[r]
  const label = reactionLabel(key)
  const atlas = idx.reactions.atlas[r].map((id) => getReaction(id, lang)).filter((x) => x !== undefined)
  const cn = compoundOf(key)
  const cnPage = cn && compoundNuclei(lang).has(cn) ? cn : null
  const evals = evaluationLinks().filter((e) => e.reactions.includes(key))
  const ch = panel.channel
  const w0 = panel.windows[0]

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 [overflow-wrap:anywhere] sm:px-8 xl:max-w-7xl">
      <Crumbs lang={lang} label={label} />
      <header className="mt-8 border-b border-border/70 pb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{dx.reaction.eyebrow}</p>
        <h1 className="mt-3 font-serif text-[min(2.25rem,11vw)] font-semibold leading-tight tracking-tight sm:text-5xl">
          <Sci>{label}</Sci>
        </h1>
        <p className="mt-3 max-w-prose text-pretty text-lg leading-snug text-muted-foreground">
          {fill(dx.reaction.intro, { n: idx.reactions.n[r] })}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {atlas.map((a) => (
            <PanelLink key={a!.id} href={to(`/atlas/${a!.id}`)}>
              {dx.reaction.atlasLink} · <Sci>{a!.label}</Sci>
            </PanelLink>
          ))}
          {cnPage && (
            <PanelLink href={to(`/data/nucleus/${cnPage}`)}>
              <Sci>{fill(dx.reaction.nucleusLink, { cn: displayNuc(cnPage) })}</Sci>
            </PanelLink>
          )}
          <PanelLink href={to("/data/search")}>{dx.reaction.searchLink}</PanelLink>
        </div>
      </header>

      <div className="mt-10">
        <MeasurementsPanel
          strings={dx}
          lang={lang}
          rows={panel.rows}
          windows={panel.windows}
          lowest={panel.lowest}
          counts={panel.counts}
          macs={panel.macs}
          threshold={panel.threshold}
          neutron={panel.neutron}
          id="gap"
          title={dx.reaction.windowsTitle}
        />
      </div>

      <div className="mt-14">
        <ReactionExplorer
          slug={slug}
          strings={dx}
          lang={lang}
          channel={ch ? { z1: ch.z1, z2: ch.z2, mu: ch.mu } : null}
          evaluations={evals.map((e) => ({ id: e.id, reactions: e.reactions, entries: e.entries, subentries: e.subentries, dois: e.dois }))}
          window={w0 && !panel.neutron ? { lo: w0.lo, hi: w0.hi, E0: w0.E0, label: w0.label } : null}
        />
      </div>

      <Attribution lang={lang} entries={panel.entries} className="mt-14" />
    </div>
  )
}

/** /data/reaction?r=<slug>: any reaction of the index, built in the browser from its shard. */
export function DataReactionAnyPage({ lang }: { lang: Lang }) {
  const dx = dict(lang).dataExpert
  return (
    <div className="mx-auto max-w-6xl px-5 py-14 [overflow-wrap:anywhere] sm:px-8 xl:max-w-7xl">
      <Crumbs lang={lang} label={dx.reaction.crumb} />
      <GenericReaction
        strings={dx}
        lang={lang}
        prerendered={prerenderedSlugs()}
        evaluations={evaluationLinks().map((e) => ({
          id: e.id,
          reactions: e.reactions,
          entries: e.entries,
          subentries: e.subentries,
          dois: e.dois,
        }))}
      />
      <Attribution lang={lang} className="mt-14" />
    </div>
  )
}
