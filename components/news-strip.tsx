import Link from "next/link"

import { FeedLink, NEWS_TEXT, newsDate } from "@/components/pages/news"
import { Sci } from "@/components/sci"
import { getProfile } from "@/lib/content"
import { localePath, type Lang } from "@/lib/i18n"
import { getNews, headline } from "@/lib/news"

/**
 * The latest items of content/news.yaml, small, on the home page: everything
 * from the most recent day (at least three, at most six), the date and the
 * first sentence of each, linking to it on /news.
 */
export function NewsStrip({ lang }: { lang: Lang }) {
  const t = NEWS_TEXT[lang]
  const all = getNews(lang)
  const sameDay = all.filter((n) => n.date === all[0]?.date).length
  const items = all.slice(0, Math.min(6, Math.max(3, sameDay)))
  if (items.length === 0) return null
  const to = (p: string) => localePath(lang, p)
  return (
    <section aria-labelledby="news-heading" className="border-t border-border/70 py-8">
      <FeedLink lang={lang} title={t.feedTitle(getProfile(lang).name)} />
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 id="news-heading" className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {t.latest}
        </h2>
        <Link prefetch={false} href={to("/news")} className="inline-flex min-h-10 items-center text-sm text-link underline-offset-4 hover:underline">
          {t.all}
        </Link>
      </div>
      <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <Link
              prefetch={false}
              href={`${to("/news")}#${item.id}`}
              className="group -mx-2 block rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60"
            >
              <time dateTime={item.date} className="block text-xs text-muted-foreground">
                {newsDate(item.date, lang)}
              </time>
              <span className="block text-pretty text-sm leading-snug text-foreground/90 group-hover:text-link">
                <Sci>{headline(item.text)}</Sci>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
