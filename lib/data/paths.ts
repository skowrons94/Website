/**
 * The three guided paths of the data explorer (/data/path/<id>), assembled
 * at build time: the words are lib/data/i18n-public.ts, every number is read
 * here from the data (the EXFOR summary, the atlas, ENSDF, the rates'
 * networks and the curiosities' sensitivity tables). Server only.
 */

import { getAtlas } from "@/lib/atlas"
import { dataPublicDict, type PathWords } from "@/lib/data/i18n-public"
import {
  energy,
  gapRowOf,
  getSummary,
  group,
  levelsInWindow,
  nucleusPath,
  reactionDataPath,
  waiting,
  waitingTime,
  type GapRow,
} from "@/lib/data/public"
import type { Lang } from "@/lib/locale"
import { curiosityCard, type CuriosityCardData } from "@/lib/rates/curiosity-data"
import { curiosityPath } from "@/lib/rates/curiosities"

export const PATH_IDS = ["sun-shines-slowly", "sodium-in-salt", "iron-to-lead"] as const
export type PathId = (typeof PATH_IDS)[number]

export interface PathLink {
  href: string
  label: string
}

export interface PathStep {
  title: string
  text: string
  links: PathLink[]
  gap?: GapRow[]
  curiosity?: CuriosityCardData | null
}

export interface GuidedPathData {
  id: PathId
  title: string
  teaser: string
  steps: PathStep[]
  unknownTitle: string
  unknown: string[]
  share: string
  /** the caveat of the curiosity a path quotes, always beside it */
  caveat: string | null
}

const dec = (s: string, lang: Lang) => (lang === "it" ? s.replace(".", ",") : s)
const mev = (x: number, lang: Lang) => `${dec(x.toFixed(3), lang)} MeV`

/** `Junker et al., 1998, LUNA` */
function whoText(row: GapRow | null, lang: Lang): string {
  const low = row?.low
  if (!low) return ""
  return [low.author, low.year, low.luna ? (lang === "it" ? "LUNA, sotto terra" : "LUNA, underground") : ""].filter(Boolean).join(", ")
}

function words(id: PathId, lang: Lang, c: Record<string, string>): PathWords {
  const p = dataPublicDict(lang).paths
  return id === "sun-shines-slowly" ? p.sun(c) : id === "sodium-in-salt" ? p.sodium(c) : p.iron(c)
}

function reactionContext(id: string, lang: Lang): Record<string, string> {
  const row = gapRowOf(id, lang)
  const s = getSummary().reactions[id]
  return {
    datasets: s ? group(s.datasets, lang) : "0",
    y0: s?.years ? String(s.years[0]) : "",
    y1: s?.years ? String(s.years[1]) : "",
    luna: s ? String(s.luna) : "0",
    low: row?.low ? energy(row.low.keV, lang) : "",
    who: whoText(row, lang),
    e0: row ? energy(row.E0, lang) : "",
    site: row?.site ?? "",
    inside: row?.kind === "inside" ? "1" : "",
  }
}

function curiosityText(card: CuriosityCardData | null): string {
  return card ? `${card.sentence} ${card.hook}` : ""
}

