import { DataReactionAnyPage } from "@/components/pages/data-reaction"
import { dict } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

// /data/reaction?r=<slug> is filled in the browser; without ?r= it sends the reader to search. Not indexed.
export const metadata = { ...pageMetadata(dict("en").dataExpert.name, dict("en").dataExpert.search.intro, "en"), robots: { index: false, follow: true } }

export default function Page() {
  return <DataReactionAnyPage lang={"en"} />
}
