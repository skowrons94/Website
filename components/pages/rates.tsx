import { Children } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Term } from "@/components/atlas/term"
import { RatesExplorer } from "@/components/rates/rates-explorer"
import { LIGHT_REFS, RatesCredits } from "@/components/rates/credits"
import { Sci } from "@/components/sci"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"
import { hasSProcess, preloadNetwork, rateTabs } from "@/lib/rates/catalog"

/**
 * /atlas/rates: the reaction rates of the light networks (pp, CNO, NeNa,
 * MgAl) from REACLIB, how fast each step goes at a chosen site, and what a
 * changed rate does to the nuclei a burn makes. The explorer runs in the
 * browser (components/rates/*, lib/rates/*); this page is its frame.
 */

const TEXT = {
  en: {
    eyebrow: "Reaction atlas",
    title: "Reaction rates: how fast, and what if",
    description:
      "The rates of the pp chains and the CNO, NeNa and MgAl cycles from REACLIB, how long each step takes inside a star, and which nuclei change when a rate does. Calculated in your browser.",
    back: "Reaction atlas",
    howTitle: "What you are looking at",
  },
  it: {
    eyebrow: "Atlante delle reazioni",
    title: "Tassi di reazione: quanto sono veloci, e se cambiassero",
    description:
      "I tassi delle catene pp e dei cicli CNO, NeNa e MgAl da REACLIB, quanto dura ogni passo dentro una stella e quali nuclei cambiano quando cambia un tasso. Calcolati nel tuo browser.",
    back: "Atlante delle reazioni",
    howTitle: "Che cosa stai guardando",
  },
} as const

export const ratesMetadata = (lang: Lang): Metadata =>
  pageMetadata(`${TEXT[lang].title} · ${dict(lang).atlas.name}`, TEXT[lang].description, lang)

function Lead({ lang }: { lang: Lang }) {
  const term = (id: string, text: string) => (
    <Term id={id} lang={lang}>
      {text}
    </Term>
  )
  return lang === "it" ? (
    <>
      Ogni reazione in una stella ha il suo {term("rate", "tasso")}, che cresce in fretta con la{" "}
      {term("temperature", "temperatura")}. Scegli un ambiente, trova il passo più lento, poi cambia un tasso e guarda
      che cosa ne esce.
    </>
  ) : (
    <>
      Every reaction in a star has its own {term("rate", "rate")}, climbing steeply with{" "}
      {term("temperature", "temperature")}. Pick a site, find the slowest step, then change a rate and see what comes
      out.
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
          I tassi vengono da REACLIB, la raccolta di tassi di reazione mantenuta da JINA, così come la distribuisce
          pynucastro: per ogni reazione, una formula a sette parametri adattata ai tassi misurati o calcolati, con la
          sua fonte. Il tuo browser calcola quella stessa formula. Per le reazioni tra nuclei carichi la parte ripida
          viene dalla {term("coulomb-barrier", "barriera coulombiana")}: contano solo i nuclei della{" "}
          {term("gamow-window", "finestra di Gamow")}, e ce ne sono molti di più quando il gas è più caldo.
        </P>
        <P>
          Il tempo di attesa di un nucleo è l'inverso della probabilità per secondo che una reazione lo trasformi:
          dipende dal tasso, dalla densità e da quanti partner ci sono intorno (i protoni, quasi sempre). Per un
          decadimento è la vita media, il {term("half-life", "tempo di dimezzamento")} diviso per ln 2. In un ciclo il
          passo più lento comanda: la <Sci>{"¹⁴N(p,γ)¹⁵O"}</Sci> nel ciclo CNO, la fusione di due protoni nella catena
          pp. Dove un nucleo può prendere due strade vince la più rapida, quindi il passo più lento si cerca lungo il
          percorso che il flusso segue davvero: in una nova il <Sci>{"¹³N"}</Sci> cattura un protone molto prima di
          decadere.
        </P>
        <P>
          «E se» ricalcola la combustione in un modello a una zona: temperatura e densità fisse, la composizione
          iniziale dello scenario, e la rete integrata nel tempo con un metodo implicito, in un thread separato del tuo
          browser. Il risultato è confrontato con quello dei tassi originali. Un modello a una zona mostra quali
          reazioni contano e quanto; non sostituisce un modello di stella. I valori di ogni scenario e la loro fonte
          sono sotto «Da dove vengono questi numeri».
        </P>
      </>
    )
  }
  return (
    <>
      <P>
        The rates come from REACLIB, the library of reaction rates maintained by JINA, as pynucastro distributes it: for
        each reaction a seven-parameter formula fitted to the measured or calculated rate, with its source. Your browser
        evaluates that same formula. For reactions between charged nuclei the steepness comes from the{" "}
        {term("coulomb-barrier", "Coulomb barrier")}: only the nuclei in the {term("gamow-window", "Gamow window")} take
        part, and a hotter gas has many more of them.
      </P>
      <P>
        A nucleus' waiting time is one over the chance per second that a reaction transforms it: it depends on the rate,
        on the density and on how many partners are around (protons, nearly always). For a decay it is the mean life,
        the {term("half-life", "half-life")} divided by ln 2. In a cycle the slowest step rules:{" "}
        <Sci>{"¹⁴N(p,γ)¹⁵O"}</Sci> in the CNO cycle, the fusion of two protons in the pp chain. Where a nucleus can go
        two ways the faster one wins, so the slowest step is taken along the path the flow actually follows: in a nova,{" "}
        <Sci>{"¹³N"}</Sci> captures a proton long before it decays.
      </P>
      <P>
        "What if" reruns the burn in a one-zone model: fixed temperature and density, the scenario's initial
        composition, and the network integrated in time with an implicit method, in a separate thread of your browser.
        The result is compared with the burn at the original rates. A one-zone model shows which reactions matter, and
        how much; it does not replace a model of a star. Each scenario's values and their source are under "Where these
        numbers come from".
      </P>
    </>
  )
}

export function RatesPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang]
  const to = (p: string) => localePath(lang, p)
  const tabs = rateTabs(lang)
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 [overflow-wrap:anywhere] sm:px-8 sm:py-10 xl:max-w-7xl">
      <Link
        href={to("/atlas")}
        className="-my-2.5 inline-flex items-center gap-1.5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.back}
      </Link>
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
        <RatesExplorer
          lang={lang}
          tabs={tabs}
          initial={tabs[0]?.id ?? "pp"}
          sProcess={hasSProcess()}
          preload={preloadNetwork(tabs[0]?.id ?? "pp") ?? undefined}
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

      <RatesCredits lang={lang} keys={LIGHT_REFS} />
    </div>
  )
}
