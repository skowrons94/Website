import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, ChevronRight, Download } from "lucide-react"

import { ArrowKey, ChartDiagram } from "@/components/atlas/chart-diagram"
import { LunaFigure } from "@/components/atlas/luna-figure"
import { NetworkMap } from "@/components/atlas/network-map"
import { SiteUrl } from "@/components/atlas/site-url"
import { LunaBadge } from "@/components/atlas/status-badge"
import { Sci } from "@/components/sci"
import { getAtlas, getMapData } from "@/lib/atlas"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const atlasMetadata = (lang: Lang): Metadata =>
  pageMetadata(dict(lang).atlas.name, dict(lang).atlas.description, lang)

/** `2004–2011`, `2006`, or nothing. */
function span(years: number[]): string {
  if (years.length === 0) return ""
  const first = years[0]
  const last = years[years.length - 1]
  return first === last ? String(first) : `${first}–${last}`
}

export function AtlasPage({ lang }: { lang: Lang }) {
  const atlas = getAtlas(lang)
  const map = getMapData(lang)
  const t = dict(lang).atlas
  const to = (path: string) => localePath(lang, path)
  const luna = atlas.reactions.filter((r) => r.luna)
  const written = atlas.reactions.filter((r) => r.hasFile).length
  const meta = atlas.meta
  const highlights = atlas.timeline.filter((e) => e.highlight).length
  // Where a newcomer should start: the short version of the timeline. In the
  // header beside the title on a wide screen; under the map on a phone, so
  // the map starts high on the page.
  const startHere = (className: string) => (
    <Link
      href={to(highlights > 0 ? "/atlas/timeline?only=highlights" : "/atlas/timeline")}
      className={`group block rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/30 ${className}`}
    >
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-link">{t.startHere}</p>
      <p className="mt-1.5 font-serif text-lg font-semibold leading-snug tracking-tight group-hover:text-link">
        {t.startHereTitle(highlights > 0 ? highlights : atlas.timeline.length)}
      </p>
      <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
        {t.startHereText(atlas.timeline.length)}
      </p>
      <ArrowRight className="mt-3 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 xl:max-w-7xl">
      {/* -- title, and where a newcomer should start ------------------------- */}
      <header className="border-b border-border/70 pb-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-end lg:gap-16">
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t.name}
          </p>
          <h1 className="text-balance font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {t.title}
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground">
            {t.description}
          </p>
          <nav className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <Link href={to("/atlas/methods")} className="inline-flex min-h-8 items-center text-link underline-offset-4 hover:underline">
              {t.methodsLink}
            </Link>
            <Link href={to("/glossary")} className="inline-flex min-h-8 items-center text-link underline-offset-4 hover:underline">
              {t.glossaryLink}
            </Link>
            <a href="#cite" className="inline-flex min-h-8 items-center text-link underline-offset-4 hover:underline">
              {t.citeTitle}
            </a>
          </nav>
        </div>
        {startHere("hidden lg:block")}
      </header>

      {/* -- how to read the map, folded ------------------------------------- */}
      <details className="group mt-6 rounded-lg border border-border/80">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 font-medium transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
          {t.howToRead}
        </summary>
        <div className="grid gap-8 px-4 pb-6 pt-2 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:gap-10">
          <ChartDiagram lang={lang} />
          <div className="space-y-5 text-[0.975rem] leading-relaxed">
            <ul className="space-y-2.5">
              {t.readSteps.map((step, i) => (
                <li key={i} className="flex gap-3 text-pretty">
                  <span className="tabular w-4 shrink-0 text-sm text-muted-foreground">{i + 1}.</span>
                  <span>
                    <Sci>{step}</Sci>
                  </span>
                </li>
              ))}
            </ul>
            <div className="rounded-md bg-secondary/60 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t.notationTitle}</p>
              <p className="mt-1.5 text-pretty">
                <span className="font-serif font-semibold">
                  <Sci>¹⁴N(p,γ)¹⁵O</Sci>
                </span>{" "}
                {t.notation[0]}{" "}
                <span className="whitespace-nowrap font-serif font-semibold">{t.notation[1]}</span>.{" "}
                <Link href={to("/glossary#notation")} className="text-link underline-offset-4 hover:underline">
                  {t.moreInGlossary}
                </Link>
              </p>
            </div>
            <ArrowKey lang={lang} />
          </div>
        </div>
      </details>

      {/* -- the map ------------------------------------------------------- */}
      <section className="pt-8" aria-label={t.mapLabel}>
        <NetworkMap data={map} />
      </section>

      {startHere("mt-10 lg:hidden")}

      {/* -- the primer: why, and why underground ---------------------------- */}
      <section className="mt-16 border-t border-border/70 pt-10" aria-labelledby="primer-heading">
        <h2 id="primer-heading" className="max-w-3xl text-balance font-serif text-2xl font-semibold tracking-tight">
          {t.primerTitle}
        </h2>
        <div className="mt-5 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
          <div className="max-w-3xl space-y-4 text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground">
            {lang === "it" ? <IntroIt /> : <IntroEn />}
          </div>
          <LunaFigure lang={lang} className="lg:sticky lg:top-24" />
        </div>
      </section>

      {/* -- LUNA ---------------------------------------------------------- */}
      {luna.length > 0 && (
        <section className="mt-16 border-t border-border/70 pt-10" aria-labelledby="luna-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 id="luna-heading" className="font-serif text-2xl font-semibold tracking-tight">
              {t.lunaTitle}
            </h2>
            <span className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <Link href={to("/atlas/timeline?only=luna")} className="inline-flex min-h-8 items-center text-link underline-offset-4 hover:underline">
                {t.lunaOnTimeline}
              </Link>
              <Link href={to("/research#luna")} className="inline-flex min-h-8 items-center text-link underline-offset-4 hover:underline">
                {t.myLuna}
              </Link>
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-pretty leading-relaxed text-muted-foreground">
            {t.lunaText}
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {luna.map((r) => (
              <li key={r.id}>
                <Link
                  href={to(`/atlas/${r.id}`)}
                  className="group inline-flex items-baseline gap-2 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:border-foreground/30"
                >
                  <span className="font-serif text-[0.95rem] font-semibold group-hover:text-link">
                    <Sci>{r.label}</Sci>
                  </span>
                  {r.lunaYears.length > 0 && (
                    <span className="tabular text-xs text-muted-foreground">{span(r.lunaYears)}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* -- further ------------------------------------------------------- */}
      <section className="mt-16 grid gap-6 border-t border-border/70 pt-10 sm:grid-cols-2 lg:grid-cols-3">
        <Link href={to("/atlas/timeline")} className="group block rounded-lg border border-border bg-card p-6">
          <h2 className="font-serif text-lg font-semibold tracking-tight group-hover:text-link">{t.timelineCard}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.timelineCardText}</p>
          <ArrowRight className="mt-4 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link href={to("/atlas/methods")} className="group block rounded-lg border border-border bg-card p-6">
          <h2 className="font-serif text-lg font-semibold tracking-tight group-hover:text-link">
            {t.methodsCard}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.methodsCardText}</p>
          <ArrowRight className="mt-4 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
        <a
          href={`${process.env.BASE_PATH ?? ""}/atlas/data.json`}
          download
          className="group block rounded-lg border border-border bg-card p-6 sm:col-span-2 lg:col-span-1"
        >
          <h2 className="font-serif text-lg font-semibold tracking-tight group-hover:text-link">{t.dataCard}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t.dataCardText(atlas.reactions.length, written, Object.keys(atlas.references).length)}
            {t.dataInEnglish && ` ${t.dataInEnglish}`}
          </p>
          <Download className="mt-4 h-4 w-4 text-muted-foreground" />
        </a>
      </section>

      {/* -- how to cite ------------------------------------------------------ */}
      <section id="cite" className="mt-10 scroll-mt-24 rounded-lg border border-border p-6" aria-labelledby="cite-heading">
        <h2 id="cite-heading" className="font-serif text-lg font-semibold tracking-tight">
          {t.citeTitle}
        </h2>
        <p className="mt-3 break-words rounded-md bg-secondary/60 px-4 py-3 font-mono text-[0.8125rem] leading-relaxed">
          {meta.author}, <i>{meta.title}</i>
          {meta.version && `, ${t.citeVersion} ${meta.version}`}, <SiteUrl path="/atlas" lang={lang} fixed={meta.url} />.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{t.citeAccessed}</p>
        {meta.licence && (
          <p className="mt-4 text-pretty text-sm leading-relaxed text-muted-foreground">
            {t.licence(meta.licence)}{" "}
            {meta.licenceUrl && (
              <a href={meta.licenceUrl} target="_blank" rel="license noreferrer" className="text-link underline-offset-4 hover:underline">
                {t.licenceLink}: {meta.licence}
              </a>
            )}
          </p>
        )}
      </section>

      <p className="mt-8 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <LunaBadge /> {t.lunaMarks}
      </p>
    </div>
  )
}

/* -- the introduction, in each language ------------------------------------- */

function IntroEn() {
  return (
    <>
      <p>
        Stars shine because light nuclei fuse into heavier ones. Fusion in stars made most of the
        elements from carbon up to iron; most of those beyond iron were made instead by neutron
        captures, slow ones mainly in red giants and rapid ones in stellar explosions and neutron-star
        mergers. To model a star, or to read the composition of an old one, we need to
        know how fast each of these reactions runs at the temperature inside it.
      </p>
      <p>
        That rate is hard to measure. Nuclei repel each other electrically, and at stellar temperatures
        they have far too little energy to overcome the repulsion. They fuse only by quantum tunnelling,
        and only within a narrow band of energies, the Gamow window, where the nuclei are fast enough
        and still numerous enough. In the Sun the window for <Sci>¹⁴N + p</Sci> lies near 27 keV
        (a keV, a kilo-electronvolt, is the energy an electron gains across 1000 volts). The chance that
        a reaction happens is measured by its cross section, an effective target area. At 70 keV, the lowest
        energy at which this reaction has been measured, the cross section is 0.24 picobarn, or
        2.4 × 10<sup>−37</sup> cm².
      </p>
      <p>
        Even an intense beam then produces only a trickle of reactions, and at the surface of the Earth
        cosmic rays make far more counts than that in any γ-ray detector.
        In the early 1990s the LUNA collaboration therefore moved its accelerator under the Gran Sasso
        mountain in Italy, where 1400 m of rock reduce the cosmic-ray muons by about a factor of a
        million. Several reactions of the pp chains and the CNO cycles have since been measured there
        at, or close to, the energies at which the Sun runs them.
      </p>
      <p>
        Each reaction turns one nucleus into another, and in a star they link up into chains and
        cycles: a reaction network. This atlas collects the reactions that matter most. For each it
        says what the reaction does, why it matters, how it has been measured and what is still
        uncertain. The map places them on the chart of nuclides, with protons counted upwards and
        neutrons across; pick a process to follow its path.
      </p>
    </>
  )
}

function IntroIt() {
  return (
    <>
      <p>
        Le stelle brillano perché i nuclei leggeri si fondono in nuclei più pesanti. La fusione nelle
        stelle ha prodotto la maggior parte degli elementi dal carbonio al ferro; quasi tutti quelli più
        pesanti del ferro sono nati invece da catture di neutroni, lente soprattutto nelle giganti rosse e rapide
        nelle esplosioni stellari e nelle fusioni di stelle di neutroni. Per costruire il modello di una stella, o per
        interpretare la composizione di una stella antica, dobbiamo sapere con quale rapidità avviene
        ciascuna di queste reazioni alla temperatura che c'è al suo interno: il suo tasso di reazione.
      </p>
      <p>
        Questo tasso è difficile da misurare. I nuclei si respingono per via della loro carica
        elettrica, e alle temperature stellari hanno troppa poca energia per vincere la repulsione. Si
        fondono solo per effetto tunnel quantistico, e solo in una stretta banda di energie, la finestra di
        Gamow, dove i nuclei sono abbastanza veloci e ancora abbastanza numerosi. Nel Sole la finestra per{" "}
        <Sci>¹⁴N + p</Sci> si trova intorno a 27 keV (un keV, un chiloelettronvolt, è l'energia che un
        elettrone acquista attraversando una differenza di potenziale di 1000 volt). La probabilità che
        una reazione avvenga si misura con la sua sezione d'urto, un'area efficace del bersaglio. A 70 keV,
        l'energia più bassa a cui questa reazione è stata misurata, la sezione d'urto è di 0,24 picobarn,
        cioè 2,4 × 10<sup>−37</sup> cm².
      </p>
      <p>
        Anche un fascio intenso produce allora solo una manciata di reazioni, e sulla superficie della Terra
        i raggi cosmici lasciano in qualunque rivelatore di raggi γ molti più conteggi di queste. All'inizio
        degli anni Novanta la collaborazione LUNA ha quindi portato il suo acceleratore nei Laboratori
        Nazionali del Gran Sasso, dove 1400 m di roccia riducono i muoni cosmici di circa un milione di
        volte. Da allora diverse reazioni delle catene protone-protone e dei cicli CNO sono state misurate in
        questo laboratorio sotterraneo alle energie a cui avvengono nel Sole, o molto vicino.
      </p>
      <p>
        Ogni reazione trasforma un nucleo in un altro, e in una stella le reazioni si collegano in catene e
        cicli: una rete di reazioni. Questo atlante raccoglie le reazioni più importanti. Per ciascuna spiega
        che cosa fa la reazione, perché conta, come è stata misurata e che cosa è ancora incerto. La mappa le
        colloca sulla carta dei nuclidi, con i protoni contati verso l'alto e i neutroni in orizzontale;
        scegli un processo per seguirne il percorso.
      </p>
    </>
  )
}
