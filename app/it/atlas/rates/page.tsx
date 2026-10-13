import { RatesPage, ratesMetadata } from "@/components/pages/rates"
import { RouteLd } from "@/components/route-ld"

export const metadata = ratesMetadata("it")

export default function Page() {
  return (
    <>
      <RatesPage lang={"it"} />
      {/* --- find --- */}
      <RouteLd lang={"it"} page="rates" />
    </>
  )
}
