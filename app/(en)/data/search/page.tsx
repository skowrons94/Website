import { DataSearchPage, dataSearchMetadata } from "@/components/pages/data-search"

export const metadata = dataSearchMetadata("en")

export default function Page() {
  return <DataSearchPage lang={"en"} />
}
