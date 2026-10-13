/**
 * Pages whose route payload is heavy (the atlas, the data explorer, the rate
 * explorer, the glossary, the s-process page, the open questions, the methods
 * and the timeline: about 100–420 KB of RSC data each). The site's
 * menus do not prefetch them, so that opening one page does not download the
 * others in the background (about 1 MB in all, R18 review); they load on
 * click as usual. Pass the result as a Link's `prefetch`.
 */
const HEAVY = new Set([
  "/atlas",
  "/data",
  "/atlas/rates",
  "/glossary",
  "/atlas/methods",
  "/atlas/s-process",
  "/atlas/open-questions",
  "/atlas/timeline",
])

/** `false` for a heavy page (in either language), else undefined (Next's default). */
export function prefetchFor(href: string): false | undefined {
  const base = process.env.BASE_PATH ?? ""
  let path = href.split(/[?#]/)[0]
  if (base && path.startsWith(base)) path = path.slice(base.length)
  path = path.replace(/^\/it(?=\/|$)/, "").replace(/\/$/, "") || "/"
  return HEAVY.has(path) ? false : undefined
}
