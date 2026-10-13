import { Sci } from "@/components/sci"

/**
 * Notation for the eye, words for the ear: `¹⁴N(p,γ)¹⁵O` is shown, and a
 * screen reader hears `nitrogen-14 + proton → oxygen-15 + gamma ray` (the
 * atlas' `plain`), not "superscript one four N".
 */
export function Said({ label, plain }: { label: string; plain: string }) {
  return (
    <>
      <span aria-hidden>
        <Sci>{label}</Sci>
      </span>
      <span className="sr-only">{plain}</span>
    </>
  )
}
