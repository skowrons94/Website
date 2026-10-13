import { RatesPage, ratesMetadata } from "@/components/pages/rates"
import { RouteLd } from "@/components/route-ld"

export const metadata = ratesMetadata("en")

export default function Page() {
  return (
    <>
      <RatesPage lang={"en"} />
      {/* --- find --- */}
      <RouteLd lang={"en"} page="rates" />
    </>
  )
}
