import fs from "node:fs"
import path from "node:path"

import { getReaction } from "@/lib/atlas"
import { statusHint, statusLabel } from "@/lib/atlas-format"
import { localePath, type Lang } from "@/lib/locale"
import {
  CURIOSITIES,
  curiosityPath,
  curiosityRatio,
  curiosityText,
  curiosityTry,
  type CuriositySpec,
  type SensitivityLike,
} from "./curiosities"
import type { Baseline } from "./client"
import type { Network } from "./schema"

/**
 * The curiosities as the pages show them, assembled at build time from the
 * network files, the sensitivity tables and the atlas (server only: reads
 * files). Everything a card needs is in plain strings, so the client gets no
 * table and no solver.
 */

export interface CuriosityCardData {
  id: string
  net: string
  site: string
  /** "AGB envelope" */
  siteShort: string
  reaction: string
  parts: { text: string; bold?: boolean }[]
  sentence: string
  hook: string
  caveat: string
  percent: string
  /** changed ÷ unchanged, for the before/after bar */
  ratio: number
  /** a ratio of two nuclei (¹²C/¹³C), not an amount */
  isRatio: boolean
  tryPath: string
  tryHash: string
  /** the curiosity's own page, with the language */
  permalink: string
  know: { href: string; external: boolean }
  status: { label: string; hint: string } | null
  /** "Rate: Iliadis 2010, NPA 841, 1 (REACLIB il10)" */
  rateSource: string
  /** for the citation: the model and its date */
  model: string
  /** the social card, when it was drawn (scripts/rates/curiosity-cards.mjs) */
  image: string | null
}

const DIR = path.join(process.cwd(), "public", "rates")
const files = new Map<string, unknown>()
const read = <T,>(name: string): T => {
  if (!files.has(name)) files.set(name, JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8")))
  return files.get(name) as T
}

function card(spec: CuriositySpec, lang: Lang): CuriosityCardData {
  const network = read<Network>(`${spec.net}.json`)
  const sens = read<SensitivityLike>(`${spec.net}.sensitivity.json`)
  const baseline = read<Baseline>(`${spec.net}.baseline.json`)
  const scenario = network.scenarios.find((s) => s.id === spec.site)!
  const reaction = network.reactions.find((r) => r.id === spec.reaction)!
  const ratio = curiosityRatio(spec, sens)
  const text = curiosityText(spec, ratio, lang, {
    reaction: reaction.label,
    T9: scenario.T9,
    tFinal: baseline.runs[spec.site].tFinal,
    cooling: Boolean(scenario.profile),
  })
  const atlas = reaction.atlas ? getReaction(reaction.atlas, lang) : undefined
  const src = reaction.sources?.find((s) => s.author) ?? reaction.sources?.[0]
  const it = lang === "it"
  const tr = curiosityTry(spec)
  const img = `/rates/cards/${spec.id}.${lang}.png`
  return {
    id: spec.id,
    net: spec.net,
    site: spec.site,
    siteShort: (it ? scenario.short_it : scenario.short) ?? scenario.name,
    reaction: reaction.label,
    parts: text.parts,
    sentence: text.sentence,
    hook: text.hook,
    caveat: text.caveat,
    percent: text.percent,
    ratio,
    isRatio: Boolean(spec.per),
    tryPath: localePath(lang, tr.path),
    tryHash: tr.hash,
    permalink: localePath(lang, curiosityPath(spec.id)),
    know:
      atlas?.hasFile && reaction.atlas
        ? { href: localePath(lang, `/atlas/${reaction.atlas}`), external: false }
        : { href: src?.url ?? localePath(lang, tr.path), external: Boolean(src?.url) },
    status: atlas?.status ? { label: statusLabel(atlas.status, lang), hint: statusHint(atlas.status, lang) } : null,
    rateSource: src
      ? `${src.author || src.title}${src.year ? ` (${src.year})` : ""}${src.ref && src.author ? `, ${src.ref}` : ""}; REACLIB ${src.set}`
      : "",
    model: `${it ? "modello a una zona" : "one-zone model"}; ${network.provenance.library} ${network.provenance.snapshot}, ${network.provenance.tool}; ${network.provenance.generated}`,
    image: fs.existsSync(path.join(process.cwd(), "public", img)) ? img : null,
  }
}

const cache = new Map<Lang, CuriosityCardData[]>()

/** Every curiosity, in the order of lib/rates/curiosities.ts. */
export function curiosityCards(lang: Lang): CuriosityCardData[] {
  if (!cache.has(lang)) {
    cache.set(
      lang,
      CURIOSITIES.filter((c) => fs.existsSync(path.join(DIR, `${c.net}.sensitivity.json`))).map((c) => card(c, lang)),
    )
  }
  return cache.get(lang)!
}

export const curiosityCard = (id: string, lang: Lang) => curiosityCards(lang).find((c) => c.id === id) ?? null
