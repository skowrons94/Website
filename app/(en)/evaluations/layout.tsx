import type { Metadata } from "next"

import { dict } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const metadata: Metadata = pageMetadata(dict("en").evaluations.metaTitle, dict("en").evaluations.description, "en")

/**
 * The evaluation UI is wider than the prose pages — a level scheme plus its
 * plots does not fit a reading measure — so it gets its own frame rather than
 * the shared Container.
 */
export default function EvaluationsLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 xl:max-w-7xl">{children}</div>
}
