import { NEWS_TEXT, feedPath, newsHref } from "@/components/pages/news"
import { getProfile } from "@/lib/content"
import { localePath, type Lang } from "@/lib/i18n"
import { getNews, headline } from "@/lib/news"
import { fileUrl, hasOrigin, pageUrl } from "@/lib/site-url"

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * The news as an Atom feed (RFC 4287), in `lang`. Written at build time
 * (the route is force-static), so it is a plain file in the static export.
 * Atom wants absolute IRIs for ids and links; without SITE_URL (a local
 * build) the ids fall back to tag: URIs and the links stay root-relative.
 */
export function newsFeed(lang: Lang): string {
  const t = NEWS_TEXT[lang]
  const profile = getProfile(lang)
  const items = getNews(lang)
  const page = pageUrl(localePath(lang, "/news"))
  const id = (suffix = "") => (hasOrigin() ? `${page}${suffix}` : `tag:skowronski-site,2026:${lang}/news${suffix}`)
  const updated = `${items[0]?.date ?? "2026-01-01"}T00:00:00Z`
  const entries = items.map((item) => {
    const link = newsHref(item, lang)
    const href = link ? (link.external ? link.href : pageUrl(link.href)) : `${page}#${item.id}`
    return [
      "  <entry>",
      `    <title>${esc(headline(item.text))}</title>`,
      `    <link rel="alternate" type="text/html" href="${esc(href)}"/>`,
      `    <id>${esc(id(`#${item.id}`))}</id>`,
      `    <published>${item.date}T00:00:00Z</published>`,
      `    <updated>${item.date}T00:00:00Z</updated>`,
      `    <summary type="text">${esc(item.text)}</summary>`,
      "  </entry>",
    ].join("\n")
  })
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${lang}">`,
    `  <title>${esc(t.feedTitle(profile.name))}</title>`,
    `  <subtitle>${esc(t.description)}</subtitle>`,
    `  <link rel="self" type="application/atom+xml" href="${esc(fileUrl(feedPath(lang)))}"/>`,
    `  <link rel="alternate" type="text/html" href="${esc(page)}"/>`,
    `  <id>${esc(id())}</id>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>${esc(profile.name)}</name><uri>${esc(pageUrl(localePath(lang, "/")))}</uri></author>`,
    ...entries,
    "</feed>",
    "",
  ].join("\n")
}
