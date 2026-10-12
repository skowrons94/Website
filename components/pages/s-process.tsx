import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight, MoveHorizontal } from "lucide-react"

import { Cite, ReferenceList } from "@/components/atlas/reference-list"
import { SProcessInset, SProcessLegend, SProcessOverview, type Inset } from "@/components/atlas/s-process-chart"
import { LunaBadge, StatusBadge } from "@/components/atlas/status-badge"
import { Term } from "@/components/atlas/term"
import { Sci } from "@/components/sci"
import { getAtlas, getSProcessPath, type Reaction } from "@/lib/atlas"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

/**
 * The s-process, iron to lead: a page of its own, because its nuclei lie far
 * beyond the light-nuclei chart of the atlas map. The narrative is for a
 * general reader, in English and Italian; every factual statement carries a
 * numbered reference from content/atlas/references/s-process.yaml (or the
 * other reference files), checked as described there.
 */

const TEXT = {
  en: {
    eyebrow: "Reaction atlas",
    title: "The s-process: from iron to lead",
    description:
      "How slow neutron captures in giant stars build about half of the nuclei between iron and bismuth: the path on the chart of nuclides, its branch points, and how the captures are measured.",
    lead:
      "About half of the nuclei heavier than iron were built one neutron at a time, inside giant stars, over thousands of years. This page follows that path across the chart of nuclides, from iron to lead and bismuth.",
    back: "Reaction atlas",
    overviewTitle: "The path on the chart of nuclides",
    overviewLabel:
      "Chart of nuclides from iron (Z = 26) to bismuth (Z = 83), with the s-process path drawn as a line through the stable nuclei it visits, the closed neutron shells N = 50, 82 and 126 shaded, s-only nuclei highlighted and three regions marked A, B and C.",
    scrollHint: "Scroll sideways to follow the path",
    insetsTitle: "Three branch points, close up",
    reactionsTitle: "The reactions in the atlas",
    reactionsText:
      "The neutron sources, the poisons that compete with the seeds, and some of the captures along the path, each with its own entry.",
    references: "References",
    sources: "Sources",
    pathNote: (nodes: number, sOnly: number) =>
      `The path is computed by this site from the NUBASE2020 half-lives and AME2020 masses with one simple rule: a nucleus that lives longer than a year captures a neutron, one that lives less decays (by β⁻ where the masses allow, by electron capture otherwise), and at the classic branch points it does both. It visits ${nodes} nuclides; ${sOnly} stable nuclei on it are shielded from the r-process by a stable isobar. Real stellar half-lives and neutron densities move the branchings; the rule shows the shape, not the abundances.`,
  },
  it: {
    eyebrow: "Atlante delle reazioni",
    title: "Il processo s: dal ferro al piombo",
    description:
      "Come le catture lente di neutroni nelle stelle giganti costruiscono circa metà dei nuclei tra il ferro e il bismuto: il percorso sulla carta dei nuclidi, i suoi punti di diramazione e come si misurano le catture.",
    lead:
      "Circa metà dei nuclei più pesanti del ferro è stata costruita un neutrone alla volta, dentro stelle giganti, nel corso di migliaia di anni. Questa pagina segue quel percorso sulla carta dei nuclidi, dal ferro fino al piombo e al bismuto.",
    back: "Atlante delle reazioni",
    overviewTitle: "Il percorso sulla carta dei nuclidi",
    overviewLabel:
      "Carta dei nuclidi dal ferro (Z = 26) al bismuto (Z = 83), con il percorso del processo s tracciato come una linea attraverso i nuclei stabili che visita, i gusci di neutroni chiusi N = 50, 82 e 126 ombreggiati, i nuclei solo s evidenziati e tre regioni indicate con A, B e C.",
    scrollHint: "Scorri di lato per seguire il percorso",
    insetsTitle: "Tre punti di diramazione, da vicino",
    reactionsTitle: "Le reazioni nell'atlante",
    reactionsText:
      "Le sorgenti di neutroni, i veleni che competono con i semi e alcune delle catture lungo il percorso, ciascuna con la sua scheda.",
    references: "Bibliografia",
    sources: "Fonti",
    pathNote: (nodes: number, sOnly: number) =>
      `Il percorso è calcolato da questo sito dai tempi di dimezzamento di NUBASE2020 e dalle masse di AME2020 con una sola regola semplice: un nucleo che vive più di un anno cattura un neutrone, uno che vive meno decade (β⁻ dove le masse lo permettono, altrimenti per cattura elettronica), e nei classici punti di diramazione fa entrambe le cose. Visita ${nodes} nuclidi; ${sOnly} nuclei stabili lungo il percorso sono schermati dal processo r da un isobaro stabile. I tempi di dimezzamento stellari e le densità di neutroni reali spostano le diramazioni; la regola mostra la forma, non le abbondanze.`,
  },
} as const

