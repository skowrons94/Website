import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { EvaluationHeader, PaperLine, nuclideOf as nuclide } from "@/components/evaluation-header"
import EvaluationWorkspace from "@/components/evaluation-workspace"
import { Sci } from "@/components/sci"
import { getAtlas } from "@/lib/atlas"
import { azure2Ref, evaluationIds, evaluationMeta, type EvaluationMeta } from "@/lib/evaluation-meta"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

/**
 * Every evaluation directory that holds a .azr file, so each build has a page
 * for each. The routes set `dynamicParams = false`: an id that is not in this
 * list is a 404 rendered by the server, not a client-side "not found" with an
 * HTTP 200. A new evaluation therefore needs a rebuild of the site, which is
 * also what gives it its server-rendered header.
 */
export function evaluationParams() {
  return evaluationIds().map((id) => ({ id }))
}

export function evaluationMetadata(id: string, lang: Lang): Metadata {
  const t = dict(lang).evaluations
  if (!evaluationIds().includes(id)) return { title: t.notFoundTitle }
  return pageMetadata(t.pageTitle(nuclide(id)), t.pageDescription(nuclide(id)), lang)
}

/** "⁴He(α,α)⁴He": the same pair in and out, i.e. elastic scattering. */
export function isScatteringReaction(reaction: string): boolean {
  const m = /^(.+?)\((.+?),(.+?)\)(.+)$/.exec(reaction)
  return Boolean(m && m[2] === m[3] && m[1] === m[4])
}

