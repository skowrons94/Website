import { PublicationsPage, publicationsMetadata } from "@/components/pages/publications"

export const metadata = publicationsMetadata("en")

export default function Page() {
  return <PublicationsPage lang={"en"} />
}
