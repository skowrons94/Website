import { PublicationsPage, publicationsMetadata } from "@/components/pages/publications"

export const metadata = publicationsMetadata("it")

export default function Page() {
  return <PublicationsPage lang={"it"} />
}
