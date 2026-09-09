import { Fragment, type ReactNode } from "react"

/**
 * Nuclide notation written as Unicode, rendered as real superscripts.
 *
 * The content files spell mass numbers the way a physicist types them —
 * `¹²C(p,γ)¹³N`, `MeV⁻¹` — which is readable in a YAML file and needs no markup.
 * The web fonts, however, do not cover it. Google's `latin` subset ends at
 * U+206F, one codepoint short of the Superscripts and Subscripts block, so
 * `¹ ² ³` resolve (they live in Latin-1) while `⁰ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹`, the signs, and
 * every subscript fall through to whatever the operating system offers. The
 * result is `¹²C` set correctly beside `¹⁵O` set half in Inter and half in a
 * system serif, at the wrong size and off the baseline.
 *
 * Widening the subset would not help — the families genuinely lack the glyphs.
 * So the characters are translated into `<sup>` and `<sub>` here, which the
 * browser sets from the surrounding font at the surrounding size. `¹⁵O` and
 * `¹²C` then match, and the source text stays as legible as it was.
 *
 * Everything outside these two blocks is passed through untouched, so ordinary
 * prose costs one regular-expression scan and nothing else.
 */

// Unicode superscripts and subscripts, to the characters they stand for. Only
// the ones that actually appear in nuclear notation: digits, the signs, and the
// parentheses that go with them.
const SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "−", "⁼": "=", "⁽": "(", "⁾": ")", "ⁿ": "n",
}

const SUBSCRIPTS: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "₊": "+", "₋": "−", "₌": "=", "₍": "(", "₎": ")",
}

// One or more characters from either block. Matched as a run so `¹²` becomes a
// single <sup>12</sup> rather than two adjacent ones, which would otherwise let
// the browser break a mass number across a line.
const MARKS = /[⁰-ₜ²³¹]+/g

/**
 * Split `text` into plain strings and `<sup>`/`<sub>` elements.
 *
 * Exported for the places that need the pieces rather than a wrapper element —
 * a page `<title>`, say, cannot hold markup.
 */
export function sci(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0

  for (const match of text.matchAll(MARKS)) {
    const run = match[0]
    const start = match.index ?? 0
    if (start > last) out.push(text.slice(last, start))

    // A run is either superscript or subscript; the two never interleave in
    // practice, and if they somehow did, the first character decides so the
    // output is still well-formed.
    const isSub = run[0] in SUBSCRIPTS
    const table = isSub ? SUBSCRIPTS : SUPERSCRIPTS
    const plain = [...run].map((c) => table[c] ?? c).join("")
    const key = String(start)

    out.push(
      isSub ? <sub key={key}>{plain}</sub> : <sup key={key}>{plain}</sup>,
    )
    last = start + run.length
  }

  if (last < text.length) out.push(text.slice(last))
  return out
}

/** True if `text` contains anything this module would rewrite. */
export function hasSci(text: string): boolean {
  MARKS.lastIndex = 0
  return MARKS.test(text)
}

/**
 * Render `children` with its Unicode super- and subscripts set properly.
 *
 * Emits a plain fragment, so it inherits whatever the surrounding element is
 * and can be dropped into a heading, a list item or a paragraph alike.
 */
export function Sci({ children }: { children: string | null | undefined }) {
  if (!children) return null
  return <Fragment>{sci(children)}</Fragment>
}
