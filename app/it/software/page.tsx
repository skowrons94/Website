import { SoftwarePage, softwareMetadata } from "@/components/pages/software"

export const metadata = softwareMetadata("it")

export default function Page() {
  return <SoftwarePage lang={"it"} />
}
