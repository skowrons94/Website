import { GlossaryPage, glossaryMetadata } from "@/components/pages/glossary"

export const metadata = glossaryMetadata("it")

export default function Page() {
  return <GlossaryPage lang={"it"} />
}
