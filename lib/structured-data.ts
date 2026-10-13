/**
 * Structured data (schema.org JSON-LD) for search engines and citation tools.
 *
 * Every fact is read from where the site already keeps it: the profile, the
 * CV (experience.yaml), publications.yaml, software.yaml, the atlas' own
 * meta (atlas.yaml) and each evaluation's info.json. Nothing about Jakub is
 * written here, so the markup cannot say more than the pages do.
 *
 * Entities refer to each other by `@id` (the Person, the WebSite), so the
 * publications, the code and the datasets on any page point at one person.
 * The ids are absolute when SITE_URL is set at build time, as Google wants;
 * a local build without it keeps them root-relative.
 *
 * Server only (reads content/ through lib/content.ts and lib/atlas.ts).
 */

import { getAtlas } from "@/lib/atlas"
import {
  getAllNotes,
  getExperience,
  getProfile,
  getPublications,
  getSoftware,
  type Publication,
  type SoftwareEntry,
} from "@/lib/content"
import type { EvaluationMeta } from "@/lib/evaluation-meta"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { siteRelease } from "@/lib/site-release"
import { fileUrl, pageUrl } from "@/lib/site-url"

export type Thing = Record<string, unknown>

const CONTEXT = "https://schema.org"
const IN_LANGUAGE: Record<Lang, string> = { en: "en", it: "it" }

/** The person's id: the home page's address plus #person, one for both languages. */
export const PERSON_ID = () => `${pageUrl("/")}#person`
export const WEBSITE_ID = () => `${pageUrl("/")}#website`

/** Who "J. Skowronski" is in an author list. */
const IS_JAKUB = /^J\.\s*Skowronski\b/

/** Common licence names to their canonical URLs; anything else is kept as text. */
const LICENCE_URLS: Record<string, string> = {
  MIT: "https://spdx.org/licenses/MIT.html",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "BSD-3-Clause": "https://spdx.org/licenses/BSD-3-Clause.html",
  "GPL-3.0": "https://spdx.org/licenses/GPL-3.0-only.html",
}
const licenceUrl = (name: string | undefined | null) => (name ? (LICENCE_URLS[name.trim()] ?? name.trim()) : undefined)

/** Drops undefined, null, empty strings and empty arrays, so no field is a placeholder. */
function clean<T extends Thing>(thing: T): T {
  const out: Thing = {}
  for (const [k, v] of Object.entries(thing)) {
    if (v === undefined || v === null || v === "") continue
    if (Array.isArray(v) && v.length === 0) continue
    out[k] = v
  }
  return out as T
}

/** The profile links that identify the person elsewhere (not the AZURE2 site). */
function sameAs(lang: Lang): string[] {
  const { links, orcid } = getProfile(lang)
  const out = new Set<string>()
  if (orcid) out.add(`https://orcid.org/${orcid}`)
  for (const l of links) {
    if (/^(orcid|github|inspire|google scholar|researchgate|scopus|linkedin|mastodon)/i.test(l.label)) out.add(l.href)
  }
  return [...out]
}

/** The institutions of the education entries ("Università … — Advisor: …"). */
function alumniOf(lang: Lang): Thing[] {
  const names = new Set<string>()
  for (const e of getExperience(lang).education ?? []) {
    const name = (e.detail ?? "").split(/\s+—\s+/)[0]?.trim()
    if (name) names.add(name)
  }
  return [...names].map((name) => ({ "@type": "CollegeOrUniversity", name }))
}

/** Prizes from the CV's awards (memberships and fellowships there are not awards). */
function awards(lang: Lang): string[] {
  return (getExperience(lang).awards ?? []).map((a) => a.title).filter((t) => /\b(prize|award|premio|medal)\b/i.test(t))
}

/** What the person works on: the field in the role, the notes' topics, the code maintained. */
function knowsAbout(lang: Lang): string[] {
  const profile = getProfile(lang)
  const field = profile.role.split(/,\s*/).slice(1).join(", ").trim()
  const out: string[] = []
  const add = (s: string) => {
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s)
  }
  if (field) add(field)
  for (const n of getAllNotes()) add(n.topic)
  for (const s of getSoftware(lang)) if (s.role && /maintain|develop|responsabile|svilupp/i.test(s.role)) add(s.name)
  return out
}

