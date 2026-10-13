import { RatesSProcessPage, ratesSProcessMetadata } from "@/components/pages/rates-sprocess"
import { RouteLd } from "@/components/route-ld"

export const metadata = ratesSProcessMetadata("it")

export default function Page() {
  return (
    <>
      <RatesSProcessPage lang={"it"} />
      {/* --- find --- */}
      <RouteLd lang={"it"} page="rates-sprocess" />
    </>
  )
}
