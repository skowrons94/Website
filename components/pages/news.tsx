import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Rss } from "lucide-react"

import { PageLd } from "@/components/json-ld"
import { Container, PageHeader } from "@/components/page-header"
import { Sci } from "@/components/sci"
import { getProfile } from "@/lib/content"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"
import { getNews, type NewsItem } from "@/lib/news"
import { fileUrl } from "@/lib/site-url"

/** The page's own words; the item texts are in content/news.yaml. */
export const NEWS_TEXT = {
  en: {
    title: "News",
    description: "What is new on the site: new pages, tools and data, newest first, with an Atom feed.",
    lead: "What is new on the site, newest first. Each item links to the page it is about.",
    feed: "Atom feed",
    feedTitle: (name: string) => `${name} — news`,
    feedLead: "To follow it in a feed reader:",
    open: "Go to the page",
    latest: "What's new",
    all: "All news",
    none: "Nothing yet.",
  },
  it: {
    title: "Novità",
    description: "Le novità del sito: nuove pagine, strumenti e dati, dalla più recente, con un feed Atom.",
    lead: "Le novità del sito, dalla più recente. Ogni voce rimanda alla pagina di cui parla.",
    feed: "Feed Atom",
    feedTitle: (name: string) => `${name} — novità`,
    feedLead: "Per seguirle con un lettore di feed:",
    open: "Vai alla pagina",
    latest: "Novità",
    all: "Tutte le novità",
    none: "Nessuna novità per ora.",
  },
} as const

/** The feed's path in `lang` (a file, so no trailing-slash rule). */
export const feedPath = (lang: Lang) => localePath(lang, "/news/feed.xml")

/** "12 October 2026" / "12 ottobre 2026". */
export function newsDate(iso: string, lang: Lang): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === "it" ? "it-IT" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** An item's link: a site path localized, an address as it is. */
export function newsHref(item: NewsItem, lang: Lang): { href: string; external: boolean } | null {
  if (!item.link) return null
  return item.link.startsWith("/") ? { href: localePath(lang, item.link), external: false } : { href: item.link, external: true }
}

export const newsMetadata = (lang: Lang): Metadata => pageMetadata(NEWS_TEXT[lang].title, NEWS_TEXT[lang].description, lang)

/** The feed's `<link rel="alternate">`, hoisted into <head> by React. */
export function FeedLink({ lang, title }: { lang: Lang; title: string }) {
  return <link rel="alternate" type="application/atom+xml" title={title} href={fileUrl(feedPath(lang))} />
}

export function NewsPage({ lang }: { lang: Lang }) {
  const t = NEWS_TEXT[lang]
  const items = getNews(lang)
  const base = process.env.BASE_PATH ?? ""
  return (
    <Container>
      <PageLd lang={lang} trail={[{ name: dict(lang).nav.news, path: "/news" }]} />
      <FeedLink lang={lang} title={t.feedTitle(getProfile(lang).name)} />
      <PageHeader title={t.title} lead={t.lead} />
      <p className="-mt-6 mb-10 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <span>{t.feedLead}</span>
        {/* A plain link: the feed is a file, not a page of the app. */}
        <a href={`${base}${feedPath(lang)}`} className="inline-flex min-h-10 items-center gap-1.5 text-link underline-offset-4 hover:underline">
          <Rss aria-hidden className="h-3.5 w-3.5" />
          {t.feed}
        </a>
      </p>

      {items.length === 0 ? (
        <p className="text-muted-foreground">{t.none}</p>
      ) : (
        <ol className="divide-y divide-border/70">
          {items.map((item) => {
            const link = newsHref(item, lang)
            return (
              <li key={item.id} id={item.id} className="scroll-mt-24 py-6 first:pt-0">
                <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  <time dateTime={item.date}>{newsDate(item.date, lang)}</time>
                </p>
                <p className="mt-2 max-w-2xl text-pretty leading-relaxed text-foreground/90">
                  <Sci>{item.text}</Sci>
                </p>
                {link &&
                  (link.external ? (
                    <a href={link.href} className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm text-link underline-offset-4 hover:underline">
                      {t.open}
                      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <Link prefetch={false} href={link.href} className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm text-link underline-offset-4 hover:underline">
                      {t.open}
                      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                    </Link>
                  ))}
              </li>
            )
          })}
        </ol>
      )}
    </Container>
  )
}
