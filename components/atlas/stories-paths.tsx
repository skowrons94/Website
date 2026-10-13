import Link from "next/link"

import { Sci } from "@/components/sci"
import { dataPublicDict } from "@/lib/data/i18n-public"
import { guidedPath, PATH_IDS } from "@/lib/data/paths"
import { energy, gapRowOf, getSummary, group, reactionDataPath, undergroundCounts, waiting, waitingTime } from "@/lib/data/public"
import { dict } from "@/lib/i18n"
import { localePath, type Lang } from "@/lib/locale"
import { curiosityPath } from "@/lib/rates/curiosities"

/**
 * The atlas' stories and guided paths (/atlas#stories, /atlas#paths): three
 * short stories that tie a reaction to its data, its rate and a curiosity,
 * and the guided paths (/data/path/<id>, an address kept from when they were
 * part of the data explorer). Drawn on the server from the data explorer's
 * summary (lib/data/public.ts); no JavaScript of their own.
 */

const H2 = "text-balance font-serif text-2xl font-semibold tracking-tight"
const LEAD = "mt-3 max-w-3xl text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground"
const SECTION = "mt-16 scroll-mt-[calc(var(--header-h,0px)+1.5rem)] border-t border-border/70 pt-10"
const LINK = "inline-flex min-h-10 items-center gap-1 text-sm text-link underline-offset-4 hover:underline"

export function AtlasStoriesAndPaths({ lang }: { lang: Lang }) {
  const t = dataPublicDict(lang)
  const to = (p: string) => localePath(lang, p)
  const summary = getSummary()
  const under = undergroundCounts()
  const ppWait = waitingTime("pp", "sun-core", "1H-pp-2H")
  const cnoWait = waitingTime("cno", "massive-15", "14N-pg-15O")
  const n14 = gapRowOf("14N-pg-15O", lang)
  const paths = PATH_IDS.map((id) => guidedPath(id, lang))

  const stories = [
    {
      id: "pp",
      title: t.stories.pp.title,
      text: t.stories.pp.text(ppWait ? waiting(ppWait.tau, lang) : ""),
      links: [
        { href: "/atlas/1H-pp-2H", label: t.stories.atlas },
        { href: "/atlas/rates#pp", label: t.stories.rates },
        { href: curiosityPath("pp-sun-hydrogen"), label: t.stories.curiosity },
      ],
    },
    {
      id: "cno",
      title: t.stories.cno.title,
      text: t.stories.cno.text(
        cnoWait ? waiting(cnoWait.tau, lang) : "",
        n14?.low ? energy(n14.low.keV, lang) : "",
        n14 ? energy(n14.E0, lang) : "",
      ),
      links: [
        { href: "/atlas/14N-pg-15O", label: t.stories.atlas },
        ...(summary.reactions["14N-pg-15O"] ? [{ href: reactionDataPath(summary.reactions["14N-pg-15O"].slug), label: t.stories.data }] : []),
        { href: "/atlas/rates#cno", label: t.stories.rates },
        { href: curiosityPath("cno-sun-oxygen-15"), label: t.stories.curiosity },
      ],
    },
    {
      id: "underground",
      title: t.stories.underground.title,
      text: t.stories.underground.text(group(under.datasets, lang), String(under.reactions), String(under.lowest)),
      links: [
        { href: "/atlas#luna-heading", label: t.stories.luna },
        { href: "/atlas/methods", label: dict(lang).footer.methods },
        { href: "/evaluations", label: dict(lang).footer.evaluations },
      ],
    },
  ]

  return (
    <>
      {/* -- three stories ------------------------------------------------ */}
      <section id="stories" aria-labelledby="stories-heading" className={SECTION}>
        <h2 id="stories-heading" className={H2}>
          {t.storiesTitle}
        </h2>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {stories.map((s, k) => (
            <li key={s.id} className="flex flex-col rounded-xl border border-border bg-card p-6">
              <p className="tabular text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{k + 1}</p>
              <h3 className="mt-2 text-balance font-serif text-xl font-semibold leading-snug tracking-tight">{s.title}</h3>
              <p className="mt-3 flex-1 text-pretty leading-relaxed text-muted-foreground">
                <Sci>{s.text}</Sci>
              </p>
              <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-0 border-t border-border/70 pt-3">
                {s.links.map((l) => (
                  <li key={l.href}>
                    <Link href={to(l.href)} className={LINK}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {/* -- guided paths ------------------------------------------------- */}
      <section id="paths" aria-labelledby="paths-heading" className={SECTION}>
        <h2 id="paths-heading" className={H2}>
          {t.pathsTitle}
        </h2>
        <p className={LEAD}>{t.pathsLead}</p>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {paths.map((p) => (
            <li key={p.id}>
              <Link
                href={to(`/data/path/${p.id}`)}
                className="group flex h-full flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-foreground/30"
              >
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.pathSteps(p.steps.length + 1)}</span>
                <span className="mt-2 text-balance font-serif text-xl font-semibold leading-snug tracking-tight group-hover:text-link">{p.title}</span>
                <span className="mt-2 flex-1 text-pretty leading-relaxed text-muted-foreground">{p.teaser}</span>
                <span className="mt-4 flex gap-1.5" aria-hidden>
                  {Array.from({ length: p.steps.length + 1 }, (_, k) => (
                    <span key={k} className={k === 0 ? "h-2.5 w-5 rounded-full bg-foreground" : "h-2.5 w-2.5 rounded-full border-2 border-foreground/40"} />
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
