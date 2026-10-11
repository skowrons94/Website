import { CVPage, cvMetadata } from "@/components/pages/cv"

export const metadata = cvMetadata("en")

export default function Page() {
  return <CVPage lang={"en"} />
}
