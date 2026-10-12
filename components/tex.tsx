import { Fragment, type ReactNode } from "react"

/**
 * The few LaTeX labels the AZURE2 API sends, set in the page's own fonts.
 *
 * Channel and nuclide labels arrive as LaTeX (`^{13}\text{N}`, `\gamma_{1}`,
 * `p + ^{12}\text{C}`, `\Gamma_{p_{0}}`). They use a tiny subset of the
 * language -- super/subscripts, `\text{}`, a handful of Greek letters -- so they
 * are translated here into `<sup>`/`<sub>` and Unicode rather than handed to
 * KaTeX. That keeps the evaluation pages in Source Serif/Inter like the rest of
 * the site (KaTeX would set them in Computer Modern), keeps ~70 kB of KaTeX out
 * of their JavaScript, and lets the same label be read as plain text by a
 * screen reader or put in an SVG legend (`texPlain`).
 *
 * Anything outside the subset is passed through as text, never dropped.
 */

const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", eta: "η",
  theta: "θ", lambda: "λ", mu: "μ", nu: "ν", pi: "π", rho: "ρ", sigma: "σ",
  tau: "τ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Pi: "Π", Sigma: "Σ",
  Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  to: "→", rightarrow: "→", pm: "±", times: "×", cdot: "·", prime: "′",
}

type Node =
  | { kind: "text"; text: string; upright: boolean }
  | { kind: "sup" | "sub"; children: Node[] }

/** Parse a label into nodes. `upright` is false for maths letters. */
function parse(src: string, upright = false, script = false): Node[] {
  const out: Node[] = []
  let i = 0
  const push = (text: string, up = upright) => {
    const last = out[out.length - 1]
    if (last && last.kind === "text" && last.upright === up) last.text += text
    else out.push({ kind: "text", text, upright: up })
  }

  // One argument: a {group} or a single token.
  const argument = (): string => {
    if (src[i] === "{") {
      let depth = 0
      const start = i
      for (; i < src.length; i++) {
        if (src[i] === "{") depth++
        else if (src[i] === "}" && --depth === 0) {
          i++
          return src.slice(start + 1, i - 1)
        }
      }
      return src.slice(start + 1)
    }
    if (src[i] === "\\") {
      const m = /^\\[A-Za-z]+/.exec(src.slice(i))
      if (m) {
        i += m[0].length
        return m[0]
      }
    }
    return src[i++] ?? ""
  }

  while (i < src.length) {
    const c = src[i]
    if (c === "^" || c === "_") {
      i++
      out.push({ kind: c === "^" ? "sup" : "sub", children: parse(argument(), upright, true) })
    } else if (c === "\\") {
      const m = /^\\([A-Za-z]+)/.exec(src.slice(i))
      if (!m) {
        // \, \; \! and friends are spacing; an escaped character is itself.
        const next = src[i + 1] ?? ""
        push(",;:! ".includes(next) ? (next === "!" ? "" : " ") : next, true)
        i += 2
        continue
      }
      i += m[0].length
      const name = m[1]
      if (name === "text" || name === "mathrm" || name === "rm") {
        for (const node of parse(argument(), true)) {
          if (node.kind === "text") push(node.text, true)
          else out.push(node)
        }
      } else if (SYMBOLS[name]) {
        push(SYMBOLS[name], true)
      } else {
        push(name, true)
      }
    } else if (c === "{" || c === "}") {
      i++
    } else if (c === " ") {
      i++
    } else if (c === "+" || c === "-" || c === "=") {
      // Spaced as a binary operator, except as a sign inside a script (J^{+}).
      const sign = c === "-" ? "−" : c
      push(script ? sign : ` ${sign} `, true)
      i++
    } else {
      push(c, upright || !/[A-Za-z]/.test(c))
      i++
    }
  }
  return out
}

function render(nodes: Node[], key = ""): ReactNode[] {
  return nodes.map((node, n) => {
    const k = `${key}${n}`
    if (node.kind === "text") {
      return node.upright ? (
        <Fragment key={k}>{node.text}</Fragment>
      ) : (
        <i key={k}>{node.text}</i>
      )
    }
    const inner = render(node.children, `${k}.`)
    return node.kind === "sup" ? <sup key={k}>{inner}</sup> : <sub key={k}>{inner}</sub>
  })
}

/** A LaTeX label rendered inline, in the surrounding font. */
export function Tex({ math, className }: { math: string | null | undefined; className?: string }) {
  if (!math) return null
  return (
    <span className={`whitespace-nowrap ${className ?? ""}`}>{render(parse(math))}</span>
  )
}

const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷",
  "8": "⁸", "9": "⁹", "+": "⁺", "−": "⁻", "-": "⁻", "(": "⁽", ")": "⁾", "/": "ᐟ",
}
const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇",
  "8": "₈", "9": "₉", "+": "₊", "−": "₋", "-": "₋", "(": "₍", ")": "₎",
}

function plain(nodes: Node[]): string {
  return nodes
    .map((node) => {
      if (node.kind === "text") return node.text
      const inner = plain(node.children)
      const table = node.kind === "sup" ? SUP : SUB
      // Characters without a Unicode super/subscript keep a readable form.
      return [...inner].every((ch) => table[ch])
        ? [...inner].map((ch) => table[ch]).join("")
        : node.kind === "sup"
          ? `^(${inner})`
          : `(${inner})`
    })
    .join("")
}

/**
 * The same label as plain Unicode text (`¹³N`, `γ₁`, `p + ¹²C`), for an
 * aria-label, a page title or an SVG legend that cannot hold markup.
 */
export function texPlain(math: string | null | undefined): string {
  return math ? plain(parse(math)).replace(/\s+/g, " ").trim() : ""
}

/**
 * A unit as the API writes it (`fm^(-1/2)`, `MeV b`, `b/sr`), with its
 * exponent set as a real superscript and a proper minus sign.
 */
export function Unit({ unit }: { unit: string }) {
  const m = /^(.*?)\^\(?([^)]*)\)?$/.exec(unit)
  if (!m) return <>{unit}</>
  return (
    <span className="whitespace-nowrap">
      {m[1]}
      <sup>{m[2].replace(/-/g, "−")}</sup>
    </span>
  )
}

/**
 * Plain-text form of a unit, for aria-valuetext: "fm^(-1/2)" → "fm−1/2" (the
 * caret is read out literally by screen readers; a minus sign is not).
 */
export function unitPlain(unit: string): string {
  return unit.replace(/\^\(?([^)]*)\)?/, (_, exp: string) => exp.replace(/-/g, "−"))
}