export function guidedPath(id: PathId, lang: Lang): GuidedPathData {
  const atlas = getAtlas(lang)
  const label = (rid: string) => atlas.reactions.find((r) => r.id === rid)?.label ?? rid
  const slug = (rid: string) => getSummary().reactions[rid]?.slug ?? null

  if (id === "sun-shines-slowly") {
    const pp = gapRowOf("1H-pp-2H", lang)
    const he3 = gapRowOf("3He-3He2p-4He", lang)
    const w = waitingTime("pp", "sun-core", "1H-pp-2H")
    const cur = curiosityCard("pp-sun-hydrogen", lang)
    const c: Record<string, string> = {
      e0: pp ? energy(pp.E0, lang) : "",
      he3low: he3?.low ? energy(he3.low.keV, lang) : "",
      he3who: whoText(he3, lang),
      tau: w ? waiting(w.tau, lang) : "",
      T: w ? dec(String(Number((w.T9 * 1000).toPrecision(2))), lang) : "",
      rho: w ? String(Math.round(w.rho)) : "",
      bottleneck: w && w.bottleneck === label("1H-pp-2H") && w.nextTau ? "1" : "",
      next: w?.nextTau ? waiting(w.nextTau, lang) : "",
      curiosity: curiosityText(cur),
    }
    const v = words(id, lang, c)
    return {
      id,
      title: v.title,
      teaser: v.teaser,
      steps: [
        { ...v.steps[0], links: [{ href: "/atlas/1H-pp-2H", label: v.steps[0].link }] },
        {
          ...v.steps[1],
          links: [{ href: "/data#gap", label: v.steps[1].link }],
          gap: [pp, he3].filter((x): x is GapRow => x !== null),
        },
        { ...v.steps[2], links: [{ href: "/atlas/rates#pp", label: v.steps[2].link }] },
        { ...v.steps[3], links: cur ? [{ href: curiosityPath(cur.id), label: v.steps[3].link }] : [], curiosity: cur },
      ],
      unknownTitle: v.unknownTitle,
      unknown: v.unknown,
      share: v.share,
      caveat: cur?.caveat ?? null,
    }
  }

  if (id === "sodium-in-salt") {
    const rid = "22Ne-pg-23Na"
    const row = gapRowOf(rid, lang)
    const cur = curiosityCard("nena-agb-sodium", lang)
    const lv = levelsInWindow("23Na", rid, lang)
    const t = lang === "it"
    let levels = ""
    if (lv) {
      const list = lv.inside.map((E) => mev(E, lang)).join(", ")
      const n = lv.inside.length
      levels = t
        ? n === 0
          ? "Nessun livello noto cade dentro la finestra della stella: decidono quelli ai suoi bordi."
          : `ENSDF elenca ${n === 1 ? "un livello" : `${n} livelli`} dentro la finestra della stella (${list}): ${n === 1 ? "è lui a decidere" : "sono loro a decidere"} il tasso.`
        : n === 0
          ? "No known level falls inside the star's window: the ones at its edges decide the rate."
          : `ENSDF lists ${n === 1 ? "one level" : `${n} levels`} inside the star's window (${list}): ${n === 1 ? "it decides" : "they decide"} the rate.`
    }
    const c: Record<string, string> = {
      ...reactionContext(rid, lang),
      carbon: label("12C-12Cp-23Na"),
      sp: lv ? mev(lv.sp, lang) : "",
      levels,
      curiosity: curiosityText(cur),
      curiositySentence: cur?.sentence ?? "",
    }
    const v = words(id, lang, c)
    const data = slug(rid)
    return {
      id,
      title: v.title,
      teaser: v.teaser,
      steps: [
        { ...v.steps[0], links: [{ href: `/atlas/${rid}`, label: v.steps[0].link }] },
        {
          ...v.steps[1],
          links: data ? [{ href: reactionDataPath(data), label: v.steps[1].link }] : [],
          gap: row ? [row] : [],
        },
        {
          ...v.steps[2],
          links: [
            { href: nucleusPath("23Na"), label: v.steps[2].link },
            { href: "/evaluations/23Na", label: dataPublicDict(lang).evaluationLink("²³Na") },
          ],
        },
        {
          ...v.steps[3],
          links: [
            ...(cur ? [{ href: curiosityPath(cur.id), label: v.steps[3].link }] : []),
            { href: "/atlas/rates#nena", label: dataPublicDict(lang).stories.rates },
          ],
          curiosity: cur,
        },
      ],
      unknownTitle: v.unknownTitle,
      unknown: v.unknown,
      share: v.share,
      caveat: cur?.caveat ?? null,
    }
  }

  // iron to lead
  const rid = "13C-an-16O"
  const ne22 = gapRowOf("22Ne-an-25Mg", lang)
  const cur = curiosityCard("s-pocket-carbon-13", lang)
  const reaction = atlas.reactions.find((r) => r.id === rid)
  const c: Record<string, string> = {
    ...reactionContext(rid, lang),
    evaluations: String(reaction?.evaluations.length ?? 0),
    ne22e0: ne22 ? energy(ne22.E0, lang) : "",
    curiosity: curiosityText(cur),
    curiositySentence: cur?.sentence ?? "",
  }
  const v = words(id, lang, c)
  const data = slug(rid)
  return {
    id,
    title: v.title,
    teaser: v.teaser,
    steps: [
      { ...v.steps[0], links: [{ href: "/atlas/s-process", label: v.steps[0].link }] },
      {
        ...v.steps[1],
        links: [
          ...(data ? [{ href: reactionDataPath(data), label: v.steps[1].link }] : []),
          { href: `/atlas/${rid}`, label: dataPublicDict(lang).stories.atlas },
        ],
        // no gap row here: EXFOR's lowest point for this reaction (Ciani 2021,
        // its energies read as laboratory) disagrees with the atlas's 230 keV
      },
      { ...v.steps[2], links: [{ href: `/atlas/${rid}#evaluations`, label: v.steps[2].link }] },
      {
        ...v.steps[3],
        links: [
          ...(cur ? [{ href: curiosityPath(cur.id), label: v.steps[3].link }] : []),
          { href: "/atlas/rates/s-process", label: dataPublicDict(lang).stories.rates },
        ],
        curiosity: cur,
      },
    ],
    unknownTitle: v.unknownTitle,
    unknown: v.unknown,
    share: v.share,
    caveat: cur?.caveat ?? null,
  }
}
