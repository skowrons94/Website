import "@/components/math-styles"
import fs from "node:fs"
import { ratesHrefFor } from "@/lib/rates/catalog"
import path from "node:path"

import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight, ChevronDown, SlidersHorizontal } from "lucide-react"

import { Cite, ReferenceList } from "@/components/atlas/reference-list"
import { ReportLinks } from "@/components/report-links"
import { LunaBadge, StatusBadge } from "@/components/atlas/status-badge"
import { linkTerms } from "@/components/atlas/linked-text"
import { Term } from "@/components/atlas/term"
import { Sci } from "@/components/sci"
import { beforeNuclide } from "@/lib/localize.mjs"
import {
  eventsFor,
  formatGamow,
  formatQ,
  formatTemperature,
  getAtlas,
  getFacility,
  getMethod,
  getReaction,
  getReactionIds,
  kindLabel,
  renderDetails,
  statusHint,
  type Reaction,
} from "@/lib/atlas"
import { formatDate } from "@/lib/atlas-format"
import { decimal, dict, localePath, withoutArticle, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"
// --- data expert ---
import { Attribution } from "@/components/data/attribution"
import { MeasurementsPanel, PanelLink } from "@/components/data/measurements-panel"
import { compoundNuclei } from "@/lib/data/build"
import { fill } from "@/lib/data/fill"
import { compoundOf, displayNuc } from "@/lib/data/nuclide"
import { atlasPanel } from "@/lib/data/panel"
import { PageLd } from "@/components/json-ld"

export const reactionParams = () => getReactionIds().map((id) => ({ id }))

export function reactionMetadata(id: string, lang: Lang): Metadata {
  const reaction = getReaction(id, lang)
  if (!reaction) return {}
  const t = dict(lang).atlas
  return pageMetadata(`${reaction.label} · ${t.name}`, reaction.summary || t.entryDescription(reaction.label), lang)
}

/**
 * A short line on a translated page, once, where the first section still in
 * English begins: which technical sections are in English.
 */
function InEnglish({ lang, sections }: { lang: Lang; sections: ("measurements" | "details" | "openQuestions")[] }) {
  const t = dict(lang).atlas
  const text = t.englishSections(sections.map((s) => t.sectionNames[s]))
  if (!text) return null
  return <p className="mt-4 text-sm italic text-muted-foreground">{text}</p>
}

/* -- pieces ---------------------------------------------------------------- */

function SectionTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 font-serif text-2xl font-semibold tracking-tight">
      {children}
    </h2>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
  )
}

