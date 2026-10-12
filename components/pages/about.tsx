import type { Metadata } from "next"
import Link from "next/link"

import { Container, PageHeader } from "@/components/page-header"
import { getAtlas } from "@/lib/atlas"
import { getEvaluationCounts, getProfile } from "@/lib/content"
import { localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"
import { issueUrl, REPO } from "@/lib/repo"
import { siteRelease } from "@/lib/site-release"

/*
 * /about: how the site was made (with AI assistance, under the owner's
 * direction and responsibility), how it was checked, where its data come
 * from and under which terms, where the code is and how to report an error,
 * and how to cite it. Written in the owner's voice, in both languages here
 * rather than in lib/i18n.ts, as the s-process page does: it is running text,
 * not interface strings.
 */

type Counts = { reactions: number; references: number; evaluations: number }

const TEXT = {
  en: {
    title: "About this site",
    description:
      "How this site was made and checked, where its data come from, its licences, the source code, how to report an error and how to cite it.",
    lead: "How this site was made, how it was checked, where its numbers come from, and how to cite it.",
    contents: "On this page",
    sections: {
      ai: "Made with AI assistance",
      checks: "How it was checked",
      data: "Data, sources and licences",
      code: "Open code, errors and contributions",
      cite: "How to cite this site",
    },
    cite: {
      version: "version",
      doi: "DOI",
      noDoi: "A DOI will be added here when the first release is archived on Zenodo.",
      specific:
        "For one reaction or one evaluation, cite the page itself (each has its own box) and, above all, the original papers it draws on.",
      cff: "Machine-readable:",
    },
  },
  it: {
    title: "Informazioni sul sito",
    description:
      "Come è stato fatto e verificato questo sito, da dove vengono i dati, le licenze, il codice sorgente, come segnalare un errore e come citarlo.",
    lead: "Come è stato fatto questo sito, come è stato verificato, da dove vengono i suoi numeri e come citarlo.",
    contents: "In questa pagina",
    sections: {
      ai: "Fatto con l'aiuto dell'intelligenza artificiale",
      checks: "Come è stato verificato",
      data: "Dati, fonti e licenze",
      code: "Codice aperto, errori e contributi",
      cite: "Come citare questo sito",
    },
    cite: {
      version: "versione",
      doi: "DOI",
      noDoi: "Un DOI comparirà qui quando la prima versione sarà archiviata su Zenodo.",
      specific:
        "Per una singola reazione o valutazione, cita la pagina stessa (ognuna ha il suo riquadro) e, soprattutto, gli articoli originali su cui si basa.",
      cff: "In formato leggibile dalle macchine:",
    },
  },
}

export const aboutMetadata = (lang: Lang): Metadata => pageMetadata(TEXT[lang].title, TEXT[lang].description, lang)

const A = "text-link"

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={A}>
      {children}
    </a>
  )
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-balance font-serif text-2xl font-semibold tracking-tight">
      {children}
    </h2>
  )
}

const prose = "mt-4 max-w-[68ch] space-y-4 text-pretty leading-[1.75] text-foreground/90"
const list = "mt-4 max-w-[68ch] list-disc space-y-2 pl-5 leading-[1.7] text-foreground/90 marker:text-muted-foreground"

/* -- English ------------------------------------------------------------------ */

