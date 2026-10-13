import { RatesSProcessPage, ratesSProcessMetadata } from "@/components/pages/rates-sprocess"
import { RouteLd } from "@/components/route-ld"

export const metadata = ratesSProcessMetadata("en")

export default function Page() {
  return (
    <>
      <RatesSProcessPage lang={"en"} />
      {/* --- find --- */}
      <RouteLd lang={"en"} page="rates-sprocess" />
    </>
  )
}
