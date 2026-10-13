import { DataReactionAnyPage } from "@/components/pages/data-reaction"
import { dict } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const metadata = pageMetadata(dict("en").dataExpert.name, dict("en").dataExpert.search.intro, "en")

export default function Page() {
  return <DataReactionAnyPage lang={"en"} />
}
