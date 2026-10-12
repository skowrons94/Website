import { siteDoi } from "@/lib/site-release"
import type { Lang } from "@/lib/i18n"

/**
 * "The site as a whole: doi:10.5281/…", under a citation box: the Zenodo
 * concept DOI from profile.yaml's `site_doi:`. Nothing while it is empty.
 */
export function SiteDoiLine({ lang, className }: { lang: Lang; className?: string }) {
  const doi = siteDoi()
  if (!doi) return null
  return (
    <p className={className ?? "mt-2 text-xs text-muted-foreground"}>
      {lang === "it" ? "Il sito nel suo insieme" : "The site as a whole"}:{" "}
      <a href={`https://doi.org/${doi}`} className="break-all text-link">
        doi:{doi}
      </a>
    </p>
  )
}
