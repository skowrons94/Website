/**
 * The language helpers, without the dictionaries.
 *
 * lib/i18n.ts re-exports all of these, so server code imports them from there
 * as before. Client components that only need a path or the language import
 * them from here instead: importing anything from i18n.ts puts both complete
 * dictionaries (about 20 kB compressed) into the browser bundle of every page
 * that uses the component, the header included.
 */

export type Lang = "en" | "it"
export const LANGS: Lang[] = ["en", "it"]

/** The path of `path` (an English, root-relative path) in `lang`. */
export function localePath(lang: Lang, path: string): string {
  if (lang === "en" || !path.startsWith("/") || path.startsWith("//")) return path
  if (path === "/" || path.startsWith("/#") || path.startsWith("/?")) return `/it${path.slice(1)}`
  return `/it${path}`
}

/** Which language a pathname (without the base path) is in. */
export function langOf(pathname: string): Lang {
  return pathname === "/it" || pathname.startsWith("/it/") ? "it" : "en"
}

/** The English path a localized pathname corresponds to. */
export function englishPath(pathname: string): string {
  if (langOf(pathname) === "en") return pathname || "/"
  return pathname.slice(3) || "/"
}
