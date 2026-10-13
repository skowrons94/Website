import { readMeta } from "@/lib/data/build"
import { fill } from "@/lib/data/fill"
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
  const t = dict(lang).dataExpert.attribution
  const ex = meta.exfor
  const sorted = [...new Set(entries)].sort()
  const entryUrl = (e: string) => ex.entry_url.replace("{entry}", e)
  return (
    <footer className={`border-t border-border/70 pt-4 text-xs leading-relaxed text-muted-foreground ${className}`}>
      <p>
        <a href="https://nds.iaea.org/exfor/" className="underline-offset-2 hover:text-foreground hover:underline">
          {fill(t.exfor, { date: ex.snapshot_date }).split(", CC BY")[0]}
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
            {fill(t.ensdf, { date: meta.ensdf.archive_date, nuclide: ensdf.nuclide, citation: ensdf.citation, cutoff: ensdf.cutoff })}
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
