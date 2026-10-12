import type { Metadata } from "next"

import { dict } from "@/lib/i18n"
import { getProfile } from "@/lib/content"
import { pageMetadata } from "@/lib/metadata"

const base = pageMetadata(dict("it").evaluations.metaTitle, dict("it").evaluations.description, "it")
// The root template again for the evaluations under it: a bare title string
// here dropped the " · name" suffix of their tab titles.
export const metadata: Metadata = {
  ...base,
  title: { default: base.title as string, template: `%s · ${getProfile("it").name}` },
}

/**
 * The evaluation UI is wider than the prose pages — a level scheme plus its
 * plots does not fit a reading measure — so it gets its own frame rather than
 * the shared Container.
 */
export default function EvaluationsLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 xl:max-w-7xl">{children}</div>
}
