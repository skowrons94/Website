// KaTeX's stylesheet (42 @font-face rules and ~20 kB), only on the pages that
// set maths with it: the notes, the glossary and the atlas reaction pages
// (whose "details" are Markdown and may hold maths). Importing this module is
// what attaches the CSS to a route; it renders nothing.
//
// The tuning comes after KaTeX's own rules, so it wins at equal specificity.
import "katex/dist/katex.min.css"
import "./math-styles.css"

export {}
