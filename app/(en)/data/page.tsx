import { DataExplorerPage, dataExplorerMetadata } from "@/components/pages/data-explorer"

export const metadata = dataExplorerMetadata("en")

export default function Page() {
  return <DataExplorerPage lang={"en"} />
}