function BodyEn({ to, n }: { to: (p: string) => string; n: Counts }) {
  const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <Link href={to(href)} className={A}>
      {children}
    </Link>
  )
  return (
    <>
      <section aria-labelledby="ai">
        <H2 id="ai">{TEXT.en.sections.ai}</H2>
        <div className={prose}>
          <p>
            I built this site with the help of an AI system, Claude, made by Anthropic. Much of the code and the first
            drafts of many pages were written by Claude, following my direction. I chose what the site covers, decided
            how each thing should be explained, and checked the results; the scientific responsibility for every page is
            mine.
          </p>
          <p>
            The research the site presents is not the AI&apos;s work. The measurements, analyses and evaluations credited
            to me, on the evaluation pages and in my publications, are my own, done with my collaborators and published
            under our names; all other work is credited to its authors where it appears.
          </p>
          <p>
            This is also how I think tools for our field can be kept alive: with an AI doing much of the routine work,
            one researcher can build and maintain resources for the community (an atlas of reactions, evaluations anyone
            can rerun, a rate explorer) that would otherwise need a small team. It does not replace checking, which is
            why the next section is the longest.
          </p>
        </div>
      </section>

      <section aria-labelledby="checks" className="mt-14">
        <H2 id="checks">{TEXT.en.sections.checks}</H2>
        <div className={prose}>
          <p>
            Every round of changes was reviewed independently, by separate AI reviewers (also Claude) that had not
            written the work, each asked to read the site in one role, from one point of view:
          </p>
        </div>
        <ul className={list}>
          <li>in the role of a nuclear astrophysicist: the physics, the numbers and the references;</li>
          <li>in the role of an R-matrix specialist: the evaluations and the notes;</li>
          <li>
            in the role of a user-interface and accessibility reviewer: phones and desktops, 200% text, the keyboard
            alone;
          </li>
          <li>in the role of readers from the general public, one in English and one in Italian;</li>
          <li>in the role of a senior referee, reading the whole site as a journal referee would.</li>
        </ul>
        <div className={prose}>
          <p>
            The reviews were repeated, and the problems they found fixed, until none reported an issue of high or medium
            severity. These are points of view an AI was asked to take, not reviews by people, and no substitute for
            them: if you find something wrong, please tell me (see below).
          </p>
          <p>Automated tests check the rest:</p>
        </div>
        <ul className={list}>
          <li>
            the atlas ({n.reactions} reactions, {n.references} references) is validated: every reaction must balance in
            charge and mass number, every link must point to something that exists, and every reference must record how
            it was checked;
          </li>
          <li>
            the <L href="/atlas/rates">reaction rates</L> and the network calculations are compared with pynucastro, the
            reference implementation of the same REACLIB rates, and every number in the{" "}
            <L href="/atlas/rates/curiosities">curiosities</L> is checked against the explorer&apos;s own solver;
          </li>
          <li>
            the <L href="/evaluations">evaluations</L> that run in your browser are compared with native AZURE2 on every
            model, and the published fits are the native results;
          </li>
          <li>the site search is tested on the queries people actually type, in English and in Italian.</li>
        </ul>
        <div className={prose}>
          <p>
            Every number in the atlas and on the explanatory pages carries a citation to its source, and during the
            reviews the references were checked against the sources they cite. If you find one that is wrong, the report
            links below are the quickest way to tell me.
          </p>
        </div>
      </section>

      <section aria-labelledby="data" className="mt-14">
        <H2 id="data">{TEXT.en.sections.data}</H2>
        <ul className={list}>
          <li>
            <span className="font-medium text-foreground">Masses and half-lives:</span> the Atomic Mass Evaluation
            AME2020 (M. Wang <i>et al.</i>, Chin. Phys. C 45, 030003 (2021)) and NUBASE2020 (F. G. Kondev{" "}
            <i>et al.</i>, Chin. Phys. C 45, 030001 (2021)). The atlas&apos; Q-values and the half-lives come from them;
            the rate explorer shows REACLIB&apos;s own Q-values, those its rates were fitted with.
          </li>
          <li>
            <span className="font-medium text-foreground">Reaction rates:</span> the JINA{" "}
            <Ext href="https://reaclib.jinaweb.org/">REACLIB</Ext> library, read through{" "}
            <Ext href="https://github.com/pynucastro/pynucastro">pynucastro</Ext> (BSD 3-clause licence). Each rate keeps
            its REACLIB label and its source paper.
          </li>
          <li>
            <span className="font-medium text-foreground">R-matrix:</span>{" "}
            <Ext href="https://github.com/rdeboer1/AZURE2">AZURE2</Ext> (R. E. Azuma <i>et al.</i>, Phys. Rev. C 81,
            045805 (2010)), the code I maintain, runs every evaluation.
          </li>
          <li>
            <span className="font-medium text-foreground">The evaluations&apos; data:</span> the measured cross
            sections in each of the {n.evaluations} evaluations come from the papers listed on its page, and the input
            files can be downloaded and run locally.
          </li>
          <li>
            <span className="font-medium text-foreground">Later:</span> links to EXFOR, the international database of
            experimental nuclear reaction data, for the measurements the atlas cites.
          </li>
        </ul>
        <div className={prose}>
          <p>
            The atlas&apos; texts and its data file (<L href="/atlas#cite">data.json</L>) are released under the{" "}
            <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext> licence: you may reuse them, with
            credit. The data of others (AME2020, NUBASE2020, REACLIB, the measurements) remain under their own terms;
            please cite the original publications.
          </p>
        </div>
      </section>

      <section aria-labelledby="code" className="mt-14">
        <H2 id="code">{TEXT.en.sections.code}</H2>
        <div className={prose}>
          <p>
            The source code of the whole site, including the evaluations and the rate explorer, is public on GitHub:{" "}
            <Ext href={REPO}>github.com/skowrons94/Website</Ext>.
          </p>
          <p>
            If you find an error, please{" "}
            <Ext href={issueUrl("Error on the site", "Page:\nSection:\n\nWhat is wrong:\n\n\nWhat it should be, with a source if you have one:\n")}>
              open an issue
            </Ext>
            ; every reaction in the atlas, the s-process page and each glossary entry also has a &ldquo;Report an
            error&rdquo; link that fills in the report for you, and a &ldquo;Suggest a reaction&rdquo; link for what is
            missing. You can also write to me by e-mail. Corrections and contributions (a reaction, a reference, a
            translation) are welcome as pull requests.
          </p>
        </div>
      </section>
    </>
  )
}

