import { DataSearchPage, dataSearchMetadata } from "@/components/pages/data-search"

export const metadata = dataSearchMetadata("it")

export default function Page() {
  return <DataSearchPage lang={"it"} />
}
