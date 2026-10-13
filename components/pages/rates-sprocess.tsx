import { Children } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Term } from "@/components/atlas/term"
import { RatesCredits, SPROCESS_REFS } from "@/components/rates/credits"
import { SProcessExplorer } from "@/components/rates/sprocess-explorer"
import { Sci } from "@/components/sci"
import { getSProcessPath } from "@/lib/atlas"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"
import { sprocessFirstViewFromDisk } from "@/lib/rates/catalog"
import { curiosityCards } from "@/lib/rates/curiosity-data"

/**
 * /atlas/rates/s-process: the neutron sources, poisons and seeds of the
 * s-process, scaled by the reader, and what they do to the heavy isotopes.
 * The explorer (components/rates/sprocess-explorer.tsx) runs in the browser.
 */

const TEXT = {
  en: {
    eyebrow: "Reaction rates",
    title: "The s-process: what if?",
    description:
      "Change the neutron sources, the poisons and the seeds of the s-process and see the neutron exposure and the heavy isotopes from iron to bismuth change. A network of some 500 nuclei, calculated in your browser.",
    back: "Reaction rates",
    sPage: "The s-process, explained",
    howTitle: "How to read it",
  },
  it: {
    eyebrow: "Tassi di reazione",
    title: "Il processo s, e se…",
    description:
      "Cambia le sorgenti di neutroni, i veleni e i semi del processo s e guarda come cambiano l'esposizione ai neutroni e gli isotopi pesanti dal ferro al bismuto. Una rete di circa 500 nuclei, calcolata nel tuo browser.",
    back: "Tassi di reazione",
    sPage: "Il processo s, spiegato",
    howTitle: "Come leggerlo",
  },
} as const

export const ratesSProcessMetadata = (lang: Lang): Metadata =>
  pageMetadata(`${TEXT[lang].title} · ${dict(lang).atlas.name}`, TEXT[lang].description, lang)

function Lead({ lang }: { lang: Lang }) {
  const term = (id: string, text: string) => (
    <Term id={id} lang={lang}>
      <Sci>{text}</Sci>
    </Term>
  )
  return lang === "it" ? (
    <>
      Nel {term("s-process", "processo s")} il ferro cattura neutroni, dalla <Sci>{"¹³C(α,n)"}</Sci> e dalla{" "}
      <Sci>{"²²Ne(α,n)"}</Sci>, e risale fino al piombo. Scegli un ambiente, cambia una reazione o un{" "}
      {term("neutron-poison", "veleno neutronico")} e guarda come si spostano gli isotopi pesanti.
    </>
  ) : (
    <>
      In the {term("s-process", "s-process")} iron captures neutrons from <Sci>{"¹³C(α,n)"}</Sci> and{" "}
      <Sci>{"²²Ne(α,n)"}</Sci> and climbs up to lead. Choose a site, change a reaction or a{" "}
      {term("neutron-poison", "neutron poison")} and see how the heavy isotopes change.
    </>
  )
}

