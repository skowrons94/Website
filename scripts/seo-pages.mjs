/**
 * The pages a finished build produced, read back from its output: the
 * static export's out/ (STATIC_EXPORT=1) or the server build's prerendered
 * HTML in .next/server/app. Shared by scripts/sitemap.mjs (which writes the
 * sitemap from them) and scripts/seo-test.mjs (which checks them).
 *
 * Working from the output rather than from a list of routes means every page
 * the build made is found, dynamic ones (atlas entries, evaluations, notes,
 * curiosities, the data explorer's pages) included, with no list to keep in
 * step with the app/ directory.
 */

import fs from "node:fs"
import path from "node:path"

export const STATIC = process.env.STATIC_EXPORT === "1"
export const ORIGIN = (process.env.SITE_URL ?? "").replace(/\/+$/, "")
export const BASE = process.env.BASE_PATH ?? ""

/** The build output to read, or null when there is none. */
export function outputDir(root = process.cwd()) {
  const dir = STATIC ? path.join(root, "out") : path.join(root, ".next", "server", "app")
  return fs.existsSync(dir) ? dir : null
}

/** Next's own pages, not the site's. */
const SKIP = /(^|\/)(_not-found|_global-error|_error|404|500)(\/|\.html$|$)/

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    // Static assets and the in-browser engine hold no pages; the WebDAQ demo
    // (public/webdaq-demo, built by webdaq-demo/build.mjs) is an app of its
    // own, marked noindex, and none of the site's pages.
    if (e.isDirectory()) {
      if (e.name !== "_next" && e.name !== "azure2" && e.name !== "webdaq-demo") walk(p, out)
    } else if (e.name.endsWith(".html")) out.push(p)
  }
  return out
}

/** The site path of an output file: "/" , "/atlas", "/it/atlas/14N-pg-15O". */
function sitePath(dir, file) {
  let rel = path.relative(dir, file).split(path.sep).join("/")
  if (STATIC) {
    if (!rel.endsWith("index.html")) return null // 404.html and the like
    rel = rel.slice(0, -"index.html".length).replace(/\/$/, "")
  } else {
    rel = rel.replace(/\.html$/, "")
    if (rel === "index") rel = ""
  }
  return `/${rel}`
}

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}=("([^"]*)"|'([^']*)')`, "i").exec(tag)
  return m ? decode(m[2] ?? m[3] ?? "") : null
}
const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")

/** The <head> facts and the JSON-LD of one page's HTML. */
export function parsePage(html) {
  const metas = {}
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0]
    const key = attr(tag, "property") ?? attr(tag, "name")
    const content = attr(tag, "content")
    if (key && content !== null) (metas[key] ??= []).push(content)
  }
  const links = []
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    links.push({ rel: attr(m[0], "rel"), href: attr(m[0], "href"), hreflang: attr(m[0], "hreflang"), type: attr(m[0], "type") })
  }
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]
  const jsonld = []
  for (const m of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    jsonld.push(m[1])
  }
  const lang = /<html\b[^>]*\slang="([^"]+)"/i.exec(html)?.[1] ?? null
  return {
    title: title ? decode(title) : null,
    lang,
    metas,
    meta: (k) => metas[k]?.[0] ?? null,
    links,
    canonical: links.find((l) => l.rel === "canonical")?.href ?? null,
    alternates: links.filter((l) => l.rel === "alternate" && l.hreflang),
    jsonld,
    noindex: (metas.robots ?? []).some((c) => /noindex/i.test(c)),
  }
}

/** Every page of the build: its path, file and parsed head. */
export function builtPages(root = process.cwd()) {
  const dir = outputDir(root)
  if (!dir) return null
  const pages = []
  for (const file of walk(dir)) {
    const p = sitePath(dir, file)
    if (p === null || SKIP.test(p.slice(1))) continue
    const html = fs.readFileSync(file, "utf8")
    pages.push({ path: p, file, ...parsePage(html) })
  }
  pages.sort((a, b) => a.path.localeCompare(b.path))
  return { dir, pages }
}

/** The address of a site path, as lib/site-url.ts makes it. */
export function pageUrl(p) {
  const full = `${BASE}${p === "/" ? "" : p}`
  const withSlash = full === "" ? "/" : STATIC && !full.endsWith("/") ? `${full}/` : full
  return `${ORIGIN}${withSlash}`
}

export function fileUrl(p) {
  return `${ORIGIN}${BASE}${p}`
}
