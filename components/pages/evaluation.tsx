import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { EvaluationHeader, nuclideOf as nuclide } from "@/components/evaluation-header"
import EvaluationWorkspace from "@/components/evaluation-workspace"
import { Sci } from "@/components/sci"
import { getAtlas } from "@/lib/atlas"
import { azure2Ref, evaluationIds, evaluationMeta } from "@/lib/evaluation-meta"
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

export function EvaluationPage({ id, lang }: { id: string; lang: Lang }) {
  const t = dict(lang).evaluations
  // The atlas entries that point at this evaluation (rmatrix: in their file),
  // so the way back to the physics is as short as the way in.
  const meta = evaluationMeta(id)
  if (!meta.known) notFound()
  const atlas = getAtlas(lang)
  const reactions = atlas.reactions.filter((r) => r.rmatrix.includes(id))
  const licence = atlas.meta.licence ? { name: atlas.meta.licence, url: atlas.meta.licenceUrl ?? null } : null

  return (
    <>
      <EvaluationHeader meta={meta} lang={lang} azure2Ref={azure2Ref()} licence={licence} />
      <EvaluationIntro reaction={meta.reactions[0]} compound={id} lang={lang} />
      <EvaluationWorkspace id={id} known={meta.known} />
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
 */
function EvaluationIntro({ reaction, compound, lang }: { reaction?: string; compound: string; lang: Lang }) {
  const m = reaction ? /^(.+?)\((.+?),(.+?)\)(.+)$/.exec(reaction) : null
  const it = lang === "it"
  const target = m ? nuclideName(m[1], lang) : null
  const cn = nuclideName(compound, lang)
  if (!m || !target || !cn) return null
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
    : `${projectileName(projectile, lang)} ${it ? "e un nucleo di" : "and a"} ${target}${it ? "" : " nucleus"}`
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

  return (
    <section aria-label={it ? "In breve" : "In brief"} className="mt-6 max-w-[68ch] text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
      <p>
        {who} {it ? "possono unirsi per un istante in" : "can merge for an instant into"}{" "}
        <span className="text-foreground">{cn}</span> (<Sci>{reaction!}</Sci>), {then}.{" "}
        {it ? (
          <>
            Lo schema dei livelli mostra le energie a cui può esistere {cn} ({g("excited-state", "stati eccitati")}, ciascuno con
            il suo {g("spin-parity", "Jπ")}); nel grafico i punti sono le misure e la linea è il modello{" "}
            {g("r-matrix", "R-matrix")}, qui come {g("s-factor", "fattore S")}. Sposta un cursore e guarda se la linea passa
            ancora per i punti: più basso è il {g("chi-squared", "χ²")}, migliore è il fit.
          </>
        ) : (
          <>
            The level scheme shows the energies at which {cn} can exist ({g("excited-state", "excited states")}, each with its{" "}
            {g("spin-parity", "spin-parity Jπ")}); in the plot the dots are measurements and the line is the{" "}
            {g("r-matrix", "R-matrix")} model, here as an {g("s-factor", "S-factor")}. Drag a slider and see whether the line
            still passes through the dots: the lower the {g("chi-squared", "χ²")}, the better the fit.
          </>
        )}
      </p>
    </section>
  )
}