export function personLd(lang: Lang): Thing {
  const p = getProfile(lang)
  return clean({
    "@type": "Person",
    "@id": PERSON_ID(),
    name: p.name,
    url: pageUrl(localePath(lang, "/")),
    jobTitle: p.role,
    email: p.email ? `mailto:${p.email}` : undefined,
    identifier: p.orcid
      ? { "@type": "PropertyValue", propertyID: "ORCID", value: p.orcid, url: `https://orcid.org/${p.orcid}` }
      : undefined,
    affiliation: clean({
      "@type": "CollegeOrUniversity",
      name: p.affiliation,
      department: p.department ? { "@type": "Organization", name: p.department } : undefined,
      address: p.location ? { "@type": "PostalAddress", addressLocality: p.location.split(",")[0].trim() } : undefined,
    }),
    alumniOf: alumniOf(lang),
    award: awards(lang),
    knowsAbout: knowsAbout(lang),
    sameAs: sameAs(lang),
  })
}

/** A short reference to the person, for author/creator fields. */
const personRef = () => ({ "@id": PERSON_ID() })

export function websiteLd(lang: Lang): Thing {
  const p = getProfile(lang)
  return clean({
    "@type": "WebSite",
    "@id": WEBSITE_ID(),
    url: pageUrl("/"),
    name: p.name,
    description: p.tagline,
    inLanguage: ["en", "it"],
    author: personRef(),
    publisher: personRef(),
    // The site search opens with the query filled in from ?q= (components/search).
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${pageUrl(localePath(lang, "/"))}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  })
}

/** A trail of pages, home first; the last item is the current page. */
export function breadcrumbLd(items: { name: string; path: string }[]): Thing {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: pageUrl(item.path),
    })),
  }
}

/** The authors of a paper, Jakub by reference; "et al." is not an author. */
function authors(list: string): Thing[] {
  return list
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !/^et al\.?$/i.test(s))
    .map((name) => (IS_JAKUB.test(name) ? personRef() : { "@type": "Person", name }))
}

/** A paper with a DOI; anything without one (submitted, under review) is not marked up. */
export function articleLd(p: Publication): Thing | null {
  if (!p.doi) return null
  const doi = p.doi.trim()
  return clean({
    "@type": "ScholarlyArticle",
    "@id": `https://doi.org/${doi}`,
    headline: p.title,
    name: p.title,
    author: authors(p.authors),
    datePublished: String(p.year),
    isPartOf: p.journal ? { "@type": "Periodical", name: p.journal.replace(/\s+\d.*$/, "").trim() } : undefined,
    identifier: { "@type": "PropertyValue", propertyID: "DOI", value: doi },
    url: `https://doi.org/${doi}`,
    sameAs: p.arxiv ? `https://arxiv.org/abs/${p.arxiv}` : undefined,
  })
}

export function publicationsLd(lang: Lang): Thing[] {
  return getPublications(lang)
    .map(articleLd)
    .filter((x): x is Thing => x !== null)
}

/**
 * One program of software.yaml. The repository is its "Source on GitHub"
 * link; the licence is the entry's `license`, when it has one. Jakub is its
 * maintainer when the entry's role says so, and its author when the code
 * lives under his own GitHub account (the profile's GitHub link).
 */
export function softwareLd(entry: SoftwareEntry, lang: Lang): Thing {
  const links = entry.links ?? []
  const repo = links.find((l) => /github\.com|gitlab\.|codeberg\.org|bitbucket\.org/i.test(l.href))?.href
  const site = links.find((l) => /^https?:/.test(l.href) && l.href !== repo && !/pypi\.org/.test(l.href))?.href
  const github = getProfile(lang).links.find((l) => /github\.com/i.test(l.href))?.href?.replace(/\/+$/, "")
  const own = Boolean(repo && github && repo.toLowerCase().startsWith(`${github.toLowerCase()}/`))
  const maintains = Boolean(entry.role && /maintain|responsabile/i.test(entry.role))
  return clean({
    "@type": "SoftwareSourceCode",
    "@id": `${pageUrl(localePath(lang, "/software"))}#${entry.id}`,
    name: entry.name,
    description: entry.tagline ?? entry.summary[0],
    url: `${pageUrl(localePath(lang, "/software"))}#${entry.id}`,
    codeRepository: repo,
    sameAs: site,
    license: licenceUrl(entry.license),
    version: entry.version,
    author: own ? personRef() : undefined,
    maintainer: maintains ? personRef() : undefined,
    citation: entry.cite?.doi ? `https://doi.org/${entry.cite.doi}` : undefined,
  })
}

export function softwareListLd(lang: Lang): Thing[] {
  return getSoftware(lang).map((s) => softwareLd(s, lang))
}