function How({ lang }: { lang: Lang }) {
  // prose with Unicode superscripts (¹⁴N) set as real ones
  const P = ({ children }: { children: React.ReactNode }) => (
    <p className="text-pretty">{Children.map(children, (c) => (typeof c === "string" ? <Sci>{c}</Sci> : c))}</p>
  )
  const term = (id: string, text: string) => (
    <Term id={id} lang={lang}>
      <Sci>{text}</Sci>
    </Term>
  )
  if (lang === "it") {
    return (
      <>
        <P>
          L'esposizione ai neutroni τ misura quanti neutroni sono stati offerti a ogni nucleo durante la combustione: è
          la {term("neutron-density", "densità di neutroni")} moltiplicata per la loro velocità e sommata nel tempo, in
          neutroni per millibarn. Un nucleo con una sezione d'urto (la {term("macs", "MACS")}) di 100 mb ne cattura in
          media 100 τ. Un'esposizione di qualche decimo per millibarn basta a portare il ferro fino al bario e al
          piombo.
        </P>
        <P>
          Rendere più rapida una sorgente nella tasca di ¹³C cambia poco: il ¹³C brucia tutto comunque, solo prima.
          Conta di più quanto ¹³C c'è, e quanti neutroni si prendono i veleni: aumenta il ¹⁴N iniziale o la ¹⁴N(n,p)¹⁴C
          e guarda il piombo calare. Nell'impulso termico invece la ²²Ne(α,n) brucia solo in parte, e il suo tasso
          decide direttamente quanti neutroni ci sono.
        </P>
        <P>
          Il modello è a zona singola: temperatura e densità fisse, una composizione iniziale per ogni ambiente, la rete
          integrata nel tuo browser con lo stesso metodo implicito della pagina dei tassi e verificata con pynucastro.
          Mostra come le sorgenti, i veleni e i semi spostano la distribuzione, non le rese di una stella.
        </P>
      </>
    )
  }
  return (
    <>
      <P>
        The neutron exposure τ measures how many neutrons each nucleus was offered during the burn: the{" "}
        {term("neutron-density", "neutron density")} times their speed, added up over time, in neutrons per millibarn. A
        nucleus with a cross section (the {term("macs", "MACS")}) of 100 mb captures about 100 τ of them. An exposure of
        a few tenths per millibarn is enough to carry iron up to barium and lead.
      </P>
      <P>
        Making a source faster in the ¹³C pocket changes little: the ¹³C burns completely anyway, only sooner. What
        matters more is how much ¹³C there is, and how many neutrons the poisons take: raise the initial ¹⁴N, or
        ¹⁴N(n,p)¹⁴C, and the lead falls. In a thermal pulse, instead, ²²Ne(α,n) burns only partly, and its rate
        directly decides how many neutrons there are.
      </P>
      <P>
        The model is one zone: fixed temperature and density, one initial composition per site, the network integrated
        in your browser with the same implicit method as the rates page, and checked against pynucastro. It shows how
        sources, poisons and seeds move the distribution, not the yields of a star.
      </P>
    </>
  )
}

export function RatesSProcessPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang]
  const to = (p: string) => localePath(lang, p)
  const path = getSProcessPath(lang)
  const cards = curiosityCards(lang)
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 [overflow-wrap:anywhere] sm:px-8 sm:py-10 xl:max-w-7xl">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Link
          href={to("/atlas/rates")}
          className="-my-2.5 inline-flex items-center gap-1.5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.back}
        </Link>
        <Link
          href={to("/atlas/s-process")}
          className="-my-2.5 inline-flex items-center py-2.5 text-sm text-link underline-offset-4 hover:underline"
        >
          {t.sPage}
        </Link>
      </div>
      <header className="mt-5">
        <p className="sr-only">{t.eyebrow}</p>
        <h1 className="text-balance font-serif text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-4xl">
          {t.title}
        </h1>
        <p className="mt-2 max-w-3xl text-pretty leading-relaxed text-muted-foreground sm:text-[1.0625rem]">
          <Lead lang={lang} />
        </p>
      </header>

      <div className="mt-5">
        <SProcessExplorer
          lang={lang}
          sOnly={path.sOnly}
          firstView={sprocessFirstViewFromDisk(path.sOnly)}
          curiosities={{ items: cards.filter((c) => c.net === "sprocess"), total: cards.length }}
        />
      </div>

      <section
        className="mt-16 border-t border-border/70 pt-10 [contain-intrinsic-size:auto_900px] [content-visibility:auto]"
        aria-labelledby="how-heading"
      >
        <h2 id="how-heading" className="font-serif text-2xl font-semibold tracking-tight">
          {t.howTitle}
        </h2>
        <div className="mt-5 max-w-[46rem] space-y-4 text-[1.0625rem] leading-[1.75] text-foreground/90">
          <How lang={lang} />
        </div>
      </section>

      <RatesCredits lang={lang} keys={SPROCESS_REFS} />
    </div>
  )
}