/* -- Italiano ----------------------------------------------------------------- */

function BodyIt({ to, n }: { to: (p: string) => string; n: Counts }) {
  const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <Link href={to(href)} className={A}>
      {children}
    </Link>
  )
  return (
    <>
      <section aria-labelledby="ai">
        <H2 id="ai">{TEXT.it.sections.ai}</H2>
        <div className={prose}>
          <p>
            Ho costruito questo sito con l&apos;aiuto di un sistema di intelligenza artificiale, Claude, sviluppato da
            Anthropic. Buona parte del codice e le prime stesure di molte pagine sono state scritte da Claude, seguendo
            le mie indicazioni. Ho scelto io che cosa il sito tratta e come spiegare ogni cosa, e ho controllato i
            risultati; la responsabilità scientifica di ogni pagina è mia.
          </p>
          <p>
            La ricerca che il sito presenta non è opera dell&apos;IA. Le misure, le analisi e le valutazioni attribuite a
            me, nelle pagine delle valutazioni e nelle mie pubblicazioni, sono mie, svolte con i miei collaboratori e
            pubblicate a nostro nome; ogni altro lavoro è attribuito ai suoi autori dove compare.
          </p>
          <p>
            Penso che sia anche così che si possono tenere in vita gli strumenti del nostro settore: con
            un&apos;intelligenza artificiale che svolge gran parte del lavoro di routine, un solo ricercatore può
            costruire e mantenere risorse per la comunità (un atlante delle reazioni, valutazioni che chiunque può
            rieseguire, un esploratore dei tassi) che altrimenti richiederebbero un piccolo gruppo. Questo non
            sostituisce le verifiche, ed è per questo che la sezione seguente è la più lunga.
          </p>
        </div>
      </section>

      <section aria-labelledby="checks" className="mt-14">
        <H2 id="checks">{TEXT.it.sections.checks}</H2>
        <div className={prose}>
          <p>
            Ogni serie di modifiche è stata esaminata in modo indipendente da revisori IA distinti (anch&apos;essi
            Claude), che non avevano scritto il lavoro, ciascuno incaricato di leggere il sito in un ruolo, da un solo
            punto di vista:
          </p>
        </div>
        <ul className={list}>
          <li>nel ruolo di un astrofisico nucleare: la fisica, i numeri e la bibliografia;</li>
          <li>nel ruolo di uno specialista di R-matrix: le valutazioni e le note;</li>
          <li>
            nel ruolo di un revisore dell&apos;interfaccia e dell&apos;accessibilità: telefono e computer, testo al
            200%, la sola tastiera;
          </li>
          <li>nel ruolo di lettori del grande pubblico, uno in inglese e uno in italiano;</li>
          <li>nel ruolo di un revisore senior, che legge l&apos;intero sito come farebbe il referee di una rivista.</li>
        </ul>
        <div className={prose}>
          <p>
            Le revisioni sono state ripetute, e i problemi trovati corretti, finché nessuna ha più segnalato problemi di
            gravità alta o media. Sono punti di vista che un&apos;IA è stata incaricata di assumere, non revisioni di
            persone, e non le sostituiscono: se trovi qualcosa di sbagliato, fammelo sapere (vedi sotto).
          </p>
          <p>Il resto lo controllano test automatici:</p>
        </div>
        <ul className={list}>
          <li>
            l&apos;atlante ({n.reactions} reazioni, {n.references} riferimenti bibliografici) viene validato: ogni
            reazione deve conservare carica e numero di massa, ogni collegamento deve puntare a qualcosa che esiste, e
            ogni riferimento deve dire come è stato verificato;
          </li>
          <li>
            i <L href="/atlas/rates">tassi di reazione</L> e i calcoli di rete sono confrontati con pynucastro,
            l&apos;implementazione di riferimento degli stessi tassi REACLIB, e ogni numero delle{" "}
            <L href="/atlas/rates/curiosities">curiosità</L> è verificato con il risolutore dell&apos;esploratore;
          </li>
          <li>
            le <L href="/evaluations">valutazioni</L> che girano nel tuo browser sono confrontate con AZURE2 nativo su
            ogni modello, e i fit pubblicati sono i risultati nativi;
          </li>
          <li>la ricerca del sito è provata sulle parole che le persone scrivono davvero, in italiano e in inglese.</li>
        </ul>
        <div className={prose}>
          <p>
            Ogni numero nell&apos;atlante e nelle pagine divulgative ha una citazione alla sua fonte, e durante le
            revisioni i riferimenti sono stati confrontati con le fonti che citano. Se ne trovi uno sbagliato, i
            collegamenti per le segnalazioni qui sotto sono il modo più rapido per dirmelo.
          </p>
        </div>
      </section>

      <section aria-labelledby="data" className="mt-14">
        <H2 id="data">{TEXT.it.sections.data}</H2>
        <ul className={list}>
          <li>
            <span className="font-medium text-foreground">Masse e tempi di dimezzamento:</span> la valutazione delle
            masse atomiche AME2020 (M. Wang <i>et al.</i>, Chin. Phys. C 45, 030003 (2021)) e NUBASE2020 (F. G. Kondev{" "}
            <i>et al.</i>, Chin. Phys. C 45, 030001 (2021)). Da qui vengono i valori Q dell&apos;atlante e i tempi di
            dimezzamento; l&apos;esploratore dei tassi mostra i valori Q di REACLIB, quelli con cui sono stati
            ricavati i suoi tassi.
          </li>
          <li>
            <span className="font-medium text-foreground">Tassi di reazione:</span> la libreria{" "}
            <Ext href="https://reaclib.jinaweb.org/">REACLIB</Ext> di JINA, letta tramite{" "}
            <Ext href="https://github.com/pynucastro/pynucastro">pynucastro</Ext> (licenza BSD a 3 clausole). Ogni tasso
            conserva la sua etichetta REACLIB e l&apos;articolo da cui proviene.
          </li>
          <li>
            <span className="font-medium text-foreground">R-matrix:</span>{" "}
            <Ext href="https://github.com/rdeboer1/AZURE2">AZURE2</Ext> (R. E. Azuma <i>et al.</i>, Phys. Rev. C 81,
            045805 (2010)), il codice di cui sono responsabile, esegue ogni valutazione.
          </li>
          <li>
            <span className="font-medium text-foreground">I dati delle valutazioni:</span> le sezioni d&apos;urto
            misurate in ciascuna delle {n.evaluations} valutazioni vengono dagli articoli elencati nella sua pagina, e i
            file di input si possono scaricare ed eseguire in locale.
          </li>
          <li>
            <span className="font-medium text-foreground">In seguito:</span> collegamenti a EXFOR, la banca dati
            internazionale dei dati sperimentali sulle reazioni nucleari, per le misure citate nell&apos;atlante.
          </li>
        </ul>
        <div className={prose}>
          <p>
            I testi dell&apos;atlante e il suo file di dati (<L href="/atlas#cite">data.json</L>) sono distribuiti con
            licenza <Ext href="https://creativecommons.org/licenses/by/4.0/deed.it">CC BY 4.0</Ext>: puoi riutilizzarli
            citando la fonte. I dati altrui (AME2020, NUBASE2020, REACLIB, le misure) restano soggetti ai loro termini;
            cita le pubblicazioni originali.
          </p>
        </div>
      </section>

      <section aria-labelledby="code" className="mt-14">
        <H2 id="code">{TEXT.it.sections.code}</H2>
        <div className={prose}>
          <p>
            Il codice sorgente dell&apos;intero sito, comprese le valutazioni e l&apos;esploratore dei tassi, è
            pubblico su GitHub: <Ext href={REPO}>github.com/skowrons94/Website</Ext>.
          </p>
          <p>
            Se trovi un errore,{" "}
            <Ext href={issueUrl("Errore nel sito", "Pagina:\nSezione:\n\nCosa è sbagliato:\n\n\nCome dovrebbe essere, con una fonte se ce l'hai:\n")}>
              apri una segnalazione
            </Ext>
            ; ogni reazione dell&apos;atlante, la pagina sul processo s e ogni voce del glossario hanno anche un
            collegamento &laquo;Segnala un errore&raquo; che compila la segnalazione al posto tuo, e uno &laquo;Proponi una
            reazione&raquo; per ciò che manca. Puoi anche scrivermi per e-mail. Correzioni e contributi (una reazione,
            un riferimento, una traduzione) sono benvenuti come pull request.
          </p>
        </div>
      </section>
    </>
  )
}