function Facts({ reaction: r, lang }: { reaction: Reaction; lang: Lang }) {
  const atlas = getAtlas(lang)
  const t = dict(lang).atlas
  const annihilation = r.q ? t.qAnnihilation(decimal(r.q.kinetic.toFixed(3), lang)) : []
  // Glossary links inside the facts box: once each, in this box.
  const seen = new Set<string>(["gamow", "q"])
  return (
    <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
      <Label>{t.facts}</Label>
      <dl className="space-y-4 text-sm">
        {r.status && r.kind !== "decay" && (
          <div>
            <dt className="text-muted-foreground">
              <Term id="status" lang={lang}>
                {t.statusFact}
              </Term>
            </dt>
            <dd className="mt-1 text-pretty text-[0.8125rem] leading-relaxed text-foreground/85">
              {linkTerms(r.statusPlain || r.statusNote || statusHint(r.status, lang), lang, seen)}
            </dd>
          </div>
        )}

        {r.kind !== "decay" && r.hasFile && (
          <div>
            <dt className="text-muted-foreground">{t.liveEvaluation}</dt>
            {r.rmatrix.length > 0 ? (
              r.rmatrix.map((ev) => (
                <dd key={ev} className="mt-1">
                  <Link href={localePath(lang, `/evaluations/${ev}?tab=plot`)} className="font-medium text-link underline-offset-4 hover:underline">
                    {otherReaction(ev, r.label) ? (
                      <Sci>{t.relatedEvaluation(otherReaction(ev, r.label)!, supCode(ev))}</Sci>
                    ) : (
                      <>
                        {t.plotData}
                        {" · "}
                        <Sci>{supCode(ev)}</Sci>
                      </>
                    )}{" "}
                    →
                  </Link>
                </dd>
              ))
            ) : (
              <dd className="mt-1 text-[0.8125rem] text-foreground/85">
                {t.noLiveEvaluation}
                {" · "}
                <Link href={localePath(lang, "/evaluations")} className="text-link underline-offset-4 hover:underline">
                  {dict(lang).nav.evaluations}
                </Link>
              </dd>
            )}
          </div>
        )}

        {/* --- rates --- the reaction in the rates explorer */}
        {ratesHrefFor(r.id) && (
          <div>
            <dt className="text-muted-foreground">{dict(lang).nav.rates}</dt>
            <dd className="mt-1">
              <Link href={localePath(lang, ratesHrefFor(r.id)!)} className="font-medium text-link underline-offset-4 hover:underline">
                {t.exploreRates} →
              </Link>
            </dd>
          </div>
        )}

        {r.q && (
          <div>
            <dt className="text-muted-foreground">
              <Term id="q-value" lang={lang}>
                {t.qValue}
              </Term>{" "}
              <span className="text-xs">· {r.q.value < 0 ? t.qNeeded : t.qReleased}</span>
            </dt>
            <dd className="mt-0.5 text-base font-medium tabular">{formatQ(r.q, lang)}</dd>
            {r.q.annihilation && (
              <dd className="mt-1 text-xs leading-snug text-muted-foreground">
                {annihilation[0]}
                <sub>{annihilation[1]}</sub>
                {annihilation[2]}
                <span className="tabular">{annihilation[3]}</span>
                {annihilation[4]}
              </dd>
            )}
          </div>
        )}

        {r.halfLife && (
          <div>
            <dt className="text-muted-foreground">
              {(() => {
                const nuclide = r.from ? displayCode(r.target) : r.target
                // "dell'⁸B", "del ¹⁸F": the article follows the mass number.
                const label = lang === "it" ? beforeNuclide(t.halfLifeOf, nuclide) : `${t.halfLifeOf} `
                return (
                  <>
                    <Term id="half-life" lang={lang}>
                      {label.trimEnd()}
                    </Term>
                    {label.endsWith(" ") ? " " : ""}
                    <Sci>{nuclide}</Sci>
                  </>
                )
              })()}
            </dt>
            <dd className="mt-0.5 text-base font-medium tabular">
              <Sci>{r.halfLife.text}</Sci>
            </dd>
            {r.kind !== "decay" && (
              <dd className="mt-1 text-xs leading-snug text-muted-foreground">
                {r.projectile === "n" ? t.halfLifeLabCapture : t.halfLifeLab}
              </dd>
            )}
          </div>
        )}

        {r.gamow.length > 0 && (
          <div>
            <dt className="text-muted-foreground">
              <Term id="gamow-window" lang={lang}>
                {t.gamow}
              </Term>
            </dt>
            <dd>
              <ul className="mt-1 space-y-1.5">
                {r.gamow.map((g) => (
                  <li key={`${g.T9}-${g.label}`}>
                    <span className="font-medium tabular">{formatGamow(g, lang)}</span>
                    {g.thresholdLimited && g.threshold !== undefined && (
                      <span className="block text-xs text-foreground/80">
                        <Term id="threshold" lang={lang}>
                          {t.thresholdLimited(decimal((g.threshold / 1000).toFixed(2), lang))}
                        </Term>
                      </span>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {linkTerms(g.label, lang, seen)},{" "}
                      {linkTerms(formatTemperature(g.T9, lang), lang, seen)} (
                      {atlas.networks.find((n) => n.id === g.network)?.name ?? g.network})
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}

        {r.thermal.length > 0 && (
          <div>
            <dt className="text-muted-foreground">{t.thermal}</dt>
            <dd className="mt-0.5 text-pretty">
              <ThermalPlain thermal={r.thermal} lang={lang} />
            </dd>
            {r.thermal.length > 1 && (
              <dd>
                <details className="group mt-2">
                  <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-xs text-link [&::-webkit-details-marker]:hidden">
                    {t.thermalBySite}
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <ul className="mt-1 space-y-1.5">
                    {r.thermal.map((th) => (
                      <li key={th.T9}>
                        <span className="font-medium tabular">{decimal(th.kT.toFixed(th.kT < 10 ? 1 : 0), lang)} keV</span>
                        <span className="block text-xs text-muted-foreground">
                          <Sci>{th.label}</Sci>, {formatTemperature(th.T9, lang)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </dd>
            )}
          </div>
        )}

        {r.windowNote && r.gamow.length === 0 && (
          <div>
            <dt className="text-muted-foreground">{r.thermal.length > 0 ? t.whyNoGamow : t.energies}</dt>
            <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
              <Sci>{r.windowNote}</Sci>
            </dd>
          </div>
        )}

        {r.productHalfLife && !r.productHalfLife.stable && r.kind !== "decay" && (
          <div>
            <dt className="text-muted-foreground">
              {t.product} <Sci>{displayCode(r.product)}</Sci>
            </dt>
            <dd className="mt-0.5">
              {t.radioactive}, t<sub>½</sub> = <span className="tabular"><Sci>{r.productHalfLife.text}</Sci></span>
            </dd>
          </div>
        )}

        <div>
          <dt className="text-muted-foreground">{t.kind}</dt>
          <dd className="mt-0.5">{kindLabel(r.kind, lang)}</dd>
        </div>

        {r.updated && (
          <div>
            <dt className="text-muted-foreground">{t.lastUpdated}</dt>
            <dd className="mt-0.5">
              <time dateTime={r.updated}>{formatDate(r.updated, lang)}</time>
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

/**
 * The thermal energies of a neutron capture in one plain line: "about 8–90
 * keV, the energy of a gas at 90–1000 million kelvin", rounded the way a
 * person would say it (English: no separator in four-digit numbers).
 */
function ThermalPlain({ thermal, lang }: { thermal: Reaction["thermal"]; lang: Lang }) {
  const t = dict(lang).atlas
  const round = (v: number) => (v < 10 ? Math.round(v) : Number(v.toPrecision(2)))
  const kTs = thermal.map((th) => th.kT)
  const mks = thermal.map((th) => th.T9 * 1000)
  const span = (values: number[]) => {
    const lo = round(Math.min(...values))
    const hi = round(Math.max(...values))
    const f = (v: number) => (lang === "it" ? v.toLocaleString("it-IT") : v.toLocaleString("en-GB", { useGrouping: v >= 10000 }).replace(/,/g, "\u2009"))
    return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`
  }
  return <span className="text-[0.9375rem] font-medium">{t.thermalPlain(span(kTs), span(mks))}</span>
}

/** An evaluation id, `13N` → `¹³N`. */
function supCode(id: string): string {
  return id.replace(/^(\d+)/, (m) => m.split("").map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]).join(""))
}

/** `14N` → `¹⁴N`, for the facts box; leaves anything else as it is. */
function displayCode(code: string): string {
  const match = /^(\d+)([A-Z][a-z]?)$/.exec(code)
  if (!match) return code
  const sup = "⁰¹²³⁴⁵⁶⁷⁸⁹"
  return `${match[1].replace(/\d/g, (d) => sup[Number(d)])}${match[2]}`
}

/* -- page ------------------------------------------------------------------ */

/**
 * The reaction an evaluation fits instead of `label`, when it does not fit
 * `label` itself (⁴He(αα,γ)¹²C links to the α+α scattering of ⁸Be), from its
 * info.json `reactions`; null when it fits this reaction, or cannot tell.
 */
function otherReaction(id: string, label: string): string | null {
  try {
    const file = path.join(process.cwd(), "server", "evaluations", id, "info.json")
    const info = JSON.parse(fs.readFileSync(file, "utf8")) as { reactions?: unknown }
    const reactions = Array.isArray(info.reactions) ? info.reactions.filter((x): x is string => typeof x === "string") : []
    const key = (x: string) => x.replace(/\s+/g, "")
    if (reactions.length === 0 || reactions.some((x) => key(x) === key(label))) return null
    return reactions[0]
  } catch {
    return null
  }
}

/** The site's own R-matrix evaluations linked from a reaction (rmatrix: in its file). */
function rmatrixEvaluations(ids: string[]) {
  return ids.map((id) => {
    const file = path.join(process.cwd(), "server", "evaluations", id, "info.json")
    let reference: string | null = null
    try {
      const info = JSON.parse(fs.readFileSync(file, "utf8"))
      reference = typeof info.reference === "string" && info.reference.startsWith("10.") ? info.reference : null
    } catch {
      /* an evaluation without info.json still links */
    }
    return { id, reference }
  })
}

export async function ReactionPage({ id, lang }: { id: string; lang: Lang }) {
  const r = getReaction(id, lang)
  if (!r) notFound()

  const t = dict(lang).atlas
  const to = (path: string) => localePath(lang, path)
  const atlas = getAtlas(lang)
  const html = await renderDetails(r.details)
  const events = eventsFor(r.id, lang)
  // Sections whose text is still English on a translated page.
  const english = (section: Reaction["untranslated"][number]) => r.untranslated.includes(section)
  const enLang = (section: Reaction["untranslated"][number]) => (english(section) ? "en" : undefined)
  // The sections still in English, in reading order; the notice goes before the first.
  const englishSections = (["measurements", "details", "openQuestions"] as const).filter((section) => english(section))
  const notice = (section: (typeof englishSections)[number]) =>
    englishSections[0] === section ? <InEnglish lang={lang} sections={[...englishSections]} /> : null
  const networks = r.networks
    .map((nid) => atlas.networks.find((n) => n.id === nid))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
  const family = networks[0] ? atlas.families.find((f) => f.id === networks[0].family) : undefined
  // Where a family lives: its own page (the s-process) or its place on the map.
  const familyHref = (id: string) => atlas.families.find((f) => f.id === id)?.page ?? `/atlas#${id}`
  // Pages of the families this reaction belongs to, or that they point to.
  const familyPages = [
    ...new Map(
      r.families
        .flatMap((fid) => {
          const f = atlas.families.find((x) => x.id === fid)
          return f ? [f, ...f.see.map((id) => atlas.families.find((x) => x.id === id))] : []
        })
        .filter((f): f is NonNullable<typeof f> => Boolean(f?.page))
        .map((f) => [f.page!, f]),
    ).values(),
  ]

  // The line above the title: the networks, or their family when the reaction
  // is in several networks of one family ("The s-process", not "main
  // component (AGB stars), weak component (massive stars)").
  const eyebrow = [
    ...new Map(
      networks.map((n) => {
        const fam = atlas.families.find((f) => f.id === n.family)
        const several = networks.filter((m) => m.family === n.family).length > 1
        return several && fam
          ? [fam.id, { key: fam.id, name: fam.name, href: familyHref(fam.id) }]
          : [n.id, { key: n.id, name: n.name, href: familyHref(n.family) }]
      }),
    ).values(),
  ]

  // Previous and next along the first network the reaction belongs to.
  const sequence = networks[0]?.reactions ?? []
  const position = sequence.indexOf(r.id)
  const prev = position > 0 ? getReaction(sequence[position - 1], lang) : undefined
  const next = position >= 0 && position < sequence.length - 1 ? getReaction(sequence[position + 1], lang) : undefined

  const related = r.related.map((rid) => getReaction(rid, lang)).filter((x): x is Reaction => Boolean(x))
  const methods = r.methods.map((mid) => getMethod(mid, lang) ?? { id: mid, name: mid })
  const order = r.references
  const years = r.measurements.map((m) => m.year).filter((y): y is number => y !== null).sort((a, b) => a - b)
  const yearSpan = years.length === 0 ? "" : years[0] === years[years.length - 1] ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`
  // --- data expert --- the EXFOR measurements of this reaction (build time, from the index)
  const dx = dict(lang).dataExpert
  const exfor = atlasPanel(r.id, lang)
  const compound = exfor ? compoundOf(exfor.slugs[0].key) : null
  const compoundPage = compound && compoundNuclei(lang).has(compound) ? compound : null
  const toc = [
    r.hasFile && (r.summary || r.role) ? { id: "summary", label: t.summaryAnchor } : null,
    methods.length > 0 || r.measurements.length > 0 ? { id: "measured", label: t.howMeasured } : null,
    html || (r.statusPlain && r.statusNote) || r.gamow.length > 0 ? { id: "details", label: t.details } : null,
    // --- data expert ---
    exfor ? { id: "exfor", label: dx.panel.title } : null,
    r.evaluations.length > 0 ? { id: "evaluations", label: t.evaluationsTitle } : null,
    r.openQuestions.length > 0 ? { id: "open-questions", label: t.openQuestions } : null,
    order.length > 0 ? { id: "references", label: t.references } : null,
  ].filter((x): x is { id: string; label: string } => x !== null)
  // Glossary links in the running text, once each, in reading order.
  const seen = new Set<string>()
  const summaryText = linkTerms(r.summary, lang, seen)
  const roleText = linkTerms(r.role, lang, seen)
  const noteTexts = r.measurements.map((m) => linkTerms(m.note, lang, seen))
  const questionTexts = r.openQuestions.map((q) => linkTerms(q, lang, seen))
  // The technical status note, when the facts box shows a plain one instead.
  const statusDetail = r.statusPlain && r.statusNote ? r.statusNote : ""
  const thresholdLimited = r.gamow.some((g) => g.thresholdLimited)
  const hasNumbers = r.gamow.length > 0
  const showDetails = Boolean(html || statusDetail || hasNumbers)
  const measurementLine = t.measurementCount(
    r.measurements.length,
    yearSpan,
    r.measurements.filter((m) => m.luna).length,
  )

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 [overflow-wrap:anywhere] sm:px-8 xl:max-w-7xl">
      {/* --- find --- */}
      <PageLd lang={lang} trail={[{ name: dict(lang).nav.atlas, path: "/atlas" }, { name: r.label, path: `/atlas/${r.id}` }]} />
      <Link
        href={to(family ? familyHref(family.id) : "/atlas")}
        className="-my-2.5 inline-flex py-2.5 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {family ? (
          <span>
            {t.name} · <Sci>{withoutArticle(family.name)}</Sci>
          </span>
        ) : (
          t.name
        )}
      </Link>

      {/* -- header -------------------------------------------------------- */}
      <header className="mt-8 border-b border-border/70 pb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {kindLabel(r.kind, lang)}
          {eyebrow.length > 0 && " · "}
          {eyebrow.map((item, i) => (
            <span key={item.key}>
              {i > 0 && ", "}
              <Link href={to(item.href)} className="underline-offset-4 hover:text-foreground hover:underline">
                <Sci>{withoutArticle(item.name)}</Sci>
              </Link>
            </span>
          ))}
        </p>
        <h1 className="mt-3 font-serif text-[min(2.25rem,11vw)] font-semibold leading-tight tracking-tight sm:text-5xl">
          <Sci>{r.label}</Sci>
        </h1>
        {r.plain && (
          <p className="mt-3 text-pretty text-lg leading-snug text-muted-foreground">
            <span className="sr-only">: </span>
            {r.plain}
            <Link
              href={to("/glossary#notation")}
              className="ml-3 inline-block py-1 text-sm text-link underline-offset-4 hover:underline"
            >
              {t.readNotation}
            </Link>
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2">
          {r.kind !== "decay" && <StatusBadge status={r.status} pending={!r.hasFile} lang={lang} link />}
          {!r.hasFile && r.kind === "decay" && <StatusBadge status={null} pending lang={lang} />}
          {r.luna && <LunaBadge label={t.measuredAtLuna} />}
          {r.rmatrix.map((ev) => (
            <Link
              key={ev}
              href={to(`/evaluations/${ev}?tab=plot`)}
              aria-label={
                otherReaction(ev, r.label)
                  ? t.relatedEvaluationAria(otherReaction(ev, r.label)!, supCode(ev))
                  : t.plotDataOf(supCode(ev))
              }
              className="group inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-link transition-colors hover:border-foreground/30"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {otherReaction(ev, r.label) ? (
                  <Sci>{t.relatedEvaluation(otherReaction(ev, r.label)!, supCode(ev))}</Sci>
                ) : (
                  t.plotData
                )}
                {r.rmatrix.length > 1 && !otherReaction(ev, r.label) && (
                  <>
                    {" · "}
                    <Sci>{supCode(ev)}</Sci>
                  </>
                )}
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ))}
        </div>
      </header>

      {toc.length > 2 && (
        <details className="group mt-6 rounded-lg border border-border/80 xl:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            {t.onThisPage}
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <nav aria-label={t.onThisPage} className="px-4 pb-3">
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="inline-flex min-h-8 items-center text-link underline-offset-4 hover:underline">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </details>
      )}

      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <article className="min-w-0 max-w-[46rem] xl:max-w-[50rem]">
          {/* -- for a general reader --------------------------------------- */}
          {r.hasFile ? (
            <div id="summary" className="scroll-mt-24 space-y-5">
              {r.summary && (
                <p className="text-pretty text-xl leading-relaxed">{summaryText}</p>
              )}
              {r.role && (
                <p className="text-pretty text-[1.0625rem] leading-[1.75] text-foreground/90">{roleText}</p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6">
              <p className="font-serif text-lg font-semibold tracking-tight">{t.entryInPreparation}</p>
              <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
                {t.preparationText(networks.length === 1)}
              </p>
            </div>
          )}

          {familyPages.length > 0 && (
            <ul className="mt-6 space-y-2">
              {familyPages.map((f) => (
                <li key={f.page}>
                  <Link
                    href={to(f.page!)}
                    className="group inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-[0.95rem] font-medium text-link transition-colors hover:border-foreground/30"
                  >
                    <Sci>{t.familyPageLink(f.name)}</Sci>
                    <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* facts sit here on a phone, beside the text on a wide screen */}
          <div className="mt-10 lg:hidden">
            <Facts reaction={r} lang={lang} />
          </div>

          {/* -- timeline strip --------------------------------------------- */}
          {events.length > 0 && (
            <section className="mt-12">
              <Label>{t.onTimeline}</Label>
              <ol className="relative space-y-3 border-l border-border pl-5">
                {events.map((e) => (
                  <li key={e.id} className="relative">
                    <span
                      aria-hidden
                      className={`absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background ${e.luna ? "bg-foreground" : "bg-muted-foreground/50"}`}
                    />
                    <Link href={to(`/atlas/timeline#${e.id}`)} className="group flex flex-wrap items-baseline gap-x-3">
                      <span className="tabular text-sm font-medium">{e.year}</span>
                      <span className="text-[0.95rem] text-muted-foreground group-hover:text-link">
                        <Sci>{e.title}</Sci>
                      </span>
                      {e.luna && <LunaBadge />}
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* -- how it was measured ----------------------------------------- */}
          {(methods.length > 0 || r.measurements.length > 0) && (
            <section className="mt-14">
              <SectionTitle id="measured">{t.howMeasured}</SectionTitle>
              {methods.length > 0 && (
                <ul className="mt-5 flex flex-wrap gap-2">
                  {methods.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={to(`/atlas/methods#${m.id}`)}
                        className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-sm text-link underline-offset-4 transition-colors hover:border-foreground/30 hover:underline"
                      >
                        <Sci>{m.name}</Sci>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {r.measurements.length > 0 && notice("measurements")}
              {r.measurements.length > 0 && (
                <details className="group mt-8 rounded-lg border border-border/80">
                  <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-4 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <span className="text-[0.95rem] font-medium tabular">{measurementLine}</span>
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-link">
                      <span className="group-open:hidden">{t.showList}</span>
                      <span className="hidden group-open:inline">{t.hideList}</span>
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
                    </span>
                  </summary>
                  <div className="px-4 pb-2">
                    <ol className="mt-3 divide-y divide-border/70 border-t border-border/70">
                      {r.measurements.map((m, i) => {
                        const facility = m.facility ? getFacility(m.facility, lang) : undefined
                        const method = m.method ? getMethod(m.method, lang) : undefined
                        return (
                          <li key={i} className="grid grid-cols-[minmax(36px,auto)_minmax(0,1fr)] gap-x-4 py-5 sm:grid-cols-[4rem_minmax(0,1fr)]">
                            <p className="tabular pt-0.5 text-sm font-medium">{m.year ?? "—"}</p>
                            <div className="min-w-0">
                              {(facility || m.lab || m.luna) && (
                                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                  {facility ? (
                                    <Link
                                      href={to(`/atlas/methods#${facility.id}`)}
                                      className="font-medium underline-offset-4 hover:text-link hover:underline"
                                    >
                                      <Sci>{facility.name}</Sci>
                                    </Link>
                                  ) : (
                                    m.lab && (
                                      <span className="font-medium">
                                        <Sci>{m.lab}</Sci>
                                      </span>
                                    )
                                  )}
                                  {facility?.lab && (
                                    <span className="text-muted-foreground">
                                      <Sci>{facility.lab}</Sci>
                                    </span>
                                  )}
                                  {m.luna && !facility?.luna && <LunaBadge />}
                                </p>
                              )}
                              <p className={`${facility || m.lab || m.luna ? "mt-1" : ""} text-xs text-muted-foreground`}>
                                {method && (
                                  <Link href={to(`/atlas/methods#${method.id}`)} className="underline-offset-2 hover:text-link hover:underline">
                                    <Sci>{method.name}</Sci>
                                  </Link>
                                )}
                                {method && m.energy && " · "}
                                {m.energy && (
                                  <span className="tabular">
                                    <Sci>{decimal(m.energy, lang)}</Sci>
                                  </span>
                                )}
                              </p>
                              {m.note && (
                                <p className="mt-2 text-pretty text-[0.95rem] leading-relaxed text-foreground/90">
                                  <span lang={enLang("measurements")}>{noteTexts[i]}</span>{" "}
                                  <Cite keys={m.refs} order={order} />
                                </p>
                              )}
                              {!m.note && m.refs.length > 0 && (
                                <p className="mt-2 text-sm">
                                  <Cite keys={m.refs} order={order} />
                                </p>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                </details>
              )}
            </section>
          )}

          {/* --- data expert --- measurements in EXFOR against the Gamow window */}
          {exfor && (
            <div className="mt-14">
              <MeasurementsPanel
                strings={dx}
                lang={lang}
                rows={exfor.rows}
                windows={exfor.windows}
                lowest={exfor.lowest}
                counts={exfor.counts}
                macs={exfor.macs}
                threshold={exfor.threshold}
                neutron={exfor.neutron}
                links={
                  <>
                    {exfor.slugs.map((s) => (
                      <PanelLink key={s.slug} href={to(`/data/reaction/${s.slug}`)}>
                        {dx.panel.allMeasurements}
                        {exfor.slugs.length > 1 ? ` · ${s.key}` : ""} <span className="font-normal text-muted-foreground tabular">({s.n})</span>
                      </PanelLink>
                    ))}
                    {compoundPage && (
                      <PanelLink href={to(`/data/nucleus/${compoundPage}`)}>
                        <Sci>{fill(dx.panel.compound, { cn: displayNuc(compoundPage) })}</Sci>
                      </PanelLink>
                    )}
                  </>
                }
              >
                <Attribution lang={lang} entries={exfor.entries} className="mt-6" />
              </MeasurementsPanel>
            </div>
          )}

          {/* -- for a specialist -------------------------------------------- */}
          {r.rmatrix.length > 0 && (
            <section className="mt-12 rounded-lg border border-border bg-card p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <SlidersHorizontal className="mt-1 h-5 w-5 shrink-0 text-link" aria-hidden />
                <div className="min-w-0">
                  <h2 className="font-serif text-lg font-semibold tracking-tight">{t.tryTitle}</h2>
                  <p className="mt-1.5 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
                    {t.tryText}
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[0.95rem]">
                    {rmatrixEvaluations(r.rmatrix).map((ev) => (
                      <li key={ev.id} className="flex flex-wrap items-baseline gap-x-2">
                        <Link href={to(`/evaluations/${ev.id}`)} className="font-medium text-link hover:underline">
                          {(() => {
                            const nuclide = ev.id.replace(/^(\d+)/, (m) => m.split("").map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]).join(""))
                            return (
                              <>
                                {lang === "it" ? beforeNuclide(t.openEvaluation[0], nuclide) : t.openEvaluation[0]}
                                <Sci>{nuclide}</Sci>
                              </>
                            )
                          })()}
                          {t.openEvaluation[1]}
                        </Link>
                        {ev.reference && (
                          <a href={`https://doi.org/${ev.reference}`} className="text-sm text-muted-foreground hover:text-foreground">
                            doi:{ev.reference}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {showDetails && (
            <section className="mt-14">
              <SectionTitle id="details">{t.details}</SectionTitle>
              {statusDetail && (
                <p className="mt-5 text-pretty text-[1rem] leading-relaxed text-foreground/90">
                  <span className="font-medium">{t.statusInDetail}: </span>
                  <Sci>{statusDetail}</Sci>
                </p>
              )}
              {html && (
                <>
                  {notice("details")}
                  <div
                    lang={enLang("details")}
                    className="prose-note mt-5 !font-sans !text-[1rem]"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </>
              )}
              {hasNumbers && (
                <p className="mt-6 text-pretty border-l-2 border-border pl-4 text-sm leading-relaxed text-muted-foreground">
                  {t.gamowNote[0]}
                  <sub>{t.gamowNote[1]}</sub>
                  {t.gamowNote[2]}
                  {thresholdLimited && ` ${t.thresholdExplain}`}
                </p>
              )}
            </section>
          )}

          {r.evaluations.length > 0 && (
            <section className="mt-14">
              <SectionTitle id="evaluations">{t.evaluationsTitle}</SectionTitle>
              <p className="mt-3 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
                {t.evaluationsText}
              </p>
              <ul className="mt-4 space-y-2 text-[0.95rem]">
                {r.evaluations.map((key) => {
                  const ref = atlas.references[key]
                  return (
                    <li key={key} className="flex gap-2.5">
                      <span className="select-none text-muted-foreground/50">—</span>
                      <span className="text-pretty">
                        {ref ? (
                          <>
                            <Sci>{shortAuthors(ref.authors)}</Sci>
                            {ref.journal ? (
                              <span className="text-muted-foreground">
                                , <Sci>{ref.journal}</Sci>
                              </span>
                            ) : (
                              <span className="text-muted-foreground"> ({ref.year})</span>
                            )}{" "}
                          </>
                        ) : (
                          `${key} `
                        )}
                        <Cite keys={[key]} order={order} />
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {r.openQuestions.length > 0 && (
            <section className="mt-14">
              <SectionTitle id="open-questions">{t.openQuestions}</SectionTitle>
              {notice("openQuestions")}
              <ul lang={enLang("openQuestions")} className="mt-5 space-y-3 border-l-2 border-border pl-5 text-[0.95rem] leading-relaxed text-foreground/90">
                {r.openQuestions.map((q, i) => (
                  <li key={i} className="text-pretty">
                    {questionTexts[i]}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {related.length > 0 && (
            <section className="mt-14">
              <Label>{t.related}</Label>
              <ul className="flex flex-wrap gap-2">
                {related.map((x) => (
                  <li key={x.id}>
                    <Link
                      href={to(`/atlas/${x.id}`)}
                      className="inline-block rounded-md border border-border bg-card px-3 py-1.5 font-serif text-[0.95rem] font-semibold transition-colors hover:border-foreground/30 hover:text-link"
                    >
                      <Sci>{x.label}</Sci>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {order.length > 0 && (
            <section id="references" className="mt-16 scroll-mt-24 border-t border-border/70 pt-8">
              <Label>{t.references}</Label>
              <ReferenceList keys={order} references={atlas.references} lang={lang} />
            </section>
          )}

          {/* --- r11 site --- */}
          <ReportLinks
            path={to(`/atlas/${r.id}`)}
            section={r.label}
            strings={dict(lang).report}
            suggest
            className="mt-12 text-sm text-muted-foreground"
          />

          {/* -- along the network ------------------------------------------- */}
          {(prev || next) && (
            <nav
              aria-label={t.along(networks[0]?.name ?? t.theNetwork)}
              className="mt-16 grid gap-4 border-t border-border/70 pt-8 sm:grid-cols-2"
            >
              {prev ? (
                <Link href={to(`/atlas/${prev.id}`)} className="group block rounded-lg border border-border p-4 transition-colors hover:border-foreground/30">
                  <span className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    <ArrowLeft className="h-3.5 w-3.5" /> {t.previousIn} <Sci>{networks[0]?.name}</Sci>
                  </span>
                  <span className="mt-1.5 block font-serif text-lg font-semibold group-hover:text-link">
                    <Sci>{prev.label}</Sci>
                  </span>
                </Link>
              ) : (
                <span className="hidden sm:block" />
              )}
              {next && (
                <Link
                  href={to(`/atlas/${next.id}`)}
                  className="group block rounded-lg border border-border p-4 text-right transition-colors hover:border-foreground/30"
                >
                  <span className="flex items-center justify-end gap-1.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    {t.nextIn} <Sci>{networks[0]?.name}</Sci> <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                  <span className="mt-1.5 block font-serif text-lg font-semibold group-hover:text-link">
                    <Sci>{next.label}</Sci>
                  </span>
                </Link>
              )}
            </nav>
          )}
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-6">
            {toc.length > 2 && (
              <nav aria-label={t.onThisPage} className="hidden xl:block">
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.onThisPage}</p>
                <ul className="space-y-0.5 border-l border-border text-sm">
                  {toc.map((item) => (
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
            )}
            <Facts reaction={r} lang={lang} />
          </div>
        </aside>
      </div>
    </div>
  )
}

/** `B. Acharya et al.` stays; a long author list is cut to the first name. */
function shortAuthors(authors: string): string {
  const parts = authors.split(",")
  if (parts.length <= 2 || /et al/.test(authors)) return authors
  return `${parts[0].trim()} et al.`
}
