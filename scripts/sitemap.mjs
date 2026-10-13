#!/usr/bin/env node
/**
 * sitemap.xml and robots.txt, written after `next build` (npm's postbuild).
 *
 * The pages are the ones the build produced (scripts/seo-pages.mjs), each
 * under the canonical address its own HTML declares, with its English and
 * Italian versions as hreflang alternates. Pages marked noindex are left out.
 *
 *   static export (STATIC_EXPORT=1)  → out/sitemap.xml, out/robots.txt
 *   server build                     → public/sitemap.xml, public/robots.txt
 *                                      (served by `next start` and copied into
 *                                      the Docker image after the build)
 *
 * The URLs are absolute when SITE_URL is set at build time, which a sitemap
 * needs: Docker Compose sets it from SITE_DOMAIN, the Pages workflow from
 * GitHub's answer. Without it (a local build) the sitemap is written with
 * root-relative addresses and a warning.
 *
 * On GitHub Pages under a project path (user.github.io/<repo>/), crawlers
 * read robots.txt only at the host's root, so out/robots.txt is there for a
 * custom domain; submit the sitemap's address in Search Console instead.
 */

import fs from "node:fs"
import path from "node:path"

import { BASE, ORIGIN, STATIC, builtPages, fileUrl } from "./seo-pages.mjs"

const quiet = process.argv.includes("--quiet")

const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export function buildSitemap(pages) {
  const indexable = pages.filter((p) => !p.noindex && p.canonical)
  const known = new Set(indexable.map((p) => p.canonical))
  const urls = indexable.map((p) => {
    // Only alternates that exist in this build; a page without an
    // Italian twin is listed alone.
    const alts = p.alternates.filter((a) => known.has(a.href))
    const lines = [`  <url>`, `    <loc>${xml(p.canonical)}</loc>`]
    if (alts.length >= 2) for (const a of alts) lines.push(`    <xhtml:link rel="alternate" hreflang="${xml(a.hreflang)}" href="${xml(a.href)}"/>`)
    lines.push(`  </url>`)
    return lines.join("\n")
  })
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    ...urls,
    `</urlset>`,
    ``,
  ].join("\n")
}

export function buildRobots() {
  const lines = ["User-agent: *", "Allow: /"]
  // The AZURE2 API answers JSON for the pages' own use; nothing to index.
  if (!STATIC) lines.push(`Disallow: ${BASE}/api/`)
  lines.push("", `Sitemap: ${fileUrl("/sitemap.xml")}`, "")
  return lines.join("\n")
}

function main() {
  const built = builtPages()
  if (!built) {
    console.warn("sitemap: no build output found (run next build first); nothing written")
    return
  }
  const outDir = STATIC ? path.join(process.cwd(), "out") : path.join(process.cwd(), "public")
  const sitemap = buildSitemap(built.pages)
  fs.writeFileSync(path.join(outDir, "sitemap.xml"), sitemap)
  fs.writeFileSync(path.join(outDir, "robots.txt"), buildRobots())
  const n = (sitemap.match(/<url>/g) ?? []).length
  if (!ORIGIN) console.warn("sitemap: SITE_URL is not set, so the addresses are root-relative; set it for a deployable sitemap")
  if (!quiet) console.log(`sitemap: ${n} pages → ${path.relative(process.cwd(), path.join(outDir, "sitemap.xml"))}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
