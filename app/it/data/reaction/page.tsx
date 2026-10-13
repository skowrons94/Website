import { DataReactionAnyPage } from "@/components/pages/data-reaction"
import { dict } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const metadata = pageMetadata(dict("it").dataExpert.name, dict("it").dataExpert.search.intro, "it")

export default function Page() {
  return <DataReactionAnyPage lang={"it"} />
}