const INSETS: Record<Lang, Inset[]> = {
  en: [
    { id: "branch-kr", letter: "A", z: [36, 38], n: [46, 51], label: "Inset A: krypton, rubidium and strontium around the N = 50 shell, with the branch points ⁸⁵Kr and ⁸⁶Rb" },
    { id: "branch-sm", letter: "B", z: [60, 64], n: [85, 90], label: "Inset B: neodymium to gadolinium, with the branch points ¹⁴⁷Nd, ¹⁴⁷Pm, ¹⁴⁸Pm and ¹⁵¹Sm and the s-only ¹⁴⁸Sm, ¹⁵⁰Sm and ¹⁵⁴Gd" },
    { id: "branch-lu", letter: "C", z: [70, 72], n: [103, 107], label: "Inset C: ytterbium, lutetium and hafnium, with the branch point ¹⁷⁶Lu, the s-only ¹⁷⁶Lu and ¹⁷⁶Hf and the r-only ¹⁷⁶Yb" },
  ],
  it: [
    { id: "branch-kr", letter: "A", z: [36, 38], n: [46, 51], label: "Riquadro A: kripton, rubidio e stronzio intorno al guscio N = 50, con i punti di diramazione ⁸⁵Kr e ⁸⁶Rb" },
    { id: "branch-sm", letter: "B", z: [60, 64], n: [85, 90], label: "Riquadro B: dal neodimio al gadolinio, con i punti di diramazione ¹⁴⁷Nd, ¹⁴⁷Pm, ¹⁴⁸Pm e ¹⁵¹Sm e i nuclei solo s ¹⁴⁸Sm, ¹⁵⁰Sm e ¹⁵⁴Gd" },
    { id: "branch-lu", letter: "C", z: [70, 72], n: [103, 107], label: "Riquadro C: itterbio, lutezio e afnio, con il punto di diramazione ¹⁷⁶Lu, i nuclei solo s ¹⁷⁶Lu e ¹⁷⁶Hf e il nucleo solo r ¹⁷⁶Yb" },
  ],
}

/** Every reference the page cites, in order of first citation. */
const ORDER = [
  "kaeppeler2011",
  "b2fh1957",
  "straniero2006",
  "domingopardo2006",
  "clayton1961",
  "mohr2016",
  "raut2013",
  "abbondanno2004",
  "wisshak2006",
  "heil2008lu",
  "beer1980",
  "bao2000",
  "guerrero2013",
  "massimi2014",
  "weigand2015",
  "lederer2013",
  "ratynski1988",
  "lederer2011",
  "reifarth2009",
  "tessler2015",
  "dillmann2008",
]

export const sProcessMetadata = (lang: Lang): Metadata =>
  pageMetadata(`${TEXT[lang].title} · ${dict(lang).atlas.name}`, TEXT[lang].description, lang)

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-balance font-serif text-2xl font-semibold tracking-tight">
      {children}
    </h2>
  )
}

