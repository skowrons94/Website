"use client"

import { useEffect, useState } from "react"

import { issueUrl } from "@/lib/repo"

/**
 * "Report an error · Suggest a reaction": links that open a new GitHub issue
 * on the site's repository with the title and body already filled in (the
 * page's address and the section), so a reader only has to say what is wrong.
 *
 * A client component only so that the address is the one being read when no
 * SITE_URL was set at build time; its strings come from the server as props
 * (lib/i18n.ts, `report`), which keeps the dictionaries out of the bundle.
 */
export type ReportStrings = {
  found: string
  error: string
  suggest: string
  opensGithub: string
  errorTitle: string
  suggestTitle: string
  errorBody: string
  suggestBody: string
}

/** `{page}` and `{section}` in a template, filled in. */
function fill(template: string, page: string, section: string): string {
  return template.replaceAll("{page}", page).replaceAll("{section}", section)
}

export function ReportLinks({
  path,
  section,
  strings,
  suggest = false,
  className,
}: {
  /** The page's path as served (with /it, without the base path). */
  path: string
  /** What on the page the report is about: a reaction, a glossary term. */
  section: string
  strings: ReportStrings
  /** Also offer "Suggest a reaction". */
  suggest?: boolean
  className?: string
}) {
  const base = process.env.BASE_PATH ?? ""
  const local = `${base}${path}`
  const built = process.env.SITE_URL ? `${process.env.SITE_URL.replace(/\/$/, "")}${local}` : ""
  const [page, setPage] = useState(built || local)
  useEffect(() => {
    if (!built) setPage(`${window.location.origin}${local}`)
  }, [built, local])

  const link = "text-link underline decoration-link/45 underline-offset-[0.2em] hover:decoration-current"
  return (
    <p className={className ?? "text-sm text-muted-foreground"}>
      {strings.found && <>{strings.found} </>}
      <a
        href={issueUrl(fill(strings.errorTitle, page, section), fill(strings.errorBody, page, section))}
        target="_blank"
        rel="noreferrer"
        className={link}
      >
        {strings.error}
        <span className="sr-only"> ({strings.opensGithub})</span>
      </a>
      {suggest && (
        <>
          {" · "}
          <a
            href={issueUrl(fill(strings.suggestTitle, page, section), fill(strings.suggestBody, page, section))}
            target="_blank"
            rel="noreferrer"
            className={link}
          >
            {strings.suggest}
            <span className="sr-only"> ({strings.opensGithub})</span>
          </a>
        </>
      )}
    </p>
  )
}
