import type { Metadata } from "next"

import { Attribution } from "@/components/data/attribution"
import { SearchView } from "@/components/data/search-view"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { levelsWithoutStrength, prerenderedSlugs } from "@/lib/data/build"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export function dataSearchMetadata(lang: Lang): Metadata {
  const dx = dict(lang).dataExpert
  return pageMetadata(`${dx.search.title} · ${dx.name}`, dx.search.intro, lang)
}

/** /data/search: expert discovery filters over the EXFOR index (no ranking). */
export function DataSearchPage({ lang }: { lang: Lang }) {
  const t = dict(lang)
  const dx = t.dataExpert
  return (
    <div className="mx-auto max-w-6xl px-5 py-14 [overflow-wrap:anywhere] sm:px-8 xl:max-w-7xl">
      <Breadcrumbs
        label={t.nav.breadcrumb}
        items={[
          { label: t.nav.home, href: localePath(lang, "/") },
          { label: dx.name, href: localePath(lang, "/data") },
          { label: dx.search.title },
        ]}
      />
      <header className="mt-8 border-b border-border/70 pb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{dx.search.eyebrow}</p>
        <h1 className="mt-3 font-serif text-[min(2.25rem,11vw)] font-semibold leading-tight tracking-tight sm:text-5xl">
          {dx.search.title}
        </h1>
        <p className="mt-3 max-w-prose text-pretty text-lg leading-snug text-muted-foreground">{dx.search.intro}</p>
      </header>
      <SearchView strings={dx} lang={lang} prerendered={prerenderedSlugs()} levelsNoWg={levelsWithoutStrength(lang)} />
      <Attribution lang={lang} className="mt-14" />
    </div>
  )
}