/* -- the page ----------------------------------------------------------------- */

export function AboutPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang]
  const to = (p: string) => localePath(lang, p)
  const atlas = getAtlas(lang)
  const profile = getProfile(lang)
  const release = siteRelease()
  const n: Counts = {
    reactions: atlas.reactions.length,
    references: Object.keys(atlas.references).length,
    evaluations: getEvaluationCounts().total,
  }
  const ids = ["ai", "checks", "data", "code", "cite"] as const
  const author = profile.name.replace(/^(\S)\S*\s+/, "$1. ")

  return (
    <Container>
      <PageHeader title={t.title} lead={t.lead} />

      <nav aria-label={t.contents} className="-mt-6 mb-12 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {ids.map((id) => (
          <a
            key={id}
            href={`#${id}`}
            className="inline-flex min-h-10 items-center text-muted-foreground underline-offset-4 transition-colors hover:text-link hover:underline"
          >
            {t.sections[id]}
          </a>
        ))}
      </nav>

      {lang === "it" ? <BodyIt to={to} n={n} /> : <BodyEn to={to} n={n} />}

      <section id="cite" aria-labelledby="cite-heading" className="mt-14 scroll-mt-24 rounded-lg border border-border p-4 sm:p-6">
        <h2 id="cite-heading" className="font-serif text-xl font-semibold tracking-tight">
          {t.sections.cite}
        </h2>
        <p lang={lang === "en" ? undefined : "en"} className="mt-3 break-words rounded-md bg-secondary/60 px-4 py-3 font-mono text-[0.8125rem] leading-relaxed">
          {author}, <i>Nuclear astrophysics: reaction atlas, R-matrix evaluations and reaction rates</i> (website and
          source code), {t.cite.version} {release.version} ({release.date}),{" "}
          {release.doi ? `doi:${release.doi}` : <span className="break-all">{REPO.replace(/^https:\/\//, "")}</span>}.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {release.doi ? (
            <>
              {t.cite.doi}:{" "}
              <a href={`https://doi.org/${release.doi}`} className={A}>
                {release.doi}
              </a>
            </>
          ) : (
            t.cite.noDoi
          )}
        </p>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{t.cite.specific}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t.cite.cff}{" "}
          <a href={`${REPO}/blob/main/CITATION.cff`} target="_blank" rel="noreferrer" className={A}>
            CITATION.cff
          </a>
        </p>
      </section>
    </Container>
  )
}
