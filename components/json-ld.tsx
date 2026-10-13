import { dict, localePath, type Lang } from "@/lib/i18n"
import { breadcrumbLd, graph, type Thing } from "@/lib/structured-data"

/**
 * A `<script type="application/ld+json">` with the given schema.org nodes in
 * one graph. A data block, not a script: browsers do not run it, and a
 * Content-Security-Policy's script-src does not apply to it. `<` is escaped
 * so no text in the data can close the element.
 */
export function JsonLd({ nodes }: { nodes: (Thing | null | undefined)[] }) {
  const json = JSON.stringify(graph(nodes)).replace(/</g, "\\u003c")
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}

/**
 * A page's structured data: its breadcrumb trail (Home, then `trail`, whose
 * paths are English and localized here; the last is the page itself) and any
 * other nodes it describes (a dataset, a list of papers).
 */
export function PageLd({
  lang,
  trail,
  nodes = [],
}: {
  lang: Lang
  trail: { name: string; path: string }[]
  nodes?: (Thing | null | undefined)[]
}) {
  const home = { name: dict(lang).nav.home, path: localePath(lang, "/") }
  const crumbs = trail.length > 0 ? [home, ...trail.map((c) => ({ name: c.name, path: localePath(lang, c.path) }))] : []
  return <JsonLd nodes={[crumbs.length > 1 ? breadcrumbLd(crumbs) : null, ...nodes]} />
}