export function EvaluationPage({ id, lang }: { id: string; lang: Lang }) {
  const t = dict(lang).evaluations
  // The atlas entries that point at this evaluation (rmatrix: in their file),
  // so the way back to the physics is as short as the way in.
  const meta = evaluationMeta(id)
  if (!meta.known) notFound()
  const atlas = getAtlas(lang)
  const reactions = atlas.reactions.filter((r) => r.rmatrix.includes(id))
  const licence = atlas.meta.licence ? { name: atlas.meta.licence, url: atlas.meta.licenceUrl ?? null } : null
  // An evaluation of elastic scattering alone (⁸Be, ²⁴Mg) has no S-factor and
  // no Gamow window: it is shown as the cross section it measures.
  const scatteringOnly = meta.reactions.length > 0 && meta.reactions.every(isScatteringReaction)
  // The temperatures at which the atlas places the headline reaction, for the
  // Gamow window of the extrapolations (e.g. the Sun and the Big Bang for ⁷Be).
  const plain = (s: string) => s.normalize("NFKC").replace(/\s+/g, "")
  const headline = meta.reactions[0]
  const temperatures: { T9: number; label: string }[] = []
  if (headline && !scatteringOnly) {
    const entry = atlas.reactions.find((r) => plain(r.label) === plain(headline)) ?? reactions.find((r) => plain(r.label) === plain(headline))
    for (const g of entry?.gamow ?? []) {
      if (!temperatures.some((x) => x.T9 === g.T9)) temperatures.push({ T9: g.T9, label: g.label })
    }
    temperatures.sort((a, b) => a.T9 - b.T9)
  }

  return (
    <>
      <EvaluationHeader meta={meta} lang={lang} azure2Ref={azure2Ref()} licence={licence} />
      <EvaluationIntro reaction={headline} compound={id} lang={lang} scattering={scatteringOnly} meta={meta} />
      <EvaluationWorkspace id={id} known={meta.known} scatteringOnly={scatteringOnly} temperatures={temperatures} />
      <EvaluationHeader part="about" meta={meta} lang={lang} azure2Ref={azure2Ref()} licence={licence} />
      {reactions.length > 0 && (
        <aside className="mt-16 border-t border-border/70 pt-8 text-sm">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t.inAtlas}
          </h2>
          <p className="max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            {t.inAtlasText}
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {reactions.map((r) => (
              <li key={r.id}>
                <Link
                  href={localePath(lang, `/atlas/${r.id}`)}
                  className="inline-flex min-h-10 items-center rounded-md border border-border bg-card px-3 py-1.5 font-serif text-[0.95rem] font-semibold transition-colors hover:border-foreground/30 hover:text-link"
                >
                  <Sci>{r.label}</Sci>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </>
  )
}


/* -- the plain-language introduction ------------------------------------------ */

const ELEMENTS: Record<string, [string, string]> = {
  H: ["hydrogen", "idrogeno"],
  He: ["helium", "elio"],
  Li: ["lithium", "litio"],
  Be: ["beryllium", "berillio"],
  B: ["boron", "boro"],
  C: ["carbon", "carbonio"],
  N: ["nitrogen", "azoto"],
  O: ["oxygen", "ossigeno"],
  F: ["fluorine", "fluoro"],
  Ne: ["neon", "neon"],
  Na: ["sodium", "sodio"],
  Mg: ["magnesium", "magnesio"],
  Al: ["aluminium", "alluminio"],
  Si: ["silicon", "silicio"],
  P: ["phosphorus", "fosforo"],
  S: ["sulphur", "zolfo"],
}

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹"

/** "¹²C" or "12C" → "carbon-12" / "carbonio-12". */
function nuclideName(text: string, lang: Lang): string | null {
  const plain = text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String(SUP.indexOf(c)))
  const m = /^(\d+)([A-Z][a-z]?)$/.exec(plain.trim())
  if (!m) return null
  const names = ELEMENTS[m[2]]
  return names ? `${names[lang === "it" ? 1 : 0]}-${m[1]}` : null
}

/** English indefinite article: "an oxygen-16", "a carbon-12". */
function an(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a"
}

/**
 * Italian definite article, plain and with "in": "l'azoto-13" / "nell'azoto-13",
 * "il carbonio-12" / "nel carbonio-12", "lo zolfo-32" / "nello zolfo-32".
 */
function itArticle(word: string): { the: string; inThe: string } {
  if (/^[aeiou]/i.test(word)) return { the: "l'", inThe: "nell'" }
  if (/^(z|s[^aeiou]|gn|ps|x|y)/i.test(word)) return { the: "lo ", inThe: "nello " }
  return { the: "il ", inThe: "nel " }
}

/** The projectile with its article: "A proton", "Una particella alfa". */
function projectileName(symbol: string, lang: Lang): string {
  const it = lang === "it"
  switch (symbol) {
    case "p":
      return it ? "Un protone" : "A proton"
    case "n":
      return it ? "Un neutrone" : "A neutron"
    case "d":
      return it ? "Un deutone" : "A deuteron"
    case "α":
      return it ? "Una particella alfa (un nucleo di elio-4)" : "An alpha particle (a helium-4 nucleus)"
    case "³He":
      return it ? "Un nucleo di elio-3" : "A helium-3 nucleus"
    default:
      return symbol
  }
}

/**
 * Three sentences for a reader who has never seen a level scheme: what the
 * reaction is, what the two views show, and what to try. Built from the
 * evaluation's headline reaction and compound nucleus, with the technical
 * words linked to the glossary.
 *
 * On a phone and a tablet it is folded, with the paper line, under "What am I
 * looking at?", so the tabs are near the top; from lg it is open.
 */
function EvaluationIntro({
  reaction,
  compound,
  lang,
  scattering,
  meta,
}: {
  reaction?: string
  compound: string
  lang: Lang
  scattering: boolean
  meta: EvaluationMeta
}) {
  const t = dict(lang).evaluations
  const m = reaction ? /^(.+?)\((.+?),(.+?)\)(.+)$/.exec(reaction) : null
  const it = lang === "it"
  const target = m ? nuclideName(m[1], lang) : null
  const cn = nuclideName(compound, lang)
  const paper = <PaperLine meta={meta} lang={lang} />
  if (!m || !target || !cn) {
    return (
      <details className="mt-5 rounded-md border border-border/70 bg-card/60 px-4 py-2.5 text-sm lg:hidden">
        <summary className="min-h-8 cursor-pointer select-none py-1 font-medium">{t.whatIsThis}</summary>
        <div className="pb-2">{paper}</div>
      </details>
    )
  }
  const [, , projectile, ejectile, residual] = m
  const residualName = nuclideName(residual, lang) ?? residual
  const g = (anchor: string, text: string) => (
    <Link href={`${localePath(lang, "/glossary")}#${anchor}`} className="text-link underline-offset-4 hover:underline">
      {text}
    </Link>
  )
  const twoAlphas = projectile === "α" && m[1].replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, "") === "He" && target.endsWith("4")
  const who = twoAlphas
    ? it
      ? "Due particelle alfa (nuclei di elio-4)"
      : "Two alpha particles (helium-4 nuclei)"
    : `${projectileName(projectile, lang)} ${it ? "e un nucleo di" : `and ${an(target)}`} ${target}${it ? "" : " nucleus"}`
  const then =
    ejectile === "γ"
      ? it
        ? "che poi si libera dell'energia in più emettendo un raggio γ"
        : "which then sheds its extra energy as a γ ray"
      : ejectile === projectile
        ? it
          ? "che subito si separa di nuovo negli stessi due nuclei (diffusione)"
          : "which at once falls apart again into the same two nuclei (scattering)"
        : it
          ? `che poi si spezza in ${ejectile} e ${residualName}`
          : `which then breaks up into ${ejectile} + ${residualName}`
  const cnIt = itArticle(cn)
  // What the plot shows: an S-factor for a reaction, the measured differential
  // cross section for elastic scattering (where no S-factor is defined).
  const shown = scattering
    ? it
      ? <>qui come {g("differential-cross-section", "sezione d'urto differenziale")} dσ/dΩ</>
      : <>here as the {g("differential-cross-section", "differential cross section")} dσ/dΩ</>
    : it
      ? <>qui come {g("s-factor", "fattore S")}</>
      : <>here as an {g("s-factor", "S-factor")}</>

  const text = (
    <p>
      {who} {it ? <>possono unirsi per un istante {cnIt.inThe}</> : "can merge for an instant into"}
      {it ? "" : " "}
      <span className="text-foreground">{cn}</span> (<Sci>{reaction!}</Sci>), {then}.{" "}
      {it ? (
        <>
          Lo schema dei livelli mostra le energie a cui può esistere {cnIt.the}
          {cn} ({g("excited-state", "stati eccitati")}, ciascuno con la sua {g("spin-parity", "spin-parità Jπ")}); nel
          grafico i punti sono le misure e la linea è il modello {g("r-matrix", "R-matrix")}, {shown}. Sposta un cursore e
          guarda se la linea passa ancora per i punti: più basso è il {g("chi-squared", "χ²")}, migliore è il fit.
        </>
      ) : (
        <>
          The level scheme shows the energies at which {cn} can exist ({g("excited-state", "excited states")}, each with its{" "}
          {g("spin-parity", "spin-parity Jπ")}); in the plot the dots are measurements and the line is the{" "}
          {g("r-matrix", "R-matrix")} model, {shown}. Drag a slider and see whether the line still passes through the dots:
          the lower the {g("chi-squared", "χ²")}, the better the fit.
        </>
      )}
    </p>
  )

  return (
    <>
      <section
        aria-label={it ? "In breve" : "In brief"}
        className="mt-6 max-w-[68ch] text-pretty text-[0.95rem] leading-relaxed text-muted-foreground max-lg:hidden"
      >
        {text}
      </section>
      <details className="group mt-5 min-w-0 rounded-md border border-border/70 bg-card/60 px-4 py-1.5 text-[0.95rem] lg:hidden">
        <summary className="flex min-h-10 cursor-pointer select-none items-center font-medium marker:text-muted-foreground">
          {t.whatIsThis}
        </summary>
        <div className="space-y-3 pb-3 pt-1 text-pretty leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {text}
          <div className="text-sm">{paper}</div>
        </div>
      </details>
    </>
  )
}
