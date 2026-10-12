import { dict, type Lang } from "@/lib/i18n"

/**
 * The strings the site chrome needs in the browser: the header, its menus, the
 * language switch, the theme toggle and the search dialog. Picked out of the
 * dictionary on the server and handed to those client components as a prop,
 * so the dictionaries themselves (lib/i18n.ts) stay out of the JavaScript that
 * every page loads.
 */
export function chromeStrings(lang: Lang) {
  const t = dict(lang)
  const other: Lang = lang === "en" ? "it" : "en"
  const o = dict(other)
  return {
    nav: t.nav,
    search: t.search,
    language: {
      label: t.nav.language,
      // The link to the other language speaks that language.
      otherName: o.langName,
      otherSwitchTo: o.nav.switchTo,
    },
  }
}

export type ChromeStrings = ReturnType<typeof chromeStrings>
