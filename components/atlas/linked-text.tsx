import { Fragment, type ReactNode } from "react"

import { Term } from "@/components/atlas/term"
import { Sci } from "@/components/sci"
import type { Lang } from "@/lib/i18n"

/**
 * Prose with its glossary terms linked, the first time each appears.
 *
 * The content files are plain text; the words a general reader may not know
 * (GK, M☉, S(0), R-matrix, fusion hindrance, ...) all have an entry at
 * /glossary. `seen` is shared by every block of a page, in reading order, so a
 * term is linked once, where it first appears, and not again further down.
 * Each pattern has its own key: "S(0)" and "keV b" both lead to the S-factor
 * entry, and both are linked.
 */

interface Pattern {
  key: string
  id: string
  re: RegExp
}

// Longer phrases first, so "Gamow window" wins over a bare "Gamow".
const PATTERNS: Pattern[] = [
  { key: "gamow", id: "gamow-window", re: /\b(?:Gamow (?:window|peak)s?|(?:finestr[ae]|picc(?:o|hi)) di Gamow)\b/ },
  { key: "q", id: "q-value", re: /\b(?:Q-values?|valor[ei] Q)\b/ },
  { key: "coulomb", id: "coulomb-barrier", re: /\b(?:Coulomb barriers?|barrier[ae] coulombian[ae])\b/ },
  { key: "compound", id: "compound-nucleus", re: /\b(?:compound nucle(?:us|i)|nucle[oi] compost[oi])\b/ },
  { key: "excited", id: "excited-state", re: /\b(?:excited states?|stat[oi] eccitat[oi])\b/ },
  { key: "hindrance", id: "fusion-hindrance", re: /\b(?:fusion[ -]hindrance|hindrance|soppressione della fusione)\b/ },
  { key: "superburst", id: "superburst", re: /\bsuperbursts?\b/ },
  { key: "rmatrix", id: "r-matrix", re: /\bR-matri(?:x|ces)\b/ },
  { key: "anc", id: "anc", re: /\bANCs?\b/ },
  { key: "s0", id: "s-factor", re: /S\(0\)/ },
  { key: "kevb", id: "s-factor", re: /\b(?:keV|MeV) b\b/ },
  { key: "sfactor", id: "s-factor", re: /\b(?:S-factors?|fattor[ei] S)\b/ },
  { key: "msun", id: "solar-mass", re: /\b\d+(?:[.,]\d+)?[ \u00a0]?M☉|M☉/ },
  { key: "gk", id: "temperature", re: /\b\d+(?:[.,]\d+)?[ \u00a0]?(?:GK|MK)\b|\b(?:GK|MK)\b/ },
  { key: "main", id: "main-sequence", re: /\b(?:main sequence|sequenza principale)\b/ },
  { key: "branching", id: "branching-ratio", re: /\b(?:branching ratios?|rapport[oi] di diramazione)\b/ },
  { key: "coincidence", id: "coincidence", re: /\bparticle[–-]γ coincidences?\b|\bcoincidenze? particella[–-]γ\b/ },
  { key: "thm", id: "trojan-horse", re: /\b(?:Trojan[ -]Horse|cavallo di Troia)\b/ },
  { key: "screening", id: "electron-screening", re: /\b(?:electron screening|schermaggio elettronico)\b/ },
  { key: "agb", id: "agb-star", re: /\bAGB\b/ },
  { key: "macs", id: "macs", re: /\b(?:MACS|Maxwellian[- ]averaged cross sections?)\b/ },
  { key: "branchpoint", id: "branch-point", re: /\b(?:branch(?:ing)? points?|punt[oi] di diramazione)\b/ },
  { key: "pocket", id: "c13-pocket", re: /(?:¹³C pocket|tasca di ¹³C)/ },
  { key: "pulse", id: "thermal-pulse", re: /\b(?:thermal pulses?|impuls[oi] termic[oi])\b/ },
  { key: "poison", id: "neutron-poison", re: /\b(?:neutron poisons?|velen[oi] neutronic[oi])\b/ },
  { key: "tof", id: "time-of-flight", re: /\b(?:time[- ]of[- ]flight|tempo di volo)\b/ },
  { key: "sonly", id: "s-only", re: /\b(?:s-only|solo s)\b/ },
  { key: "ndensity", id: "neutron-density", re: /\b(?:neutron densit(?:y|ies)|densità di neutroni)\b/ },
  { key: "sproc", id: "s-process", re: /\b(?:s-process|processo s)\b/ },
  { key: "rproc", id: "r-process", re: /\b(?:r-process|processo r)\b/ },
  { key: "threshold", id: "threshold", re: /\b(?:endothermic|endotermic[ao])\b/ },
  { key: "cross", id: "cross-section", re: /\b(?:cross sections?|sezion[ei] d'urto)\b/ },
  { key: "resonance", id: "resonance", re: /\b(?:resonances?|risonanz[ae])\b/ },
]

/** `text` as nodes, with the first unseen occurrence of each term linked. */
export function linkTerms(text: string, lang: Lang, seen: Set<string>): ReactNode {
  if (!text) return null
  const hits: { start: number; end: number; id: string }[] = []
  for (const p of PATTERNS) {
    if (seen.has(p.key)) continue
    const m = p.re.exec(text)
    if (!m) continue
    const start = m.index
    const end = start + m[0].length
    // Skip a match inside one already taken (e.g. "MeV b" inside a longer one).
    if (hits.some((h) => start < h.end && end > h.start)) continue
    hits.push({ start, end, id: p.id })
    seen.add(p.key)
  }
  if (hits.length === 0) return <Sci>{text}</Sci>
  hits.sort((a, b) => a.start - b.start)
  const out: ReactNode[] = []
  let last = 0
  for (const h of hits) {
    if (h.start > last) out.push(<Sci key={`t${last}`}>{text.slice(last, h.start)}</Sci>)
    out.push(
      <Term key={`g${h.start}`} id={h.id} lang={lang}>
        <Sci>{text.slice(h.start, h.end)}</Sci>
      </Term>,
    )
    last = h.end
  }
  if (last < text.length) out.push(<Sci key={`t${last}`}>{text.slice(last)}</Sci>)
  return <Fragment>{out}</Fragment>
}

/** The same, as a component, for a block that has its own `seen`. */
export function LinkedText({ text, lang, seen }: { text: string; lang: Lang; seen?: Set<string> }) {
  return <>{linkTerms(text, lang, seen ?? new Set())}</>
}
