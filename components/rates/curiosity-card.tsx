"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { ArrowUpRight, Check, Copy, Link2 } from "lucide-react"

import { Sci } from "@/components/sci"
import type { Lang } from "@/lib/locale"
import type { CuriosityCardData } from "@/lib/rates/curiosity-data"
import { ratesDict } from "@/lib/rates/i18n"
import { showWhatIf } from "@/lib/rates/url"


/** The sentence, its bold parts set in bold. */
function Sentence({ c }: { c: CuriosityCardData }) {
  return (
    <>
      {c.parts.map((p, i) =>
        p.bold ? (
          <strong key={i} className="font-semibold">
            <Sci>{p.text}</Sci>
          </strong>
        ) : (
          <Sci key={i}>{p.text}</Sci>
        ),
      )}
    </>
  )
}

/** Today's rate against the doubled one, as two bars (the sentence says it in words). */
function Bars({ c, lang }: { c: CuriosityCardData; lang: Lang }) {
  const t = ratesDict(lang).cur
  const max = Math.max(1, c.ratio)
  const row = (label: string, v: number, changed: boolean) => (
    <div className="grid grid-cols-[minmax(0,42%)_minmax(0,1fr)] items-center gap-2 text-xs text-muted-foreground">
      <span className="leading-tight">{label}</span>
      <span className="block h-2.5 rounded-sm bg-secondary">
        <span
          className="block h-full rounded-sm"
          style={{
            width: `${Math.max(2, (100 * v) / max)}%`,
            background: changed ? (c.ratio >= 1 ? "var(--rates-up, #6d4bb8)" : "var(--rates-down, #8a5a2b)") : "var(--viz-text-muted, #888)",
          }}
        />
      </span>
    </div>
  )
  return (
    <div className="space-y-1" aria-hidden>
      {row(c.isRatio ? t.ratioToday : t.today, 1, false)}
      {row(c.isRatio ? t.ratioDoubled : t.doubled, c.ratio, true)}
    </div>
  )
}

const BTN =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** "Try it": on the explorer's own page, applies the change there; elsewhere, opens it. */
function TryIt({ c, lang }: { c: CuriosityCardData; lang: Lang }) {
  const t = ratesDict(lang).cur
  const here = usePathname()
  const cls = `${BTN} bg-foreground text-background hover:bg-foreground/85`
  if (here === c.tryPath) {
    return (
      <a
        href={c.tryHash}
        className={cls}
        onClick={(e) => {
          e.preventDefault()
          if (window.location.hash === c.tryHash) showWhatIf()
          else window.location.hash = c.tryHash
        }}
      >
        {t.tryIt}
      </a>
    )
  }
  return (
    <Link href={c.tryPath + c.tryHash} className={cls}>
      {t.tryIt}
    </Link>
  )
}

function Know({ c, lang }: { c: CuriosityCardData; lang: Lang }) {
  const t = ratesDict(lang).cur
  const cls = `${BTN} border border-border text-foreground hover:bg-secondary`
  const label = c.status || !c.know.external ? t.know : t.knowSource
  return c.know.external ? (
    <a href={c.know.href} target="_blank" rel="noreferrer" className={cls}>
      {label}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
    </a>
  ) : (
    <Link href={c.know.href} className={cls}>
      {label}
    </Link>
  )
}

/** The caveat and the rate's real standing: never a card without them. */
function Caveat({ c, lang }: { c: CuriosityCardData; lang: Lang }) {
  const t = ratesDict(lang).cur
  return (
    <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
      {c.caveat} {t.whatIf} {c.status ? t.status(c.status.label) : t.noStatus}
    </p>
  )
}

