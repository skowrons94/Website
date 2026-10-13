/**
 * The site's public addresses, for canonical links, hreflang pairs, Open
 * Graph URLs, structured data, the sitemap and the news feed.
 *
 * Two build-time settings decide them (next.config.mjs inlines both):
 *
 *   SITE_URL   the public origin, e.g. https://jskowron.eu or
 *              https://skowrons94.github.io (no path). Docker Compose sets it
 *              from SITE_DOMAIN; the Pages workflow from GitHub's own answer.
 *              Empty: addresses stay root-relative (a local build).
 *   BASE_PATH  the path the site is served under: "" on its own domain,
 *              "/<repository>" on GitHub Pages.
 *
 * The static export ends every page address with a slash (TRAILING_SLASH),
 * the server build does not; both are followed here so a canonical URL is
 * the one the page is actually served at, with no redirect in between.
 *
 * No dependencies: safe in client components (components/alternates.tsx).
 */

/** The public origin without a trailing slash, or "" when unknown. */
export function siteOrigin(): string {
  return (process.env.SITE_URL ?? "").replace(/\/+$/, "")
}

/** Whether absolute addresses can be made (SITE_URL was set at build time). */
export function hasOrigin(): boolean {
  return siteOrigin() !== ""
}

/**
 * The address of a page, from its root-relative path (English or /it/…,
 * without the base path): absolute when SITE_URL is known. A `#fragment` or
 * `?query` is kept after the slash rule is applied to the path.
 */
export function pageUrl(path: string): string {
  const m = /^([^?#]*)(.*)$/.exec(path || "/")!
  const bare = m[1] || "/"
  const rest = m[2]
  const full = `${process.env.BASE_PATH ?? ""}${bare === "/" ? "" : bare}`
  const slash = process.env.TRAILING_SLASH === "1"
  const withSlash = full === "" ? "/" : slash && !full.endsWith("/") ? `${full}/` : full
  return `${siteOrigin()}${withSlash}${rest}`
}

/** The address of a file in public/ (an image, a feed): no slash rule. */
export function fileUrl(path: string): string {
  return `${siteOrigin()}${process.env.BASE_PATH ?? ""}${path.startsWith("/") ? path : `/${path}`}`
}
