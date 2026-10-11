import { SoftwarePage, softwareMetadata } from "@/components/pages/software"

export const metadata = softwareMetadata("en")

export default function Page() {
  return <SoftwarePage lang={"en"} />
}