/** The site's Zenodo concept DOI, when profile.yaml has one. */
function siteDoi(): string | null {
  return siteRelease().doi
}

/** The reaction atlas as a dataset: its texts and data.json, CC BY 4.0 (atlas.yaml). */
export function atlasDatasetLd(lang: Lang): Thing {
  const atlas = getAtlas(lang)
  const meta = atlas.meta
  const doi = siteDoi()
  return clean({
    "@type": "Dataset",
    "@id": `${pageUrl("/atlas")}#dataset`,
    name: meta.title,
    description: dict(lang).atlas.description,
    url: pageUrl(localePath(lang, "/atlas")),
    inLanguage: IN_LANGUAGE[lang],
    creator: personRef(),
    license: meta.licenceUrl || licenceUrl(meta.licence),
    isAccessibleForFree: true,
    version: meta.version ?? undefined,
    dateModified: meta.version ?? undefined,
    identifier: doi ? `https://doi.org/${doi}` : undefined,
    keywords: ["nuclear astrophysics", "nuclear reactions", "reaction rates", "Gamow window", "LUNA"],
    variableMeasured: ["Q-value", "Gamow window", "half-life"],
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: fileUrl("/atlas/data.json"),
    },
    isPartOf: { "@id": WEBSITE_ID() },
  })
}

/**
 * Everyone named in an evaluation's `analysis` ("J. Skowronski, R. J. deBoer",
 * "A and B"), Jakub by reference; a note in brackets is not a name.
 */
export function analystsLd(analysis: string): Thing[] {
  return analysis
    .replace(/\([^)]*\)/g, "")
    .split(/,|;|\s+and\s+|\s+&\s+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^et al\.?$/i.test(s))
    .map((name) => (IS_JAKUB.test(name) ? personRef() : { "@type": "Person", name }))
}

/**
 * One R-matrix evaluation as a dataset. The page states the site's content
 * licence for the page and the model file (components/evaluation-header.tsx),
 * so the licence is the atlas' one; the paper, when published, is cited.
 */
export function evaluationDatasetLd(meta: EvaluationMeta, title: string, description: string, lang: Lang): Thing {
  const atlas = getAtlas(lang)
  const doi = siteDoi()
  const analysts = meta.analysis ? analystsLd(meta.analysis) : []
  return clean({
    "@type": "Dataset",
    "@id": `${pageUrl(`/evaluations/${meta.id}`)}#dataset`,
    name: title,
    description: meta.purpose ? `${description} ${meta.purpose}` : description,
    url: pageUrl(localePath(lang, `/evaluations/${meta.id}`)),
    inLanguage: IN_LANGUAGE[lang],
    creator: analysts.length > 1 ? analysts : analysts[0],
    license: atlas.meta.licence ? atlas.meta.licenceUrl || licenceUrl(atlas.meta.licence) : undefined,
    isAccessibleForFree: true,
    citation: meta.doi ? `https://doi.org/${meta.doi}` : undefined,
    identifier: doi ? `https://doi.org/${doi}` : undefined,
    keywords: ["R-matrix", "AZURE2", "nuclear astrophysics", ...meta.reactions],
    measurementTechnique: "R-matrix analysis (AZURE2)",
    isPartOf: { "@id": WEBSITE_ID() },
  })
}

/** The evaluations index: one Dataset per evaluation would repeat the pages; a catalog names them. */
export function evaluationsCatalogLd(items: { id: string; title: string }[], lang: Lang): Thing {
  return {
    "@type": "DataCatalog",
    name: dict(lang).nav.evaluations,
    url: pageUrl(localePath(lang, "/evaluations")),
    creator: personRef(),
    dataset: items.map((e) => ({ "@id": `${pageUrl(`/evaluations/${e.id}`)}#dataset`, name: e.title, url: pageUrl(localePath(lang, `/evaluations/${e.id}`)) })),
  }
}

/** A note: an article by the person. */
export function noteLd(note: { slug: string; title: string; summary: string; date: string; topic: string }, lang: Lang): Thing {
  return clean({
    "@type": "Article",
    headline: note.title,
    description: note.summary,
    datePublished: note.date,
    author: personRef(),
    inLanguage: "en",
    about: note.topic,
    url: pageUrl(localePath(lang, `/notes/${note.slug}`)),
    isPartOf: { "@id": WEBSITE_ID() },
  })
}

/** Wraps nodes in one graph with the context, for a <script type="application/ld+json">. */
export function graph(nodes: (Thing | null | undefined)[]): Thing {
  return { "@context": CONTEXT, "@graph": nodes.filter(Boolean) }
}
