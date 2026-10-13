/**
 * Pages whose route payload is heavy (the atlas, the data explorer, the rate
 * explorer and the glossary: about 100–220 KB of RSC data each). The site's
 * menus do not prefetch them, so that opening one page does not download the
 * others in the background (about 1 MB in all, R18 review); they load on
 * click as usual. Pass the result as a Link's `prefetch`.
 */
const HEAVY = new Set(["/atlas", "/data", "/atlas/rates", "/glossary"])

/** `false` for a heavy page (in either language), else undefined (Next's default). */
export function prefetchFor(href: string): false | undefined {
  const path = href.replace(/^\/it(?=\/|$)/, "") || "/"
  return HEAVY.has(path) ? false : undefined
}