export function CuriosityCard({ c, lang, headingLevel = 3 }: { c: CuriosityCardData; lang: Lang; headingLevel?: 1 | 2 | 3 }) {
  const t = ratesDict(lang).cur
  const H = (["h1", "h2", "h3"] as const)[headingLevel - 1]
  return (
    <article
      className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:p-5"
      aria-labelledby={`cur-${c.id}`}
    >
      <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t.eyebrow}</span>
        <span aria-hidden>·</span>
        <span>
          <Sci>{c.siteShort}</Sci>
        </span>
      </p>
      <H id={`cur-${c.id}`} className="text-pretty font-serif text-[1.0625rem] font-normal leading-snug sm:text-lg">
        <Sentence c={c} />
      </H>
      <Bars c={c} lang={lang} />
      <p className="text-pretty text-sm leading-relaxed">
        <Sci>{c.hook}</Sci>
      </p>
      <Caveat c={c} lang={lang} />
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <TryIt c={c} lang={lang} />
        <Know c={c} lang={lang} />
        <Link
          href={c.permalink}
          className={`${BTN} px-3 text-muted-foreground hover:text-foreground`}
          aria-label={t.share}
          title={t.share}
        >
          <Link2 className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </article>
  )
}

/** "Copy citation" and "Copy link", for a curiosity's own page. */
export function CuriosityCopy({ c, lang }: { c: CuriosityCardData; lang: Lang }) {
  const t = ratesDict(lang).cur
  const [done, setDone] = useState<"cite" | "link" | null>(null)
  // shown on the curiosity's own page: its address is the page's
  const url = () => window.location.href.split("#")[0]
  const copy = async (what: "cite" | "link") => {
    const text =
      what === "link"
        ? url()
        : `J. Skowronski, “${c.sentence}” ${c.caveat} Reaction rates explorer (${c.model}). ${url()}. ${t.rate}: ${c.rateSource}.`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      window.prompt(what === "link" ? t.copyLink : t.copyCitation, text)
    }
    setDone(what)
    setTimeout(() => setDone(null), 2000)
  }
  const cls = `${BTN} border border-border text-foreground hover:bg-secondary`
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={cls} onClick={() => copy("cite")}>
        {done === "cite" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        {done === "cite" ? t.copied : t.copyCitation}
      </button>
      <button type="button" className={cls} onClick={() => copy("link")}>
        {done === "link" ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
        {done === "link" ? t.copied : t.copyLink}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {done ? t.copied : ""}
      </span>
    </div>
  )
}

/**
 * A few curiosities in a row: on a phone one card per screen, swiped
 * sideways; from the small breakpoint up, three side by side. `first` are
 * shown first (the open network's), the rest follow on "Show three more".
 */
export function CuriosityStrip({
  items,
  lang,
  first = [],
  allHref,
  total,
}: {
  items: CuriosityCardData[]
  lang: Lang
  first?: string[]
  allHref: string
  total: number
}) {
  const t = ratesDict(lang).cur
  const [offset, setOffset] = useState(0)
  const order = [...items.filter((c) => first.includes(c.id)), ...items.filter((c) => !first.includes(c.id))]
  if (!order.length) return null
  const shown = Array.from({ length: Math.min(3, order.length) }, (_, i) => order[(offset + i) % order.length])
  return (
    <section aria-labelledby="curiosities-title" className="scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="curiosities-title" className="text-balance font-serif text-xl font-semibold tracking-tight sm:text-2xl">
          <Sci>{t.title}</Sci>
        </h2>
        <Link href={allHref} className="inline-flex min-h-11 items-center text-sm text-link underline-offset-4 hover:underline">
          {t.all(total)} →
        </Link>
      </div>
      <p className="mt-1 max-w-[46rem] text-pretty text-sm text-muted-foreground">{t.lead}</p>
      <ul
        className="-mx-5 mt-4 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:thin] sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0"
      >
        {shown.map((c) => (
          <li key={c.id} className="w-[calc(100vw-2.5rem)] max-w-[24rem] shrink-0 snap-start lg:w-auto lg:max-w-none">
            <CuriosityCard c={c} lang={lang} />
          </li>
        ))}
      </ul>
      {order.length > 3 && (
        <button
          type="button"
          onClick={() => setOffset((o) => (o + 3) % order.length)}
          className="mt-2 inline-flex min-h-11 items-center text-sm text-link underline-offset-4 hover:underline"
        >
          {t.more}
        </button>
      )}
    </section>
  )
}
