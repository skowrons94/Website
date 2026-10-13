import { readMeta } from "@/lib/data/build"
import { fill } from "@/lib/data/fill"
import { ensdfDate, itDate } from "@/lib/data/format"
import { formatDate } from "@/lib/atlas-format"
import { dict, type Lang } from "@/lib/i18n"

/**
 * The line every data page carries (CC BY 4.0 asks for it): "Data: EXFOR
 * (IAEA/NRDC), snapshot <date>, CC BY 4.0", the EXFOR entries shown, linked,
 * the citation, and ENSDF's credit where levels are drawn.
 */
export function Attribution({
  lang,
  entries = [],
  ensdf,
  className = "",
}: {
  lang: Lang
  entries?: string[]
  ensdf?: { nuclide: string; citation: string; cutoff: string } | null
  className?: string
}) {
  const meta = readMeta()
  // one date format (docs/STYLE.md): 28 September 2026 / del 28 settembre 2026
  const when = (iso: string, prep: "di" | "a") => {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDate(iso, lang) : iso
    return lang === "it" ? itDate(prep, d) : d
  }
  const t = dict(lang).dataExpert.attribution
  const ex = meta.exfor
  const sorted = [...new Set(entries)].sort()
  const entryUrl = (e: string) => ex.entry_url.replace("{entry}", e)
  return (
    <footer className={`border-t border-border/70 pt-4 text-xs leading-relaxed text-muted-foreground ${className}`}>
      <p>
        <a href="https://nds.iaea.org/exfor/" className="underline-offset-2 hover:text-foreground hover:underline">
          {fill(t.exfor, { date: when(ex.snapshot_date, "di") }).split(", CC BY")[0]}
        </a>
        {", "}
        <a href={ex.license_url} className="underline-offset-2 hover:text-foreground hover:underline" rel="license">
          CC BY 4.0
        </a>
        {" · "}
        <a href={`${ex.repository}/tree/${ex.commit}`} className="font-mono underline-offset-2 hover:text-foreground hover:underline">
          exfor_master {ex.commit.slice(0, 10)}
        </a>
        . {t.cite}{" "}
        <a href="https://doi.org/10.1016/j.nds.2014.07.065" className="underline-offset-2 hover:text-foreground hover:underline">
          doi:10.1016/j.nds.2014.07.065
        </a>
      </p>
      <p className="mt-1">{t.changes}</p>
      {ensdf && (
        <p className="mt-1">
          <a href="https://www.nndc.bnl.gov/ensdf/" className="underline-offset-2 hover:text-foreground hover:underline">
            {fill(t.ensdf, { date: when(meta.ensdf.archive_date, "di"), nuclide: ensdf.nuclide, citation: ensdf.citation, cutoff: when(ensdfDate(ensdf.cutoff), "a") })}
          </a>
        </p>
      )}
      {sorted.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer select-none hover:text-foreground">
            {t.entries} ({sorted.length})
          </summary>
          <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono">
            {sorted.map((e) => (
              <a key={e} href={entryUrl(e)} className="underline-offset-2 hover:text-foreground hover:underline">
                {e}
              </a>
            ))}
          </p>
        </details>
      )}
    </footer>
  )
}
