import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import { getProfile } from "@/lib/content"

/**
 * The site's release, for "How to cite this site" on /about and for the DOI
 * line in the atlas' and the evaluations' citation boxes.
 *
 *   version  the latest git tag vX.Y.Z when the history has one, else the
 *            `version` of package.json (RELEASING.md says how to tag)
 *   date     the date of that tag's commit; without a tag, CITATION.cff's
 *            `date-released` (so the two always agree), else the date of the
 *            last commit, else the day of the build (a Docker build copies no
 *            .git)
 *   doi      profile.yaml's `site_doi:` (the Zenodo concept DOI, which always
 *            resolves to the latest version), or null while it is empty
 *
 * Read once per build: server-only (it runs git).
 */
export type SiteRelease = { version: string; date: string; tag: string | null; doi: string | null }

function git(args: string[]): string | null {
  try {
    const out = execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
    return out || null
  } catch {
    return null
  }
}

let cached: SiteRelease | null = null

export function siteRelease(): SiteRelease {
  if (cached) return cached
  let pkgVersion = "0.0.0"
  try {
    pkgVersion = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")).version ?? pkgVersion
  } catch {
    /* keep the default */
  }
  const tag = git(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*"])
  const version = tag ? tag.replace(/^v/, "") : pkgVersion
  const isDate = (s: string | null): s is string => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s))
  const tagDate = tag ? git(["log", "-1", "--format=%cs", tag]) : null
  const lastDate = git(["log", "-1", "--format=%cs"])
  const cffDate = tag ? null : citationDate()
  const date = isDate(tagDate)
    ? tagDate
    : isDate(cffDate)
      ? cffDate
      : isDate(lastDate)
        ? lastDate
        : new Date().toISOString().slice(0, 10)
  cached = { version, date, tag, doi: siteDoi() }
  return cached
}

/** CITATION.cff's `date-released:` (YYYY-MM-DD), or null. */
function citationDate(): string | null {
  try {
    const cff = fs.readFileSync(path.join(process.cwd(), "CITATION.cff"), "utf8")
    return cff.match(/^date-released:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/m)?.[1] ?? null
  } catch {
    return null
  }
}

/** profile.yaml's `site_doi:`, bare (no https://doi.org/), or null while it is empty. */
export function siteDoi(): string | null {
  const raw = (getProfile("en").site_doi ?? "").trim()
  const doi = raw.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "")
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : null
}