export function SProcessPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang]
  const a = dict(lang).atlas
  const atlas = getAtlas(lang)
  const path = getSProcessPath(lang)
  const to = (p: string) => localePath(lang, p)
  const insets = INSETS[lang]
  const c = (...keys: string[]) => (
    <span className="whitespace-nowrap">
      <Cite keys={keys} order={ORDER} />
    </span>
  )
  // Short terms do not break at their hyphen ("s-" | "process").
  const term = (id: string, text: string) => (
    <Term id={id} lang={lang} className={text.length < 24 ? "whitespace-nowrap" : undefined}>
      <Sci>{text}</Sci>
    </Term>
  )
  const reactionLink = (id: string) => {
    const r = atlas.reactions.find((x) => x.id === id)
    return (
      <Link href={to(`/atlas/${id}`)} className="whitespace-nowrap font-medium text-link underline-offset-4 hover:underline">
        <Sci>{r?.label ?? id}</Sci>
      </Link>
    )
  }
  const facility = (id: string, name: string) => (
    <Link href={to(`/atlas/methods#${id}`)} className="text-link underline-offset-4 hover:underline">
      {name}
    </Link>
  )

  // The reactions of the s-process family and of the neutron family, in
  // network order.
  const families = ["s-process", "neutrons"]
  const networks = atlas.networks.filter((n) => families.includes(n.family))
  const seen = new Set<string>()
  const groups = networks.map((n) => ({
    network: n,
    reactions: n.reactions
      .filter((id) => !seen.has(id) && (seen.add(id), true))
      .map((id) => atlas.reactions.find((r) => r.id === id))
      .filter((r): r is Reaction => Boolean(r)),
  }))

  const P = (props: { children: React.ReactNode }) => <p className="text-pretty">{props.children}</p>
  const prose = "mt-5 max-w-[46rem] space-y-4 text-[1.0625rem] leading-[1.75] text-foreground/90"

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 xl:max-w-7xl">
      <Link
        href={to("/atlas")}
        className="-my-2.5 inline-flex items-center gap-1.5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.back}
      </Link>

      <header className="mt-8 border-b border-border/70 pb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.eyebrow}</p>
        <h1 className="mt-3 text-balance font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {t.title}
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground">{t.lead}</p>
      </header>

      {/* -- the overview -------------------------------------------------- */}
      <section className="mt-10" aria-labelledby="overview-heading">
        <H2 id="overview-heading">{t.overviewTitle}</H2>
        <figure className="mt-5">
          <div className="relative rounded-lg border border-border" style={{ background: "var(--viz-surface)" }}>
            <div
              className="overflow-x-auto overscroll-x-contain rounded-lg p-2 [scrollbar-width:thin]"
              tabIndex={0}
              role="region"
              aria-label={t.overviewTitle}
            >
              <SProcessOverview lang={lang} insets={insets} label={t.overviewLabel} describedBy="overview-description" />
            </div>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-lg bg-gradient-to-l from-[var(--viz-surface)] to-transparent md:hidden"
            />
          </div>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground md:hidden">
            <MoveHorizontal className="h-3.5 w-3.5" aria-hidden />
            {t.scrollHint}
          </p>
          <figcaption className="mt-3 space-y-3">
            <SProcessLegend lang={lang} />
            <p id="overview-description" className="max-w-[46rem] text-pretty text-sm leading-relaxed text-muted-foreground">
              <Sci>{t.pathNote(path.nodes.length, path.sOnly.length)}</Sci>
            </p>
          </figcaption>
        </figure>
      </section>

      <div className="mt-14 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <article className="min-w-0">
          {lang === "it" ? (
            <BodyIt c={c} term={term} r={reactionLink} f={facility} prose={prose} P={P} insets={insets} lang={lang} />
          ) : (
            <BodyEn c={c} term={term} r={reactionLink} f={facility} prose={prose} P={P} insets={insets} lang={lang} />
          )}

          {/* -- the reactions -------------------------------------------- */}
          <section className="mt-16" aria-labelledby="reactions-heading">
            <H2 id="reactions-heading">{t.reactionsTitle}</H2>
            <p className="mt-3 max-w-[46rem] text-pretty leading-relaxed text-muted-foreground">{t.reactionsText}</p>
            <div className="mt-6 grid gap-x-10 gap-y-8 md:grid-cols-2">
              {groups
                .filter((g) => g.reactions.length > 0)
                .map((g) => (
                  <div key={g.network.id}>
                    <h3 className="font-serif text-lg font-semibold tracking-tight">
                      <Sci>{g.network.name}</Sci>
                    </h3>
                    <ul className="mt-2 divide-y divide-border/70 border-y border-border/70">
                      {g.reactions.map((r) => (
                        <li key={r.id}>
                          <Link
                            href={to(`/atlas/${r.id}`)}
                            className="group flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-[0.95rem]"
                          >
                            <span className="font-serif font-semibold group-hover:text-link">
                              <Sci>{r.label}</Sci>
                            </span>
                            <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                              {r.luna && <LunaBadge />}
                              <StatusBadge status={r.status} pending={!r.hasFile} lang={lang} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </section>

          <section id="references" className="mt-16 scroll-mt-24 border-t border-border/70 pt-8">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.references}</h2>
            <ReferenceList keys={ORDER} references={atlas.references} lang={lang} />
          </section>
        </article>

        {/* -- contents, on a wide screen ----------------------------------- */}
        <aside className="hidden lg:block">
          <nav aria-label={a.onThisPage} className="sticky top-24">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{a.onThisPage}</p>
            <ul className="space-y-0.5 border-l border-border text-sm">
              {(lang === "it" ? TOC_IT : TOC_EN).concat([
                { id: "reactions-heading", label: t.reactionsTitle },
                { id: "references", label: t.references },
              ]).map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="-ml-px block border-l border-transparent py-1 pl-3 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  )
}

/* -- the narrative, in each language ------------------------------------------ */

type BodyProps = {
  c: (...keys: string[]) => React.ReactNode
  term: (id: string, text: string) => React.ReactNode
  r: (id: string) => React.ReactNode
  f: (id: string, name: string) => React.ReactNode
  prose: string
  P: (props: { children: React.ReactNode }) => React.ReactNode
  insets: Inset[]
  lang: Lang
}

const TOC_EN = [
  { id: "slow", label: "Slow captures" },
  { id: "peaks", label: "Peaks at the magic numbers" },
  { id: "components", label: "Main and weak components" },
  { id: "s-and-r", label: "s, r and the isotopes only one makes" },
  { id: "branchings", label: "Branch points" },
  { id: "measuring", label: "How the captures are measured" },
]

const TOC_IT = [
  { id: "slow", label: "Catture lente" },
  { id: "peaks", label: "I picchi ai numeri magici" },
  { id: "components", label: "Componente principale e debole" },
  { id: "s-and-r", label: "s, r e gli isotopi che solo uno produce" },
  { id: "branchings", label: "Punti di diramazione" },
  { id: "measuring", label: "Come si misurano le catture" },
]

function InsetFigure({ inset, lang, children }: { inset: Inset; lang: Lang; children: React.ReactNode }) {
  return (
    <figure id={inset.id} className="mt-6 scroll-mt-24 rounded-lg border border-border p-3 sm:p-4" style={{ background: "var(--viz-surface)" }}>
      <SProcessInset inset={inset} lang={lang} label={inset.label} />
      <figcaption className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
        <span className="mr-1.5 font-semibold text-foreground">{inset.letter}.</span>
        {children}
      </figcaption>
    </figure>
  )
}

function BodyEn({ c, term, r, f, prose, P, insets, lang }: BodyProps) {
  const [kr, sm, lu] = insets
  return (
    <>
      <section aria-labelledby="slow">
        <H2 id="slow">Slow captures, climbing the valley of stability</H2>
        <div className={prose}>
          <P>
            Fusion stops at iron: building heavier nuclei from lighter ones no longer releases energy, and the
            growing electric charge of the nuclei keeps charged particles out. Neutrons have no charge, so
            the heavy elements were built instead by neutron captures. About half of the nuclei between iron and
            bismuth come from the <i>slow</i> neutron-capture process, the {term("s-process", "s-process")}; most of the rest from
            the rapid {term("r-process", "r-process")} {c("kaeppeler2011")}. Both were named, with the other processes of
            element building, in the review of Burbidge, Burbidge, Fowler and Hoyle {c("b2fh1957")}.
          </P>
          <P>
            The seeds are iron nuclei, mostly <Sci>⁵⁶Fe</Sci>, already present in the gas the star formed from.
            A seed captures a neutron and becomes a heavier isotope of the same element, one step to the right on
            the chart. While the isotopes stay stable, it keeps capturing. When it reaches a radioactive one, that
            nucleus usually decays by β⁻ emission, in minutes to days, long before the next neutron arrives,
            and becomes the next element up. In the stars where the s-process runs the neutron density is
            modest, at most about 10<sup>8</sup> neutrons per cubic centimetre {c("straniero2006")}: with a typical
            capture cross section of a tenth of a barn, a nucleus waits about a decade between two captures.
          </P>
          <P>
            The path therefore zigzags along the valley of stable nuclei, from iron through krypton, strontium,
            tin and barium to lead and bismuth. <Sci>²⁰⁹Bi</Sci> is the last stable nucleus it reaches; one more
            capture gives <Sci>²¹⁰Bi</Sci>, which decays to <Sci>²¹⁰Po</Sci>, whose α decay returns the matter to{" "}
            <Sci>²⁰⁶Pb</Sci>, so the s-process ends in a lead–bismuth cycle {c("domingopardo2006")}.
          </P>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="peaks">
        <H2 id="peaks">Peaks at the magic numbers</H2>
        <div className={prose}>
          <P>
            Nuclei with 50, 82 or 126 neutrons have closed neutron shells, the{" "}
            {term("magic-numbers", "magic numbers")} of nuclear physics. They are reluctant to capture one more neutron: their
            capture cross sections are far smaller than those of their neighbours. Matter flowing along the
            path piles up in front of them like traffic at a narrowing. That is why the solar abundances show
            s-process peaks at strontium, yttrium and zirconium (N = 50), at barium, lanthanum and cerium
            (N = 82) and at lead (N = 126) {c("kaeppeler2011")}. On the chart above the three shells are the
            shaded columns.
          </P>
          <P>
            In 1961 Clayton, Fowler, Hull and Zimmerman worked out how abundances build up along such a chain
            of captures {c("clayton1961")}. Where the flow is steady, a nucleus that captures easily is used up
            quickly and stays rare, and one that captures reluctantly accumulates: the product of the cross
            section and the abundance changes only slowly between the closed shells, and drops in steps at them.
            Measured cross sections and the solar abundances of nuclei made only by the s-process test this
            picture, which is why the cross sections have to be known well.
          </P>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="components">
        <H2 id="components">Two kinds of stars: the main and the weak component</H2>
        <div className={prose}>
          <P>
            The <b>main component</b>, which makes most s-process nuclei heavier than strontium, comes from
            low-mass {term("agb-star", "AGB stars")}. After each {term("thermal-pulse", "thermal pulse")}, a helium flash
            in the shell around the core, some protons are mixed down into the helium-rich layer and form a thin{" "}
            {term("c13-pocket", "¹³C pocket")}. Between pulses <Sci>¹³C</Sci> burns there quietly by {r("13C-an-16O")}, at a
            thermal energy kT of about 8 keV; the next pulse, reaching about 300 million kelvin (kT ≈ 23 keV), briefly
            ignites {r("22Ne-an-25Mg")} as well, with a higher neutron density {c("straniero2006", "kaeppeler2011")}. Where
            the pocket also holds <Sci>¹⁴N</Sci>, the reaction {r("14N-np-14C")} steals neutrons from the iron: it is a strong{" "}
            {term("neutron-poison", "neutron poison")} of AGB stars {c("straniero2006")}.
          </P>
          <P>
            The <b>weak component</b> comes from massive stars. There, <Sci>²²Ne</Sci> releases neutrons near the end of
            core helium burning (kT ≈ 26 keV) and again in the carbon-burning shell (kT ≈ 90 keV){" "}
            {c("mohr2016")}. There are too few neutrons per iron seed to go far, and the weak component makes mostly
            nuclei lighter than mass 90, from copper to strontium {c("kaeppeler2011")}. Abundant light nuclei,{" "}
            <Sci>¹⁶O</Sci> and <Sci>²²Ne</Sci> themselves, compete for the neutrons ({r("16O-ng-17O")}, {r("22Ne-ng-23Ne")}){" "}
            {c("mohr2016")}.
          </P>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="s-and-r">
        <H2 id="s-and-r">s, r and the isotopes only one of them makes</H2>
        <div className={prose}>
          <P>
            In the r-process, in a neutron-star merger or a similar explosion, nuclei capture neutrons far
            faster than they decay, and are pushed far to the neutron-rich side of the chart. When the neutrons
            run out they decay back, along lines of constant mass number, until each chain meets the first
            stable nucleus on its way. A stable nucleus that has a stable neighbour of the same mass and lower
            charge is therefore shielded: the r-process decays stop at the neighbour. If the s-process path
            passes through it, it is an {term("s-only", "s-only")} nucleus, made by the s-process alone. Examples are{" "}
            <Sci>¹⁴⁸Sm</Sci> and <Sci>¹⁵⁰Sm</Sci>, shielded by <Sci>¹⁴⁸Nd</Sci> and <Sci>¹⁵⁰Nd</Sci>, and{" "}
            <Sci>²⁰⁴Pb</Sci>, shielded by <Sci>²⁰⁴Hg</Sci> {c("kaeppeler2011")}. Their solar abundances measure
            the s-process directly, without the r-process mixed in.
          </P>
          <P>
            Conversely, the most neutron-rich stable isotopes of an element are often bypassed by the
            s-process, because the isotope before them decays before it can capture. They are r-only nuclei, such as{" "}
            <Sci>¹⁵⁰Nd</Sci> and <Sci>¹⁷⁶Yb</Sci>. The rarest, proton-rich stable isotopes are reached by neither; they
            belong to the p-process. On the chart the s-only nuclei found by the rule are filled in orange.
          </P>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="branchings">
        <H2 id="branchings">Branch points: a thermometer and a gauge of neutron density</H2>
        <div className={prose}>
          <P>
            A few radioactive nuclei on the path live about as long as the wait for the next neutron: years to
            centuries. There the path forks. Some nuclei decay, some capture another neutron, and the share
            depends on the {term("neutron-density", "neutron density")} and, where the decay itself changes with the
            heat of the star, on the temperature. The abundances of the isotopes beyond such a{" "}
            {term("branch-point", "branch point")} record the conditions inside the star that made them {c("kaeppeler2011")}.
            Three classic examples are marked A, B and C on the chart.
          </P>
        </div>

        <InsetFigure inset={kr} lang={lang}>
          <Sci>
            ⁸⁵Kr (10.7 yr in the laboratory) either decays to ⁸⁵Rb or captures to ⁸⁶Kr; ⁸⁷Kr then decays to ⁸⁷Rb, with the magic
            N = 50. The more neutrons, the more ⁸⁶Kr and ⁸⁷Rb are made, so the branching gauges the neutron density, higher in
            the ²²Ne bursts than in the ¹³C pocket. ⁸⁵Kr(n,γ) has never been measured directly; it was constrained through the
            photodisintegration of ⁸⁶Kr, and krypton in stardust grains from AGB stars tests it
          </Sci>{" "}
          {c("raut2013", "kaeppeler2011")}.
        </InsetFigure>

        <InsetFigure inset={sm} lang={lang}>
          <Sci>
            Branchings at ¹⁴⁷Nd, ¹⁴⁷Pm and ¹⁴⁸Pm let part of the flow bypass ¹⁴⁸Sm, but not ¹⁵⁰Sm; both are s-only, so their
            abundance ratio measures the neutron density. At ¹⁵¹Sm (90 yr) the path forks again towards ¹⁵²Sm or ¹⁵¹Eu. Its
            capture cross section was measured on radioactive samples at n_TOF and Karlsruhe
          </Sci>{" "}
          {c("kaeppeler2011", "abbondanno2004", "wisshak2006")}.
        </InsetFigure>

        <InsetFigure inset={lu} lang={lang}>
          <Sci>
            ¹⁷⁶Lu lives 37 billion years in the laboratory, but its capture also feeds a short-lived isomer (3.68 h), and in a
            star thermal photons connect the two states, so its effective half-life falls steeply with temperature, to days.
            ¹⁷⁶Lu and its daughter ¹⁷⁶Hf are both s-only, shielded by ¹⁷⁶Yb: their ratio is an s-process thermometer
          </Sci>{" "}
          {c("beer1980", "heil2008lu")}.
        </InsetFigure>
      </section>

      <section className="mt-14" aria-labelledby="measuring">
        <H2 id="measuring">How the captures are measured</H2>
        <div className={prose}>
          <P>
            Stars do not have neutrons of a single energy: their energies follow the thermal (Maxwell–Boltzmann)
            distribution of the gas. What a star needs is the {term("macs", "Maxwellian-averaged cross section (MACS)")}, the
            cross section averaged over that distribution. By convention it is quoted at kT = 30 keV, as in the
            compilation of Bao and colleagues, which recommends values for nuclei from hydrogen to bismuth{" "}
            {c("bao2000")}. Two techniques supply it.
          </P>
          <P>
            In {term("time-of-flight", "time-of-flight")} measurements a pulsed source makes bursts of neutrons of all
            energies; the time each takes to reach the sample, along a flight path of tens to hundreds of
            metres, gives its energy, and detectors around the sample count the γ-rays of each capture. The cross
            section is measured at every energy and then averaged for any temperature. Facilities are{" "}
            {f("n-tof", "n_TOF at CERN")}, with a 185 m flight path from a lead spallation target {c("guerrero2013")};{" "}
            {f("gelina", "GELINA at the JRC in Geel")}, an electron linear accelerator with flight paths from 10 to 400 m{" "}
            {c("massimi2014")}; and {f("lansce-dance", "DANCE at LANSCE")} in Los Alamos, a ball of 160 barium fluoride
            crystals that can measure samples of a milligram, radioactive ones included {c("weigand2015")}. Such
            samples made it possible to measure branch points: {r("63Ni-ng-64Ni")} and {r("151Sm-ng-152Sm")}{" "}
            {c("lederer2013", "abbondanno2004")}.
          </P>
          <P>
            In {term("activation", "activation")} measurements a sample is irradiated with neutrons whose spectrum already
            looks stellar, and the radioactive products are counted afterwards. At the{" "}
            {f("karlsruhe-vdg", "Karlsruhe Van de Graaff")}, protons of 1912 keV on lithium, just above the threshold of{" "}
            <Sci>⁷Li(p,n)⁷Be</Sci>, give neutrons whose spectrum closely resembles a Maxwell–Boltzmann distribution at
            kT = 25 keV {c("beer1980", "ratynski1988")}. Gold foils measured in this way fixed{" "}
            {r("197Au-ng-198Au")}, the standard to which most stellar captures are referred; time-of-flight data at
            n_TOF and GELINA later differed from it by about 5% {c("ratynski1988", "lederer2011", "massimi2014")}. The
            same idea continues at {f("franz", "FRANZ in Frankfurt")}, designed to be about a thousand times more intense{" "}
            {c("reifarth2009")}, and at {f("saraf-lilit", "SARAF")}, where a liquid-lithium target gives a quasi-Maxwellian
            spectrum at kT ≈ 30 keV {c("tessler2015")}.
          </P>
          <P>
            The measured values are collected in KADoNiS, the Karlsruhe Astrophysical Database of Nucleosynthesis in
            Stars, which continues the compilation of Bao and colleagues {c("dillmann2008")}. The neutron sources and
            poisons, and the captures with entries of their own, are listed below.
          </P>
        </div>
      </section>
    </>
  )
}

function BodyIt({ c, term, r, f, prose, P, insets, lang }: BodyProps) {
  const [kr, sm, lu] = insets
  return (
    <>
      <section aria-labelledby="slow">
        <H2 id="slow">Catture lente, risalendo la valle di stabilità</H2>
        <div className={prose}>
          <P>
            La fusione si ferma al ferro: costruire nuclei più pesanti a partire da quelli più leggeri non libera
            più energia, e la carica elettrica crescente dei nuclei tiene lontane le particelle cariche. I neutroni
            non hanno carica, e gli elementi pesanti sono stati costruiti invece da catture di neutroni. Circa metà
            dei nuclei tra il ferro e il bismuto viene dal processo di cattura <i>lenta</i> di neutroni, il{" "}
            {term("s-process", "processo s")}; la maggior parte del resto dal {term("r-process", "processo r")} rapido{" "}
            {c("kaeppeler2011")}. Entrambi furono individuati, con gli altri processi che costruiscono gli elementi,
            nella rassegna di Burbidge, Burbidge, Fowler e Hoyle {c("b2fh1957")}.
          </P>
          <P>
            I semi sono nuclei di ferro, soprattutto <Sci>⁵⁶Fe</Sci>, già presenti nel gas da cui la stella si è
            formata. Un seme cattura un neutrone e diventa un isotopo più pesante dello stesso elemento, un passo
            a destra sulla carta. Finché gli isotopi restano stabili, continua a catturare. Quando ne raggiunge uno
            radioattivo, quel nucleo di solito decade per emissione β⁻, in un tempo che va da minuti a giorni,
            molto prima che arrivi il neutrone successivo, e diventa l&apos;elemento seguente. Nelle stelle in cui
            avviene il processo s la densità di neutroni è modesta, al massimo circa 10<sup>8</sup> neutroni per
            centimetro cubo {c("straniero2006")}: con una tipica sezione d&apos;urto di cattura di un decimo di barn, un
            nucleo aspetta circa dieci anni tra una cattura e l&apos;altra.
          </P>
          <P>
            Il percorso procede quindi a zigzag lungo la valle dei nuclei stabili, dal ferro attraverso il kripton,
            lo stronzio, lo stagno e il bario fino al piombo e al bismuto. Il <Sci>²⁰⁹Bi</Sci> è l&apos;ultimo nucleo
            stabile che raggiunge; un&apos;altra cattura dà il <Sci>²¹⁰Bi</Sci>, che decade in <Sci>²¹⁰Po</Sci>, il cui
            decadimento α riporta la materia al <Sci>²⁰⁶Pb</Sci>: il processo s finisce in un ciclo piombo–bismuto{" "}
            {c("domingopardo2006")}.
          </P>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="peaks">
        <H2 id="peaks">I picchi ai numeri magici</H2>
        <div className={prose}>
          <P>
            I nuclei con 50, 82 o 126 neutroni hanno gusci di neutroni chiusi, i{" "}
            {term("magic-numbers", "numeri magici")} della fisica nucleare. Catturano malvolentieri un neutrone in più:
            le loro sezioni d&apos;urto di cattura sono molto più piccole di quelle dei vicini. La materia che scorre
            lungo il percorso si accumula davanti a loro come il traffico davanti a una strettoia. Per questo le
            abbondanze solari mostrano picchi del processo s allo stronzio, all&apos;ittrio e allo zirconio (N = 50), al
            bario, al lantanio e al cerio (N = 82) e al piombo (N = 126) {c("kaeppeler2011")}. Nella carta qui sopra i
            tre gusci sono le colonne ombreggiate.
          </P>
          <P>
            Nel 1961 Clayton, Fowler, Hull e Zimmerman calcolarono come si accumulano le abbondanze lungo una tale
            catena di catture {c("clayton1961")}. Dove il flusso è stazionario, un nucleo che cattura facilmente si
            consuma in fretta e resta raro, e uno che cattura a fatica si accumula: il prodotto della sezione
            d&apos;urto per l&apos;abbondanza cambia solo lentamente tra i gusci chiusi, e cala a gradini in
            corrispondenza di essi. Le sezioni d&apos;urto misurate e le abbondanze solari dei nuclei prodotti solo dal
            processo s mettono alla prova questo quadro, ed è per questo che le sezioni d&apos;urto vanno conosciute
            bene.
          </P>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="components">
        <H2 id="components">Due tipi di stelle: la componente principale e quella debole</H2>
        <div className={prose}>
          <P>
            La <b>componente principale</b>, che produce la maggior parte dei nuclei del processo s più pesanti dello
            stronzio, viene dalle {term("agb-star", "stelle AGB")} di piccola massa. Dopo ogni{" "}
            {term("thermal-pulse", "impulso termico")}, un lampo dell&apos;elio nel guscio intorno al nucleo, alcuni
            protoni vengono rimescolati verso il basso nello strato ricco di elio e formano una sottile{" "}
            {term("c13-pocket", "tasca di ¹³C")}. Tra un impulso e l&apos;altro il <Sci>¹³C</Sci> vi brucia tranquillamente
            con la {r("13C-an-16O")}, a un&apos;energia termica kT di circa 8 keV; l&apos;impulso successivo, che arriva a
            circa 300 milioni di kelvin (kT ≈ 23 keV), accende brevemente anche la {r("22Ne-an-25Mg")}, con una
            densità di neutroni più alta {c("straniero2006", "kaeppeler2011")}. Dove la tasca contiene anche{" "}
            <Sci>¹⁴N</Sci>, la {r("14N-np-14C")} sottrae neutroni al ferro: è un forte{" "}
            {term("neutron-poison", "veleno neutronico")} delle stelle AGB {c("straniero2006")}.
          </P>
          <P>
            La <b>componente debole</b> viene dalle stelle massicce. Lì il <Sci>²²Ne</Sci> libera neutroni verso la
            fine della combustione centrale dell&apos;elio (kT ≈ 26 keV) e di nuovo nel guscio in cui brucia il
            carbonio (kT ≈ 90 keV) {c("mohr2016")}. I neutroni per seme di ferro sono troppo pochi per andare lontano,
            e la componente debole produce soprattutto nuclei più leggeri della massa 90, dal rame allo stronzio{" "}
            {c("kaeppeler2011")}. Nuclei leggeri abbondanti, lo stesso <Sci>²²Ne</Sci> e l&apos;<Sci>¹⁶O</Sci>,
            competono per i neutroni ({r("16O-ng-17O")}, {r("22Ne-ng-23Ne")}) {c("mohr2016")}.
          </P>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="s-and-r">
        <H2 id="s-and-r">s, r e gli isotopi che solo uno dei due produce</H2>
        <div className={prose}>
          <P>
            Nel processo r, in una fusione di stelle di neutroni o in un&apos;esplosione simile, i nuclei catturano
            neutroni molto più in fretta di quanto decadano, e vengono spinti lontano verso il lato della carta
            ricco di neutroni. Quando i neutroni finiscono decadono all&apos;indietro, lungo linee di numero di massa
            costante, finché ogni catena incontra il primo nucleo stabile sulla sua strada. Un nucleo stabile che
            ha un vicino stabile con la stessa massa e carica minore è quindi schermato: i decadimenti del processo
            r si fermano al vicino. Se il percorso del processo s lo attraversa, è un nucleo{" "}
            {term("s-only", "solo s")}, prodotto soltanto dal processo s. Ne sono esempi <Sci>¹⁴⁸Sm</Sci> e{" "}
            <Sci>¹⁵⁰Sm</Sci>, schermati da <Sci>¹⁴⁸Nd</Sci> e <Sci>¹⁵⁰Nd</Sci>, e il <Sci>²⁰⁴Pb</Sci>, schermato dal{" "}
            <Sci>²⁰⁴Hg</Sci> {c("kaeppeler2011")}. Le loro abbondanze solari misurano direttamente il processo s,
            senza il contributo del processo r.
          </P>
          <P>
            Al contrario, gli isotopi stabili più ricchi di neutroni di un elemento sono spesso saltati dal processo
            s, perché l&apos;isotopo che li precede decade prima di poter catturare. Sono nuclei solo r, come{" "}
            <Sci>¹⁵⁰Nd</Sci> e <Sci>¹⁷⁶Yb</Sci>. Gli isotopi stabili più rari, ricchi di protoni, non sono raggiunti da
            nessuno dei due; appartengono al processo p. Nella carta i nuclei solo s trovati dalla regola sono pieni
            in arancione.
          </P>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="branchings">
        <H2 id="branchings">Punti di diramazione: un termometro e un misuratore della densità di neutroni</H2>
        <div className={prose}>
          <P>
            Alcuni nuclei radioattivi lungo il percorso vivono all&apos;incirca quanto l&apos;attesa del neutrone
            successivo: da anni a secoli. Lì il percorso si biforca. Alcuni nuclei decadono, altri catturano un
            altro neutrone, e la ripartizione dipende dalla {term("neutron-density", "densità di neutroni")} e, dove il
            decadimento stesso cambia con il calore della stella, dalla temperatura. Le abbondanze degli isotopi oltre
            un tale {term("branch-point", "punto di diramazione")} registrano le condizioni all&apos;interno della stella
            che li ha prodotti {c("kaeppeler2011")}. Tre esempi classici sono indicati con A, B e C sulla carta.
          </P>
        </div>

        <InsetFigure inset={kr} lang={lang}>
          <Sci>
            Il ⁸⁵Kr (10,7 anni in laboratorio) decade in ⁸⁵Rb oppure cattura e diventa ⁸⁶Kr; il ⁸⁷Kr decade poi in ⁸⁷Rb, con il
            numero magico N = 50. Più neutroni ci sono, più ⁸⁶Kr e ⁸⁷Rb si producono, quindi la diramazione misura la densità di
            neutroni, più alta nei lampi del ²²Ne che nella tasca di ¹³C. La ⁸⁵Kr(n,γ) non è mai stata misurata direttamente; è
            stata vincolata attraverso la fotodisintegrazione del ⁸⁶Kr, e il kripton nei grani di polvere stellare delle stelle
            AGB la mette alla prova
          </Sci>{" "}
          {c("raut2013", "kaeppeler2011")}.
        </InsetFigure>

        <InsetFigure inset={sm} lang={lang}>
          <Sci>
            Le diramazioni a ¹⁴⁷Nd, ¹⁴⁷Pm e ¹⁴⁸Pm fanno sì che parte del flusso salti il ¹⁴⁸Sm, ma non il ¹⁵⁰Sm; entrambi sono solo
            s, quindi il rapporto tra le loro abbondanze misura la densità di neutroni. Al ¹⁵¹Sm (90 anni) il percorso si
            biforca di nuovo verso il ¹⁵²Sm o l&apos;¹⁵¹Eu. La sua sezione d&apos;urto di cattura è stata misurata su campioni
            radioattivi a n_TOF e a Karlsruhe
          </Sci>{" "}
          {c("kaeppeler2011", "abbondanno2004", "wisshak2006")}.
        </InsetFigure>

        <InsetFigure inset={lu} lang={lang}>
          <Sci>
            Il ¹⁷⁶Lu vive 37 miliardi di anni in laboratorio, ma la sua cattura alimenta anche un isomero di vita breve (3,68 h),
            e in una stella i fotoni termici collegano i due stati, così la sua vita media efficace crolla con la temperatura,
            fino a pochi giorni. Il ¹⁷⁶Lu e suo figlio ¹⁷⁶Hf sono entrambi solo s, schermati dal ¹⁷⁶Yb: il loro rapporto è un
            termometro del processo s
          </Sci>{" "}
          {c("beer1980", "heil2008lu")}.
        </InsetFigure>
      </section>

      <section className="mt-14" aria-labelledby="measuring">
        <H2 id="measuring">Come si misurano le catture</H2>
        <div className={prose}>
          <P>
            Nelle stelle i neutroni non hanno una sola energia: le loro energie seguono la distribuzione termica
            (di Maxwell–Boltzmann) del gas. Quello che serve a una stella è la{" "}
            {term("macs", "sezione d'urto mediata su una maxwelliana (MACS)")}, la sezione d&apos;urto mediata su quella
            distribuzione. Per convenzione si cita a kT = 30 keV, come nella compilazione di Bao e colleghi, che
            raccomanda valori per i nuclei dall&apos;idrogeno al bismuto {c("bao2000")}. La forniscono due tecniche.
          </P>
          <P>
            Nelle misure a {term("time-of-flight", "tempo di volo")} una sorgente pulsata produce impulsi di neutroni di
            tutte le energie; il tempo che ciascuno impiega a raggiungere il campione, lungo una base di volo da
            decine a centinaia di metri, ne dà l&apos;energia, e i rivelatori intorno al campione contano i raggi γ di
            ogni cattura. La sezione d&apos;urto si misura a ogni energia e poi si media per qualunque temperatura. Gli
            impianti sono {f("n-tof", "n_TOF al CERN")}, con una base di volo di 185 m da un bersaglio di spallazione di
            piombo {c("guerrero2013")}; {f("gelina", "GELINA al JRC di Geel")}, un acceleratore lineare di elettroni con
            basi di volo da 10 a 400 m {c("massimi2014")}; e {f("lansce-dance", "DANCE a LANSCE")} a Los Alamos, una sfera
            di 160 cristalli di fluoruro di bario che può misurare campioni di un milligrammo, anche radioattivi{" "}
            {c("weigand2015")}. Campioni simili hanno permesso di misurare i punti di diramazione:{" "}
            {r("63Ni-ng-64Ni")} e {r("151Sm-ng-152Sm")} {c("lederer2013", "abbondanno2004")}.
          </P>
          <P>
            Nelle misure per {term("activation", "attivazione")} un campione viene irraggiato con neutroni il cui spettro
            somiglia già a quello stellare, e i prodotti radioattivi si contano dopo. Al{" "}
            {f("karlsruhe-vdg", "Van de Graaff di Karlsruhe")}, protoni da 1912 keV sul litio, appena sopra la soglia della{" "}
            <Sci>⁷Li(p,n)⁷Be</Sci>, danno neutroni con uno spettro molto simile a una distribuzione di Maxwell–Boltzmann a
            kT = 25 keV {c("beer1980", "ratynski1988")}. Fogli d&apos;oro misurati in questo modo hanno fissato la{" "}
            {r("197Au-ng-198Au")}, il campione di riferimento per la maggior parte delle catture stellari; i dati a tempo
            di volo di n_TOF e GELINA se ne sono poi discostati di circa il 5%{" "}
            {c("ratynski1988", "lederer2011", "massimi2014")}. La stessa idea continua a {f("franz", "FRANZ a Francoforte")},
            progettata per essere circa mille volte più intensa {c("reifarth2009")}, e a {f("saraf-lilit", "SARAF")}, dove
            un bersaglio di litio liquido dà uno spettro quasi maxwelliano a kT ≈ 30 keV {c("tessler2015")}.
          </P>
          <P>
            I valori misurati sono raccolti in KADoNiS, il Karlsruhe Astrophysical Database of Nucleosynthesis in Stars,
            che prosegue la compilazione di Bao e colleghi {c("dillmann2008")}. Le sorgenti e i veleni neutronici, e le
            catture che hanno una scheda propria, sono elencati qui sotto.
          </P>
        </div>
      </section>
    </>
  )
}
