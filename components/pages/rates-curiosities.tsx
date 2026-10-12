import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { CuriosityCard, CuriosityCopy } from "@/components/rates/curiosity-card"
import { Sci } from "@/components/sci"
import { localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"
import { rateTabs } from "@/lib/rates/catalog"
import { curiosityCard, curiosityCards } from "@/lib/rates/curiosity-data"
import { CURIOSITIES } from "@/lib/rates/curiosities"
import { ratesDict } from "@/lib/rates/i18n"

/**
 * /atlas/rates/curiosities: every rate curiosity, by network, and one page
 * per curiosity (/atlas/rates/curiosities/<id>), the address to share, with
 * its own social card. The words and numbers are lib/rates/curiosity-data.ts.
 */

const BASE = process.env.BASE_PATH ?? ""

export const curiosityIds = () => CURIOSITIES.map((c) => ({ id: c.id }))

export function curiositiesMetadata(lang: Lang): Metadata {
  const t = ratesDict(lang).cur
  return pageMetadata(t.indexTitle, t.indexLead, lang)
}

export function curiosityMetadata(id: string, lang: Lang): Metadata {
  const c = curiosityCard(id, lang)
  if (!c) return {}
  const plain = (s: string) => s.replace(/\s+/g, " ")
  const title = c.parts[0].text.replace(/,$/, "")
  const m = pageMetadata(plain(title), plain(`${c.sentence} ${c.caveat}`), lang)
  // the card drawn for this curiosity (scripts/rates/curiosity-cards.mjs),
  // only with an absolute site address, as for the site's own card
  if (c.image && process.env.SITE_URL) {
    const images = [{ url: `${BASE}${c.image}`, width: 1200, height: 630, alt: c.sentence }]
    m.openGraph = { ...m.openGraph, images }
    m.twitter = { ...m.twitter, images }
  }
  return m
}

function Back({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-my-2.5 inline-flex items-center gap-1.5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  )
}

export function RatesCuriositiesPage({ lang }: { lang: Lang }) {
  const t = ratesDict(lang).cur
  const cards = curiosityCards(lang)
  const nets = [...rateTabs(lang), { id: "sprocess", title: lang === "it" ? "Processo s" : "s-process" }]
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 [overflow-wrap:anywhere] sm:px-8 sm:py-10 xl:max-w-7xl">
      <Back href={localePath(lang, "/atlas/rates")} label={t.back} />
      <header className="mt-5">
        <h1 className="text-balance font-serif text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-4xl">
          {t.indexTitle}
        </h1>
        <p className="mt-2 max-w-3xl text-pretty leading-relaxed text-muted-foreground sm:text-[1.0625rem]">
          {t.indexLead}
        </p>
      </header>
      {nets.map((n) => {
        const list = cards.filter((c) => c.net === n.id)
        if (!list.length) return null
        return (
          <section key={n.id} aria-labelledby={`net-${n.id}`} className="mt-10">
            <h2 id={`net-${n.id}`} className="font-serif text-xl font-semibold tracking-tight sm:text-2xl">
              <Sci>{n.title}</Sci>
            </h2>
            <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {list.map((c) => (
                <li key={c.id} id={c.id} className="scroll-mt-24">
                  <CuriosityCard c={c} lang={lang} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      <p className="mt-12 max-w-[46rem] text-pretty border-t border-border/70 pt-6 text-sm leading-relaxed text-muted-foreground">
        {t.indexHow}
      </p>
    </div>
  )
}

export function RatesCuriosityPage({ id, lang }: { id: string; lang: Lang }) {
  const t = ratesDict(lang).cur
  const c = curiosityCard(id, lang)
  if (!c) notFound()
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 [overflow-wrap:anywhere] sm:px-8 sm:py-10">
      <Back href={localePath(lang, "/atlas/rates/curiosities")} label={t.backAll} />
      <div className="mt-5">
        <CuriosityCard c={c} lang={lang} headingLevel={1} />
      </div>
      <dl className="mt-6 space-y-2 text-sm">
        <div>
          <dt className="inline font-medium">{t.rate}: </dt>
          <dd className="inline text-muted-foreground">
            <Sci>{`${c.reaction} — ${c.rateSource}`}</Sci>
          </dd>
        </div>
        {c.status && (
          <div>
            <dt className="inline font-medium">{c.status.label}: </dt>
            <dd className="inline text-muted-foreground">{c.status.hint}</dd>
          </div>
        )}
        <div>
          <dt className="inline font-medium">{t.model}: </dt>
          <dd className="inline text-muted-foreground">{c.model}</dd>
        </div>
      </dl>
      <div className="mt-6">
        <CuriosityCopy c={c} lang={lang} />
      </div>
    </div>
  )
}
