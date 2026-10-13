import { PageLd } from "@/components/json-ld"
import { curiosityMetadata } from "@/components/pages/rates-curiosities"
import { nuclideOf } from "@/components/evaluation-header"
import { evaluationIds } from "@/lib/evaluation-meta"
import { dict, type Lang } from "@/lib/i18n"
import { evaluationsCatalogLd } from "@/lib/structured-data"

/**
 * Structured data for the pages whose bodies live elsewhere (the rates
 * explorer's, the evaluations index, a client component): rendered beside
 * the page by its thin route file, so those components stay untouched.
 */
export function RouteLd({ lang, page, id }: { lang: Lang; page: "rates" | "rates-sprocess" | "curiosities" | "curiosity" | "evaluations"; id?: string }) {
  const nav = dict(lang).nav
  const rates = { name: nav.rates, path: "/atlas/rates" }
  const curiosities = { name: nav.curiosities, path: "/atlas/rates/curiosities" }
  switch (page) {
    case "rates":
      return <PageLd lang={lang} trail={[rates]} />
    case "rates-sprocess":
      return <PageLd lang={lang} trail={[rates, { name: nav.sProcessWhatIf, path: "/atlas/rates/s-process" }]} />
    case "curiosities":
      return <PageLd lang={lang} trail={[rates, curiosities]} />
    case "curiosity": {
      const title = id ? curiosityMetadata(id, lang).title : null
      return <PageLd lang={lang} trail={[rates, curiosities, ...(typeof title === "string" ? [{ name: title, path: `/atlas/rates/curiosities/${id}` }] : [])]} />
    }
    case "evaluations": {
      const t = dict(lang)
      const items = evaluationIds().map((e) => ({ id: e, title: nuclideOf(e) }))
      return <PageLd lang={lang} trail={[{ name: t.nav.evaluations, path: "/evaluations" }]} nodes={[evaluationsCatalogLd(items, lang)]} />
    }
  }
}
