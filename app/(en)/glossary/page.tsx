import { GlossaryPage, glossaryMetadata } from "@/components/pages/glossary"

export const metadata = glossaryMetadata("en")

export default function Page() {
  return <GlossaryPage lang={"en"} />
}
